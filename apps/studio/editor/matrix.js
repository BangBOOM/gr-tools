// Legacy matrix configuration remains in the color engine; this file owns Color comparison.
import {editorTab} from './advanced.js';
import {$,queuePreview} from './app.js';
import {syncColorTouch} from './color-touch.js';
import {syncFlowColor} from './flow.js';
import {syncLightIntent} from './intent-light.js';
export {matrixBeforeHeld,setMatrixBefore,syncMatrix,wireMatrix};
let matrixBeforeHeld=false;
function syncMatrix(){syncColorTouch();syncLightIntent();syncFlowColor();}
function setMatrixBefore(value){
  if(value===matrixBeforeHeld)return;matrixBeforeHeld=value;$('matrix-compare').classList.toggle('held',value);$('matrix-compare').setAttribute('aria-pressed',value);queuePreview(0);
}
function wireMatrix(){
  $('tab-matrix').addEventListener('click',()=>editorTab('matrix'));
  const button=$('matrix-compare');button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);setMatrixBefore(true);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>setMatrixBefore(false));
  button.addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();e.stopPropagation();if(!e.repeat)setMatrixBefore(e.code==='Enter'?!matrixBeforeHeld:true);}});button.addEventListener('keyup',e=>{e.stopPropagation();if(e.code==='Space')setMatrixBefore(false);});button.addEventListener('blur',()=>setMatrixBefore(false));window.addEventListener('blur',()=>setMatrixBefore(false));
}
