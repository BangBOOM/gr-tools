import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import {verifyReportIntegrity,sealReport} from '../packages/firmware-core/src/report.ts';
import {DEFAULT_STYLES,FACTORY_ORDER,exportProject,importStyle} from '../apps/firmware/src/project.ts';
import {sha256} from '../packages/firmware-core/src/platform.ts';
import {createStylePackage,inspectStylePackage,renderIcon} from '../packages/style-contract/src/index.ts';
import {fitCube} from '../packages/firmware-fit/src/index.ts';
import {CAMERA_TARGET} from '../packages/firmware-fit/src/target.ts';
const cancelOnly=process.env.GR_OBSERVE_CANCEL_ONLY==='1';
const output=resolve('apps/firmware/test/artifacts');await mkdir(output,{recursive:true});
const dist=resolve('dist'),requests=[],blocked=[];let server;
let baseURL=process.env.GR_FIRMWARE_TEST_URL;
if(!baseURL){
 server=createServer(async(req,res)=>{try{requests.push({method:req.method,url:req.url});if(req.method!=='GET')return res.writeHead(405).end();const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(dist,'.'+pathname);if(!file.startsWith(dist+sep)&&file!==dist)return res.writeHead(403).end();if((await stat(file)).isDirectory())file=resolve(file,'index.html');const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'}[extname(file)]??'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));baseURL=`http://127.0.0.1:${server.address().port}`;
}
const browser=await chromium.launch({headless:true,channel:process.env.GR_BROWSER_CHANNEL??"chrome"});
const cdp=await browser.newBrowserCDPSession(),exec=promisify(execFile),measurementStarted=performance.now(),rssSamples=[],sampleErrors=[],workerEvents=[],buildMetrics=[];let sampleBusy=false,suiteStatus='FAIL',cleanupStarted=false;const lifecycleEvents=[];
browser.on('disconnected',()=>lifecycleEvents.push({event:'browser-disconnected',at_ms:performance.now()-measurementStarted,cleanupStarted}));
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('crash',()=>lifecycleEvents.push({event:'page-crash',at_ms:performance.now()-measurementStarted}));page.on('close',()=>lifecycleEvents.push({event:'page-close',at_ms:performance.now()-measurementStarted,cleanupStarted}));
page.on('worker',worker=>{workerEvents.push({event:'created',at_ms:performance.now()-measurementStarted,url:worker.url()});worker.on('close',()=>workerEvents.push({event:'closed',at_ms:performance.now()-measurementStarted,url:worker.url()}));});
async function sampleRSS(label){if(sampleBusy&&!label)return;sampleBusy=true;try{const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');const {stdout}=await exec('ps',['-o','rss=','-p',processInfo.map(p=>p.id).join(',')]);const row={at_ms:performance.now()-measurementStarted,label,aggregate_process_rss_bytes:stdout.trim().split(/\s+/).reduce((sum,value)=>sum+Number(value),0)*1024,processes:processInfo.length,workers:page.workers().length};rssSamples.push(row);return row;}catch(error){sampleErrors.push(String(error));}finally{sampleBusy=false;}}
const rssSampler=setInterval(()=>sampleRSS(),400);
async function beginBuild(profile){await sampleRSS('before-'+profile);return {profile,started:performance.now(),sampleIndex:rssSamples.length-1,workerEventIndex:workerEvents.length};}
async function finishBuild(mark){const elapsed_ms=performance.now()-mark.started;assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'100','progress completes only with a verified artifact');assert.match(await page.locator('[data-progress-time]').innerText(),/elapsed/);for(let i=0;i<80&&page.workers().length;i++)await page.waitForTimeout(25);assert.equal(page.workers().length,0,'firmware worker must terminate after complete result verification');await sampleRSS('completed-'+mark.profile);await page.waitForTimeout(500);const settled=await sampleRSS('settled-'+mark.profile),rows=rssSamples.slice(mark.sampleIndex),events=workerEvents.slice(mark.workerEventIndex);buildMetrics.push({profile:mark.profile,elapsed_ms,baseline_aggregate_rss_bytes:rows[0]?.aggregate_process_rss_bytes,peak_aggregate_rss_bytes:Math.max(...rows.map(r=>r.aggregate_process_rss_bytes)),settled_aggregate_rss_bytes:settled?.aggregate_process_rss_bytes,workers_created:events.filter(e=>e.event==='created').length,workers_closed:events.filter(e=>e.event==='closed').length,workers_after_completion:page.workers().length,artificial_main_hash_delay_ms:mark.profile.startsWith('custom')?500:0});}
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.route('**/*',route=>{const request=route.request();if(new URL(request.url()).origin!==new URL(baseURL).origin||request.method()!=='GET'){blocked.push(request.url());return route.abort();}return route.continue();});
async function choose(action,file){const selected=page.waitForEvent('filechooser');await page.locator(`[data-action="${action}"]`).click();await(await selected).setFiles(file);}
async function readReport(){const event=page.waitForEvent('download');await page.locator('[data-action="report"]').click();const download=await event;return JSON.parse(await readFile(await download.path(),'utf8'));}
async function slotValues(){return page.locator('[data-slot-index]').evaluateAll(cards=>cards.map(card=>card.dataset.styleId));}
async function assignSlot(index,id){await page.locator(`[data-slot-pick="${index}"]`).click();await page.locator(`[data-choose-style="${id}"]`).click();}
async function idle(timeout=180000){await page.locator('[data-action="cancel"]').waitFor({state:'hidden',timeout});}
async function observeBuildUI(){
 await page.evaluate(()=>{
  const selectors=['[data-task-progress]','[role="progressbar"]','.build-status','.build-overview','.build-checklist',...Array.from(document.querySelectorAll('[data-progress-step]')).map(row=>`[data-progress-step="${row.dataset.progressStep}"]`)];
  const nodes=selectors.map(selector=>document.querySelector(selector)),samples=[];
  const sample=()=>{if(!document.querySelector('[data-action="cancel"]'))return;const track=document.querySelector('[role="progressbar"]').getBoundingClientRect(),overview=document.querySelector('.build-overview').getBoundingClientRect();samples.push({sameNodes:nodes.every((node,i)=>node===document.querySelector(selectors[i])),top:track.top,height:overview.height,heading:document.querySelector('.build-status').textContent,plan:document.querySelector('[data-progress-step="plan"]').dataset.status,percent:Number(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'))});};
  const observer=new MutationObserver(sample);observer.observe(document.querySelector('#firmware-build'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','data-status','aria-valuenow']});
  window.__grBuildUI={selectors,nodes,samples,observer};sample();
 });
}
async function assertStableBuildUI(){
 const observation=await page.evaluate(()=>{const {samples,observer}=window.__grBuildUI;observer.disconnect();return samples;});
 assert.ok(observation.length>13,'observe progress across real stages');
 assert.ok(observation.every(s=>s.sameNodes&&s.heading==='Building firmware'),'all progress and checklist DOM nodes survive phase updates and main-thread hash verification');
 assert.ok(observation.every(s=>Math.abs(s.top-observation[0].top)<.5&&Math.abs(s.height-observation[0].height)<.5),'long phase labels keep progress geometry fixed');
 assert.ok(observation.every((s,i)=>!i||s.percent>=observation[i-1].percent),'progress never moves backwards');
 assert.ok(observation.every(s=>s.percent<5||s.plan==='complete'),'the installation plan passes before packing or final verification begins');
 assert.deepEqual(await page.locator('[data-progress-step]').evaluateAll(rows=>rows.map(row=>row.dataset.status)),Array(6).fill('complete'),'all six steps complete only after verified download');
 await writeFile(resolve(output,'progress-ui-observation.json'),JSON.stringify({status:'PASS',samples:observation},null,2));
}
try{
 await page.addInitScript(()=>localStorage.setItem('gr-firmware:theme','light'));
 await page.goto(`${baseURL}/apps/firmware/`);await page.locator('.slot').first().waitFor();
 assert.equal(await page.locator('.slot').count(),4);assert.equal(await page.locator('.style-card').count(),0);assert.ok(await page.locator('[data-action="build"]').isDisabled());
 for(let i=0;i<4;i++)assert.deepEqual(await page.locator(`[data-slot-index="${i}"] canvas`).evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,32,32).data)),Array.from(renderIcon(DEFAULT_STYLES[i].icon)),'built-in slots display canonical film-label pixels');
 assert.equal(await page.locator('[data-policy]').count(),0,'unchanged reference recipes need no DNG/settings reset acknowledgment');
 await page.screenshot({path:resolve(output,'default-film-labels.png')});
 const studio=await browser.newPage({viewport:{width:1440,height:1000}});await studio.goto(`${baseURL}/apps/studio/`);
 const headerGeometry=p=>p.locator('.app-header,.brand,.tool-nav a').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};}));
 assert.deepEqual(await headerGeometry(page),await headerGeometry(studio),'both tools share exact header and navigation geometry');
 for(const width of [900,720,390,320]) {
  await page.setViewportSize({width,height:900});await studio.setViewportSize({width,height:900});
  assert.deepEqual(await headerGeometry(page),await headerGeometry(studio),`shared tab bar geometry at ${width}px`);
  for(const toolPage of [page,studio]) assert.ok(await toolPage.locator('.app-header').evaluate(header=>{
   const nav=header.querySelector('.tool-nav').getBoundingClientRect(),brand=header.querySelector('.brand').getBoundingClientRect();
   return header.scrollWidth<=innerWidth && brand.right<=nav.left && nav.right<=innerWidth && !header.querySelector('button,input') && Math.abs((nav.left+nav.right)/2-innerWidth/2)<1;
  }),`navigation is centered and contains no editing controls at ${width}px`);
 }
 await studio.close();
 for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[1152,648],[1024,768],[900,700]]) {
  await page.setViewportSize({width,height});
  const layout=await page.evaluate(()=>{
   const inside=selector=>Array.from(document.querySelectorAll(selector)).every(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
   const build=document.querySelector('.build-actions').getBoundingClientRect(),panel=document.querySelector('.build-panel').getBoundingClientRect();
   const slots=document.querySelector('.slots-panel .panel-body').getBoundingClientRect();
   return {noDocumentScroll:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth,headingsVisible:inside('.panel-heading'),buildVisible:inside('.build-actions'),progressVisible:inside('.build-overview,.progress-track'),buildPinned:Math.abs(build.bottom-panel.bottom)<2,allSlotsVisible:innerWidth<1150||Array.from(document.querySelectorAll('.slot')).every(node=>node.getBoundingClientRect().bottom<=slots.bottom)};
  });
  assert.ok(Object.values(layout).every(Boolean),`Desktop workspace at ${width}×${height}: ${JSON.stringify(layout)}`);
  if(width===1280)await page.screenshot({path:resolve(output,'desktop-workspace.png')});
 }
 await page.setViewportSize({width:1280,height:720});
 assert.equal(await page.locator('.tool-nav a').last().innerText(),'Firmware');
 await page.screenshot({path:resolve(output,'initial-dark.png'),fullPage:true});console.log('initial+unknown+official checks');
 assert.equal(await page.locator('[data-action="theme"]').count(),0);
 assert.ok(await page.locator('body').evaluate(e=>!e.classList.contains('light')),'legacy theme preference cannot change the dark workspace');
 assert.equal(await page.locator('.project-tools,.project-name,[data-action="load"],[data-action="save"],[data-action="export"],[data-action="restore-local"]').count(),0,'Firmware has no Project workflow');
 // The pool and mapping are disjoint; unassign compacts and insertion fills gaps.
 const originalSlots=await slotValues();
 const assertPartition=async()=>{
  const mapped=(await slotValues()).filter(Boolean),pool=await page.locator('.style-card').evaluateAll(cards=>cards.map(card=>card.dataset.styleId));
  assert.equal(new Set([...mapped,...pool]).size,mapped.length+pool.length,'styles appear in exactly one area');
 };
 await page.locator('[data-slot-index="0"]').dragTo(page.locator('[data-slot-index="2"]'));
 assert.deepEqual(await slotValues(),[originalSlots[1],originalSlots[2],originalSlots[0],originalSlots[3]]);
 await page.locator('[data-slot-index="2"]').dragTo(page.locator('[data-slot-index="0"]'));assert.deepEqual(await slotValues(),originalSlots);
 await page.locator('[data-slot-index="1"]').dragTo(page.locator('[data-drop-library]'));
 assert.deepEqual(await slotValues(),[originalSlots[0],originalSlots[2],originalSlots[3],'']);assert.equal(await page.locator('.style-card').count(),1);assert.ok(await page.locator('[data-action="build"]').isDisabled());await assertPartition();
 assert.equal(await page.locator('.style-card canvas').getAttribute('data-icon'),'1');
 await page.screenshot({path:resolve(output,'exclusive-style-pool.png')});
 await page.locator(`.style-card[data-style-id="${originalSlots[1]}"]`).dragTo(page.locator('[data-slot-index="1"]'));assert.deepEqual(await slotValues(),originalSlots);assert.equal(await page.locator('.style-card').count(),0);await assertPartition();
 // Multiple returns still close gaps; an empty trailing target appends, never leaves holes.
 await page.locator('[data-unassign="1"]').click();await page.locator('[data-unassign="1"]').click();
 assert.deepEqual(await slotValues(),[originalSlots[0],originalSlots[3],'','']);assert.equal(await page.locator('.style-card').count(),2);await assertPartition();
 await page.locator(`.style-card[data-style-id="${originalSlots[1]}"]`).dragTo(page.locator('[data-slot-index="3"]'));
 assert.deepEqual(await slotValues(),[originalSlots[0],originalSlots[3],originalSlots[1],'']);assert.equal(await page.locator('.style-card').count(),1);await assertPartition();
 await page.locator(`[data-style-pick="${originalSlots[2]}"]`).click();await page.locator('[data-slot-pick="1"]').click();
 assert.deepEqual(await slotValues(),[originalSlots[0],originalSlots[2],originalSlots[3],originalSlots[1]]);assert.equal(await page.locator('.style-card').count(),0);await assertPartition();
 await page.locator('[data-slot-index="3"]').dragTo(page.locator('[data-slot-index="1"]'));assert.deepEqual(await slotValues(),originalSlots);
 await page.locator('[data-slot-handle="0"]').press('ArrowDown');await page.locator('[data-slot-handle="1"]').press('ArrowUp');assert.deepEqual(await slotValues(),originalSlots);
 await page.locator('[data-slot-pick="0"]').click();assert.equal(await page.locator('[data-choose-style]').count(),0,'assigned styles are excluded from the chooser');await page.locator('[data-close]').click();
 await page.locator('[data-unassign="1"]').click();await assignSlot(1,originalSlots[1]);assert.deepEqual(await slotValues(),originalSlots);assert.equal(await page.locator('.style-card').count(),0);
 await page.locator('[data-slot-index="0"]').dragTo(page.locator('.intro h1'));assert.deepEqual(await slotValues(),originalSlots,'dropping outside leaves the mapping untouched');
 const external=await page.evaluateHandle(()=>{const transfer=new DataTransfer();transfer.setData('application/x-gr-style','external-id');return transfer;});
 await page.locator('[data-slot-index="0"]').dispatchEvent('drop',{dataTransfer:external});await external.dispose();assert.deepEqual(await slotValues(),originalSlots,'external drag payload cannot modify firmware slots');
 // Unknown and unsupported inputs fail closed before any build is offered.
 await choose('base',{name:'unknown.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(256)});await page.waitForTimeout(100);await idle();
 assert.ok(await page.locator('[data-action="build"]').isDisabled());assert.equal(await page.locator('[data-action="download"]').count(),0);
 await choose('base',resolve('fwdc239b.bin'));await page.waitForTimeout(100);await idle();
 await page.locator('[data-action="build"]:enabled').waitFor({timeout:30000});
 assert.equal(await page.locator('[data-action="plan"],[data-action="fit"],[data-nodes],[data-accept-fit],.fit-card,.detail-pre,[data-detail="platform"],[data-detail="task-log"]').count(),0,'the build surface contains no manual preflight or developer details');
 if(!cancelOnly){
 // A real minified production Worker must run the full emulator gates.
 if(process.env.GR_SKIP_REFERENCE_BUILD!=='1'){
  const mark=await beginBuild('default-film-labels');await page.locator('[data-action="build"]').click();await observeBuildUI();
  await page.waitForFunction(()=>Number(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'))>=25,{},{timeout:900000});
  assert.ok(Number(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'))<100);
  assert.match(await page.locator('[data-progress-time]').innerText(),/About .* left|Finishing checks/);
  assert.match(await page.locator('[data-progress-checks]').innerText(),/\/13 checks complete/);
  await page.screenshot({path:resolve(output,'build-progress.png'),fullPage:true});
  await idle(900000);await finishBuild(mark);await assertStableBuildUI();
  assert.equal(await page.locator('[data-action="download"]').count(),1,await page.locator('.build-status').innerText());
  const report=await readReport();assert.equal(report.status,'PASS');assert.ok(report.gates.every(g=>g.status==='PASS'));assert.equal(report.buildProfile,'V9.2-four-slot');assert.equal(report.deviceAcceptance,'REQUIRES_DEVICE_TEST');assert.equal(report.candidate.registryChanged,false);
  assert.equal(report.gates.length,12);assert.equal(report.gates.find(g=>g.id==='native-arm').evidence.length,13);
  for(let i=0;i<4;i++){assert.equal(report.candidate.slots[i].iconSha256,await sha256(renderIcon(DEFAULT_STYLES[i].icon)));assert.equal(report.candidate.slots[i].fit,undefined);}
  for(const [action,file] of [['download','default-film-label-candidate.bin'],['report','default-film-label-report.json']]){const event=page.waitForEvent('download');await page.locator(`[data-action="${action}"]`).click();await(await event).saveAs(resolve(output,file));}
  assert(await verifyReportIntegrity(report,await readFile(resolve(output,'default-film-label-candidate.bin'))));
  for(const mutate of [r=>delete r.candidate.slots[0].iconDefinition,r=>r.candidate.slots[0].iconDefinition.top_text='WRNG',r=>r.candidate.slots[0].recipeSha256='0'.repeat(64)]){const changed=structuredClone(report);mutate(changed);assert.equal(await verifyReportIntegrity(await sealReport(changed),await readFile(resolve(output,'default-film-label-candidate.bin'))),false,'resealed reference icon/recipe tampering must fail');}
  await writeFile(resolve(output,'default-film-label-project.json'),exportProject('Default film labels',{name:'fwdc239b.bin',sha256:report.baseSha256},DEFAULT_STYLES,originalSlots,FACTORY_ORDER,65));
  console.log('production default film labels PASS',report.candidateSha256);
 }
 console.log('production default film labels PASS (or explicitly skipped)');
 if(process.env.GR_TEST_SWAPPED_NAMES==='1'||process.env.GR_ONLY_SWAPPED_NAMES==='1'){
  await page.locator('[data-slot-index="1"]').dragTo(page.locator('[data-slot-index="0"]'));await page.locator('[data-policy]').check();
  const mark=await beginBuild('swapped-names');await page.locator('[data-action="build"]').click();await page.waitForTimeout(100);await idle(900000);await finishBuild(mark);
  assert.equal(await page.locator('[data-action="download"]').count(),1,await page.locator('.build-status').innerText());
  const swapped=await readReport();
  assert.deepEqual(swapped.candidate.slots.map(s=>s.nativeLabel),['Tungsten 800','Gold 200','Ektar 100','Metropolis']);
  assert.deepEqual(swapped.candidate.slots.map(s=>s.token),['Gold200','Cine800T','Ektar100','Metropolis']);
  for(const [action,file] of [['download','swapped-names-candidate.bin'],['report','swapped-names-report.json'],['checklist','swapped-names-device-checklist.md']]){
   const event=page.waitForEvent('download');await page.locator(`[data-action="${action}"]`).click();await(await event).saveAs(resolve(output,file));
  }
  assert(await verifyReportIntegrity(swapped,await readFile(resolve(output,'swapped-names-candidate.bin'))));
  await page.locator('[data-action="reset"]').click();
 }
 if(process.env.GR_ONLY_SWAPPED_NAMES!=='1'){
 const sourcePackage=await inspectStylePackage(new Uint8Array(await readFile(resolve('stylepack/fixtures/asymmetric-v2.grstyle'))));
 const wasm=await readFile(resolve('packages/firmware-fit/wasm/gr_firmware_fit_bg.wasm'));
 const compiledRecipe=await fitCube(sourcePackage.cubeBytes,{nodes:65,wasmBytes:wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength)});
 const filmIcon={template:'film-label-v1',layout:'band',top_text:'EKT',bottom_text:'100',top_color:'#D96147',bottom_color:'#E5B828'};
 const compiledBytes=await createStylePackage({cube:sourcePackage.cubeBytes,name:sourcePackage.manifest.name,style_id:sourcePackage.manifest.id,version:sourcePackage.manifest.version,author:sourcePackage.manifest.author,license:sourcePackage.manifest.license,icon:filmIcon,camera:{platform:CAMERA_TARGET,fit:compiledRecipe}});
 const compiledFile=resolve(output,'compiled-fixture.grstyle');await writeFile(compiledFile,compiledBytes);
 await choose('import-style',compiledFile);await page.locator('.style-card').first().waitFor();
 const imported=await page.locator('.style-card').last().getAttribute('data-style-id');await page.locator('.style-card').last().dragTo(page.locator('[data-slot-index="0"]'));assert.equal((await slotValues())[0],imported);assert.equal(await page.locator(`.style-card[data-style-id="${imported}"]`).count(),0);assert.equal(await page.locator(`.style-card[data-style-id="${originalSlots[0]}"]`).count(),1);await assertPartition();
 assert.deepEqual(await page.locator('[data-slot-index="0"] canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height,pixels:Array.from(canvas.getContext('2d').getImageData(0,0,32,32).data)})),{width:32,height:32,pixels:Array.from(renderIcon(filmIcon))},'Firmware renders imported film labels with exact canonical 32x32 pixels');
 assert.ok(await page.locator('[data-action="build"]').isDisabled());
 assert.equal(await page.locator('[data-accept-fit],.fit-card,[data-nodes]').count(),0);
 await page.locator('[data-policy]').check();
 assert.ok(await page.locator('[data-action="build"]').isEnabled());
 await page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle);window.__grDigestPending=false;window.__grRestoreDigest=()=>{crypto.subtle.digest=original;};crypto.subtle.digest=async(...args)=>{if(args[1].byteLength>=30000000){window.__grDigestPending=true;await new Promise(r=>setTimeout(r,500));try{return await original(...args);}finally{window.__grDigestPending=false;}}return original(...args);};});
 const customMark=await beginBuild('custom');await page.locator('[data-action="build"]').click();await observeBuildUI();await page.waitForFunction(()=>window.__grDigestPending,{},{timeout:900000});
 assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'99','final main-thread hash verification must keep progress below 100%');
 assert.equal(await page.locator('[data-progress-step="artifact"]').getAttribute('data-status'),'running','the final checkbox waits for main-thread artifact verification');
 assert(await page.evaluate(()=>Array.from(document.querySelectorAll('[data-action="base"],[data-action="import-style"],[data-action="reset"],[data-slot-pick],[data-slot-handle],[data-unassign],[data-style-pick],[data-nodes],[data-policy],[data-accept-fit],[data-remove]')).every(e=>e.disabled)),'configuration remains frozen throughout main-thread report SHA verification');
 assert(await page.locator('.style-card,.slot').evaluateAll(cards=>cards.every(card=>card.getAttribute('draggable')==='false')),'drag sources remain locked through final result verification');
 await idle(900000);await finishBuild(customMark);await assertStableBuildUI();await page.evaluate(()=>window.__grRestoreDigest());
 assert.equal(await page.locator('[data-action="download"]').count(),1,await page.locator('.build-status').innerText());
 const customReport=await readReport();assert.equal(customReport.status,'PASS');assert.equal(customReport.buildProfile,'V9.2-four-slot');assert.equal(customReport.gates.length,12);assert.ok(customReport.gates.every(g=>g.status==='PASS'));
 const customSuites=customReport.gates.find(g=>g.id==='native-arm').evidence;assert.equal(customSuites.length,13);assert.equal(Object.values(customSuites.find(s=>s.name==='V9_backend_arm').reports)[0].gammaControlCases.length,165);
 assert.equal(customReport.gates.find(g=>g.id==='candidate-native-curves').evidence.fullDomainInputs,196620);assert.equal(customReport.candidate.slots[0].nodes,65);assert.match(customReport.candidate.slots[0].packageSha256,/^[a-f0-9]{64}$/);
 assert.equal(customReport.candidate.slots[0].fitOrigin,'compiled-style');
 assert.equal(customReport.candidate.slots[0].fit.fit_sha256,compiledRecipe.report.fit_sha256);
 assert.ok(await page.locator('.build-content').evaluate(body=>body.scrollHeight<=body.clientHeight+1),'all completed steps fit without scrolling at 1280x720');
 await page.screenshot({path:resolve(output,'build-complete.png')});
 const downloadEvent=page.waitForEvent('download');await page.locator('[data-action="download"]').click();const downloaded=await downloadEvent;await downloaded.saveAs(resolve(output,'custom-candidate.bin'));
 const candidateBytes=await readFile(resolve(output,'custom-candidate.bin'));const candidateSHA=await crypto.subtle.digest('SHA-256',candidateBytes);assert.equal(Buffer.from(candidateSHA).toString('hex'),customReport.candidateSha256);
 const reportEvent=page.waitForEvent('download');await page.locator('[data-action="report"]').click();const reportDownload=await reportEvent;await reportDownload.saveAs(resolve(output,'custom-report.json'));const savedReport=JSON.parse(await readFile(resolve(output,'custom-report.json'),'utf8'));assert.deepEqual(savedReport,customReport);assert(await verifyReportIntegrity(savedReport,candidateBytes),'downloaded production report integrity');
 for(const incorrect of [undefined,'0'.repeat(64)]){const changed=structuredClone(savedReport);if(incorrect===undefined)delete changed.toolchain.unicornRuntimeSha256;else changed.toolchain.unicornRuntimeSha256=incorrect;assert.equal(await verifyReportIntegrity(await sealReport(changed),candidateBytes),false,'missing or incorrect executor identity must fail despite a fresh report hash');}
 const checklistEvent=page.waitForEvent('download');await page.locator('[data-action="checklist"]').click();const checklistDownload=await checklistEvent;await checklistDownload.saveAs(resolve(output,'custom-device-checklist.md'));const checklist=await readFile(resolve(output,'custom-device-checklist.md'),'utf8');assert.ok(checklist.includes(customReport.candidateSha256)&&checklist.includes(customReport.reportSha256));assert.match(checklist,/待实机验收|待验收|未验收|Pending|NOT RUN|REQUIRES_DEVICE/i);console.log('production custom candidate PASS',customReport.candidateSha256);
 // Development evidence only: the product deliberately exposes no Project UI.
 // Bind the real browser mapping to its exact input packages for Python readback.
 const fixtureStyle=await importStyle(compiledBytes,'compiled-fixture.grstyle');
 assert.equal(fixtureStyle.id,imported);
 await writeFile(resolve(output,'exported-project.json'),exportProject('Production browser verification',{name:'fwdc239b.bin',sha256:customReport.baseSha256},[...structuredClone(DEFAULT_STYLES),fixtureStyle],await slotValues(),FACTORY_ORDER,65));
 if(process.env.GR_REPEAT_CUSTOM_BUILD==='1'){
  const repeat=await beginBuild('repeat-custom');await page.locator('[data-action="build"]').click();await page.waitForTimeout(100);await idle(900000);await finishBuild(repeat);
  const repeated=await readReport();assert.equal(repeated.candidateSha256,customReport.candidateSha256);assert(await verifyReportIntegrity(repeated,candidateBytes));await writeFile(resolve(output,'custom-repeat-report.json'),JSON.stringify(repeated,null,2));
 }
 // Legacy packages fit automatically in the same gated build task.
 const legacyBytes=await createStylePackage({cube:sourcePackage.cubeBytes,name:'Legacy import',style_id:crypto.randomUUID(),version:'1.0.0',author:'Test',license:'NOASSERTION',icon:filmIcon});
 const legacyFile=resolve(output,'automatic-fit-fixture.grstyle');await writeFile(legacyFile,legacyBytes);
 await choose('import-style',legacyFile);await page.locator('.style-card').last().waitFor();
 const legacyStyle=await importStyle(legacyBytes,'automatic-fit-fixture.grstyle');
 await page.locator(`.style-card[data-style-id="${legacyStyle.id}"]`).dragTo(page.locator('[data-slot-index="0"]'));await page.locator('[data-policy]').check();
 const legacyMark=await beginBuild('legacy-auto-fit');await page.locator('[data-action="build"]').click();await observeBuildUI();await idle(900000);await finishBuild(legacyMark);await assertStableBuildUI();
 const legacyReport=await readReport();assert.equal(legacyReport.status,'PASS');assert.equal(legacyReport.gates.length,12);assert.equal(legacyReport.gates.find(g=>g.id==='native-arm').evidence.length,13);
 assert.equal(legacyReport.candidate.slots[0].fitOrigin,undefined);assert.equal(legacyReport.candidate.slots[0].fit.fit_sha256,compiledRecipe.report.fit_sha256);
 assert.equal(legacyReport.candidate.slots[0].acceptedFitHash,compiledRecipe.report.fit_sha256);
 const legacyDownload=page.waitForEvent('download');await page.locator('[data-action="download"]').click();await(await legacyDownload).saveAs(resolve(output,'automatic-fit-candidate.bin'));
 assert(await verifyReportIntegrity(legacyReport,await readFile(resolve(output,'automatic-fit-candidate.bin'))));
 await writeFile(resolve(output,'automatic-fit-report.json'),JSON.stringify(legacyReport,null,2)+'\n');
 await writeFile(resolve(output,'automatic-fit-project.json'),exportProject('Automatic legacy fit',{name:'fwdc239b.bin',sha256:legacyReport.baseSha256},[...structuredClone(DEFAULT_STYLES),legacyStyle],await slotValues(),FACTORY_ORDER,65));
 console.log('production automatic legacy fit PASS',legacyReport.candidateSha256);
 const beforeReturn=await slotValues();
 await page.locator('[data-slot-index="3"]').dragTo(page.locator('[data-drop-library]'));
 assert.equal((await slotValues())[3],'');assert.equal(await page.locator('[data-action="download"]').count(),0);assert.ok(await page.locator('[data-action="build"]').isDisabled());
 await page.locator(`.style-card[data-style-id="${beforeReturn[3]}"]`).dragTo(page.locator('[data-slot-index="3"]'));
 assert.deepEqual(await slotValues(),beforeReturn);await assertPartition();assert.equal(await page.locator('[data-action="download"]').count(),0);assert.ok(!await page.locator('[data-policy]').isChecked());
 assert.equal(await page.locator('[data-nodes],[data-action="fit"],[data-accept-fit]').count(),0);
 assert.equal((await slotValues())[0],legacyStyle.id);
 }
 }
 // Bare CUBE requires user declarations, never silently assigns camera calibration.
 await choose('import-style',resolve('stylepack/fixtures/asymmetric.cube'));await page.locator('dialog').waitFor();assert.match(await page.locator('dialog').innerText(),/display-sRGB/);await page.locator('dialog [data-cancel]').click();
 // Cancellation always leaves downloads unavailable, even after a previous PASS.
 await page.locator('[data-action="reset"]').click();await page.locator('[data-action="build"]').click();await page.locator('[data-action="cancel"]').click();await idle();assert.equal(await page.locator('[data-action="download"]').count(),0);assert.match(await page.locator('.build-status').innerText(),/Cancelled/);assert.ok(Number(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'))<100);for(let i=0;i<80&&page.workers().length;i++)await page.waitForTimeout(25);assert.equal(page.workers().length,0,'cancelled worker must close before suite completion');await sampleRSS('after-cancel');
 await page.screenshot({path:resolve(output,'configured-dark.png'),fullPage:true});
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:resolve(output,'compact-desktop.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.ok(requests.every(r=>r.method==='GET'));assert.equal(sampleErrors.length,0);assert.ok(rssSamples.length>0);suiteStatus='PASS';console.log(JSON.stringify({status:'PASS',surface:'production-firmware',fullDefaultFilmLabelBuild:!cancelOnly&&process.env.GR_SKIP_REFERENCE_BUILD!=='1',fullCustomBuild:!cancelOnly&&process.env.GR_ONLY_SWAPPED_NAMES!=='1',fullSwappedNamesBuild:!cancelOnly&&(process.env.GR_TEST_SWAPPED_NAMES==='1'||process.env.GR_ONLY_SWAPPED_NAMES==='1'),cancelOnly,screenshots:output},null,2));
}catch(e){const failure={error:String(e),stack:e?.stack,errors,lifecycleEvents,page:await page.locator('body').innerText({timeout:3000}).catch(error=>'unavailable: '+String(error))};await writeFile(resolve(output,'failure.json'),JSON.stringify(failure,null,2));console.error(JSON.stringify(failure,null,2));await page.screenshot({path:resolve(output,'failure.png'),fullPage:true,timeout:3000}).catch(error=>console.error('failure screenshot unavailable: '+String(error)));throw e;}finally{clearInterval(rssSampler);await sampleRSS('before-browser-close');const metrics={schema:'gr-firmware-browser-observation/v1',status:suiteStatus,tested_at:new Date().toISOString(),browser:browser.version(),node:process.version,os:{platform:os.platform(),arch:os.arch(),release:os.release(),total_memory_bytes:os.totalmem()},sampling_interval_ms:400,scope:'Sum of CDP browser-process RSS via ps; includes shared-page double counting; excludes Node test runner and OS/private-memory attribution. Sampled peaks can miss shorter spikes. No forced GC.',builds:buildMetrics,peak_aggregate_process_rss_bytes:Math.max(...rssSamples.map(r=>r.aggregate_process_rss_bytes)),workers_after_suite:page.workers().length,workerEvents,lifecycleEvents,sampleErrors,samples:rssSamples};await writeFile(resolve(output,cancelOnly?'worker-cleanup-observation.json':process.env.GR_ONLY_SWAPPED_NAMES==='1'?'name-swap-performance.json':'performance-observation.json'),JSON.stringify(metrics,null,2)+'\n');cleanupStarted=true;await browser.close();if(server)await new Promise(r=>server.close(r));}
