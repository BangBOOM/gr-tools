import {services} from '../services.ts';
import {editorTab} from './advanced.js';
import {$,activePhoto,bumpSequence,canvas,clone,dirty,drawMain,drawPhotoStrip,invalidateCameraReview,photos,previewBusy,previewReady,queuePreview,remember,renderThumbnails,selectPhoto,setActivePhoto,setRenderDirty,snapshot,toast,worker} from './app.js';
import {syncColorTouch,syncTouchPin} from './color-touch.js';
import {syncLightIntent} from './intent-light.js';
import {syncMatrix} from './matrix.js';
export {addRawPhoto,applyRawContext,cancelRawTasks,pendingRawContext,rawContext,rawImports,rawStatus,rawTaskEpoch,removePhoto,restoreRawSnapshot,setPendingRawContext,syncRawPanel,wireRaw};
const rawDefaults={exposure:0,wb:'camera',temperature:0,tint:0};
let pendingRawContext=null,rawImports=0,rawTaskEpoch=0,photoCounter=0;
function setPendingRawContext(value){pendingRawContext=value;}
function cancelRawTasks(){
  rawTaskEpoch++;services.raw.cancel();
  for(const photo of photos){if(!photo.raw)continue;const r=photo.raw;clearTimeout(r.timer);r.version++;r.pending=false;if(r.appliedSettings)r.settings=clone(r.appliedSettings);}
  if(activePhoto){syncRawPanel();queuePreview(0);}rawStatus();
}
function checkRawEpoch(epoch){if(epoch!==rawTaskEpoch)throw new DOMException("RAW task canceled","AbortError");}
function rawContext(){
  if(!activePhoto?.raw)return null;
  return {filename:activePhoto.name,source_sha256:activePhoto.raw.source_sha256,settings:clone(activePhoto.raw.settings)};
}
function rawStatus(){
  const pending=activePhoto?.raw?.pending;
  $('raw-status').hidden=!rawImports&&!pending;$('cancel-raw').hidden=!rawImports&&!pending;
  $('raw-status-text').textContent=rawImports?'Reading DNG · Developing sensor data':'Updating RAW exposure and white balance';
}
async function rawPixels(id,settings){return services.rawPixels(id,settings);}
function installRawPixels(photo,{buffer,latent,meta}){
  const rgb=new Float32Array(buffer),rgba=new Uint8ClampedArray(meta.width*meta.height*4);
  const previousFrame=photo.width===meta.width&&photo.height===meta.height?photo.edited:null;
  for(let i=0,j=0;i<rgb.length;i+=3,j+=4){rgba[j]=Math.round(rgb[i]*255);rgba[j+1]=Math.round(rgb[i+1]*255);rgba[j+2]=Math.round(rgb[i+2]*255);rgba[j+3]=255;}
  Object.assign(photo,{width:meta.width,height:meta.height,naturalWidth:meta.source_width,naturalHeight:meta.source_height,original:rgba,colorSamples:rgb.slice(),latent:new Float32Array(latent),edited:previousFrame||null});
  const c=document.createElement('canvas');c.width=photo.width;c.height=photo.height;c.getContext('2d').putImageData(new ImageData(rgba,photo.width,photo.height),0,0);
  const tiny=document.createElement('canvas');tiny.width=160;tiny.height=104;const t=tiny.getContext('2d');const scale=Math.max(160/photo.width,104/photo.height);
  t.drawImage(c,(160-photo.width*scale)/2,(104-photo.height*scale)/2,photo.width*scale,photo.height*scale);
  photo.thumbnail=tiny.toDataURL('image/jpeg',.85);photo.thumbPixels=t.getImageData(0,0,160,104).data;
  photo.raw.meta=meta;photo.raw.appliedSettings=clone(meta.settings);
  worker.postMessage({type:'load',id:photo.id,pixels:buffer,format:'rgb-f32'},[buffer]);
}
async function addRawPhoto(file,epoch=rawTaskEpoch){
  checkRawEpoch(epoch);
  if(photos.length>=10)throw new Error('Up to 10 photos. Remove one first.');
  rawImports++;rawStatus();let record;
  try{
    record=await services.rawImport(file);checkRawEpoch(epoch);
    let settings={...rawDefaults};const restoringContext=pendingRawContext?.source_sha256===record.source_sha256?pendingRawContext:null;
    if(restoringContext){settings={...settings,...restoringContext.settings};}
    const photo={id:'photo-'+(++photoCounter),name:file.name,raw:{...record,settings,version:0,pending:false,running:false}};
    const result=await rawPixels(record.id,settings);checkRawEpoch(epoch);installRawPixels(photo,result);if(restoringContext&&pendingRawContext===restoringContext)pendingRawContext=null;photos.push(photo);return photo;
  }catch(e){if(record?.id)services.files.delete(record.id);throw e;}
  finally{rawImports--;rawStatus();}
}
function syncRawPanel(){
  const photo=activePhoto,raw=photo?.raw;$('tab-raw').hidden=!raw;
  if(!raw){if($('tab-raw').classList.contains('active'))editorTab('style');rawStatus();return;}
  const s=raw.settings;
  $('raw-exposure').value=s.exposure;$('raw-exposure-value').textContent=(s.exposure>0?'+':'')+Number(s.exposure).toFixed(1)+' EV';
  $('raw-exposure-value').classList.toggle('modified',s.exposure!==0);$('raw-wb').value=s.wb;
  for(const key of ['temperature','tint']){
    $('raw-'+key).value=s[key];$('raw-'+key).disabled=s.wb!=='custom';$('raw-'+key+'-value').disabled=s.wb!=='custom';
    $('raw-'+key+'-value').textContent=(s[key]>0?'+':'')+s[key];$('raw-'+key+'-value').classList.toggle('modified',s[key]!==0);
  }
  $('raw-info').textContent=`${photo.naturalWidth.toLocaleString()} × ${photo.naturalHeight.toLocaleString()} · 16-bit sensor development\nHigh-precision LUT input · ${raw.meta.decoder}`;
  rawStatus();
}
function scheduleRaw(photo){
  photo.raw.version++;photo.raw.pending=true;
  if(photo===activePhoto){invalidateCameraReview();bumpSequence();setRenderDirty(true);syncRawPanel();previewBusy();}
  clearTimeout(photo.raw.timer);photo.raw.timer=setTimeout(()=>developRaw(photo),450);
}
async function developRaw(photo){
  const raw=photo.raw;if(raw.running)return;raw.running=true;
  try{
    while(raw.pending&&photos.includes(photo)){
      const version=raw.version,settings=clone(raw.settings),result=await rawPixels(raw.id,settings);
      if(!photos.includes(photo))break;
      if(version!==raw.version)continue;
      installRawPixels(photo,result);raw.pending=false;
      if(photo===activePhoto){syncRawPanel();drawMain();drawPhotoStrip();syncLightIntent();queuePreview(0);renderThumbnails();}
    }
  }catch(e){if(photos.includes(photo)){raw.settings=clone(raw.appliedSettings);raw.pending=false;if(photo===activePhoto){syncRawPanel();queuePreview(0);}toast(e.message);}}
  finally{raw.running=false;rawStatus();}
}
function restoreRawSnapshot(saved){
  if(!saved)return;const photo=photos.find(p=>p.id===saved.photoId);if(!photo?.raw)return;
  if(JSON.stringify(photo.raw.settings)!==JSON.stringify(saved.settings)){photo.raw.settings=clone(saved.settings);scheduleRaw(photo);}
  if(photo!==activePhoto)selectPhoto(photo);else syncRawPanel();
}
// Project import establishes the RAW context invariant before this UI applies it.
function applyRawContext(context){
  if(!context){pendingRawContext=null;return;}
  pendingRawContext=clone(context);
  if(activePhoto?.raw?.source_sha256===context.source_sha256){
    activePhoto.raw.settings=clone(context.settings);pendingRawContext=null;scheduleRaw(activePhoto);
  }
}
function removePhoto(){
  if(!activePhoto)return;invalidateCameraReview();const photo=activePhoto,index=photos.indexOf(photo);
  if(photo.raw){clearTimeout(photo.raw.timer);services.releasePhotos([photo.raw.id]).catch(()=>{});}
  worker.postMessage({type:'remove',id:photo.id});photos.splice(index,1);
  if(photos.length)selectPhoto(photos[Math.min(index,photos.length-1)]);
  else{setActivePhoto(null);bumpSequence();canvas.hidden=true;$('empty-state').hidden=false;$('photo-strip').hidden=true;$('remove-photo').hidden=true;$('photo-title').textContent='Photo';$('photo-meta').textContent='';previewReady();syncRawPanel();syncMatrix();syncColorTouch();syncLightIntent();syncTouchPin();}
}
function wireRaw(){
  $('tab-raw').addEventListener('click',()=>editorTab('raw'));
  $('remove-photo').addEventListener('click',removePhoto);
  for(const key of ['exposure','temperature','tint']){
    let before=null,editingPhoto=null;const input=$('raw-'+key);
    input.addEventListener('input',()=>{if(!activePhoto?.raw)return;if(!before){before=snapshot();editingPhoto=activePhoto;}if(editingPhoto!==activePhoto){before=snapshot();editingPhoto=activePhoto;}activePhoto.raw.settings[key]=Number(input.value);dirty();scheduleRaw(activePhoto);});
    const finish=()=>{if(before){remember(before);before=null;editingPhoto=null;}};input.addEventListener('change',finish);input.addEventListener('blur',finish);
    const reset=()=>{if(!activePhoto?.raw||activePhoto.raw.settings[key]===0)return;remember();activePhoto.raw.settings[key]=0;scheduleRaw(activePhoto);};
    input.addEventListener('dblclick',reset);$('raw-'+key+'-value').addEventListener('click',reset);
  }
  $('raw-wb').addEventListener('change',()=>{if(!activePhoto?.raw)return;remember();activePhoto.raw.settings.wb=$('raw-wb').value;scheduleRaw(activePhoto);});
  $('reset-raw').addEventListener('click',()=>{if(!activePhoto?.raw)return;remember();activePhoto.raw.settings={...rawDefaults};scheduleRaw(activePhoto);});
  window.addEventListener('pagehide',()=>services.raw.cancel());
}
