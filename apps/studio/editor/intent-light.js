import {services} from '../services.ts';
import {ensureEdits,syncAdvanced} from './advanced.js';
import {$,activePhoto,canvas,dirty,remember,setState,snapshot,state,toast} from './app.js';
import {touchClamp,touchFinish,touchHsl,touchPhotoRGB,touchSchedulePreview} from './color-touch.js';
import {dismissGestureCoach,uiColorNames} from './interface.js';
import {syncMatrix} from './matrix.js';
export {lightDrag,lightScope,setLightScope,setLightZone,syncLightIntent,syncLightPin,wireLightIntent};
const lightZones={shadows:'Shadows',midtones:'Midtones',highlights:'Highlights'};
let lightZone='midtones',lightScope='all',lightPickMode=false,lightPickToken=0,lightDrag=null,lightPadDrag=null;
function setLightZone(zone){lightZone=zone;}
function setLightScope(scope){lightScope=scope;}
const lightClamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
// A gesture coordinates a shared tone curve and the existing response controls.
// It produces ordinary project parameters; no invisible second set of settings.
function lightIntentEdit(source,zone,dx,dy){
  const next=JSON.parse(JSON.stringify(source));if(!dx&&!dy)return next;
  const p=[...(next.curves?.master||[0,.25,.5,.75,1])],f={...next.film};
  if(zone==='shadows'){p[1]+=.14*dy-.065*dx;p[2]+=.04*dy+.025*dx;f.shadow_depth=lightClamp((f.shadow_depth||0)+30*dx-30*dy,-100,100);}
  else if(zone==='highlights'){p[2]+=.035*dy;p[3]+=.12*dy+.06*dx;p[4]+=.04*dy+.08*dx;f.highlight_softness=lightClamp((f.highlight_softness||0)-45*dx,0,100);}
  else {p[1]+=.05*dy-.06*dx;p[2]+=.15*dy;p[3]+=.05*dy+.06*dx;}
  p[0]=lightClamp(p[0]);for(let i=1;i<5;i++)p[i]=Math.max(p[i-1],lightClamp(p[i]));
  next.curves={...next.curves,master:p.map(v=>Math.round(v*1e6)/1e6)};next.film=f;return next;
}
function lightIntentPosition(s,zone){
  const p=s.curves?.master||[0,.25,.5,.75,1],i={shadows:1,midtones:2,highlights:3}[zone];
  return [lightClamp(((p[3]-p[1])-.5)/.12,-1,1),lightClamp((p[i]-i/4)/.15,-1,1)];
}
function lightIntentChanged(){dismissGestureCoach('light');dirty();syncAdvanced();syncMatrix();syncLightIntent();touchSchedulePreview();}
function lightSampleInk(rgb){
  const linear=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722>.179?'#17191b':'#fff';
}
function lightZoneSwatch(rgb,zone){
  const [h,s]=touchHsl(rgb||[.45,.45,.45]),l={shadows:.18,midtones:.4,highlights:.72}[zone],a=s*Math.min(l,1-l);
  return [0,8,4].map(n=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));});
}
function syncLightIntent(){
  if(!$('light-intent-pad'))return;
  const global=lightScope==='all';
  $('light-global-tools').hidden=!global;$('light-color-control').hidden=global;
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-light-color]')).forEach(button=>{
    const band=button.dataset.lightColor,value=band==='all'?0:state.mixer?.[band]?.luminance||0;
    button.classList.toggle('active',band===lightScope);button.classList.toggle('has-edit',value!==0);
    button.setAttribute('aria-pressed',String(band===lightScope));
    button.title=band==='all'?'All colors':uiColorNames[band]+' brightness · '+(value>0?'+':'')+value;
  });
  if(!global){
    const value=state.mixer?.[lightScope]?.luminance||0;
    $('light-color-label').textContent=uiColorNames[lightScope]+' brightness';$('light-color-brightness').value=value;
    $('light-color-brightness').setAttribute('aria-label',uiColorNames[lightScope]+' brightness');
    $('light-color-value').textContent=(value>0?'+':'')+value;
  }
  $('light-intent-reset').setAttribute('aria-label',global?'Reset selected tone range':'Reset '+uiColorNames[lightScope]+' brightness');
  $('light-intent-reset').title=global?'Reset selected tone range':'Reset '+uiColorNames[lightScope]+' brightness';
  const [x,y]=lightIntentPosition(state,lightZone);$('light-intent-dot').style.left=(50+50*x)+'%';$('light-intent-dot').style.top=(50-50*y)+'%';
  $('light-intent-name').textContent='Shape '+lightZones[lightZone];
  const pad=$('light-intent-pad');pad.setAttribute('aria-valuenow',Math.round(y*100));pad.setAttribute('aria-valuetext',lightZones[lightZone]+', '+(y>.05?'Brighten':y<-.05?'Darker':'Original depth'));
  const point=!global&&activePhoto?.lightPickPosition;
  const rgb=point?touchPhotoRGB(activePhoto,point):null;
  const pick=$('light-pick');pick.classList.toggle('sampled',!!rgb);
  if(rgb){
    const color=rgb.map(v=>Math.round(v*255)).join(' ');
    pick.style.setProperty('--light-sample',color);
    pick.style.setProperty('--light-ink',lightSampleInk(rgb));
  }else{
    pick.style.removeProperty('--light-sample');pick.style.removeProperty('--light-ink');
  }
  pad.style.setProperty('--light-sample','90 90 94');
  $('light-sample-label').hidden=!rgb;
  $('light-sample-label').textContent=global?'All colors':'Sampled · Editing '+uiColorNames[lightScope]+' brightness';
  $('light-hint').textContent='All colors: shape shadows, midtones, or highlights. Pick a color to adjust that color family instead.';
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-light-zone]')).forEach(b=>{
    const color=lightZoneSwatch(null,b.dataset.lightZone);
    b.style.setProperty('--light-zone-color',color.map(v=>Math.round(v*255)).join(' '));
    b.style.setProperty('--light-zone-ink',lightSampleInk(color));
    b.classList.toggle('active',b.dataset.lightZone===lightZone);b.setAttribute('aria-pressed',String(b.dataset.lightZone===lightZone));
  });
  $('light-pick').disabled=!activePhoto;syncLightPin();
}
function setLightPick(value){lightPickToken++;if(lightDrag?.band)touchFinish(lightDrag.before);lightDrag=null;lightPickMode=value;$('light-pick').classList.toggle('active',value);$('light-pick').setAttribute('aria-pressed',String(value));canvas.classList.toggle('light-picking',value);syncLightPin();}
function syncLightPin(){
  if(!$('light-photo-pin'))return;const pin=$('light-photo-pin'),p=activePhoto?.lightPickPosition;
  pin.hidden=!p||lightScope==='all'||$('pane-light').hidden;if(pin.hidden)return;
  pin.style.background='rgb('+touchPhotoRGB(activePhoto,p).map(v=>Math.round(v*255)).join(',')+')';
  const r=canvas.getBoundingClientRect(),s=$('stage').getBoundingClientRect();pin.style.left=(r.left-s.left+p[0]*r.width)+'px';pin.style.top=(r.top-s.top+p[1]*r.height)+'px';
}
function wireLightIntent(){
  for(const button of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-light-color]'))){const band=button.dataset.lightColor;button.addEventListener('click',()=>{lightScope=band;setLightPick(false);if(activePhoto)activePhoto.lightPickPosition=null;syncLightIntent();});}
  let colorBefore=null;
  $('light-color-brightness').addEventListener('input',event=>{ensureEdits();if(!colorBefore)colorBefore=snapshot();state.mixer[lightScope].luminance=Number(event.target.value);lightIntentChanged();});
  $('light-color-brightness').addEventListener('change',()=>{if(colorBefore){touchFinish(colorBefore);colorBefore=null;}});
  const resetColor=()=>{ensureEdits();if(!state.mixer[lightScope].luminance)return;remember();state.mixer[lightScope].luminance=0;lightIntentChanged();};
  $('light-color-value').addEventListener('click',resetColor);
  for(const button of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-light-zone]')))button.addEventListener('click',()=>{lightZone=button.dataset.lightZone;if(activePhoto)activePhoto.lightZone=lightZone;setLightPick(false);syncLightIntent();});
  $('light-pick').addEventListener('click',()=>setLightPick(!lightPickMode));
  $('light-intent-reset').addEventListener('click',()=>{if(lightScope!=='all'){resetColor();return;}ensureEdits();remember();const p=state.curves.master;if(lightZone==='shadows'){p[1]=.25;p[2]=.5;state.film.shadow_depth=0;}else if(lightZone==='highlights'){p[2]=.5;p[3]=.75;p[4]=1;state.film.highlight_softness=0;}else{p[1]=.25;p[2]=.5;p[3]=.75;}lightIntentChanged();});
  const pad=$('light-intent-pad');
  const move=e=>{const r=pad.getBoundingClientRect(),x=lightClamp((e.clientX-r.left)/r.width*2-1,-1,1),y=lightClamp(1-(e.clientY-r.top)/r.height*2,-1,1);setState(lightIntentEdit(lightPadDrag.before.state,lightZone,x-lightPadDrag.position[0],y-lightPadDrag.position[1]));lightIntentChanged();};
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();ensureEdits();pad.focus({preventScroll:true});lightPadDrag={before:snapshot(),position:lightIntentPosition(state,lightZone)};pad.setPointerCapture(e.pointerId);move(e);});pad.addEventListener('pointermove',e=>{if(lightPadDrag)move(e);});
  const endPad=()=>{if(lightPadDrag)touchFinish(lightPadDrag.before);lightPadDrag=null;};for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,endPad);
  pad.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();ensureEdits();remember();const n=e.shiftKey?.1:.02;setState(lightIntentEdit(state,lightZone,e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0,e.key==='ArrowUp'?n:e.key==='ArrowDown'?-n:0));lightIntentChanged();});
  const applyColorDrag=drag=>{if(!drag.band)return;const dy=(drag.start[1]-drag.last[1])/1.6;if(Math.abs(dy)<2)return;state.mixer[drag.band].luminance=Math.round(touchClamp(drag.value+dy));lightIntentChanged();};
  canvas.addEventListener('pointerdown',async e=>{
    if(!lightPickMode||$('pane-light').hidden||e.button!==0||!activePhoto)return;if(activePhoto.raw?.pending){toast('Wait for RAW development to finish');return;}
    e.preventDefault();ensureEdits();const photo=activePhoto,r=canvas.getBoundingClientRect(),point=[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height],rgb=touchPhotoRGB(photo,point),token=++lightPickToken;
    const drag={before:snapshot(),photo,start:[e.clientX,e.clientY],last:[e.clientX,e.clientY],band:null,done:false};lightDrag=drag;canvas.setPointerCapture(e.pointerId);
    try{
      const result=await services.pickColor(drag.before.state,rgb);
      if(token!==lightPickToken||photo!==activePhoto||JSON.stringify(state)!==JSON.stringify(drag.before.state)||JSON.stringify(services.identitySnapshot())!==JSON.stringify(drag.before.identity)){if(lightDrag===drag)lightDrag=null;return;}
      lightScope=result.band;photo.lightPickPosition=point;drag.band=result.band;drag.value=state.mixer[result.band].luminance;syncLightIntent();applyColorDrag(drag);
      if(drag.done){touchFinish(drag.before);if(lightDrag===drag)lightDrag=null;}
    }catch(error){if(token===lightPickToken){toast(error.message);lightDrag=null;}}
  });
  canvas.addEventListener('pointermove',e=>{if(!lightDrag||lightDrag.done||lightDrag.photo!==activePhoto)return;lightDrag.last=[e.clientX,e.clientY];applyColorDrag(lightDrag);});
  const endPhoto=()=>{if(!lightDrag)return;lightDrag.done=true;if(lightDrag.band){touchFinish(lightDrag.before);lightDrag=null;}};for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endPhoto);
  $('tab-light').addEventListener('click',syncLightIntent);
  for(const tab of ['style','matrix','raw'])$('tab-'+tab).addEventListener('click',()=>setLightPick(false));window.addEventListener('resize',syncLightPin);syncLightIntent();
}
