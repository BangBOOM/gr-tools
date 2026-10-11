// Creative color intent uses the existing HSL stage. The camera recipe is fitted
// independently; these gestures never pretend to be exact matrix coefficients.
import {services} from '../services.ts';
import {editorTab,ensureEdits,mixNames,setMixerColor,syncAdvanced} from './advanced.js';
import {$,activePhoto,canvas,clone,currentProfile,dirty,lutBuffer,previewRequestActive,previewWorkerActive,queuePreview,remember,setRenderDirty,snapshot,state,toast} from './app.js';
import {dismissGestureCoach,uiColorNames} from './interface.js';
import {setMatrixBefore,syncMatrix} from './matrix.js';
export {showColorTouchProfile,syncColorTouch,syncTouchPin,touchBand,touchChanged,touchClamp,touchFinish,touchHsl,touchOriginalState,touchPhotoDrag,touchPhotoRGB,touchPreviewPending,touchSchedulePreview,wireColorTouch};
let touchBand='blue',touchSourceRGB=[.2,.35,.75],touchPickMode=false,touchPickToken=0,touchPhotoDrag=null,touchPadDrag=null,touchPreviewTimer=null,touchPreviewPending=false;
const touchClamp=n=>Math.max(-100,Math.min(100,n));
const touchNeutral={hue:0,saturation:0,luminance:0};
function touchCompareAvailable(){const m=state.mixer?.[touchBand];return !!activePhoto&&!!(m?.hue||m?.saturation);}
function touchOriginalState(value){const s=clone(value);s.mixer[touchBand].hue=0;s.mixer[touchBand].saturation=0;return s;}
function touchFinish(before){if(before&&JSON.stringify(before.state)!==JSON.stringify(state))remember(before);}
function touchSchedulePreview(){
  touchPreviewPending=true;setRenderDirty(true);if(touchPreviewTimer)return;
  const tick=()=>{touchPreviewTimer=null;if(!touchPreviewPending)return;if(previewRequestActive!==null||previewWorkerActive!==null){touchPreviewTimer=setTimeout(tick,25);return;}touchPreviewPending=false;queuePreview(0);};
  touchPreviewTimer=setTimeout(tick,45);
}
function touchChanged(){dismissGestureCoach('matrix');dirty();syncAdvanced();syncMatrix();touchSchedulePreview();if(state.strength===0)$('touch-hint').textContent='Amount is zero. Increase it to see adjustments.';}
function touchChoose(band,rgb){touchBand=band;setMixerColor(band);touchSourceRGB=rgb;syncAdvanced();syncMatrix();syncColorTouch();if(currentProfile)showColorTouchProfile(currentProfile);}
function setTouchPick(value){touchPickToken++;if(touchPhotoDrag?.changed)touchFinish(touchPhotoDrag.before);touchPhotoDrag=null;touchPickMode=value;$('touch-pick').setAttribute('aria-pressed',value);$('touch-pick').classList.toggle('active',value);canvas.classList.toggle('color-picking',value);$('touch-pick').querySelector('span').textContent='Pick';$('touch-hint').textContent=value?'Click or drag in the photo. Move horizontally for hue, vertically for saturation.':'Move horizontally for hue, vertically for saturation. Similar colors change together; brightness is in Light.';}
function syncColorTouch(){
  if(!$('touch-pad')||!state.mixer)return;
  const m=state.mixer[touchBand]||touchNeutral,ids=Object.keys(mixNames),i=ids.indexOf(touchBand);
  $('touch-color-name').textContent=uiColorNames[touchBand];$('touch-left').textContent=uiColorNames[ids[(i+7)%8]];$('touch-right').textContent=uiColorNames[ids[(i+1)%8]];
  $('touch-direction').textContent=[Math.abs(m.hue)>3?(m.hue<0?$('touch-left').textContent:$('touch-right').textContent):'',Math.abs(m.saturation)>3?(m.saturation>0?'More vivid':'Softer'):''].filter(Boolean).join(' · ')||'Original feel';
  $('touch-cursor').style.left=(50+m.hue/2)+'%';$('touch-cursor').style.top=(50-m.saturation/2)+'%';
  $('touch-pad').setAttribute('aria-valuemin','-100');$('touch-pad').setAttribute('aria-valuemax','100');$('touch-pad').setAttribute('aria-valuenow',m.hue);$('touch-pad').setAttribute('aria-valuetext',`${uiColorNames[touchBand]}, Hue ${Math.round(m.hue)}, Saturation ${Math.round(m.saturation)}`);
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-touch-color]')).forEach(b=>{const band=b.dataset.touchColor,edit=state.mixer[band];b.classList.toggle('active',band===touchBand);b.classList.toggle('has-edit',!!(edit.hue||edit.saturation));b.setAttribute('aria-pressed',String(band===touchBand));b.title=uiColorNames[band]+` · Hue ${edit.hue} · Saturation ${edit.saturation}`;});
  $('touch-pick').disabled=!activePhoto;$('matrix-compare').disabled=!touchCompareAvailable();
}
function touchHsl(rgb){const hi=Math.max(...rgb),lo=Math.min(...rgb),d=hi-lo,l=(hi+lo)/2;let h=0;if(d){const i=rgb.indexOf(hi);h=((rgb[(i+1)%3]-rgb[(i+2)%3])/d+i*2)/6;h=(h+1)%1;}return [h,d?d/(1-Math.abs(2*l-1)):0,l];}
function touchSampleLut(rgb,p){
  const lut=p._lut||new Float32Array(lutBuffer(p)),n=p.size,point=rgb.map(v=>Math.max(0,Math.min(1,v))*(n-1)),low=point.map(Math.floor),f=point.map((v,i)=>v-low[i]),out=[0,0,0];
  for(let b=0;b<2;b++)for(let g=0;g<2;g++)for(let r=0;r<2;r++){const index=(Math.min(low[2]+b,n-1)*n*n+Math.min(low[1]+g,n-1)*n+Math.min(low[0]+r,n-1))*3,w=(b?f[2]:1-f[2])*(g?f[1]:1-f[1])*(r?f[0]:1-f[0]);for(let c=0;c<3;c++)out[c]+=lut[index+c]*w;}return out;
}
function showColorTouchProfile(p){
  const rgb=touchSampleLut(touchSourceRGB,p),h=[0,30,60,120,180,240,275,315][Object.keys(mixNames).indexOf(touchBand)];
  $('touch-color-dot').style.background=`rgb(${rgb.map(v=>Math.round(v*255)).join(',')})`;
  for(const [name,delta] of /** @type {[string,number][]} */([['left',-30],['center',0],['right',30]]))$('touch-pad').style.setProperty('--touch-'+name,`hsl(${h+delta} 52% 45%)`);
}
function touchPhotoRGB(photo,point){
  const x=Math.min(photo.width-1,Math.max(0,Math.floor(point[0]*photo.width))),y=Math.min(photo.height-1,Math.max(0,Math.floor(point[1]*photo.height))),out=[0,0,0];let count=0;
  for(let yy=Math.max(0,y-2);yy<=Math.min(photo.height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(photo.width-1,x+2);xx++){const i=yy*photo.width+xx;for(let c=0;c<3;c++)out[c]+=photo.colorSamples?photo.colorSamples[i*3+c]:photo.original[i*4+c]/255;count++;}
  return out.map(v=>Math.max(0,Math.min(1,v/count)));
}
function syncTouchPin(){
  const p=activePhoto?.colorPickPosition,pin=$('touch-photo-pin');pin.hidden=!p||!touchPickMode||$('pane-matrix').hidden;if(pin.hidden)return;const r=canvas.getBoundingClientRect(),s=$('stage').getBoundingClientRect();pin.style.left=(r.left-s.left+p[0]*r.width)+'px';pin.style.top=(r.top-s.top+p[1]*r.height)+'px';
}
function wireColorTouch(){
  const source={red:[.78,.22,.22],orange:[.8,.46,.18],yellow:[.75,.69,.2],green:[.22,.65,.32],aqua:[.2,.65,.65],blue:[.2,.35,.75],purple:[.55,.25,.7],magenta:[.75,.2,.55]};
  for(const b of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-touch-color]'))){const id=b.dataset.touchColor;b.addEventListener('click',()=>{setMatrixBefore(false);setTouchPick(false);touchChoose(id,source[id]);syncTouchPin();});}
  $('touch-pick').addEventListener('click',()=>{setMatrixBefore(false);setTouchPick(!touchPickMode);syncTouchPin();});
  $('touch-reset').addEventListener('click',()=>{ensureEdits();const m=state.mixer[touchBand];if(!m.hue&&!m.saturation)return;remember();m.hue=0;m.saturation=0;touchChanged();});
  const pad=$('touch-pad'),updatePad=e=>{const r=pad.getBoundingClientRect();state.mixer[touchBand].hue=Math.round(touchClamp((e.clientX-r.left)/r.width*200-100));state.mixer[touchBand].saturation=Math.round(touchClamp(100-(e.clientY-r.top)/r.height*200));touchChanged();};
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();ensureEdits();setMatrixBefore(false);pad.focus({preventScroll:true});touchPadDrag=snapshot();pad.setPointerCapture(e.pointerId);updatePad(e);});
  pad.addEventListener('pointermove',e=>{if(touchPadDrag)updatePad(e);});
  const endPad=()=>{touchFinish(touchPadDrag);touchPadDrag=null;};for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,endPad);
  pad.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();ensureEdits();remember();const m=state.mixer[touchBand],delta=e.shiftKey?10:2;if(['ArrowLeft','ArrowRight'].includes(e.key))m.hue=touchClamp(m.hue+(e.key==='ArrowRight'?delta:-delta));else m.saturation=touchClamp(m.saturation+(e.key==='ArrowUp'?delta:-delta));touchChanged();});
  const applyPhotoDrag=drag=>{if(!drag.band)return;const dx=drag.last[0]-drag.start[0],dy=drag.last[1]-drag.start[1];if(Math.abs(dx)+Math.abs(dy)<4)return;state.mixer[drag.band].hue=Math.round(touchClamp(drag.hue+dx/1.8));state.mixer[drag.band].saturation=Math.round(touchClamp(drag.value-dy/1.6));touchChanged();drag.changed=true;};
  canvas.addEventListener('pointerdown',async e=>{
    if(!touchPickMode||$('pane-matrix').hidden||e.button!==0||!activePhoto)return;if(activePhoto.raw?.pending){toast('Wait for RAW development to finish');return;}e.preventDefault();ensureEdits();setMatrixBefore(false);canvas.setPointerCapture(e.pointerId);
    const photo=activePhoto,r=canvas.getBoundingClientRect(),point=[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height],rgb=touchPhotoRGB(photo,point),token=++touchPickToken;
    const drag={before:snapshot(),start:[e.clientX,e.clientY],last:[e.clientX,e.clientY],photo,rawVersion:photo.raw?.version,done:false,band:null};touchPhotoDrag=drag;
    $('touch-hint').textContent='Finding this color…';
    try{const result=await services.pickColor(drag.before.state,rgb);if(token!==touchPickToken||photo!==activePhoto||photo.raw?.version!==drag.rawVersion||JSON.stringify(state)!==JSON.stringify(drag.before.state)||JSON.stringify(services.identitySnapshot())!==JSON.stringify(drag.before.identity)){if(touchPhotoDrag===drag)touchPhotoDrag=null;return;}
      photo.colorPickPosition=point;touchChoose(result.band,rgb);drag.band=result.band;drag.hue=state.mixer[result.band].hue;drag.value=state.mixer[result.band].saturation;syncTouchPin();$('touch-hint').textContent='Move horizontally for hue, vertically for saturation. Similar colors change together.';applyPhotoDrag(drag);if(drag.done){touchFinish(drag.changed?drag.before:null);if(touchPhotoDrag===drag)touchPhotoDrag=null;}
    }catch(error){if(token===touchPickToken){$('touch-hint').textContent=error.message;toast(error.message);touchPhotoDrag=null;}}
  });
  canvas.addEventListener('pointermove',e=>{const drag=touchPhotoDrag;if(!drag||drag.done)return;drag.last=[e.clientX,e.clientY];applyPhotoDrag(drag);});
  const endPhoto=()=>{const drag=touchPhotoDrag;if(!drag)return;drag.done=true;if(drag.band){touchFinish(drag.changed?drag.before:null);touchPhotoDrag=null;}};for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endPhoto);
  window.addEventListener('resize',syncTouchPin);$('tab-matrix').addEventListener('click',()=>{syncColorTouch();syncTouchPin();});
  for(const tab of ['style','light','detail','raw'])$('tab-'+tab).addEventListener('click',()=>{setTouchPick(false);syncTouchPin();});
  syncColorTouch();editorTab('style');
}
