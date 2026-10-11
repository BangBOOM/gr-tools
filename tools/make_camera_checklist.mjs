import {readFile,writeFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyReportIntegrity} from '../packages/firmware-core/src/report.ts';
import {cameraChecklist} from '../packages/firmware-core/src/camera-checklist.ts';
import {strictJSON} from '../packages/style-contract/src/index.ts';
const [reportPath,firmwarePath,output,...dngPaths]=process.argv.slice(2);
if(!reportPath||!firmwarePath||!output)throw new Error('Usage: node tools/make_camera_checklist.mjs report.json firmware.bin checklist.md [photo.DNG ...]');
const report=strictJSON(await readFile(reportPath,'utf8')),firmware=await readFile(firmwarePath);
if(!await verifyReportIntegrity(report,firmware))throw new Error('Report inventory or firmware/report hash binding failed');
const photos=[];for(const path of dngPaths){const bytes=await readFile(path);photos.push({name:basename(path),sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(output,cameraChecklist(report,photos),{flag:'wx'});
console.log(`Pending device checklist created: ${output}`);
