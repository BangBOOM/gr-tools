/** Exercise the shipped static directory: no computation endpoint or photo upload. */
import { chromium } from 'playwright';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {importStyle} from '../apps/firmware/src/project.ts';
import {evaluateRecipe,evaluateLatent,parseCube,sampleCube} from '../packages/firmware-fit/src/index.ts';
import {renderIcon} from '../packages/style-contract/src/index.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'artifacts/web-tests');await mkdir(out,{recursive:true});
const requests=[],blocked=[],errors=[],results={};
let url=process.env.GR_STUDIO_TEST_URL,server;
if(!url){server=createServer(async(req,res)=>{try{
  if(req.method!=='GET')return res.writeHead(405).end();
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)&&file!==dist)return res.writeHead(403).end();
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end(await readFile(file));
}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
url=`http://127.0.0.1:${server.address().port}`;}
url=new URL(url).origin;
let browser,sampler;const rssSamples=[];const exec=promisify(execFile);
try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-precise-memory-info']});
  const cdp=await browser.newBrowserCDPSession();let sampling=false;
  sampler=setInterval(async()=>{if(sampling)return;sampling=true;try{
    const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');
    const {stdout}=await exec('ps',['-o','rss=','-p',processInfo.map(p=>p.id).join(',')]);
    rssSamples.push(stdout.trim().split(/\s+/).reduce((s,n)=>s+Number(n),0)*1024);
  }catch{}finally{sampling=false;}},400);
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/*',route=>{const r=route.request();requests.push({method:r.method(),url:new URL(r.url()).pathname});if(new URL(r.url()).origin!==url||r.method()!=='GET'){blocked.push(r.url());return route.abort();}return route.continue();});
  page.on('pageerror',e=>errors.push(e.message));
  // index.html is the final layout: startup may fill data lists but must not move, remove, or create static structure.
  await page.addInitScript(()=>{
    if(sessionStorage.getItem('gr-static-layout-checked'))return;sessionStorage.setItem('gr-static-layout-checked','1');
    const log=window.__startupMutations={removed:[],created:[]},name=n=>n.id?'#'+n.id:n.localName+(n.className&&typeof n.className==='string'?'.'+n.className.trim().replace(/\s+/g,'.'):'');
    let marked=false;
    document.addEventListener('readystatechange',()=>{if(document.readyState!=='interactive')return;for(const n of document.body.querySelectorAll('*'))n.__static=true;marked=true;});
    const observer=new MutationObserver(records=>{if(window.__startupDone){observer.disconnect();return;}if(!marked)return;for(const r of records)if(r.type==='childList'){
      for(const n of r.removedNodes)if(n.nodeType===1&&n.__static)log.removed.push(name(n));
      for(const n of r.addedNodes)if(n.nodeType===1&&!n.__static&&!r.target.closest('#project-list,#toast,dialog'))log.created.push(name(r.target)+' > '+name(n));
    }});observer.observe(document,{subtree:true,childList:true});
  });
  await page.goto(url+'/apps/studio/');await page.waitForFunction(()=>!!window.studio?.bootstrap&&!studio.renderDirty);
  const startup=await page.evaluate(()=>{window.__startupDone=true;return window.__startupMutations;});
  assert.deepEqual(startup,{removed:[],created:[]},'startup keeps the static index.html layout');results.staticLayout=true;
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('.tool-nav [aria-current="page"]').innerText(),'Studio');
  assert.ok(!/\p{Script=Han}/u.test(await page.locator('body').innerText()),'fresh Studio interface uses English');
  assert.equal(await page.locator('.app-header button,.app-header input').count(),0);
  for(const width of [1440,900,720,390,320]){
    await page.setViewportSize({width,height:1000});
    const layout=await page.evaluate(()=>{
      const box=selector=>document.querySelector(selector).getBoundingClientRect();
      const nav=box('.tool-nav'),history=box('.history-actions'),stage=box('#stage'),name=box('.style-identity'),actions=box('.studio-actions'),header=box('.app-header');
      return {center:Math.abs((nav.left+nav.right)/2-innerWidth/2),historyAbovePhoto:history.bottom<=stage.top,historyVisible:history.width>0&&history.left>=0&&history.right<=innerWidth,nameBelowHeader:name.top>=header.bottom,actionsVisible:actions.width>0,footerPinned:innerWidth<=720||Math.abs(actions.bottom-innerHeight)<1,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(layout.center<1&&layout.historyAbovePhoto&&layout.historyVisible&&layout.nameBelowHeader&&layout.actionsVisible&&layout.footerPinned&&!layout.overflow,`Workspace layout at ${width}: ${JSON.stringify(layout)}`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:path.join(out,'studio-workspace.png')});
  const originalName=await page.locator('#look-name').inputValue();
  await page.getByRole('button',{name:'Gold Gold 200',exact:true}).click();
  const selectedName=await page.locator('#look-name').inputValue();assert.notEqual(selectedName,originalName);
  await page.locator('#undo').click();assert.equal(await page.locator('#look-name').inputValue(),originalName);
  await page.locator('#redo').click();assert.equal(await page.locator('#look-name').inputValue(),selectedName);
  assert.equal(await page.locator('#save,#save-dialog').count(),0);
  assert.equal(await page.evaluate(async()=> (await studio.services.listProjects()).length),0,'untouched Starting Styles do not create My Styles entries');
  const originalIdentity=await page.evaluate(()=>studio.services.identitySnapshot());
  const iconOnlyCube=await page.evaluate(async()=>Array.from(await studio.services.cube(studio.state,studio.$('look-name').value)));
  await page.locator('#modify-icon').click();await page.locator('#style-icon-top').fill('TUNG');
  await page.locator('#icon-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>studio.services.identitySnapshot()),originalIdentity,'Cancel does not change identity');
  await page.locator('#modify-icon').click();await page.locator('#style-icon-top').fill('');
  assert.ok(await page.locator('#confirm-icon').isDisabled());
  await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>studio.services.identitySnapshot()),originalIdentity);
  await page.locator('#modify-icon').click();await page.locator('#style-icon-top').fill('tung');await page.locator('#style-icon-bottom').fill('800');
  await page.locator('#style-icon-top-color').fill('#af3737');await page.locator('#style-icon-bottom-color').fill('#23292f');
  await page.screenshot({path:path.join(out,'studio-film-label.png')});
  const changedIcon={template:'film-label-v1',layout:'split',top_text:'TUNG',bottom_text:'800',top_color:'#AF3737',bottom_color:'#23292F'};
  await page.locator('#confirm-icon').click();
  await page.waitForFunction(()=>studio.saved&&document.querySelector('#saved-indicator').textContent==='Saved locally');
  assert.deepEqual(await page.evaluate(()=>studio.services.identitySnapshot().identity.icon),changedIcon);
  assert.deepEqual(await page.evaluate(async()=>Array.from(await studio.services.cube(studio.state,studio.$('look-name').value))),iconOnlyCube,'label edits preserve exact authored CUBE');
  assert.deepEqual(await page.locator('#style-identity-icon').evaluate(el=>Array.from(el.getContext('2d').getImageData(0,0,32,32).data)),Array.from(renderIcon(changedIcon)));
  assert.equal(await page.evaluate(()=>studio.projects.length),1);
  await page.locator('#undo').click();assert.deepEqual(await page.evaluate(()=>studio.services.identitySnapshot().identity.icon),originalIdentity.identity.icon);
  await page.locator('#redo').click();await page.waitForFunction(()=>studio.saved);
  assert.equal(await page.evaluate(()=>studio.projects.length),1,'icon undo and redo update one style identity');
  await page.evaluate(()=>{window.realSaveStyle=studio.services.saveStyle;studio.services.saveStyle=async()=>{throw new Error('Test quota exceeded');};});
  await page.locator('#look-name').fill('Retry style');await page.waitForFunction(()=>document.querySelector('#saved-indicator').textContent==='Save failed');
  assert.ok(await page.locator('#retry-save').isVisible());await page.evaluate(()=>studio.services.saveStyle=window.realSaveStyle);
  await page.locator('#retry-save').click();await page.waitForFunction(()=>studio.saved);assert.equal(await page.evaluate(()=>studio.projects.length),1);
  // Hold an old style write while a second style is created. Each save owns its snapshot.
  await page.evaluate(()=>{window.saveGate=new Promise(resolve=>window.releaseSave=resolve);studio.services.saveStyle=async(...args)=>{await window.saveGate;return window.realSaveStyle(...args);};});
  await page.locator('#look-name').fill('First queued style');
  await page.evaluate(()=>studio.selectPreset('vivid'));await page.locator('#look-name').fill('Second queued style');
  await page.evaluate(()=>{void studio.flushSave();});
  await page.evaluate(()=>{window.releaseSave();studio.services.saveStyle=window.realSaveStyle;});await page.waitForFunction(()=>studio.saved&&studio.saveJobs===0);
  const storedStyles=await page.evaluate(async()=> (await studio.services.listProjects()));
  assert.deepEqual(storedStyles.map(p=>p.name).sort(),['First queued style','Second queued style']);
  assert.equal(new Set(storedStyles.map(p=>p.id)).size,2);
  await page.evaluate(()=>{studio.services.saveStyle=async()=>{throw new Error('Old failed write');};});
  await page.locator('#look-name').fill('Old failed style');await page.waitForFunction(()=>studio.failedSaves.size===1);
  await page.evaluate(()=>{window.saveGate=new Promise(resolve=>window.releaseSave=resolve);studio.services.saveStyle=async(...args)=>{await window.saveGate;return window.realSaveStyle(...args);};});
  await page.locator('#look-name').fill('Newest queued style');await page.evaluate(()=>{void studio.flushSave();});
  await page.locator('#retry-save').click();
  await page.evaluate(()=>{window.releaseSave();studio.services.saveStyle=window.realSaveStyle;});await page.waitForFunction(()=>studio.saved&&studio.saveJobs===0&&studio.failedSaves.size===0);
  assert.equal(await page.evaluate(()=>studio.projects.find(p=>p.id===studio.services.identitySnapshot().identity.id).name),'Newest queued style','an old retry cannot overwrite a newer successful write');
  // A failed write for a departed style remains available through Retry.
  await page.evaluate(()=>{studio.services.saveStyle=async()=>{throw new Error('Departed style write');};});
  await page.locator('#look-name').fill('Departed style');await page.evaluate(()=>{studio.selectPreset('gold');});
  await page.waitForFunction(()=>studio.failedSaves.size===1);assert.ok(await page.locator('#retry-save').isVisible());
  await page.evaluate(()=>studio.services.saveStyle=window.realSaveStyle);await page.locator('#retry-save').click();await page.waitForFunction(()=>studio.saveJobs===0&&studio.failedSaves.size===0);
  assert.equal(await page.locator('#look-name').inputValue(),'Gold 200');
  assert.ok(await page.evaluate(()=>studio.projects.some(p=>p.name==='Departed style')));
  // A delayed My Styles click cannot win over a later Starting Style selection.
  await page.locator('#look-name').fill('Third queued style');
  await page.evaluate(()=>{window.saveGate=new Promise(resolve=>window.releaseSave=resolve);studio.services.saveStyle=async(...args)=>{await window.saveGate;return window.realSaveStyle(...args);};void studio.flushSave();});
  await page.locator('#tab-mine').click();
  const firstSavedId=storedStyles.find(p=>p.name==='First queued style').id;
  await page.locator(`#project-list [data-id="project-${firstSavedId}"]`).click();
  await page.evaluate(()=>studio.selectPreset('original'));await page.evaluate(()=>{window.releaseSave();studio.services.saveStyle=window.realSaveStyle;});await page.waitForFunction(()=>studio.saveJobs===0);
  assert.equal(await page.locator('#look-name').inputValue(),'Standard');
  await page.evaluate(async()=>studio.services.host.storage.save('broken-project',JSON.stringify({schema:'gr-studio-project/v1',icon:null})));
  await page.reload();await page.waitForFunction(()=>!!window.studio?.bootstrap&&!studio.renderDirty);
  assert.equal(await page.evaluate(()=>studio.projects.length),3,'corrupt local projects do not block healthy styles');
  await page.locator('#tab-mine').click();const departedId=await page.evaluate(()=>studio.projects.find(p=>p.name==='Departed style').id);await page.locator(`#project-list [data-id="project-${departedId}"]`).click();
  assert.equal(await page.locator('#look-name').inputValue(),'Departed style');
  assert.equal(await page.locator('#saved-indicator').textContent(),'Saved locally');
  // My Styles delete: Cancel keeps the style; Delete removes it from storage and the open style continues under a new identity.
  const identityBefore=await page.evaluate(()=>studio.services.identitySnapshot().identity.id);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator(`#project-list [data-remove="project-${departedId}"]`).click();
  assert.equal(await page.evaluate(()=>studio.projects.length),3,'cancelled delete keeps the style');
  page.once('dialog',dialog=>dialog.accept());await page.locator(`#project-list [data-remove="project-${departedId}"]`).click();
  await page.waitForFunction(()=>studio.projects.length===2);
  assert.equal(await page.locator(`#project-list [data-id="project-${departedId}"]`).count(),0);
  assert.ok(!(await page.evaluate(async()=>(await studio.services.listProjects()).map(p=>p.id))).includes(departedId),'deleted style leaves local storage');
  assert.equal(await page.locator('#look-name').inputValue(),'Departed style','deleting the open style keeps the editor state');
  assert.notEqual(await page.evaluate(()=>studio.services.identitySnapshot().identity.id),identityBefore,'the open style gets a new identity');
  assert.equal(await page.locator('#saved-indicator').textContent(),'Not saved');
  await page.locator('#tab-presets').click();await page.evaluate(()=>studio.selectPreset('original'));await page.waitForFunction(()=>!studio.renderDirty);
  results.workspace={responsiveWidths:[1440,900,720,390,320],history:true,topIconModify:true,iconCancelAndEscape:true,iconUndoRedo:true,automaticLocalSave:true,saveFailureRetry:true,queuedStyleIsolation:true,staleRetryRejected:true,departedWriteRecovery:true,staleSelectionRejected:true,deleteSavedStyle:true,corruptStorageSkipped:true,reloadRestore:true,headerNavigationOnly:true};
  const beforeLight=await page.evaluate(()=>studio.snapshot());
  await page.locator('#tab-light').click();
  assert.equal(await page.locator('#tone-curve').evaluate(el=>el.tagName),'SECTION');
  assert.ok(await page.locator('#tone-curve #curve-editor').isVisible());
  assert.equal(await page.locator('[data-light-color="all"]').getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('#light-global-tools').isVisible());
  const setColorBrightness=async(band,fraction)=>{
    await page.locator(`[data-light-color="${band}"]`).click();
    const slider=page.locator('#light-color-brightness');await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();
    await page.mouse.click(box.x+box.width*fraction,box.y+box.height/2);
    return page.evaluate(b=>studio.state.mixer[b].luminance,band);
  };
  const blueLight=await setColorBrightness('blue',.67),greenLight=await setColorBrightness('green',.35);
  assert.ok(blueLight>25&&greenLight< -20);assert.equal(await page.evaluate(()=>studio.state.mixer.blue.luminance),blueLight);
  assert.equal(await page.locator('.light-color-chip.has-edit').count(),2);
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>studio.state.mixer.green.luminance),0);
  assert.equal(await page.evaluate(()=>studio.state.mixer.blue.luminance),blueLight);await page.locator('#redo').click();
  await page.locator('#tab-matrix').click();await page.locator('[data-touch-color="blue"]').click();
  assert.equal(await page.locator('[data-touch-axis],#selected-luminance').count(),0,'Color has no duplicate brightness control');
  assert.equal(await page.locator('#overall-color #slider-saturation,#overall-color #slider-vibrance,#overall-color #global-color-pad').count(),3);
  assert.equal(await page.locator('#pane-matrix > #rgb-curves').count(),1);
  assert.equal(await page.locator('.touch-bases,#matrix-target,#matrix-mix,#matrix-grid').count(),0,'Base palette controls are removed');
  await page.locator('#touch-pad').focus();await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(()=>studio.state.mixer.blue),{hue:2,saturation:2,luminance:blueLight});
  await page.locator('[data-touch-color="green"]').click();await page.locator('#touch-pad').press('ArrowLeft');
  await page.locator('[data-touch-color="blue"]').click();
  assert.equal(await page.locator('#touch-colors .has-edit').count(),2,'each color retains its own hue and saturation');
  const compared=await page.evaluate(()=>studio.touchOriginalState(studio.state));
  assert.deepEqual(compared.mixer.blue,{hue:0,saturation:0,luminance:blueLight});assert.equal(compared.mixer.green.hue,-2);
  await page.locator('#touch-reset').click();
  assert.deepEqual(await page.evaluate(()=>studio.state.mixer.blue),{hue:0,saturation:0,luminance:blueLight},'Color reset preserves Light brightness');
  await page.locator('#undo').click();assert.equal(await page.evaluate(()=>studio.state.mixer.blue.saturation),2);
  await page.locator('#redo').click();assert.equal(await page.evaluate(()=>studio.state.mixer.blue.saturation),0);
  await page.locator('#selected-color-values summary').click();await page.locator('#selected-saturation').fill('33');await page.locator('#selected-saturation').press('Tab');
  assert.equal(await page.evaluate(()=>studio.state.mixer.blue.saturation),33);assert.equal(await page.evaluate(()=>studio.state.mixer.blue.luminance),blueLight);
  await page.locator('#overall-color summary').first().click();await page.locator('#global-color-pad').press('ArrowRight');
  assert.equal(await page.evaluate(()=>studio.state.values.warmth),2);
  await page.screenshot({path:path.join(out,'studio-color-controls.png')});
  await page.locator('#color-brightness-link').click();
  assert.equal(await page.locator('[data-light-color="blue"]').getAttribute('aria-pressed'),'true');
  assert.equal(Number(await page.locator('#light-color-brightness').inputValue()),blueLight);
  await page.locator('#light-color-value').click();assert.equal(await page.evaluate(()=>studio.state.mixer.blue.luminance),0);
  assert.equal(await page.evaluate(()=>studio.state.mixer.green.luminance),greenLight);
  await page.locator('[data-light-color="all"]').click();assert.ok(await page.locator('#light-color-control').isHidden());
  const toneBefore=await page.evaluate(()=>studio.state.curves.master[2]);
  await page.locator('#curve-points [data-index="2"]').focus();await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(()=>studio.state.curves.master[2]),toneBefore+.01);
  assert.equal(await page.evaluate(()=>studio.state.mixer.green.luminance),greenLight);
  const lightConfig=await page.evaluate(async()=>{const config=await studio.services.config(studio.state,'Two colors',null);const restored=await studio.services.importConfig(config);return restored.state.mixer.green.luminance;});assert.equal(lightConfig,greenLight);
  await page.evaluate(s=>{studio.restore(s);studio.lightScope='all';studio.editorTab('style');},beforeLight);
  results.light={globalDefault:true,toneCurveAlwaysOpen:true,multipleColors:true,resetIsolation:true,undoRedo:true,configurationRoundtrip:true};
  results.color={hueSaturationOnly:true,brightnessLink:true,brightnessPreservedByResetAndComparison:true,multipleColors:true,numericValues:true,globalControlsGrouped:true,flatSections:true,undoRedo:true};
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  assert.equal(await page.locator('#build-firmware').count(),0);assert.equal(await page.locator('#mode-camera').count(),1);
  results.configuration=await page.evaluate(async()=>{
    const before=await studio.services.config(studio.state,'AB Sunset',null);
    await studio.services.importConfig(Object.fromEntries(Object.entries(before).reverse()));
    const after=await studio.services.config(studio.state,'AB Sunset',null);
    if(before.content_sha256!==after.content_sha256)throw new Error('Config changed during roundtrip');
    let rejects=0;try{studio.services.strictJSON('{"state":{},"state":{}}');}catch{rejects++;}
    const bad=structuredClone(before);bad.state.values.brightness=20;try{await studio.services.importConfig(bad);}catch{rejects++;}
    if(rejects!==2)throw new Error('Corrupt config was accepted');
    await studio.services.saveStyle(studio.state,'AB Sunset',null,studio.services.identitySnapshot());
    return {schema:before.schema,icon:before.icon,sha256:before.content_sha256,malformedRejected:rejects};
  });
  results.legacyMatrix=await page.evaluate(async()=>{
    const saved=studio.snapshot(),custom=studio.clone(studio.state);custom.matrix={from:'nega',to:'posi',mix:37,offset:[.02,-.02,0,0,0,0,0,0,0],neutral_lock:true};
    const expected=Array.from(await studio.services.cube(custom,'Legacy matrix'));
    const legacy={schema:'gr-color-studio/v1',name:'Legacy matrix',state:custom};
    if(!await studio.importProject(new File([JSON.stringify(legacy)],'legacy-matrix.grstyle.json',{type:'application/json'})))throw new Error('Legacy matrix import failed');
    const matrix=JSON.stringify(studio.state.matrix);studio.editorTab('matrix');studio.syncControls();
    if(JSON.stringify(Array.from(await studio.services.cube(studio.state,'Legacy matrix')))!==JSON.stringify(expected))throw new Error('Hidden legacy matrix changed the LUT');
    const config=await studio.services.config(studio.state,'Legacy matrix',null),restored=await studio.services.importConfig(config);
    if(JSON.stringify(restored.state.matrix)!==matrix)throw new Error('Saving lost the legacy matrix');
    const without=studio.clone(studio.state);delete without.matrix;
    if(JSON.stringify(Array.from(await studio.services.cube(without,'Legacy matrix')))===JSON.stringify(expected))throw new Error('Legacy matrix is no longer applied');
    studio.restore(saved);return {import:true,saveRoundtrip:true,exactCubePreserved:true,matrixStillApplied:true};
  });
  results.legacyRawContext=await page.evaluate(async()=>{
    const source_sha256='a'.repeat(64),legacy={schema:'gr-color-studio/v1',name:'Legacy RAW',state:{},raw_development:{source_sha256,settings:{exposure:1}}};
    const imported=await studio.importProject(new File([JSON.stringify(legacy)],'legacy.grstyle.json',{type:'application/json'}));
    if(!imported)throw new Error('Legacy project import failed');
    if(studio.state.base!=='original'||studio.state.strength!==100)throw new Error('Imported state was not normalized');
    if(studio.pendingRawContext.filename!=='photo.dng'||studio.pendingRawContext.source_sha256!==source_sha256||JSON.stringify(studio.pendingRawContext.settings)!==JSON.stringify({exposure:1,wb:'camera',temperature:0,tint:0}))throw new Error('Legacy RAW defaults were not applied');
    const before=JSON.stringify(studio.state),bad=structuredClone(legacy);bad.raw_development.settings.exposure=4;
    if(await studio.importProject(new File([JSON.stringify(bad)],'bad.grstyle.json',{type:'application/json'})))throw new Error('Invalid RAW settings were accepted');
    if(JSON.stringify(studio.state)!==before)throw new Error('Failed import changed the current state');
    studio.applyRawContext(null);studio.queuePreview(0);
    return {normalizedState:true,legacyDefaults:true,invalidSettingsRejected:true};
  });
  await page.locator('#export').click();
  assert.equal(await page.locator('#download-package strong').innerText(),'Style for Firmware');
  assert.ok(await page.locator('#download-package').isEnabled(),'styles export without a DNG');
  assert.ok(await page.locator('#download-photo').isDisabled(),'photo export requires a DNG');
  assert.ok(await page.locator('[name="export-photo-format"][value="jpeg"]').isChecked());
  assert.ok(await page.locator('[name="export-photo-size"][value="full"]').isChecked());
  assert.equal(await page.locator('#export-more,#download-project,#download-cube').count(),0);
  // A fresh/default icon and a blank name must not invalidate their own preparation.
  await page.evaluate(()=>studio.services.startStyle(''));
  await page.locator('#export-name').fill('');
  assert.equal(await page.locator('#look-name').inputValue(),'');
  await page.locator('#download-package').click();
  await page.locator('#camera-review-download').waitFor({state:'visible',timeout:180000});
  assert.ok(await page.locator('#camera-review-previews').isHidden());
  const noPhotoDownload=page.waitForEvent('download');await page.locator('#camera-review-download').click();
  const noPhotoStyle=await noPhotoDownload;await noPhotoStyle.saveAs(path.join(out,'no-photo.grstyle'));
  const noPhotoImported=await importStyle(new Uint8Array(await readFile(path.join(out,'no-photo.grstyle'))),'no-photo.grstyle');
  assert.equal(noPhotoImported.name,'Untitled Style');assert.equal(noPhotoImported.compiledFit.origin,'compiled-style');
  assert.equal(noPhotoImported.compiledFit.curves_q14[0].length,65);
  assert.equal((await page.locator('#camera-review-download').innerText()).trim(),'Download style');
  assert.equal(await page.locator('.download-ready,a[download]').count(),0,'download leaves no duplicate action');
  await page.locator('#export-name').fill('Camera review test');
  assert.equal(await page.locator('#look-name').inputValue(),'Camera review test');
  assert.ok(await page.locator('#camera-review-download').isHidden(),'name changes invalidate review');
  await page.locator('#download-package').click();
  await page.locator('#export-name').fill('Renamed during preparation');
  assert.equal(await page.evaluate(()=>studio.cameraReviewPending),false,'rename cancels the preceding preparation');
  await page.locator('#download-package').click();await page.locator('#camera-review-cancel').click();
  assert.ok(await page.locator('#camera-review').isHidden());
  assert.equal(await page.evaluate(()=>studio.cameraReviewPending),false);
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('#camera-review-download')).some(e=>!e.hidden));
  await page.screenshot({path:path.join(out,'studio-export-no-photo.png')});
  await page.locator('#export-dialog .close-dialog').click();
  const dng=process.env.GR_DNG_PATH;if(!dng)throw new Error('GR_DNG_PATH must name a real GR III DNG');
  // Use a browser File so the drop follows the same path as a file-manager drag.
  await page.evaluate(()=>{const input=document.createElement('input');input.id='drop-fixture';input.type='file';input.hidden=true;document.body.append(input);});
  await page.locator('#drop-fixture').setInputFiles(dng);
  const dataTransfer=await page.evaluateHandle(()=>{const transfer=new DataTransfer();transfer.items.add(studio.$('drop-fixture').files[0]);return transfer;});
  await page.dispatchEvent('#stage','dragenter',{dataTransfer});
  assert.ok(await page.locator('#drop-overlay').isVisible());
  assert.ok(await page.locator('#stage').evaluate(el=>el.classList.contains('drag-over')));
  await page.dispatchEvent('#choose-photo','dragenter',{dataTransfer});
  await page.dispatchEvent('#stage','dragleave',{dataTransfer});
  assert.ok(await page.locator('#drop-overlay').isVisible(),'crossing a child keeps the drop target active');
  await page.dispatchEvent('#choose-photo','dragleave',{dataTransfer});
  assert.ok(await page.locator('#drop-overlay').isHidden(),'leaving the target clears the highlight');
  await page.dispatchEvent('#stage','dragenter',{dataTransfer});
  const acceptsDrop=await page.evaluate(transfer=>{const event=new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true});studio.$('stage').dispatchEvent(event);return event.defaultPrevented;},dataTransfer);
  assert.ok(acceptsDrop,'dragover enables file dropping instead of browser navigation');
  await page.screenshot({path:path.join(out,'studio-dng-drop.png')});
  const started=Date.now();await page.dispatchEvent('#choose-photo','drop',{dataTransfer});
  assert.ok(await page.locator('#drop-overlay').isHidden(),'dropping clears the highlight');
  await dataTransfer.dispose();await page.evaluate(()=>studio.$('drop-fixture').remove());
  await page.waitForFunction(()=>studio.activePhoto?.edited&&!studio.renderDirty&&studio.rawImports===0,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>studio.photos.length),1,'one drop imports the DNG once');
  results.dngDrop={fileManagerFile:true,nestedTarget:true,leaveClearsHighlight:true,acceptsDrop:true,singleImport:true};
  results.dng=await page.evaluate(()=>({meta:studio.activePhoto.raw.meta,pixels:studio.activePhoto.edited.length,heap:performance.memory?.usedJSHeapSize}));results.dng.elapsed_ms=Date.now()-started;
  assert.equal(results.dng.meta.source_width,6000);assert.equal(results.dng.meta.source_height,4000);
  await page.screenshot({path:path.join(out,'studio-dng.png')});
  const beforeGR=await page.evaluate(()=>studio.snapshot());
  // GR Preview: GPU output from the latent equals the CPU chain, its recipe equals the exported fit, and edits settle quickly.
  await page.locator('#mode-camera').click();
  const grSettled=()=>page.waitForFunction(()=>!studio.renderDirty&&studio.cameraFrame?.profile===studio.currentProfile&&studio.$('preview-note').textContent==='GR Preview · Approx.');
  await page.evaluate(()=>{studio.state.values.contrast=35;studio.state.values.warmth=-20;studio.queuePreview(0);});await grSettled();
  const grSample=await page.evaluate(()=>{const {width,height}=studio.activePhoto,pixels=studio.ctx.getImageData(0,0,width,height).data,rgb=[],shown=[];
    for(let k=0;k<4096;k++){const i=Math.floor((k+.5)/4096*width*height);rgb.push(...studio.activePhoto.latent.slice(i*3,i*3+3));shown.push(...pixels.slice(i*4,i*4+3));}
    return {rgb,shown,recipe:studio.cameraFrame.recipe};});
  const grExpected=evaluateLatent(grSample.rgb,grSample.recipe);let grMax=0;
  for(let i=0;i<grExpected.length;i++)grMax=Math.max(grMax,Math.abs(grSample.shown[i]-Math.round(grExpected[i]*255)));
  assert.ok(grMax<=1,`GR Preview differs from evaluateLatent by ${grMax} codes`);
  const grExport=await page.evaluate(async()=>{const fit=(await studio.services.prepareCamera(studio.state,'GR Preview check')).fit;return JSON.stringify({matrix_q13:fit.matrix_q13,curves_q14:fit.curves_q14})===JSON.stringify(studio.cameraFrame.recipe);});
  assert.ok(grExport,'GR Preview recipe equals the exported recipe');
  const grLatency=await page.evaluate(async()=>{
    const settle=()=>new Promise(resolve=>{const t=performance.now(),poll=()=>!studio.renderDirty&&studio.cameraFrame?.profile===studio.currentProfile?resolve(performance.now()-t):requestAnimationFrame(poll);poll();});
    const single=[],drag=[],slider=studio.$('slider-contrast');
    for(let i=0;i<8;i++){slider.value=String(10+i*7);slider.dispatchEvent(new Event('input'));single.push(await settle());}
    const notes=[],observer=new MutationObserver(()=>notes.push(studio.$('preview-note').textContent));observer.observe(studio.$('preview-note'),{childList:true,characterData:true,subtree:true});
    for(let i=0;i<4;i++){for(let j=0;j<20;j++){slider.value=String(-60+i*5+j*4);slider.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,16));}drag.push(await settle());}
    observer.disconnect();
    const stats=a=>({median_ms:[...a].sort((x,y)=>x-y)[a.length>>1],max_ms:Math.max(...a)});
    return {noteFlicker:notes.filter(t=>t!=='GR Preview · Approx.').length,scope:'Last slider input to displayed GR Preview of that state, rAF polling; includes 110 ms preview debounce, LUT bake, fit, GPU draw',single:stats(single),afterDrag:stats(drag)};});
  assert.equal(grLatency.noteFlicker,0,'GR Preview note stays steady while dragging');
  results.grPreview={gpuMaxCodes:grMax,samples:4096,exportRecipeEqual:true,latency:grLatency};
  await page.screenshot({path:path.join(out,'studio-gr-preview.png')});
  await page.locator('#mode-full').click();await page.evaluate(s=>studio.restore(s),beforeGR);await page.waitForFunction(()=>!studio.renderDirty);
  const beforeColorPhoto=await page.evaluate(()=>studio.snapshot());
  await page.locator('#tab-matrix').click();await page.locator('#touch-pick').click();
  const colorPhotoBox=await page.locator('#preview').boundingBox(),colorX=colorPhotoBox.x+colorPhotoBox.width*.7,colorY=colorPhotoBox.y+colorPhotoBox.height*.4;
  await page.mouse.move(colorX,colorY);await page.mouse.down();
  await page.waitForFunction(()=>!!studio.touchPhotoDrag?.band);
  await page.mouse.move(colorX+24,colorY-20,{steps:4});await page.mouse.up();
  await page.waitForFunction(()=>studio.touchPhotoDrag===null&&!studio.renderDirty);
  const photoMixer=await page.evaluate(()=>studio.clone(studio.state.mixer));
  assert.ok(Object.values(photoMixer).some(m=>m.hue!==0&&m.saturation!==0));
  assert.deepEqual(Object.values(photoMixer).map(m=>m.luminance),Object.values(beforeColorPhoto.state.mixer).map(m=>m.luminance),'Color photo drag preserves brightness');
  await page.screenshot({path:path.join(out,'studio-color-dng.png')});
  await page.evaluate(()=>{const original=studio.services.pickColor;studio.services.pickColor=(state,rgb)=>new Promise(resolve=>{window.finishColorPick=async()=>{studio.services.pickColor=original;resolve(await original(state,rgb));};});});
  await page.mouse.click(colorX,colorY);await page.waitForFunction(()=>typeof window.finishColorPick==='function');
  const colorBeforeSwitch=await page.evaluate(()=>JSON.stringify(studio.state));
  await page.locator('#color-brightness-link').click();
  await page.evaluate(async()=>{await window.finishColorPick();delete window.finishColorPick;});
  assert.equal(await page.evaluate(()=>JSON.stringify(studio.state)),colorBeforeSwitch);assert.equal(await page.evaluate(()=>studio.touchPhotoDrag),null);
  await page.evaluate(s=>studio.restore(s),beforeColorPhoto);results.color.photoDrag=true;results.color.stalePickRejected=true;
  await page.locator('#tab-light').click();await page.locator('#light-pick').click();
  const photoBox=await page.locator('#preview').boundingBox();
  await page.mouse.click(photoBox.x+photoBox.width*.7,photoBox.y+photoBox.height*.4);
  await page.waitForFunction(()=>studio.lightScope!=='all');
  assert.ok(await page.locator('#light-color-brightness').isVisible());
  // A late picker result cannot replace a new scope selection.
  await page.evaluate(()=>{const original=studio.services.pickColor;studio.services.pickColor=(state,rgb)=>new Promise(resolve=>{window.finishLightPick=async()=>{studio.services.pickColor=original;resolve(await original(state,rgb));};});});
  await page.mouse.click(photoBox.x+photoBox.width*.4,photoBox.y+photoBox.height*.6);
  await page.waitForFunction(()=>typeof window.finishLightPick==='function');
  await page.locator('[data-light-color="all"]').click();
  await page.evaluate(async()=>{await window.finishLightPick();delete window.finishLightPick;});
  assert.equal(await page.evaluate(()=>studio.lightScope),'all');assert.equal(await page.evaluate(()=>studio.lightDrag),null);
  await page.locator('#tab-style').click();results.light.photoPick=true;results.light.stalePickRejected=true;
  // Basic editing, advanced HSL, curve and matrix gestures still use the author engine.
  await page.evaluate(()=>{studio.state.values.warmth=25;studio.state.film.highlight_softness=35;studio.state.curves.master=[0,.2,.55,.8,1];studio.state.mixer.blue.hue=15;studio.syncControls();studio.queuePreview(0);});
  await page.waitForFunction(()=>!studio.renderDirty);const changedHash=await page.evaluate(()=>studio.currentProfile.look_sha256);
  assert.ok(changedHash);
  results.export=await page.evaluate(async()=>{
    const result=await studio.services.exportRaw(studio.activePhoto.raw.id,studio.activePhoto.raw.appliedSettings,structuredClone(studio.state),'png');
    const bitmap=await createImageBitmap(result.blob),c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});ctx.drawImage(bitmap,0,0);
    const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==result.rgba_sha256)throw new Error('PNG decoded pixels differ from output buffer');
    const samples=[];for(let i=0;i<4096;i++){const at=Math.floor((i+.5)*bitmap.width*bitmap.height/4096)*4;samples.push(pixels[at],pixels[at+1],pixels[at+2]);}
    const answer={width:bitmap.width,height:bitmap.height,bytes:result.blob.size,pixel_sha256:hash,pixel_exact:true,samples};bitmap.close();c.width=c.height=1;return answer;
  });
  assert.deepEqual([results.export.width,results.export.height],[6000,4000]);
  const jpeg=await page.evaluate(async()=>{
    const r=await studio.services.exportRaw(studio.activePhoto.raw.id,studio.activePhoto.raw.appliedSettings,structuredClone(studio.state),'jpeg');
    const image=await createImageBitmap(r.blob),c=new OffscreenCanvas(image.width,image.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,c.width,c.height).data,samples=[];
    for(let i=0;i<4096;i++){const at=Math.floor((i+.5)*image.width*image.height/4096)*4;samples.push(data[at],data[at+1],data[at+2]);}
    const result={width:image.width,height:image.height,bytes:r.blob.size,samples};image.close();c.width=c.height=1;return result;
  });
  assert.deepEqual([jpeg.width,jpeg.height],[6000,4000]);
  const squared=jpeg.samples.map((v,i)=>(v-results.export.samples[i])**2),rmse=Math.sqrt(squared.reduce((a,b)=>a+b,0)/squared.length);
  assert.ok(rmse<8,`Fixture JPEG RGB RMSE ${rmse} exceeds 8/255`);
  results.jpeg={width:jpeg.width,height:jpeg.height,bytes:jpeg.bytes,rmse_8bit:rmse,sample_pixels:4096,quality:.95,scope:'Fixture-specific lossy pixel regression; encoded bytes are not required to match'};delete results.export.samples;
  await page.locator('#export').click();
  await page.screenshot({path:path.join(out,'studio-export.png')});
  for(const [size,format,ext] of [['full','jpeg','.jpg'],['full','png','.png'],['preview','jpeg','.jpg'],['preview','png','.png']]){
    await page.locator(`[name="export-photo-size"][value="${size}"]`).check();await page.locator(`[name="export-photo-format"][value="${format}"]`).check();
    const downloading=page.waitForEvent('download',{timeout:90000});await page.locator('#download-photo').click();
    if(size==='full'){
      assert.ok(await page.locator('#download-photo').isDisabled(),'serial full-size export');
      if(format==='jpeg'){
        await page.locator('#export-dialog .close-dialog').click();await page.locator('#export').click();
        assert.ok(await page.locator('#download-photo').isDisabled(),'reopening the dialog does not start a second RAW export');
      }
    }
    const d=await downloading;assert.ok(d.suggestedFilename().endsWith(ext));
    assert.ok(d.suggestedFilename().includes(size==='full'?'-full.':'-preview.'));
    const file=path.join(out,'studio-'+size+ext);await d.saveAs(file);
    const bytes=await readFile(file),expected=size==='full'?[6000,4000]:[results.dng.meta.width,results.dng.meta.height];
    if(format==='png')assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],expected);
    else assert.deepEqual(await page.evaluate(async encoded=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));const size=[image.width,image.height];image.close();return size;},bytes.toString('base64')),expected);
    await page.waitForFunction(()=>!studio.photoExportPending);
  }
  await page.locator('#export-name').fill('Warm afternoon');
  await page.locator('#download-package').click();
  await page.locator('#camera-review-download').waitFor({state:'visible',timeout:180000});
  assert.ok(await page.locator('#camera-review-previews').isVisible());
  assert.equal(await page.evaluate(()=>studio.cameraReview.prepared.fit.report.camera_calibrated),false);
  const reviewedFit=await page.evaluate(()=>studio.cameraReview.prepared.fit);
  const comparison=await page.evaluate(()=>({cube:Array.from(studio.cameraReview.prepared.cube),input:Array.from(studio.activePhoto.thumbPixels),authored:Array.from(new Uint8Array(studio.cameraReview.prepared.authored)),camera:Array.from(new Uint8Array(studio.cameraReview.prepared.camera))}));
  const rgb=Float64Array.from(comparison.input.filter((_,i)=>i%4!==3),v=>v/255);
  const pixels=values=>Array.from(values,v=>Math.min(255,Math.max(0,Math.round(v*255))));
  assert.deepEqual(comparison.authored.filter((_,i)=>i%4!==3),pixels(sampleCube(parseCube(Uint8Array.from(comparison.cube)),rgb)),'preview evaluates exact authored CUBE');
  assert.deepEqual(comparison.camera.filter((_,i)=>i%4!==3),pixels(evaluateRecipe(rgb,reviewedFit)),'preview evaluates installed matrix and curves directly');
  await page.screenshot({path:path.join(out,'studio-camera-review.png')});
  const packageDownload=page.waitForEvent('download');await page.locator('#camera-review-download').click();
  const styleDownload=await packageDownload;assert.equal(styleDownload.suggestedFilename(),'Warm afternoon.grstyle');await styleDownload.saveAs(path.join(out,'studio.grstyle'));
  assert.equal(await page.locator('.download-ready,a[download]').count(),0,'style and photo downloads leave no duplicate action');
  const exportedStyle=await importStyle(new Uint8Array(await readFile(path.join(out,'studio.grstyle'))),'studio.grstyle');
  const authored=await page.evaluate(async()=>({config:await studio.services.config(studio.state,studio.$('look-name').value,studio.rawContext()),cube:Array.from(await studio.services.cube(studio.state,studio.$('look-name').value))}));
  assert.equal(exportedStyle.name,authored.config.name);assert.deepEqual({...exportedStyle.icon},authored.config.icon);
  assert.equal(exportedStyle.name,'Warm afternoon');
  assert.deepEqual(Buffer.from(exportedStyle.cube),Buffer.from(authored.cube),'Firmware imports the exact authored LUT');
  assert.equal(JSON.stringify(exportedStyle.compiledFit.report),JSON.stringify(reviewedFit.report),'Firmware retains the reviewed recipe without refitting');
  assert.deepEqual(exportedStyle.compiledFit.matrix_q13,reviewedFit.matrix_q13);
  results.exportMenu={styleFormats:['grstyle'],firmwareImport:true,compiledRecipe:true,nodes:65,reviewPreview:true,cancelPreparation:true,blankName:true,editableName:true,renameCancelsPreparation:true,singleDownloadAction:true,photoFormats:['jpeg','png'],photoSizes:['full','preview'],defaultPhoto:{format:'jpeg',size:'full'},styleWithoutPhoto:true};
  await page.locator('#export-dialog .close-dialog').click();
  results.cancellation=await page.evaluate(async()=>{
    const f=studio.services.files.get(studio.activePhoto.raw.id),start=performance.now(),job=studio.services.raw.decode(f,{exposure:1,wb:'camera',temperature:0,tint:0});
    const rejected=job.then(()=>false,e=>e.name==='AbortError');studio.services.raw.cancel();if(!await rejected)throw new Error('Cancellation did not reject');
    const recovered=await studio.services.raw.decode(f,{exposure:0,wb:'custom',temperature:25,tint:-10});
    return {cancelled:true,recovered:recovered.meta.settings,elapsed_ms:performance.now()-start};
  });
  // A renamed PNG must fail sniffing, keep the preceding photo, and release the new file capability.
  await page.locator('#photo-input').setInputFiles({name:'fake.dng',mimeType:'image/x-adobe-dng',buffer:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])});
  await page.waitForFunction(()=>studio.rawImports===0);assert.match(await page.locator('#toast').textContent(),/DNG/);
  assert.equal(await page.evaluate(()=>studio.photos.length),1);
  await page.evaluate(()=>{studio.exportPackage();studio.removePhoto();});assert.equal(await page.evaluate(()=>studio.services.files.size),0);
  assert.equal(await page.evaluate(()=>studio.cameraReview),null,'removing the photo invalidates its comparison');
  assert.equal(await page.evaluate(()=>studio.cameraReviewPending),false,'removing the photo cancels preparation');
  for(let i=0;i<3;i++){
    await page.locator('#photo-input').setInputFiles(dng);
    await page.waitForFunction(()=>studio.activePhoto?.edited&&!studio.renderDirty&&studio.rawImports===0,null,{timeout:90000});
    await page.evaluate(()=>studio.removePhoto());
  }
  results.lifecycle={removed:true,heap:await page.evaluate(()=>performance.memory?.usedJSHeapSize),scope:'Chromium JS heap only; excludes full WASM/process peak'};
  const pageCDP=await page.context().newCDPSession(page);await pageCDP.send('HeapProfiler.collectGarbage');await page.waitForTimeout(800);
  // Editor, color and GR Preview workers persist; the RAW worker must not.
  const persistentWorker=/\/assets\/(render|color|preview)\.worker-[\w-]+\.js$/;results.lifecycle.workers_after_remove=page.workers().length;assert.ok(page.workers().every(w=>persistentWorker.test(w.url())),'RAW worker survived photo release');
  results.lifecycle.heap_after_gc=await page.evaluate(()=>performance.memory?.usedJSHeapSize);
  results.memory={samples:rssSamples.length,peak_aggregate_process_rss_bytes:Math.max(...rssSamples),last_aggregate_process_rss_bytes:rssSamples.at(-1),scope:'Sum of RSS for browser CDP-reported processes sampled every 400 ms; includes shared-page double counting, not peak private memory; three additional DNG import/remove cycles'};
  // Import the actual Studio download through Firmware's browser UI.
  const firmware=await browser.newPage({viewport:{width:1280,height:720}});
  firmware.on('pageerror',e=>errors.push(e.message));
  await firmware.route('**/*',route=>{const r=route.request();requests.push({method:r.method(),url:new URL(r.url()).pathname});if(new URL(r.url()).origin!==url||r.method()!=='GET'){blocked.push(r.url());return route.abort();}return route.continue();});
  await firmware.goto(url+'/apps/firmware/');await firmware.locator('.slot').first().waitFor();
  const chooseStyle=firmware.waitForEvent('filechooser');await firmware.locator('[data-action="import-style"]').click();await(await chooseStyle).setFiles(path.join(out,'studio.grstyle'));
  const card=firmware.locator(`.style-card[data-style-id="${exportedStyle.id}"]`);await card.waitFor();
  await card.dragTo(firmware.locator('[data-slot-index="0"]'));
  assert.equal(await firmware.locator('[data-accept-fit],[data-action="fit"],[data-action="plan"],[data-nodes],.fit-card').count(),0,'compiled import uses the single-action build surface');
  assert.equal(await firmware.locator('[data-slot-index="0"]').getAttribute('data-style-id'),exportedStyle.id);
  assert.equal(await card.count(),0,'assigned Studio style leaves the available library');
  assert.equal(firmware.workers().length,0,'compiled import requires no fitting Worker');
  assert.ok(!await firmware.locator('[data-policy]').isChecked(),'the DNG/settings acknowledgment is not inherited from Studio');
  results.exportMenu.firmwareBrowserImport=true;await firmware.close();
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  results.network={origin:url,requests:requests.length,methods:[...new Set(requests.map(r=>r.method))],externalRequests:blocked,apiRequests:requests.filter(r=>r.url.startsWith('/api/'))};
  assert.deepEqual(results.network.apiRequests,[]);
  results.status='PASS';await writeFile(path.join(out,'studio-report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{clearInterval(sampler);await browser?.close();if(server)await new Promise(r=>server.close(r));}
