// Presentation and guidance stay outside the saved color recipe.
import {$} from './app.js';
export {dismissGestureCoach,showGestureCoach,uiColorNames,wireCompactInterface};
const uiColorNames={red:'Red',orange:'Orange',yellow:'Yellow',green:'Green',aqua:'Cyan',blue:'Blue',purple:'Purple',magenta:'Magenta'};
function positionUiPopover(detail){
  if(!detail?.open)return;
  const panel=detail.lastElementChild,r=detail.firstElementChild.getBoundingClientRect();
  panel.style.left=Math.max(16,Math.min(innerWidth-panel.offsetWidth-16,r.right-panel.offsetWidth))+'px';
  panel.style.top=Math.max(16,Math.min(innerHeight-panel.offsetHeight-16,r.bottom+8))+'px';
}
function showGestureCoach(key){
  const coach=$('coach-'+key);if(!coach)return;
  let seen=false;try{seen=localStorage.getItem('gr-coach-'+key)==='seen';}catch{}
  coach.hidden=seen;
}
function dismissGestureCoach(key){const coach=$('coach-'+key);if(coach)coach.hidden=true;try{localStorage.setItem('gr-coach-'+key,'seen');}catch{}}
/** Help popovers: position on open, close on outside click or Escape. */
function wireCompactInterface(){
  for(const detail of /** @type {NodeListOf<HTMLDetailsElement>} */(document.querySelectorAll('.inline-help,.model-check')))detail.addEventListener('toggle',()=>{
    detail.firstElementChild.setAttribute('aria-expanded',String(detail.open));
    positionUiPopover(detail);
  });
  // Native disclosure semantics, keyboard Escape, and click-away dismissal.
  document.addEventListener('click',e=>{for(const detail of /** @type {NodeListOf<HTMLDetailsElement>} */(document.querySelectorAll('.inline-help[open],.model-check[open]')))if(!detail.contains(/** @type {Node} */(e.target)))detail.open=false;});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;for(const detail of /** @type {NodeListOf<HTMLDetailsElement>} */(document.querySelectorAll('.inline-help[open],.model-check[open]'))){detail.open=false;detail.querySelector('summary').focus({preventScroll:true});}});
  showGestureCoach(document.querySelector('.editor-tabs [aria-selected="true"]').id.replace('tab-',''));
}
