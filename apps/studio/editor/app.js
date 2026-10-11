import {services} from '../services.ts';
import {showFit,syncAdvanced,wireAdvanced} from './advanced.js';
import {showColorTouchProfile,syncColorTouch,syncTouchPin,touchOriginalState,touchPreviewPending,wireColorTouch} from './color-touch.js';
import {wireContextTools} from './context-tools.js';
import {syncStartingNavigation,wireFlow} from './flow.js';
import {setLightZone,syncLightIntent,syncLightPin,wireLightIntent} from './intent-light.js';
import {wireCompactInterface} from './interface.js';
import {matrixBeforeHeld,syncMatrix,wireMatrix} from './matrix.js';
import {addRawPhoto,applyRawContext,cancelRawTasks,pendingRawContext,rawContext,rawStatus,rawTaskEpoch,restoreRawSnapshot,setPendingRawContext,syncRawPanel,wireRaw} from './raw.js';
export {$,activePhoto,bootstrap,bumpSequence,cameraFrame,cameraReview,cameraReviewPending,canvas,clone,ctx,currentProfile,dirty,drawMain,drawPhotoStrip,exportPackage,failedSaves,flushSave,history,importProject,invalidateCameraReview,lutBuffer,photoExportPending,photos,previewBusy,previewReady,previewRequestActive,previewWorkerActive,projects,queuePreview,remember,renderDirty,renderThumbnails,restore,saveJobs,saved,selectPhoto,selectPreset,setActivePhoto,setRenderDirty,setState,snapshot,startEditor,state,syncControls,toast,viewTab,worker};
/** Editor element lookup. Untyped: the editor JS checks names and imports, not DOM element types. @type {(id:string)=>any} */
const $ = id => document.getElementById(id);
const svg = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Basic sliders in index.html: #slider-<key>, #value-<key>, #fill-<key>.
const sliderKeys=['brightness','contrast','saturation','warmth','tint','shadows','highlights','vibrance','whites','blacks','fade'];
/** @param {string} [base] @param {Record<string,number>} [values] */
const freshState=(base='original',values={})=>({base,values:{...values},curve_interpolation:'smooth'});
let bootstrap, projects=[], state=freshState(), presetId='original';
let photos=[], activePhoto=null, compareHeld=false, currentProfile=null;
let sequence=0, previewTimer, previewAbort, toastTimer, editingState=null;
let history=[], future=[], viewTab='presets', latestJob=null, saved=false;
let styleEdited=false,needsSave=false,saveTimer=null,saveRevision=0,saveJobs=0,saveQueue=Promise.resolve();
let selectionGeneration=0;
const failedSaves=new Map();
const latestSaveRevisions=new Map();
let renderDirty=false, buildSnapshot=null, buildStatus=null;
let previewMode='full',previewRequestActive=null,previewWorkerActive=null;
// The latest displayed GR Preview recipe and the profile it was fitted from.
let matrixRenderedBefore=false;
let cameraFrame=null,cameraRequests=0,cameraShown=0,cameraStaleTimer=null,cameraStaleShown=false;
let previewBusyTimer=null;
let photoExportPending=false;
let cameraReview=null,cameraReviewPending=false,cameraReviewEpoch=0;
const presetProfiles=new Map();
const worker=new Worker(new URL('./render.worker.js',import.meta.url),{type:'module'});
const canvas=$('preview'), ctx=canvas.getContext('2d',{colorSpace:'srgb'});
const clone = value => JSON.parse(JSON.stringify(value));
const snapshot = () => ({identity:services.identitySnapshot(),state:clone(state),presetId,styleEdited,name:$('look-name').value,rawPending:clone(pendingRawContext),raw:activePhoto?.raw?{photoId:activePhoto.id,settings:clone(activePhoto.raw.settings)}:null});

// Setters for module-owned bindings that other editor modules change.
function setState(value){state=value;}
function setActivePhoto(photo){activePhoto=photo;}
function bumpSequence(){sequence++;}
function setRenderDirty(value){renderDirty=value;}

function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200); }
async function downloadResponse(response,filename,url=null) {
  if(!response.ok) { const error=await response.json();throw new Error(error.error||'Export failed'); }
  if(url){await response.arrayBuffer();downloadUrl(url,filename);}else downloadBlob(await response.blob(),filename);
}
function downloadUrl(url,filename) {
  const a=document.createElement('a');a.href=url;a.download=filename;a.hidden=true;
  // Keep the download trigger inside the active modal, then release it.
  (document.querySelector('dialog[open]')||document.body).append(a);a.click();a.remove();
  if(url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function downloadBlob(blob,filename){downloadUrl(URL.createObjectURL(blob),filename);}
function filename(ext){return ($('look-name').value.trim()||'my-style').replace(/[\\/:*?"<>|]/g,'-')+ext;}
function saveStatus(text){$('saved-indicator').textContent=failedSaves.size?'Save failed':text;$('retry-save').hidden=!failedSaves.size;}
function dirty(){styleEdited=true;needsSave=true;saved=false;saveRevision++;saveStatus('Saving…');clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,350);invalidateCameraReview();}
function remember(old=snapshot(),changed=true) {history.push(old);if(history.length>50)history.shift();future=[];updateHistory();changed?dirty():invalidateCameraReview();}
function updateHistory() {$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function restore(s){selectionGeneration++;flushSave();if(s.identity)services.restoreIdentity(s.identity);state=clone(s.state);presetId=s.presetId;$('look-name').value=s.name;setPendingRawContext(s.rawPending||null);restoreRawSnapshot(s.raw);styleEdited=!!s.styleEdited;syncControls();syncPresetSelection();queuePreview(0);if(styleEdited)dirty();else{saveRevision++;saved=false;needsSave=false;saveStatus('Not saved');invalidateCameraReview();}}
function undo(){if(!history.length)return;future.push(snapshot());restore(history.pop());updateHistory();}
function redo(){if(!future.length)return;history.push(snapshot());restore(future.pop());updateHistory();}

function bindControls() {
  for(const key of sliderKeys) {
    const slider=$('slider-'+key);
    slider.addEventListener('input',()=>{if(!editingState)editingState=snapshot();state.values[key]=Number(slider.value);syncValue(key);queuePreview();dirty();});
    slider.addEventListener('change',()=>{if(editingState){remember(editingState);editingState=null;}});
    const reset=()=>{if((state.values[key]||0)===0)return;remember();state.values[key]=0;editingState=null;syncControls();queuePreview(0);};
    slider.addEventListener('dblclick',reset);$('value-'+key).addEventListener('click',reset);
  }
}
function syncValue(key) {const value=state.values[key]||0;const slider=$('slider-'+key);slider.value=value;$('value-'+key).textContent=value>0?'+'+value:String(value);$('value-'+key).classList.toggle('modified',value!==0);const position=(value+100)/2;const fill=$('fill-'+key);fill.style.left=Math.min(position,50)+'%';fill.style.width=Math.abs(position-50)+'%';}
function syncControls(){sliderKeys.forEach(syncValue);syncAdvanced();syncMatrix();syncColorTouch();syncLightIntent();const p=bootstrap?.presets[presetId];$('current-look').textContent=p?.name||'My Styles';$('current-caption').textContent=p?.caption||'Make it yours';}

function makeCard(id,name,caption,monogram){
  const button=document.createElement('button');button.className='preset-card';button.dataset.id=id;
  const image=document.createElement('div');image.className='preset-image';
  const placeholder=document.createElement('span');placeholder.className='preset-placeholder';placeholder.textContent=monogram;
  const thumb=document.createElement('canvas');thumb.width=160;thumb.height=104;thumb.hidden=true;
  image.append(placeholder,thumb);const title=document.createElement('strong');title.textContent=name;const small=document.createElement('small');small.textContent=caption;
  button.append(image,title,small);return button;
}
/** Bind the Starting Style cards that vite.config.ts renders from apps/studio/presets.ts. */
function bindPresets(){for(const button of /** @type {NodeListOf<HTMLElement>} */($('preset-list').querySelectorAll('.preset-card'))){const id=button.dataset.id;button.addEventListener('click',()=>selectPreset(id));}}
function selectPreset(id){selectionGeneration++;flushSave();remember(snapshot(),false);presetId=id;const p=bootstrap.presets[id];services.startStyle(p.name);$('look-name').value=p.name;state=freshState(p.base,p.values);styleEdited=false;saved=false;needsSave=false;saveRevision++;saveStatus('Not saved');syncControls();syncPresetSelection();queuePreview(0);}
function syncPresetSelection(){/** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('.preset-card')).forEach(button=>button.classList.toggle('active',button.dataset.id===presetId));}
function setTab(tab){viewTab=tab;$('preset-list').hidden=tab!=='presets';$('project-list').hidden=tab!=='mine';$('tab-presets').classList.toggle('active',tab==='presets');$('tab-mine').classList.toggle('active',tab==='mine');syncStartingNavigation();if(tab==='mine')drawProjects();}
function drawProjects(){
  $('project-list').replaceChildren();$('project-count').textContent=projects.length||'';
  if(!projects.length){const hint=document.createElement('div');hint.className='empty-projects';hint.textContent='Edit a style to save it here automatically.';$('project-list').append(hint);return;}
  for(const p of projects){const button=makeCard('project-'+p.id,p.name,'Saved locally',p.name.slice(0,2));const item=document.createElement('div');item.className='saved-style';const remove=document.createElement('button');remove.className='icon-button remove-style';remove.dataset.remove='project-'+p.id;remove.title=remove.ariaLabel='Delete '+p.name;remove.innerHTML=svg('close');remove.addEventListener('click',()=>deleteProject(p));item.append(button,remove);$('project-list').append(item);button.addEventListener('click',async()=>{const generation=++selectionGeneration;flushSave();await saveQueue;if(generation!==selectionGeneration)return;if(failedSaves.has(p.id)){toast('Retry saving this style before reopening it.');return;}const latest=projects.find(item=>item.id===p.id),before=snapshot();let validated;try{validated=await services.importConfig(latest,()=>generation===selectionGeneration);}catch(e){if(e.name!=='AbortError')toast(e.message);return;}remember(before,false);state=clone(validated.state);presetId='project-'+p.id;$('look-name').value=validated.name;applyRawContext(validated.raw_development);styleEdited=true;needsSave=false;saveRevision++;syncControls();syncPresetSelection();queuePreview(0);saved=true;saveStatus('Saved locally');});const icon=document.createElement('canvas');icon.className='saved-style-icon';icon.width=32;icon.height=32;icon.setAttribute('aria-label',p.name+' icon');services.drawStyleIcon(icon,p.icon);button.querySelector('.preset-image').append(icon);;}
  syncPresetSelection();renderThumbnails();
}

/** Remove a saved style from this device. The open style keeps its editor state under a new identity, so later edits save as a new entry. */
async function deleteProject(p){
  if(!confirm(`Delete "${p.name}" from this device?`))return;
  flushSave();await saveQueue;
  projects=projects.filter(item=>item.id!==p.id);failedSaves.delete(p.id);latestSaveRevisions.delete(p.id);
  try{await services.deleteProject(p.id);}catch(e){toast(e.message);projects=await services.listProjects();}
  if(presetId==='project-'+p.id){services.startStyle($('look-name').value);presetId=null;saved=false;saveStatus('Not saved');syncControls();}
  drawProjects();toast(`Deleted ${p.name}`);
}
/** Copy the cached LUT so the render Worker can take ownership of the buffer. */
function lutBuffer(p){return p.lut.slice().buffer;}
function previewBusy(){
  $('stage').setAttribute('aria-busy','true');
  // A ready photo stays visible during edits. Only a first render or RAW
  // development needs an overlay, and brief requests should stay quiet.
  if(activePhoto?.edited&&!activePhoto.raw?.pending){previewReady();$('stage').setAttribute('aria-busy','true');return;}
  if(previewBusyTimer!==null||!$('rendering').hidden)return;
  previewBusyTimer=setTimeout(()=>{previewBusyTimer=null;if(activePhoto&&renderDirty)$('rendering').hidden=false;},450);
}
function previewReady(){clearTimeout(previewBusyTimer);previewBusyTimer=null;$('rendering').hidden=true;$('stage').setAttribute('aria-busy','false');}
function queuePreview(delay=110){sequence++;renderDirty=true;previewBusy();clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,delay);}
async function updatePreview(){
  if(activePhoto?.raw?.pending){previewBusy();return;}
  const requestId=++sequence;previewRequestActive=requestId;
  if(previewAbort)previewAbort.abort();previewAbort=new AbortController();
  if(activePhoto)previewBusy();
  try {
    const before=matrixBeforeHeld,previewState=before?touchOriginalState(state):clone(state);
    const p=await services.profile(previewState);if(requestId!==sequence)return;
    currentProfile=p;$('connection-error').hidden=true;showFit(p);if(!before)showColorTouchProfile(p);syncPreviewNote();updateCameraPreview(p);
    if(activePhoto){previewWorkerActive=requestId;const lut=lutBuffer(p);worker.postMessage({type:'render',kind:'main',requestId,photoId:activePhoto.id,size:p.size,lut,matrixBefore:before},[lut]);}
    else {previewReady();renderDirty=false;}
  } catch(e) {if(e.name==='AbortError')return;if(requestId===sequence)previewReady();if(e instanceof TypeError)$('connection-error').hidden=false;else toast(e.message);}finally{if(previewRequestActive===requestId)previewRequestActive=null;}
}
worker.onmessage=({data})=>{
  if(data.type==='error'){if(previewWorkerActive===data.requestId)previewWorkerActive=null;if(data.requestId===sequence){previewReady();toast(data.error);}return;}
  if(data.kind==='main'){if(previewWorkerActive===data.requestId)previewWorkerActive=null;
    if(data.requestId!==sequence||data.photoId!==activePhoto?.id)return;
    activePhoto.edited=new Uint8ClampedArray(data.pixels);activePhoto.recipeHash=currentProfile?.look_sha256;matrixRenderedBefore=!!data.matrixBefore;drawMain();previewReady();renderDirty=false;
  } else if(data.kind==='thumb'&&data.photoId===activePhoto?.id){
    const button=[.../** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('.preset-card'))].find(b=>b.dataset.id===data.cardId);if(!button)return;
    const thumb=button.querySelector('canvas');thumb.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),160,104),0,0);thumb.hidden=false;/** @type {HTMLElement} */(button.querySelector('.preset-placeholder')).hidden=true;
  }
};
function syncPreviewNote(){
  const camera=previewMode==='camera',note=$('preview-note'),current=cameraFrame&&cameraFrame.profile===currentProfile;
  // Drags make each frame briefly stale; announce Updating only after a visible delay.
  if(!camera||current){clearTimeout(cameraStaleTimer);cameraStaleTimer=null;cameraStaleShown=false;}
  else if(!cameraFrame)cameraStaleShown=true;
  else if(cameraStaleTimer===null)cameraStaleTimer=setTimeout(()=>{cameraStaleShown=true;syncPreviewNote();},400);
  note.textContent=!camera?'LUT · sRGB':cameraStaleShown?'GR Preview · Updating':'GR Preview · Approx.';
  note.title=camera?'Fitted GR III recipe (Q13 matrix, 65-node curves) on the developed DNG. Host camera model; not calibrated against camera JPEGs.':'Full creative look · Developed sRGB';
}
async function updateCameraPreview(p){
  if(previewMode!=='camera')return;const request=++cameraRequests;
  try{const recipe=await services.cameraPreview(p);if(request<cameraShown)return;cameraShown=request;cameraFrame={recipe,profile:p};drawMain();syncPreviewNote();}
  catch(e){if(e.name!=='AbortError')toast(e.message);}
}
function setPreviewMode(mode){
  previewMode=mode;for(const id of ['full','camera']){$('mode-'+id).classList.toggle('active',id===mode);$('mode-'+id).setAttribute('aria-pressed',String(id===mode));}
  syncPreviewNote();drawMain();if(currentProfile)updateCameraPreview(currentProfile);
}
function drawMain(){
  if(!activePhoto)return;
  if(canvas.width!==activePhoto.width)canvas.width=activePhoto.width;
  if(canvas.height!==activePhoto.height)canvas.height=activePhoto.height;
  if(previewMode==='camera'&&cameraFrame&&!compareHeld)ctx.drawImage(services.cameraRenderer.render(activePhoto.latent,activePhoto.width,activePhoto.height,cameraFrame.recipe),0,0);
  else ctx.putImageData(new ImageData(compareHeld?activePhoto.original:(activePhoto.edited||activePhoto.original),activePhoto.width,activePhoto.height),0,0);
  $('original-badge').hidden=!compareHeld&&!matrixRenderedBefore;$('original-badge').textContent=compareHeld?(activePhoto.raw?'Developed original':'Original'):'Original color';syncTouchPin();syncLightPin();
}
function setCompare(value){compareHeld=value;$('compare').classList.toggle('held',value);drawMain();}

function selectPhoto(photo){invalidateCameraReview();activePhoto=photo;matrixRenderedBefore=false;sequence++;$('empty-state').hidden=true;canvas.hidden=false;$('stage').classList.remove('zoomed');$('photo-title').textContent=photo.name;$('photo-meta').textContent=`${photo.naturalWidth.toLocaleString()} × ${photo.naturalHeight.toLocaleString()}`;syncPreviewNote();if(photo.raw&&pendingRawContext?.source_sha256===photo.raw.source_sha256)applyRawContext(pendingRawContext);syncRawPanel();$('remove-photo').hidden=false;$('original-badge').textContent=photo.raw?'Developed original':'Original';if(photo.raw)$('photo-meta').textContent+=' · RAW / 16-bit';setLightZone(photo.lightZone||'midtones');drawMain();drawPhotoStrip();syncMatrix();syncColorTouch();syncLightIntent();queuePreview(0);renderThumbnails();}
function drawPhotoStrip(){
  $('photo-strip').hidden=photos.length<2;$('photo-strip').replaceChildren();
  for(const photo of photos){const button=document.createElement('button');button.className='photo-chip'+(photo.id===activePhoto.id?' active':'');button.title=photo.name;button.setAttribute('aria-label','Switch photo '+photo.name);const img=new Image();img.src=photo.thumbnail;img.alt=photo.name;button.append(img);button.addEventListener('click',()=>selectPhoto(photo));$('photo-strip').append(button);}
}
async function acceptPhotos(files){
  if(!files.length)return;let first=null;const epoch=rawTaskEpoch;
  for(const file of files){
    if(epoch!==rawTaskEpoch)break;
    if(!/\.dng$/i.test(file.name)){toast('Photos must be DNG RAW. Use Import style project for projects.');continue;}
    if(file.size>100*1024*1024){toast('DNG exceeds the 100 MB import limit');continue;}
    try{const p=await addRawPhoto(file,epoch);first=first||p;}catch(e){toast(e.message);}
  }
  if(first)selectPhoto(first);$('photo-input').value='';
}
async function acceptFiles(files){
  const configs=files.filter(file=>/\.json$/i.test(file.name));
  if(configs.length>1){toast('Import one style project at a time');return;}
  if(configs.length&&!(await importProject(configs[0])))return;
  await acceptPhotos(files.filter(file=>!configs.includes(file)));
}
async function renderThumbnails(){
  if(!activePhoto||!bootstrap)return;
  const photo=activePhoto, items=viewTab==='presets'?Object.entries(bootstrap.presets).map(([id,p])=>({id,state:{base:p.base,values:p.values}})):projects.map(p=>({id:'project-'+p.id,state:p.state}));
  for(const item of items){try{const key=JSON.stringify(item.state);let p=presetProfiles.get(key);if(!p){p=await services.profile(item.state);presetProfiles.set(key,p);}if(photo.id!==activePhoto?.id)return;const lut=lutBuffer(p),pixels=photo.thumbPixels.slice().buffer;worker.postMessage({type:'render',kind:'thumb',photoId:photo.id,cardId:item.id,size:p.size,lut,pixels},[lut,pixels]);}catch(e){console.warn('Thumbnail unavailable',e);}}
}

function flushSave(){
  clearTimeout(saveTimer);saveTimer=null;if(!needsSave)return saveQueue;
  const revision=saveRevision,input={state:clone(state),name:$('look-name').value,raw:clone(rawContext()||pendingRawContext),identity:services.identitySnapshot()};
  needsSave=false;return queueSave(input,revision);
}
function queueSave(input,revision){
  const owner=input.identity.identity.id;latestSaveRevisions.set(owner,Math.max(revision,latestSaveRevisions.get(owner)??-1));saveJobs++;
  saveQueue=saveQueue.then(async()=>{
    try{if(revision<latestSaveRevisions.get(owner))return;const p=await services.saveStyle(input.state,input.name,input.raw,input.identity);projects=projects.filter(old=>old.id!==p.id);projects.unshift(p);
      if((failedSaves.get(p.id)?.revision??-1)<=revision)failedSaves.delete(p.id);
      if(revision===saveRevision){presetId='project-'+p.id;saved=true;saveStatus('Saved locally');syncControls();syncPresetSelection();}
      drawProjects();
    }catch(error){failedSaves.set(input.identity.identity.id,{input,revision});toast('Could not save '+(input.name||'Untitled Style')+' on this device: '+error.message);}
    finally{saveJobs--;saveStatus(saved?'Saved locally':needsSave||saveJobs?'Saving…':'Not saved');}
  });return saveQueue;
}
function retrySaves(){for(const {input,revision} of failedSaves.values())queueSave(input,revision);flushSave();}
function exportDialog(){
  $('export-name').value=$('look-name').value;
  syncPhotoExport();
  if(cameraReview&&cameraReview.key!==cameraReviewKey())invalidateCameraReview();
  $('export-dialog').showModal();
}
function syncPhotoExport(){
  $('photo-export-fields').disabled=!activePhoto||photoExportPending;
  $('export-photo-hint').textContent=photoExportPending?'Developing full-size photo…':activePhoto?`${activePhoto.naturalWidth.toLocaleString()} × ${activePhoto.naturalHeight.toLocaleString()} · Current DNG and style`:'Add a DNG to export a photo.';
  $('download-photo').innerHTML=(photoExportPending?'Exporting…':'Export photo')+svg('download');
}
function cameraReviewKey(){return JSON.stringify({state,name:$('look-name').value,identity:services.identitySnapshot(),photo:activePhoto?{id:activePhoto.id,raw:activePhoto.raw?.appliedSettings,pending:activePhoto.raw?.pending}:null});}
function invalidateCameraReview(){
  cameraReviewEpoch++;services.cancelCamera();cameraReview=null;cameraReviewPending=false;
  $('download-package').disabled=false;$('camera-review').hidden=true;
  for(const id of ['camera-review-download','camera-review-cancel','camera-review-progress','camera-review-metrics','camera-review-previews','camera-review-note','camera-review-details'])$(id).hidden=true;
}
async function exportPackage(){
  if(cameraReviewPending)return;
  if(activePhoto?.raw?.pending){toast('Wait for DNG development to finish');return;}
  const epoch=++cameraReviewEpoch,key=cameraReviewKey(),frozen=clone(state),name=$('look-name').value||'Untitled Style',photo=activePhoto;
  cameraReview=null;cameraReviewPending=true;$('download-package').disabled=true;$('camera-review').hidden=false;
  for(const id of ['camera-review-download','camera-review-metrics','camera-review-previews','camera-review-note','camera-review-details'])$(id).hidden=true;
  $('camera-review-progress').hidden=false;$('camera-review-cancel').hidden=false;
  $('camera-review-status').textContent='Preparing exact LUT…';
  try{
    const prepared=await services.prepareCamera(frozen,name,photo?.thumbPixels?.slice(),phase=>{if(epoch===cameraReviewEpoch)$('camera-review-status').textContent=phase;});
    if(epoch!==cameraReviewEpoch||key!==cameraReviewKey())return;
    cameraReview={key,prepared};const report=prepared.fit.report,error=report.holdout;
    $('camera-review-status').textContent='GR III HDF · 2.10 / V9.2 · '+report.curve_nodes+' nodes per channel';
    $('camera-review-metrics').replaceChildren();
    for(const [label,value] of [['RMSE',error.rmse_8bit.toFixed(3)],['P95',error.p95_8bit.toFixed(3)],['Max',error.max_8bit.toFixed(3)],['Clipped channels',(100*error.clipped_channel_fraction).toFixed(2)+'%']]){const item=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;item.append(term,detail);$('camera-review-metrics').append(item);}
    $('camera-review-metrics').hidden=false;$('camera-review-note').hidden=false;
    $('camera-review-report').textContent=JSON.stringify({platform:services.cameraTarget,matrix_q13:prepared.fit.matrix_q13,curves_q14:prepared.fit.curves_q14,report},null,2);$('camera-review-details').hidden=false;
    if(prepared.authored&&prepared.camera){for(const [id,pixels] of /** @type {[string,ArrayBuffer][]} */([['camera-review-authored',prepared.authored],['camera-review-native',prepared.camera]]))$(id).getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),160,104),0,0);$('camera-review-previews').hidden=false;}
    $('camera-review-download').hidden=false;
  }catch(error){if(epoch===cameraReviewEpoch&&error.name!=='AbortError')$('camera-review-status').textContent=error.message;}
  finally{if(epoch===cameraReviewEpoch){cameraReviewPending=false;$('download-package').disabled=false;$('camera-review-progress').hidden=true;$('camera-review-cancel').hidden=true;}}
}
async function downloadCameraStyle(){
  if(!cameraReview||cameraReview.key!==cameraReviewKey()){invalidateCameraReview();toast('Style changed. Prepare the camera recipe again.');return;}
  const review=cameraReview,epoch=cameraReviewEpoch,button=$('camera-review-download');button.disabled=true;
  try{const bytes=await services.packageCamera(review.prepared);if(epoch!==cameraReviewEpoch||review.key!==cameraReviewKey())return;downloadBlob(new Blob([/** @type {BlobPart} */(bytes)],{type:'application/zip'}),filename('.grstyle'));}
  catch(error){toast(error.message);}finally{button.disabled=false;}
}
async function exportFull(format){
  if(!activePhoto?.raw||activePhoto.raw.pending)return toast('Wait for DNG development to finish');
  const photo=activePhoto,settings=clone(photo.raw.appliedSettings),frozen=clone(state),name=filename('-full.'+(format==='png'?'png':'jpg'));
  photoExportPending=true;syncPhotoExport();$('cancel-raw').hidden=false;
  try{const r=await services.exportRaw(photo.raw.id,settings,frozen,format);downloadBlob(r.blob,name);toast(`Exported ${r.width} × ${r.height} · 8-bit sRGB`);}catch(e){toast(e.message);}finally{photoExportPending=false;syncPhotoExport();rawStatus();}
}
function exportPhoto(format='jpeg'){
  if(!activePhoto?.edited||renderDirty||touchPreviewPending||matrixBeforeHeld||matrixRenderedBefore||(previewMode==='camera'&&cameraFrame?.profile!==currentProfile)){toast('Wait for the photo preview to finish');return;}
  const mime=format==='png'?'image/png':'image/jpeg',extension=format==='png'?'.png':'.jpg';
  const name=filename('-'+previewMode+'-preview'+extension);
  const c=document.createElement('canvas');c.width=activePhoto.width;c.height=activePhoto.height;const output=c.getContext('2d');if(previewMode==='camera')output.drawImage(services.cameraRenderer.render(activePhoto.latent,activePhoto.width,activePhoto.height,cameraFrame.recipe),0,0);else output.putImageData(new ImageData(activePhoto.edited,activePhoto.width,activePhoto.height),0,0);c.toBlob(blob=>{if(blob&&blob.type===mime){downloadBlob(blob,name);toast('Photo exported at preview size');}else toast('Photo export failed. Try again.');},mime,.95);
}
async function importProject(file){
  if(!file)return;
  const generation=++selectionGeneration;
  try{if(!/\.json$/i.test(file.name))throw new Error('Choose a .grstyle.json project. Use .grstyle bundles in Firmware.');if(file.size>1024*1024)throw new Error('Style project file is too large');const p=services.strictJSON(await file.text());if(generation!==selectionGeneration)return false;flushSave();const before=snapshot(),validated=await services.importConfig(p,()=>generation===selectionGeneration);remember(before);state=validated.state;presetId='imported';$('look-name').value=validated.name;applyRawContext(validated.raw_development);syncControls();syncPresetSelection();queuePreview(0);toast('Style project imported. Continue editing.');return true;}catch(e){if(e.name!=='AbortError')toast(e.message);return false;}finally{$('project-input').value='';}
}

function wire(){
  bindControls();bindPresets();$('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
  wireAdvanced();wireRaw();wireMatrix();wireColorTouch();$('reset').addEventListener('click',()=>{remember();state=freshState(state.base);syncControls();queuePreview(0);});
  $('look-name').addEventListener('input',dirty);
  for(const id of ['choose-photo','add-photos'])$(id).addEventListener('click',()=>$('photo-input').click());
  $('photo-input').addEventListener('change',e=>acceptPhotos([...e.target.files]));
  $('import-project').addEventListener('click',()=>$('project-input').click());$('project-input').addEventListener('change',e=>importProject(e.target.files[0]));
  $('tab-presets').addEventListener('click',()=>{setTab('presets');renderThumbnails();});$('tab-mine').addEventListener('click',()=>setTab('mine'));
  $('mode-full').addEventListener('click',()=>setPreviewMode('full'));$('mode-camera').addEventListener('click',()=>setPreviewMode('camera'));
  if(!services.cameraRenderer){$('mode-camera').disabled=true;$('mode-camera').title='GR Preview needs WebGL 2';}setPreviewMode(services.cameraRenderer?'camera':'full');
  $('zoom').addEventListener('click',()=>{if(activePhoto)$('stage').classList.toggle('zoomed');});
  $('compare').addEventListener('pointerdown',e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setCompare(true);});
  $('compare').addEventListener('pointerup',()=>setCompare(false));$('compare').addEventListener('pointercancel',()=>setCompare(false));
  $('compare').addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();setCompare(true);}});$('compare').addEventListener('keyup',()=>setCompare(false));
  window.addEventListener('blur',()=>setCompare(false));
  window.addEventListener('keydown',e=>{const target=/** @type {HTMLElement} */(e.target),editing=target.matches('input,textarea,select,[contenteditable="true"]'),interactive=target.closest('button,summary,a,[role="button"],[role="slider"]');if(e.code==='Space'&&!editing&&!interactive&&!document.querySelector('dialog[open]')){e.preventDefault();setCompare(true);}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing&&!document.querySelector('dialog[open]')){e.preventDefault();e.shiftKey?redo():undo();}});
  window.addEventListener('keyup',e=>{if(e.code==='Space')setCompare(false);});
  $('retry-save').addEventListener('click',retrySaves);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});
  window.addEventListener('beforeunload',event=>{if(needsSave||saveJobs||failedSaves.size){flushSave();event.preventDefault();event.returnValue='';}});
  document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('export').addEventListener('click',exportDialog);$('download-package').addEventListener('click',exportPackage);
  $('export-name').addEventListener('input',()=>{$('look-name').value=$('export-name').value;$('look-name').dispatchEvent(new Event('input'));});
  $('camera-review-download').addEventListener('click',downloadCameraStyle);$('camera-review-cancel').addEventListener('click',invalidateCameraReview);
  $('export-dialog').addEventListener('close',()=>{if(cameraReviewPending)invalidateCameraReview();});
  window.addEventListener('gr-style-identity-change',event=>{const before=snapshot();before.identity=/** @type {CustomEvent} */(event).detail.before;remember(before);});
  $('download-photo').addEventListener('click',()=>{const format=/** @type {HTMLInputElement} */(document.querySelector('[name="export-photo-format"]:checked')).value;/** @type {HTMLInputElement} */(document.querySelector('[name="export-photo-size"]:checked')).value==='full'?exportFull(format):exportPhoto(format);});$('cancel-raw').addEventListener('click',cancelRawTasks);
  $('retry').addEventListener('click',init);
  let dragging=0;
  const showDrop=active=>{$('drop-overlay').hidden=!active;$('stage').classList.toggle('drag-over',active);};
  const clearDrop=()=>{dragging=0;showDrop(false);};
  window.addEventListener('dragenter',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragging++;showDrop($('stage').contains(e.target));});
  window.addEventListener('dragover',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';showDrop($('stage').contains(e.target));});
  window.addEventListener('dragleave',e=>{if(!e.dataTransfer.types.includes('Files'))return;if(--dragging<=0)clearDrop();});
  window.addEventListener('drop',e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();clearDrop();acceptFiles([...e.dataTransfer.files]);});
  window.addEventListener('dragend',clearDrop);window.addEventListener('blur',clearDrop);
}
async function init(){
  try{bootstrap=services.bootstrap();projects=await services.listProjects();drawProjects();syncControls();$('connection-error').hidden=true;queuePreview(0);}
  catch(e){console.error(e);$('connection-error').hidden=false;toast(e.message);}
}
/** Wire every editor control, then load presets and saved styles. */
function startEditor(){wire();wireFlow();wireLightIntent();wireCompactInterface();wireContextTools();init();}
