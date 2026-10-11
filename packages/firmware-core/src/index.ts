import { UNICORN_RUNTIME_SHA256 } from '../../firmware-checks/vendor/source-build-2026-10-09/pin.ts';
import {V92,V92_PLAN,V92_BEFORE,V92_PAYLOAD} from '../platform/version-v92.ts';
import initialize, * as wasm from '../wasm/gr_firmware_core.js';
import { PLATFORM_SHA256 } from '../platform/pin.ts';
import { CORE_WASM_SHA256, CORE_RUST_SOURCE_SHA256 } from '../wasm/pin.ts';
import { additiveSum, bytesEqual, decodeIndependent, MAX_CONTAINER_BYTES, PAYLOAD_BYTES } from './decoder.ts';
import { applyFrozenPlan, assetBytes, getPlan, sha256, type Platform } from './platform.ts';
import { runReferenceChecks,runCandidateCurveChecks } from '../../firmware-checks/src/index.ts';
import { createCandidate, type FourSlotSelection, type Candidate } from './candidate.ts';
import { verifyCandidateReadback } from './readback.ts';
import { sealReport,verifyReportIntegrity } from './report.ts';
export { canonicalReportJSON,verifyReportIntegrity } from './report.ts';

const OFFICIAL = 'd6a3c9c288d784080e7b283222ecdd8752adfeed6faa36dab44f73115354bfd4';
const SOURCE = '53da690797f35ad6dc2c429d8ca1d0de8e333c211ed959816813982cd093b703';
const V91_PAYLOAD = '4af8b4b61fc20495d639bd4183b3631060837fa2d2f1fcca890393e856b76b02';
const V91_BEFORE = '4332e9babb26aea76cebd3a28a9dd46572f152d83de1f33ef42bf1b0b4aebd84';
const V91 = '58135687e2b990636369d80ef36475cab0ea28a5128184322f2cd94ba46352d5';
const KNOWN = [
  [OFFICIAL,30391780,'official-2.10','GR III v2.10 official','official'],
  ['97bc0a838ff72750f5a644e25ca116b146e22896f14aaa5f6c06e704fe4b6698',30408860,'V7','V7 Gold','derived'],
  ['2088b800d09d03b3ee270fb2526416368bfb5b87f67e090e3a95d55b9d4d88c5',30410436,'V9-defective','V9 (known RAW capacity defect)','derived'],
  [V91,30410436,'V9.1','V9.1 four films','derived'],
  [V92,30410988,'V9.2','V9.2 persistence and refresh repair','derived'],
] as const;
export type Selection = { profile: 'V9.1-reference'|'V9.2-reference' } | FourSlotSelection;
export type Gate = { id: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string; evidence?: unknown };
export type FirmwareReport = { schema: 'gr3-web-build-report-v1'; status: 'PASS' | 'FAIL' | 'BLOCKED'; gates: Gate[]; deviceAcceptance: 'REQUIRES_DEVICE_TEST'; [key: string]: unknown };
export type Progress = { phase: string; probe?: string; status?: string };
export class GateError extends Error {
  readonly report: FirmwareReport;
  constructor(message: string, report: FirmwareReport) { super(message); this.name = 'GateError'; this.report = report; }
}
const report = (gates: Gate[], extra = {}): FirmwareReport => ({ schema: 'gr3-web-build-report-v1', status: gates.some(g => g.status === 'FAIL') ? 'FAIL' : gates.some(g => g.status === 'BLOCKED') ? 'BLOCKED' : 'PASS', gates, deviceAcceptance: 'REQUIRES_DEVICE_TEST', ...extra });
function gate(ok: unknown, id: string, detail: string): Gate {
  if (!ok) throw new GateError(detail, report([{ id, status: 'FAIL', detail }]));
  return { id, status: 'PASS', detail };
}
function bytes(base: ArrayBuffer): Uint8Array {
  if (!(base instanceof ArrayBuffer) || base.byteLength > MAX_CONTAINER_BYTES || base.byteLength < 128) throw new GateError('invalid firmware input size', report([{ id: 'input-size', status: 'FAIL', detail: 'Provide a GR III BIN up to 32 MiB.' }]));
  return new Uint8Array(base);
}
export async function createFirmwareCore(options: { wasmUrl?: string | URL; wasmBytes?: ArrayBuffer; platformUrl?: string | URL; platform?: Platform } = {}) {
  const platformText = options.platform ? JSON.stringify(options.platform) + '\n' : await (async () => {
    const response = await fetch(options.platformUrl ?? new URL('../platform/platform.json',import.meta.url));
    if (!response.ok) throw new Error(`platform fetch failed ${response.status}`); return response.text();
  })();
  gate(await sha256(new TextEncoder().encode(platformText)) === PLATFORM_SHA256, 'platform-integrity', 'audited platform assets match integrity pin');
  const platform: Platform = JSON.parse(platformText);
  gate(platform.schema === 'gr3-web-platform-v1' && platform.rom_distributed === false, 'platform-schema', 'static code/data platform contains no distributed ROM');
  const wasmBytes=options.wasmBytes??await(async()=>{const response=await fetch(options.wasmUrl??new URL('../wasm/gr_firmware_core_bg.wasm',import.meta.url));if(!response.ok)throw new Error(`core WASM fetch failed ${response.status}`);return response.arrayBuffer();})();
  gate(await sha256(new Uint8Array(wasmBytes))===CORE_WASM_SHA256,'wasm-integrity','Rust WASM matches committed build integrity pin');
  await initialize({ module_or_path: wasmBytes });
  const selectionDefault: Selection = { profile: 'V9.2-reference' };
  const versionOf=(s:Selection)=>s.profile.startsWith('V9.2-')?'V9.2':'V9.1';
  const isReference=(s:Selection):s is {profile:'V9.1-reference'|'V9.2-reference'}=>s.profile.endsWith('-reference');
  const isCustom=(s:Selection):s is FourSlotSelection=>!isReference(s);
  async function inspect(base: ArrayBuffer) {
    const raw = bytes(base), hash = await sha256(raw), known = KNOWN.find(([h,n]) => h === hash && n === raw.length);
    return { supported: !!known, sha256: hash, profile: known?.[2] ?? 'unknown', label: known?.[3] ?? 'Unknown firmware', source: known?.[4] ?? 'unknown', bytes: raw.length,
      capabilities: { inspect: !!known, referenceBuild: known?.[0] === OFFICIAL, customFourSlotBuild: known?.[0]===OFFICIAL, arbitraryAddDelete: false, arbitraryReorder: false, fixedFourSlotReorder:false },
      knownDefect: known?.[2] === 'V9-defective' ? 'RAW native list capacity17 cannot contain18/19 live rows' : null };
  }
  async function sourcePayload(base: ArrayBuffer, progress?: (event: Progress) => void) {
    const raw = bytes(base); gate(raw.length === 30391780 && await sha256(raw) === OFFICIAL, 'official-base', 'build accepts exact official GR III v2.10 base only');
    progress?.({ phase: 'decode-rust' }); const payload = wasm.decode(raw);
    progress?.({ phase: 'decode-independent' }); const independent = decodeIndependent(raw);
    const gates = [gate(bytesEqual(payload,independent.payload), 'independent-decoders', 'Rust and independent TypeScript agree on every payload byte'), gate(payload.length === PAYLOAD_BYTES && await sha256(payload) === SOURCE, 'source-payload', 'decoded official payload matches audited SHA256')];
    return { raw, payload, frames: independent.frames, gates };
  }
  async function plan(base: ArrayBuffer, selection: Selection = selectionDefault) {
    const identity = await inspect(base), gates: Gate[] = [];
    if(!selection||!['V9.1-reference','V9.1-four-slot','V9.2-reference','V9.2-four-slot'].includes(selection.profile))return report([{id:'selection',status:'FAIL',detail:'Unknown build profile; select an explicitly supported platform.'}],{identity});
    gates.push({ id: 'official-base', status: identity.capabilities.referenceBuild ? 'PASS' : 'FAIL', detail: 'Only the exact official GR III v2.10 package is an audited build base.' });
    if (isReference(selection)) gates.push({ id: 'selection', status: 'PASS', detail: `Frozen ${versionOf(selection)} reference: Gold, Tungsten800T, Ektar100, Metropolis; all factory styles retained.` });
    let candidateReport:any;
    if(isCustom(selection)&&identity.capabilities.referenceBuild){try{const {payload}=await sourcePayload(base);const candidate=await createCandidate(payload,platform,selection);const evidence=verifyCandidateReadback(payload,candidate.beforeChecksum,platform,candidate);candidateReport=candidate.report;gates.push({id:'candidate-data',status:'PASS',detail:'Four-slot data, precompiled code, independent readback, protected native tables and exact arena capacity validated.',evidence});}catch(e){gates.push({id:'candidate-data',status:'FAIL',detail:e instanceof Error?e.message:String(e)});}}
    return report(gates, { identity, target: versionOf(selection), candidate:candidateReport, arenas: [{ start: '0x53000d50', end: '0x53002000' },{ start: '0x53002080', end: '0x53004000' }], moduleBytes: candidateReport?.moduleBytes??11362, arenaBytes:12848, freeBytes:12848-(candidateReport?.moduleBytes??11362), requiredProbes: platform.probes, nativeArmRequiredBeforeDownload:true, protectedFactoryStyles:12, originalAndCustomEntries:3 });
  }
  async function fit(base: ArrayBuffer, selection: Selection = selectionDefault) {
    const result = await plan(base,selection);
    return { ...result, fit: isReference(selection) ? { mode:'frozen-recipes', approximation:false, curveNodes:[257,257,65,65] } : { mode:'fixed-four-slot-recipes', curveNodes:selection.slots.map(s=>s.recipe?.curves_q14[0].length), approximationRequiresBoundFitAcceptance:true } };
  }
  async function verify(base: ArrayBuffer, candidate: ArrayBuffer, selection: Selection = selectionDefault,
    options: { onProgress?: (event: Progress) => void; runArm?: boolean } = {}) {
    const planned = await plan(base,selection); if (planned.status !== 'PASS') throw new GateError('build plan is blocked',planned);
    const { raw, payload, frames, gates } = await sourcePayload(base,options.onProgress);
    const frozen = getPlan(platform,versionOf(selection));
    gates.push(gate(frozen.source_sha256 === SOURCE,'plan-source','frozen plan source binding matches official payload'));
    const candidateData=isCustom(selection)?await createCandidate(payload,platform,selection):undefined;
    const requested = candidateData?Uint8Array.from(candidateData.beforeChecksum):applyFrozenPlan(payload,frozen);
    if(!candidateData)gates.push(gate(await sha256(requested) === (versionOf(selection)==='V9.2'?V92_BEFORE:V91_BEFORE),'patch-whitelist','all payload differences derive from exact nonoverlapping old/new whitelist'));
    new DataView(requested.buffer).setUint32(requested.length-4,-additiveSum(requested.subarray(0,requested.length-4))>>>0,true);
    if(!candidateData)gates.push(gate(await sha256(requested) === (versionOf(selection)==='V9.2'?V92_PAYLOAD:V91_PAYLOAD),'target-payload','requested repaired payload matches frozen V9.1'));
    options.onProgress?.({ phase: 'verify-container' });
    const encoded = bytes(candidate), decoded = wasm.decode(encoded), independent = decodeIndependent(encoded);
    gates.push(gate(bytesEqual(decoded,requested) && bytesEqual(decoded,independent.payload),'candidate-two-decoders','both independent decoders match every requested byte including checksum'));
    gates.push(gate(frames.length === independent.frames.length && frames.every((f,i) => f.outEnd-f.outStart === independent.frames[i].outEnd-independent.frames[i].outStart),'frame-schedule','original decoded frame schedule is preserved'));
    gates.push(gate(additiveSum(encoded) === 0 && additiveSum(decoded) === 0,'checksums','container and decoded additive sums are zero; token terminators and reference bounds validated'));
    gates.push(gate(bytesEqual(raw.subarray(0,128),encoded.subarray(0,128)),'header-preserved','official header preserved byte for byte'));
    if(!candidateData)gates.push(gate(await sha256(encoded) === (versionOf(selection)==='V9.2'?V92:V91),'python-golden','Rust output reproduces independently built frozen Python V9.1 BIN SHA256'));
    else {const evidence=verifyCandidateReadback(payload,decoded,platform,candidateData);gates.push({id:'independent-final-readback',status:'PASS',detail:'Independent full payload ownership, precompiled ARM code, matrices, all curves, icon LZ4 pixels, display order and UUID header decoded from final BIN.',evidence});}
    if (options.runArm === false) {
      gates.push({ id:'native-arm',status:'BLOCKED',detail:'Native ARM suites were explicitly skipped; candidate is not downloadable.' });
      return sealReport(report(gates,{ candidateSha256: await sha256(encoded), payloadSha256:await sha256(decoded) }));
    }
    if(candidateData){candidateData.beforeChecksum=decoded;candidateData.assets.set('/re/build/'+(versionOf(selection)==='V9.2'?'V9-2':'V9-1')+'-integrated/unpackedFW.before-checksum.bin',decoded);}
    const probes = await runReferenceChecks(payload,platform,{version:versionOf(selection),candidate:candidateData,finalPayload:decoded,onProgress(name,result){options.onProgress?.({phase:'native-arm',probe:name,status:result?.status ?? 'RUNNING'});}});
    gates.push({ id:'native-arm',status:probes.length === platform.probes.length+(versionOf(selection)==='V9.2'?2:0) && probes.every(p=>p.status==='PASS') ? 'PASS':'FAIL',detail:'Complete original ARM assertions: curve65/menu/text/icon/storage/backend/RAW/UI/capacity negative control/memory/shared pages.',evidence:probes });
    if(versionOf(selection)==='V9.2'){const lifecycle=probes.find(p=>p.name==='persistence_apdata13_probe');gates.push({id:'persistence-lifecycle',status:lifecycle?.status==='PASS'?'PASS':'FAIL',detail:'Final ROM native APData13 bundle, import, cache and factory/custom save-order checks.',evidence:lifecycle});}
    if(versionOf(selection)==='V9.2'){const refresh=probes.find(p=>p.name==='persistence_refresh_property_gate');gates.push({id:'refresh-properties',status:refresh?.status==='PASS'?'PASS':'FAIL',detail:'Final ROM integer refresh shim and native bulk receiver, with explicit zero-zoom VFP fixture limitations.',evidence:refresh});}
    if(candidateData){options.onProgress?.({phase:'native-arm',probe:'candidate-native-curves',status:'RUNNING'});try{const evidence=await runCandidateCurveChecks(candidateData);gates.push({id:'candidate-native-curves',status:'PASS',detail:'All twelve final-ROM candidate curves exercised across the complete Q14 domain with native codec ABI and malformed blocked-data checks.',evidence});options.onProgress?.({phase:'native-arm',probe:'candidate-native-curves',status:'PASS'});}catch(e){gates.push({id:'candidate-native-curves',status:'FAIL',detail:e instanceof Error?e.message:String(e)});}}
    return sealReport(report(gates,{buildProfile:selection.profile,baseSha256:OFFICIAL,planSha256:await sha256(candidateData?.assets.get(platform.plans[versionOf(selection)])??assetBytes(platform,platform.plans[versionOf(selection)])),candidateSha256: await sha256(encoded), payloadSha256:await sha256(decoded), bytes:encoded.length, frameCount:frames.length,candidate:candidateData?.report,toolchain:{unicornRuntimeSha256:UNICORN_RUNTIME_SHA256,coreWasmSha256:CORE_WASM_SHA256,rustSourceSha256:CORE_RUST_SOURCE_SHA256,platformSha256:PLATFORM_SHA256} }));
  }
  async function build(base: ArrayBuffer, selection: Selection = selectionDefault, options: { onProgress?: (event: Progress) => void } = {}) {
    options.onProgress?.({phase:'check-plan'});
    const planned = await plan(base,selection); if (planned.status !== 'PASS') throw new GateError('build plan is blocked',planned);
    options.onProgress?.({phase:'plan-checked'});
    const { raw,payload } = await sourcePayload(base,options.onProgress);
    const custom=isCustom(selection)?await createCandidate(payload,platform,selection):undefined;
    const requested = custom?custom.beforeChecksum:applyFrozenPlan(payload,getPlan(platform,versionOf(selection)));
    if(!custom)gate(await sha256(requested) === (versionOf(selection)==='V9.2'?V92_BEFORE:V91_BEFORE),'patch-whitelist','exact frozen V9.1 payload before checksum');
    options.onProgress?.({phase:'repack-rust'});
    const candidate = wasm.repack(raw,requested);
    const result = await verify(base,candidate.buffer as ArrayBuffer,selection,options);
    if (result.status !== 'PASS') throw new GateError('candidate did not pass every required gate',result);
    options.onProgress?.({phase:'verify-report'});
    if(!await verifyReportIntegrity(result,candidate))throw new GateError('build report is missing required coverage or artifact binding',report([{id:'report-integrity',status:'FAIL',detail:'Required evidence inventory or candidate/report hash binding failed.'}],{untrustedReport:result}));
    return { firmware: candidate.buffer as ArrayBuffer, report:result };
  }
  return { inspect,plan,fit,build,verify };
}
