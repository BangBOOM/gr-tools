/** Studio entry: bind the static editor markup in index.html, which also links the styles. */
import {services} from './services.ts';
import {startEditor} from './editor/app.js';
import {wireIconDialog} from './editor/icon-dialog.ts';
import {exposeStudio} from './editor/automation.js';
exposeStudio();
startEditor();
services.syncIcon();
wireIconDialog();
window.addEventListener('pagehide',()=>services.dispose());
document.getElementById('look-name')!.addEventListener('input',event=>services.renameStyle((event.target as HTMLInputElement).value));
