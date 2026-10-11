import {readFile} from 'node:fs/promises';
import {fitCube} from '../../firmware-fit/src/index.ts';
import {inspectStylePackage,renderIcon} from '../../style-contract/src/index.ts';
import type {FourSlotSelection} from '../src/candidate.ts';
/** Exact same accepted package/CUBE fixture used by the production browser test. */
export async function customSelection(nodes:65|257=65):Promise<FourSlotSelection>{
 const root=new URL('../../../',import.meta.url),packageBytes=new Uint8Array(await readFile(new URL('stylepack/fixtures/asymmetric-v2.grstyle',root))),style=await inspectStylePackage(packageBytes),wasmBytes=new Uint8Array(await readFile(new URL('packages/firmware-fit/wasm/gr_firmware_fit_bg.wasm',root))).buffer;
 const fitted=await fitCube(style.cubeBytes,{nodes,wasmBytes});
 return {profile:'V9.2-four-slot',historicalDngPolicy:'fixed-slot-reinterpretation',persistencePolicy:'reset-on-registry-change',slots:[{uuid:style.manifest.id,label:style.manifest.name,packageBytes,packageSha256:style.package_sha256,cubeBytes:style.cubeBytes,cubeSha256:style.manifest.look.sha256,recipe:fitted,fitReport:fitted.report,acceptedFitHash:fitted.report.fit_sha256,icon:{pixels_hex:Buffer.from(renderIcon(style.icon)).toString('hex')}},{reference:'tungsten'},{reference:'ektar'},{reference:'metropolis'}]};
}
