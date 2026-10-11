// Context tools: the shared curve editor, selected-color values, and additional-adjustment lists.
import {curveChannel,drawCurve,paletteNames,setCurveChannel} from './advanced.js';
import {$,queuePreview,remember,snapshot,state,syncControls} from './app.js';
import {touchBand,touchChanged,touchClamp,touchFinish} from './color-touch.js';
import {uiColorNames} from './interface.js';
export {placeContextCurve,syncContextTools,wireContextTools};
let contextRgbChannel='red';
/** Show the one curve editor in Tone Curve (Light) or RGB Curves (Color). */
function placeContextCurve(tab){
  if(!['light','matrix'].includes(tab))return;
  if(curveChannel!=='master')contextRgbChannel=curveChannel;
  const tone=tab==='light';setCurveChannel(tone?'master':contextRgbChannel);
  const body=$('curve-channels').parentElement,target=$(tone?'tone-curve':'rgb-curves').lastElementChild;
  if(body.parentElement!==target)target.append(body);
  $('curve-channels').hidden=tone;
  for(const b of $('curve-channels').children)b.hidden=tone||b.dataset.channel==='master';
  $('curve-editor').setAttribute('aria-label',tone?'Tone Curve Five-point curve editor':'RGB Curves Five-point curve editor');
  drawCurve();
}
function extraContextParameters(){
  const value=(key,label)=>({group:'light',label,get:()=>state.values[key]||null,reset:()=>state.values[key]=0});
  return [
    ...[['brightness','Brightness'],['contrast','Contrast'],['shadows','Shadows'],['highlights','Highlights'],['whites','White Point'],['fade','Fade']].map(([k,n])=>value(k,n)),
    {group:'light',label:'Shadow Depth',get:()=>state.film.shadow_depth||null,reset:()=>state.film.shadow_depth=0},
    {group:'matrix',label:'Palette',get:()=>state.style.palette==='neutral'?null:paletteNames[state.style.palette],reset:()=>state.style.palette='neutral'},
    ...[['tone','Palette · Tone',0],['color','Palette · Color',0],['intensity','Palette · Amount',100]].map(([k,label,neutral])=>({group:'matrix',label,get:()=>state.style[k]===neutral?null:state.style[k],reset:()=>state.style[k]=neutral}))
  ];
}
function syncContextTools(){
  const m=state.mixer[touchBand];
  for(const key of ['hue','saturation']){
    const input=$('selected-'+key);if(document.activeElement!==input)input.value=m[key];
  }
  $('selected-color-title').textContent=uiColorNames[touchBand]+' · Values';
  const brightness=m.luminance;$('color-brightness-link').textContent=uiColorNames[touchBand]+' brightness'+(brightness?' · '+(brightness>0?'+':'')+brightness:'')+' in Light →';
  for(const group of ['light','matrix']){
    const d=$('extra-'+group),entries=extraContextParameters().filter(p=>p.group===group&&p.get()!==null);
    d.hidden=!entries.length;d.firstElementChild.querySelector('span').textContent='Additional adjustments · '+entries.length;
    const body=d.lastElementChild;body.replaceChildren();
    for(const p of entries){
      const row=document.createElement('div');row.className='extra-adjustment';
      const label=document.createElement('span');label.textContent=p.label;
      const value=document.createElement('b');value.textContent=p.get();
      const restore=p.label==='Palette · Amount';
      const clear=document.createElement('button');clear.textContent=restore?'Reset':'Clear';clear.setAttribute('aria-label',(restore?'Reset ':'Clear ')+p.label);
      clear.addEventListener('click',()=>{remember();p.reset();syncControls();queuePreview(0);});
      row.append(label,value,clear);body.append(row);
    }
  }
}
function wireContextTools(){
  // Numeric entry belongs to the selected color; HSL is the same underlying edit.
  for(const key of ['hue','saturation']){
    const input=$('selected-'+key);let before=null;
    input.addEventListener('input',()=>{
      if(!input.value.trim()||!Number.isFinite(input.valueAsNumber))return;
      const next=Math.round(touchClamp(input.valueAsNumber));
      if(next===state.mixer[touchBand][key])return;
      if(!before)before=snapshot();
      state.mixer[touchBand][key]=next;touchChanged();
    });
    const finish=()=>{if(before){touchFinish(before);before=null;}input.value=state.mixer[touchBand][key];};
    input.addEventListener('change',finish);input.addEventListener('blur',finish);
  }
  $('color-brightness-link').addEventListener('click',()=>{$('tab-light').click();/** @type {HTMLElement} */(document.querySelector(`[data-light-color="${touchBand}"]`)).click();});
  placeContextCurve('light');syncContextTools();
}
