// Automation seam for tools/test_web.mjs. Editor code must not read window.studio.
// Getters expose live module bindings; only lightScope accepts writes.
import {services} from '../services.ts';
import {editorTab} from './advanced.js';
import {$,activePhoto,bootstrap,history,cameraFrame,cameraReview,cameraReviewPending,clone,ctx,currentProfile,exportPackage,failedSaves,flushSave,importProject,photoExportPending,photos,projects,queuePreview,renderDirty,restore,saveJobs,saved,selectPreset,snapshot,state,syncControls} from './app.js';
import {touchOriginalState,touchPhotoDrag} from './color-touch.js';
import {lightDrag,lightScope,setLightScope} from './intent-light.js';
import {applyRawContext,pendingRawContext,rawContext,rawImports,removePhoto} from './raw.js';
export {exposeStudio};
function exposeStudio(){
  /** @type {any} */(window).studio={
    services,$,clone,snapshot,restore,selectPreset,flushSave,failedSaves,syncControls,queuePreview,editorTab,importProject,exportPackage,
    touchOriginalState,applyRawContext,rawContext,removePhoto,ctx,
    get bootstrap(){return bootstrap;},get state(){return state;},get history(){return history;},get projects(){return projects;},
    get saved(){return saved;},get saveJobs(){return saveJobs;},get renderDirty(){return renderDirty;},
    get photos(){return photos;},get activePhoto(){return activePhoto;},get currentProfile(){return currentProfile;},
    get cameraFrame(){return cameraFrame;},get cameraReview(){return cameraReview;},get cameraReviewPending(){return cameraReviewPending;},
    get photoExportPending(){return photoExportPending;},get pendingRawContext(){return pendingRawContext;},get rawImports(){return rawImports;},
    get touchPhotoDrag(){return touchPhotoDrag;},get lightDrag(){return lightDrag;},
    get lightScope(){return lightScope;},set lightScope(value){setLightScope(value);},
  };
}
