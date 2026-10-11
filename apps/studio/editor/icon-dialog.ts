/** Film label dialog: edit a draft icon, preview it, and apply it on Done. */
import {validateIcon} from '../../../packages/style-contract/src/index.ts';
import type {FilmLabelIcon} from '../../../packages/style-contract/src/index.ts';
import {services} from '../services.ts';
const iconInput=(id:string)=>document.querySelector<HTMLInputElement>('#'+id)!;
const canvas=(id:string)=>document.querySelector<HTMLCanvasElement>('#'+id)!;
function iconDraft():FilmLabelIcon {
  return {template:'film-label-v1',layout:document.querySelector<HTMLInputElement>('[name="icon-layout"]:checked')!.value as FilmLabelIcon['layout'],top_text:iconInput('style-icon-top').value.toUpperCase(),bottom_text:iconInput('style-icon-bottom').value.toUpperCase(),top_color:iconInput('style-icon-top-color').value.toUpperCase(),bottom_color:iconInput('style-icon-bottom-color').value.toUpperCase()};
}
function previewIcon(){
  for(const id of ['style-icon-top','style-icon-bottom']){const input=iconInput(id);input.value=input.value.toUpperCase().replace(/[^A-Z0-9]/g,'');}
  const error=document.querySelector<HTMLElement>('#style-icon-error')!,done=document.querySelector<HTMLButtonElement>('#confirm-icon')!;
  const draft=iconDraft();iconInput('style-icon-bottom-color').disabled=draft.layout==='solid';
  try{validateIcon(draft);services.drawStyleIcon(canvas('style-icon'),draft);services.drawStyleIcon(canvas('style-icon-native'),draft);error.hidden=true;done.disabled=false;}
  catch{error.textContent='Top line needs 1–4 letters or numbers.';error.hidden=false;done.disabled=true;}
}
/** Done dispatches `gr-style-identity-change` with the previous identity so the editor records one undo entry. */
export function wireIconDialog(){
  const iconDialog=document.querySelector<HTMLDialogElement>('#icon-dialog')!,iconForm=document.querySelector<HTMLFormElement>('#icon-form')!;
  document.getElementById('modify-icon')!.addEventListener('click',()=>{
    const icon=services.identitySnapshot().identity.icon,draft:FilmLabelIcon=icon.template==='film-label-v1'?icon:{template:'film-label-v1',layout:'split',top_text:icon.text,bottom_text:'',top_color:icon.border_color,bottom_color:'#422D28'};
    document.querySelector<HTMLInputElement>(`[name="icon-layout"][value="${draft.layout}"]`)!.checked=true;
    iconInput('style-icon-top').value=draft.top_text;iconInput('style-icon-bottom').value=draft.bottom_text;
    iconInput('style-icon-top-color').value=draft.top_color;iconInput('style-icon-bottom-color').value=draft.bottom_color;
    previewIcon();iconDialog.showModal();
  });
  iconForm.addEventListener('input',previewIcon);
  iconForm.addEventListener('submit',event=>{
    event.preventDefault();const icon=validateIcon(iconDraft()),before=services.identitySnapshot();
    if(services.applyIcon(icon))window.dispatchEvent(new CustomEvent('gr-style-identity-change',{detail:{before}}));
    iconDialog.close();
  });
}
