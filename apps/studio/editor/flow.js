import {editorTab} from './advanced.js';
import {$,dirty,remember,snapshot,state,syncControls,viewTab} from './app.js';
import {touchClamp,touchFinish,touchSchedulePreview} from './color-touch.js';
export {syncFlowColor,syncStartingNavigation,wireFlow};
function wireFlow(){
  const browse=direction=>{const list=$('preset-list'),pages=[...list.children],step=pages[1].offsetLeft-pages[0].offsetLeft,current=Math.round(list.scrollLeft/step);list.scrollTo({left:Math.max(0,Math.min(pages.length-1,current+direction))*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  $('starting-previous').addEventListener('click',()=>browse(-1));$('starting-next').addEventListener('click',()=>browse(1));
  $('preset-list').addEventListener('scroll',syncStartingNavigation);
  new ResizeObserver(syncStartingNavigation).observe($('preset-list'));
  let before=null;const pad=$('global-color-pad');
  const move=e=>{const r=pad.getBoundingClientRect();state.values.warmth=Math.round(touchClamp((e.clientX-r.left)/r.width*200-100));state.values.tint=Math.round(touchClamp(100-(e.clientY-r.top)/r.height*200));dirty();syncControls();touchSchedulePreview();};
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();before=snapshot();pad.setPointerCapture(e.pointerId);pad.focus({preventScroll:true});move(e);});pad.addEventListener('pointermove',e=>{if(before)move(e);});
  const end=()=>{if(before)touchFinish(before);before=null;};for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,end);
  pad.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();remember();const key=['ArrowLeft','ArrowRight'].includes(e.key)?'warmth':'tint',n=e.shiftKey?10:2;state.values[key]=touchClamp((state.values[key]||0)+(['ArrowRight','ArrowUp'].includes(e.key)?n:-n));dirty();syncControls();touchSchedulePreview();});
  editorTab('style');
}
function syncFlowColor(){
  const x=state.values.warmth||0,y=state.values.tint||0;$('global-color-dot').style.left=(50+x/2)+'%';$('global-color-dot').style.top=(50-y/2)+'%';$('global-color-pad').setAttribute('aria-valuenow',x);$('global-color-pad').setAttribute('aria-valuetext',`Warmth ${x}, Tint ${y}`);
}
function syncStartingNavigation(){
  const list=$('preset-list'),pages=list.children;
  $('starting-navigation').hidden=viewTab!=='presets'||pages.length<2;
  if($('starting-navigation').hidden||!list.clientWidth)return;
  const page=Math.round(list.scrollLeft/(pages[1].offsetLeft-pages[0].offsetLeft));
  $('starting-page-number').textContent=`${page+1} / ${pages.length}`;
  $('starting-previous').disabled=list.scrollLeft<=1;
  $('starting-next').disabled=list.scrollLeft>=list.scrollWidth-list.clientWidth-1;
}
