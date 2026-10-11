import {$,dirty,queuePreview,remember,snapshot,state} from './app.js';
import {syncColorTouch} from './color-touch.js';
import {placeContextCurve,syncContextTools} from './context-tools.js';
import {syncFlowColor} from './flow.js';
import {syncLightIntent} from './intent-light.js';
import {showGestureCoach} from './interface.js';
import {syncMatrix} from './matrix.js';
export {curveChannel,drawCurve,editorTab,ensureEdits,mixNames,paletteNames,setCurveChannel,setMixerColor,showFit,syncAdvanced,wireAdvanced};
const paletteNames={neutral:'Neutral',amber:'Amber',rose:'Rose',jade:'Jade',silver:'Silver'};
const paletteColors={neutral:'#96988b',amber:'#c09b64',rose:'#b88790',jade:'#729890',silver:'#99a0b0'};
const mixNames={red:'Red',orange:'Orange',yellow:'Yellow',green:'Green',aqua:'Aqua',blue:'Blue',purple:'Purple',magenta:'Magenta'};
const mixColors={red:'#d56c6b',orange:'#d49a69',yellow:'#cdc179',green:'#7dba89',aqua:'#79c3bf',blue:'#719fd0',purple:'#a587ce',magenta:'#c482b1'};
let curveChannel='master',mixerColor='red',gradingRegion='shadows',advancedSliders=[];
function setCurveChannel(channel){curveChannel=channel;}
function setMixerColor(color){mixerColor=color;}
function ensureEdits(){
  state.film={highlight_softness:0,shadow_depth:0,chroma_compression:0,shadow_saturation:0,midtone_saturation:0,highlight_saturation:0,...state.film};
  state.curve_interpolation=state.curve_interpolation||'linear';
  state.style={palette:'neutral',tone:0,color:0,intensity:100,...state.style};
  state.strength=state.strength??100;
  state.curves=state.curves||{};for(const k of ['master','red','green','blue'])state.curves[k]=state.curves[k]||[0,.25,.5,.75,1];
  state.mixer=state.mixer||{};for(const k of Object.keys(mixNames))state.mixer[k]={hue:0,saturation:0,luminance:0,...state.mixer[k]};
  state.grading=state.grading||{};for(const k of ['shadows','midtones','highlights'])state.grading[k]={hue:0,saturation:0,...state.grading[k]};state.grading.balance=state.grading.balance||0;
}
function changedAdvanced(){dirty();syncAdvanced();syncMatrix();queuePreview();}
/** Bind a slider in index.html: #<id> and its reset button #<id>-value. */
function bindRange(id,min,read,write,resetValue=0){
  const input=$(id),value=$(id+'-value');let before=null;
  input.addEventListener('input',()=>{ensureEdits();if(!before)before=snapshot();write(Number(input.value));changedAdvanced();});
  input.addEventListener('change',()=>{if(before){remember(before);before=null;}});
  const reset=()=>{ensureEdits();if(read()===resetValue)return;remember();write(resetValue);changedAdvanced();};input.addEventListener('dblclick',reset);value.addEventListener('click',reset);
  advancedSliders.push(()=>{const n=read();input.value=n;value.textContent=id==='grading-hue'?Math.round(n)+'°':(n>0&&min<0?'+':'')+Math.round(n);value.classList.toggle('modified',n!==resetValue);});
}
function editorTab(tab){for(const k of ['style','matrix','light','raw']){$('tab-'+k).classList.toggle('active',k===tab);$('tab-'+k).setAttribute('aria-selected',k===tab);$('pane-'+k).hidden=k!==tab;}syncLightIntent();showGestureCoach(tab);placeContextCurve(tab);}
function syncAdvanced(){
  ensureEdits();
  $('style-dot').style.left=(50+state.style.color/2)+'%';$('style-dot').style.top=(50-state.style.tone/2)+'%';
  $('style-pad').style.setProperty('--palette',paletteColors[state.style.palette]);$('style-pad').setAttribute('aria-valuemin',-100);$('style-pad').setAttribute('aria-valuemax',100);$('style-pad').setAttribute('aria-valuenow',state.style.color);$('style-pad').setAttribute('aria-valuetext',`Tone ${state.style.tone}, Color ${state.style.color}`);
  $('style-tone').value=state.style.tone;$('style-color').value=state.style.color;
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-palette]')).forEach(b=>{b.classList.toggle('active',b.dataset.palette===state.style.palette);b.setAttribute('aria-pressed',String(b.dataset.palette===state.style.palette));});
  advancedSliders.forEach(f=>f());$('curve-interpolation').value=state.curve_interpolation;drawCurve();$('mixer-label').textContent=mixNames[mixerColor];
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-mix]')).forEach(b=>{b.classList.toggle('active',b.dataset.mix===mixerColor);b.classList.toggle('has-edit',Object.values(state.mixer[b.dataset.mix]).some(v=>v!==0));b.setAttribute('aria-pressed',String(b.dataset.mix===mixerColor));});
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-region]')).forEach(b=>{b.classList.toggle('active',b.dataset.region===gradingRegion);b.setAttribute('aria-pressed',String(b.dataset.region===gradingRegion));});
  const g=state.grading[gradingRegion],a=g.hue*Math.PI/180,r=g.saturation*.46;
  $('grading-dot').style.left=(50+Math.cos(a)*r)+'%';$('grading-dot').style.top=(50+Math.sin(a)*r)+'%';$('grading-wheel').setAttribute('aria-valuemin',0);$('grading-wheel').setAttribute('aria-valuemax',100);$('grading-wheel').setAttribute('aria-valuenow',g.saturation);$('grading-wheel').setAttribute('aria-valuetext',`${gradingRegion} Hue ${g.hue}, Saturation ${g.saturation}`);syncColorTouch();syncLightIntent();syncFlowColor();syncContextTools();
}
function drawCurve(){
  const values=state.curves[curveChannel],colors={master:'#e0ddcf',red:'#d5807b',green:'#94b89a',blue:'#81a6d0'};
  const p=values.map((v,i)=>[6+i*57,234-v*228]);
  const path=Array.from({length:129},(_,i)=>[6+i/128*228,234-curveAt(i/128,values,state.curve_interpolation)*228]);
  $('curve-path').setAttribute('d',path.map((v,i)=>(i?'L':'M')+v.join(' ')).join(' '));$('curve-editor').style.setProperty('--curve-color',colors[curveChannel]);
  const points=$('curve-points');
  [...points.children].forEach((c,i)=>{c.setAttribute('cx',p[i][0]);c.setAttribute('cy',p[i][1]);c.setAttribute('aria-label',`${curveChannel} curve point ${i+1}`);c.setAttribute('aria-valuenow',Math.round(values[i]*100));});
  /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-channel]')).forEach(b=>{b.classList.toggle('active',b.dataset.channel===curveChannel);b.setAttribute('aria-pressed',String(b.dataset.channel===curveChannel));});
}
function curveAt(x,points,mode){
  const i=Math.min(Math.floor(x*4),3),t=x*4-i;
  if(mode==='linear')return points[i]*(1-t)+points[i+1]*t;
  const d=points.slice(1).map((v,i)=>(v-points[i])*4),m=[0,0,0,0,0];
  for(let j=1;j<4;j++)if(d[j-1]*d[j]>0)m[j]=2*d[j-1]*d[j]/(d[j-1]+d[j]);
  for(const [j,a,b] of [[0,d[0],d[1]],[4,d[3],d[2]]]){const slope=(3*a-b)/2;m[j]=slope*a<=0?0:Math.sign(a)*Math.min(Math.abs(slope),3*Math.abs(a));}
  return (2*t**3-3*t*t+1)*points[i]+(t**3-2*t*t+t)*m[i]/4+(-2*t**3+3*t*t)*points[i+1]+(t**3-t*t)*m[i+1]/4;
}
function pointerEdit(element,edit){
  let before=null,moved=false;
  const update=e=>{const r=element.getBoundingClientRect();edit(e,r);moved=true;changedAdvanced();};
  element.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();if(e.target.matches('[role="slider"][tabindex]'))e.target.focus({preventScroll:true});else element.focus({preventScroll:true});ensureEdits();before=snapshot();element.setPointerCapture(e.pointerId);update(e);});
  element.addEventListener('pointermove',e=>{if(before)update(e);});
  const finish=()=>{if(before&&moved&&JSON.stringify(before.state)!==JSON.stringify(state))remember(before);before=null;moved=false;};element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',finish);element.addEventListener('lostpointercapture',finish);
}
function showFit(p){$('fit-summary').hidden=true;}
function wireAdvanced(){
  ensureEdits();for(const tab of ['style','light','detail'])$('tab-'+tab).addEventListener('click',()=>editorTab(tab));
  for(const b of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-palette]'))){const key=b.dataset.palette;b.addEventListener('click',()=>{if(state.style.palette===key)return;remember();state.style.palette=key;changedAdvanced();});}
  pointerEdit($('style-pad'),(e,r)=>{state.style.color=Math.round(Math.max(-100,Math.min(100,(e.clientX-r.left)/r.width*200-100)));state.style.tone=Math.round(Math.max(-100,Math.min(100,100-(e.clientY-r.top)/r.height*200)));});
  const resetStyle=()=>{remember();state.style.tone=0;state.style.color=0;changedAdvanced();};$('reset-style').addEventListener('click',resetStyle);$('style-pad').addEventListener('dblclick',resetStyle);
  $('style-pad').addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();remember();const delta=e.shiftKey?10:1;if(['ArrowLeft','ArrowRight'].includes(e.key))state.style.color=Math.max(-100,Math.min(100,state.style.color+(e.key==='ArrowRight'?delta:-delta)));else state.style.tone=Math.max(-100,Math.min(100,state.style.tone+(e.key==='ArrowUp'?delta:-delta)));changedAdvanced();});
  for(const k of ['tone','color'])$('style-'+k).addEventListener('change',e=>{const n=Number(e.target.value);if(!Number.isFinite(n))return;remember();state.style[k]=Math.max(-100,Math.min(100,n));changedAdvanced();});
  bindRange('style-intensity',0,()=>state.style.intensity,n=>state.style.intensity=n,100);
  bindRange('look-strength',0,()=>state.strength,n=>state.strength=n,100);
  for(const [k,min] of [['highlight_softness',0],['shadow_depth',-100],['chroma_compression',0],['shadow_saturation',-100],['midtone_saturation',-100],['highlight_saturation',-100]])bindRange('film-'+k,min,()=>state.film[k],v=>state.film[k]=v);
  $('curve-interpolation').addEventListener('change',e=>{remember();state.curve_interpolation=e.target.value;changedAdvanced();});
  for(const b of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-channel]'))){const k=b.dataset.channel;b.addEventListener('click',()=>{curveChannel=k;drawCurve();});}
  for(const c of /** @type {NodeListOf<SVGElement>} */($('curve-points').querySelectorAll('circle'))){const i=Number(c.dataset.index);c.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();remember();const v=state.curves[curveChannel][i];state.curves[curveChannel][i]=e.key==='Home'?0:e.key==='End'?1:Math.max(0,Math.min(1,v+(e.key==='ArrowUp'?.01:-.01)));changedAdvanced();});}
  let dragIndex=0;pointerEdit($('curve-editor'),(e,r)=>{if(e.type==='pointerdown')dragIndex=e.target.dataset.index!==undefined?Number(e.target.dataset.index):Math.max(0,Math.min(4,Math.round(((e.clientX-r.left)/r.width*240-6)/57)));state.curves[curveChannel][dragIndex]=Math.round(Math.max(0,Math.min(1,(234-(e.clientY-r.top)/r.height*240)/228))*1000)/1000;});
  const shapes={identity:[0,.25,.5,.75,1],soft:[0,.3,.5,.7,1],contrast:[0,.18,.5,.82,1],matte:[.065,.29,.52,.76,.97]};/** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-curve]')).forEach(b=>b.addEventListener('click',()=>{remember();state.curves[curveChannel]=[...shapes[b.dataset.curve]];changedAdvanced();}));
  for(const b of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-mix]'))){const k=b.dataset.mix;b.addEventListener('click',()=>{mixerColor=k;syncAdvanced();});}
  for(const k of ['hue','saturation','luminance'])bindRange('mixer-'+k,-100,()=>state.mixer[mixerColor][k],v=>state.mixer[mixerColor][k]=v);
  $('reset-mixer').addEventListener('click',()=>{remember();state.mixer[mixerColor]={hue:0,saturation:0,luminance:0};changedAdvanced();});
  for(const b of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll('[data-region]'))){const k=b.dataset.region;b.addEventListener('click',()=>{gradingRegion=k;syncAdvanced();});}
  pointerEdit($('grading-wheel'),(e,r)=>{const x=(e.clientX-r.left)/r.width*2-1,y=(e.clientY-r.top)/r.height*2-1;state.grading[gradingRegion]={hue:Math.round((Math.atan2(y,x)*180/Math.PI+360)%360),saturation:Math.round(Math.min(1,Math.hypot(x,y)/.92)*100)};});
  $('grading-wheel').addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();remember();const g=state.grading[gradingRegion];if(['ArrowLeft','ArrowRight'].includes(e.key))g.hue=(g.hue+(e.key==='ArrowRight'?1:359))%360;else g.saturation=Math.max(0,Math.min(100,g.saturation+(e.key==='ArrowUp'?1:-1)));changedAdvanced();});
  bindRange('grading-hue',0,()=>state.grading[gradingRegion].hue,n=>state.grading[gradingRegion].hue=n);
  bindRange('grading-saturation',0,()=>state.grading[gradingRegion].saturation,n=>state.grading[gradingRegion].saturation=n);
  bindRange('grading-balance',-100,()=>state.grading.balance,n=>state.grading.balance=n);
  $('reset-grading').addEventListener('click',()=>{remember();state.grading[gradingRegion]={hue:0,saturation:0};changedAdvanced();});
  syncAdvanced();
}
