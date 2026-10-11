import { UNICORN_RUNTIME_SHA256 } from '../../firmware-checks/vendor/source-build-2026-10-09/pin.ts';
import {V92,V92_PLAN,V92_PAYLOAD} from '../platform/version-v92.ts';
import { sha256 } from './platform.ts';
import {MODEL_SHA256} from '../../color-engine/assets/pin.ts';
import {FIT_WASM_SHA256,FIT_RUST_SOURCE_SHA256,FIT_EVALUATOR_SOURCE_SHA256} from '../../firmware-fit/wasm/pin.ts';
import {REFERENCE_PINS} from '../platform/reference-pins.ts';
import { PLATFORM_SHA256 } from '../platform/pin.ts';
import { CORE_WASM_SHA256,CORE_RUST_SOURCE_SHA256 } from '../wasm/pin.ts';
import { validCameraName } from './display-name.ts';
import {renderIcon} from '../../style-contract/src/index.ts';
export const REQUIRED_PROBES = ['four49_curve65_arm','V9_menu_arm','V9_text_guest','V9_icon_arm','V9_storage_guest','V9_backend_arm','V9_raw_arm','V9_ui_detail_arm','V9_1_capacity_arm','V9_1_memory_arm','V9_1_shared_pages_arm'] as const;
export const EXPECTED_PROBE_STATUS:Record<string,string>={four49_curve65_arm:'PASS_REAL_ARM_65_INTERPOLATION',V9_menu_arm:'PASS',V9_text_guest:'PASS',V9_icon_arm:'PASS',V9_storage_guest:'PASS',V9_backend_arm:'PASS_FINAL_ROM_ARM',V9_raw_arm:'PASS',V9_ui_detail_arm:'PASS',V9_1_capacity_arm:'CONFIRMED_NATIVE_CAPACITY_MISMATCH',V9_1_memory_arm:'PASS_ACTUAL_V9_1_NATIVE_MEMORY_REGRESSION',V9_1_shared_pages_arm:'PASS_ALL_NINE_RAW_PAGE_CAPACITY_CONTRACTS'};
EXPECTED_PROBE_STATUS.persistence_refresh_property_gate='PASS_NATIVE_REFRESH_PROPERTY_GATE';
EXPECTED_PROBE_STATUS.persistence_apdata13_probe='PASS_APDATA13_FINAL_PAYLOAD';
const COMMON = ['independent-decoders','source-payload','plan-source','candidate-two-decoders','frame-schedule','checksums','header-preserved','native-arm'];
const OFFICIAL='d6a3c9c288d784080e7b283222ecdd8752adfeed6faa36dab44f73115354bfd4';
/** Semantic canonical JSON: sorted object keys, array order preserved, no hash field. */
export function canonicalReportJSON(report:any):string {
  const {reportSha256:_,...body}=report;
  const canonical=(v:any):any=>{
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('nonfinite report number');return v;}
    if(Array.isArray(v))return v.map(x=>x===undefined?null:canonical(x));
    if(typeof v==='object'){const out:Record<string,unknown>={};for(const key of Object.keys(v).sort())if(v[key]!==undefined)out[key]=canonical(v[key]);return out;}
    throw new Error('non-JSON report value');
  };
  return JSON.stringify(canonical(body));
}
export async function sealReport<T extends object>(report:T):Promise<T&{reportSha256:string}>{return {...report,reportSha256:await sha256(new TextEncoder().encode(canonicalReportJSON(report)))};}
/** A hash is an integrity binding, not a signature or a claim of device safety.
 * Download validation also requires exact gate inventory, actual evidence and
 * artifact SHA; an arbitrary old PASS plus a fresh self-hash is rejected.
 */
export async function verifyReportIntegrity(report:any,firmware:ArrayBuffer|Uint8Array):Promise<boolean>{
  try{
    const fields=['schema','status','gates','deviceAcceptance','buildProfile','baseSha256','planSha256','candidateSha256','payloadSha256','bytes','frameCount','candidate','toolchain','reportSha256'];
    if(!report||typeof report!=='object'||Array.isArray(report)||Object.keys(report).some(k=>!fields.includes(k)))return false;
    if(report?.schema!=='gr3-web-build-report-v1'||report.status!=='PASS'||report.deviceAcceptance!=='REQUIRES_DEVICE_TEST'||report.baseSha256!==OFFICIAL)return false;
    if(!['V9.1-reference','V9.1-four-slot','V9.2-reference','V9.2-four-slot'].includes(report.buildProfile))return false;
    const v92=report.buildProfile.startsWith('V9.2-'),reference=report.buildProfile.endsWith('-reference'),required:string[]=v92?[...REQUIRED_PROBES,'persistence_apdata13_probe','persistence_refresh_property_gate']:[...REQUIRED_PROBES];
    if(report.buildProfile==='V9.2-reference'&&(report.candidateSha256!==V92||report.planSha256!==V92_PLAN||report.payloadSha256!==V92_PAYLOAD))return false;
    if(!/^[a-f0-9]{64}$/.test(report.reportSha256)||await sha256(new TextEncoder().encode(canonicalReportJSON(report)))!==report.reportSha256)return false;
    if(report.toolchain?.unicornRuntimeSha256!==UNICORN_RUNTIME_SHA256||report.toolchain?.coreWasmSha256!==CORE_WASM_SHA256||report.toolchain?.rustSourceSha256!==CORE_RUST_SOURCE_SHA256||report.toolchain?.platformSha256!==PLATFORM_SHA256)return false;
    const bytes=firmware instanceof Uint8Array?firmware:new Uint8Array(firmware);
    if(bytes.length!==report.bytes||await sha256(bytes)!==report.candidateSha256||report.frameCount!==2430)return false;
    if(report.buildProfile==='V9.1-reference'&&report.candidateSha256!=='58135687e2b990636369d80ef36475cab0ea28a5128184322f2cd94ba46352d5')return false;
    const expected=[...COMMON,...(v92?['persistence-lifecycle','refresh-properties']:[]),...(reference?['patch-whitelist','target-payload','python-golden']:['independent-final-readback','candidate-native-curves'])].sort();
    if(!Array.isArray(report.gates)||report.gates.length!==expected.length||report.gates.some((g:any)=>g.status!=='PASS'||typeof g.detail!=='string'||Object.keys(g).some(k=>!['id','status','detail','evidence'].includes(k)))||report.gates.map((g:any)=>g.id).sort().some((id:string,i:number)=>id!==expected[i]))return false;
    const suites=report.gates.find((g:any)=>g.id==='native-arm').evidence;
    if(!Array.isArray(suites)||suites.length!==required.length||new Set(suites.map((s:any)=>s.name)).size!==required.length||suites.some((s:any)=>!required.includes(s.name)||s.status!=='PASS'||s.finalPayloadSha256!==report.payloadSha256||!s.reports||Object.keys(s.reports).length!==1))return false;
    const evidence=(name:string)=>Object.values(suites.find((s:any)=>s.name===name).reports)[0] as any;
    if(suites.some((s:any)=>(Object.values(s.reports)[0] as any).status!==EXPECTED_PROBE_STATUS[s.name]))return false;
    if(!/^[0-9a-f]{64}$/.test(report.planSha256)||suites.some((s:any)=>s.name!=='four49_curve65_arm'&&((Object.values(s.reports)[0] as any).combined_plan_sha256??(Object.values(s.reports)[0] as any).plan_sha256)!==report.planSha256))return false;
    if(v92){const r=evidence('persistence_refresh_property_gate'),g=report.gates.find((g:any)=>g.id==='refresh-properties').evidence;if(r.cases!==34||r.rows?.length!==34||new Set(r.rows.map((x:any)=>[x.style,x.slot,x.variant,x.kind].join(':'))).size!==34||r.rows.some((x:any)=>!((x.kind==='normal'&&[25,26,27,28,22].includes(x.style)&&[0,1,2].includes(x.slot)&&[0,1].includes(x.variant))||(['invalid-tail','movie','mismatch','invalid-slot'].includes(x.kind)&&x.style===25&&x.variant===0&&x.slot===(x.kind==='invalid-slot'?3:0))))||r.rows.some((x:any)=>x.controls?.length!==9||x.controls.some((v:any)=>!Number.isInteger(v)||v<0||v>8))||r.rows.filter((x:any)=>x.kind==='normal'&&x.style!==22).length!==24||r.rows.filter((x:any)=>x.kind==='normal'&&x.style===22).length!==6||r.rows.filter((x:any)=>x.kind!=='normal').length!==4||r.registers_flags_preserved!==true||r.payload_sha256!==report.payloadSha256||r.limitations?.length!==2||g?.name!=='persistence_refresh_property_gate'||g.status!=='PASS'||g.finalPayloadSha256!==report.payloadSha256)return false;}
    const curve=evidence('four49_curve65_arm'),backend=evidence('V9_backend_arm'),raw=evidence('V9_raw_arm'),storage=evidence('V9_storage_guest'),icon=evidence('V9_icon_arm'),capacity=evidence('V9_1_capacity_arm'),memory=evidence('V9_1_memory_arm'),shared=evidence('V9_1_shared_pages_arm');
    const menu=evidence('V9_menu_arm'),labels=!reference?report.candidate?.slots?.map((s:any)=>s.nativeLabel):['Gold 200','Tungsten 800','Ektar 100','Metropolis'];
    if(!Array.isArray(labels)||labels.length!==4||!labels.every(validCameraName))return false;
    const utf16=(text:string)=>Array.from({length:text.length+1},(_,i)=>{const n=i<text.length?text.charCodeAt(i):0;return(n&255).toString(16).padStart(2,'0')+(n>>>8).toString(16).padStart(2,'0');}).join('');
    if(menu.main_and_adj_names!==36||menu.new_text_paths!==168||menu.main_and_adj_candidate_name_cases!==8||menu.native_label_utf16_cases!==168||menu.native_label_descriptor_cases!==168||menu.native_label_nul_cases!==168||!Array.isArray(menu.native_label_cases)||menu.native_label_cases.length!==168||new Set(menu.native_label_cases.map((c:any)=>c.lang+':'+c.id+':'+c.path)).size!==168||menu.native_label_cases.some((c:any)=>!Number.isInteger(c.lang)||c.lang<0||c.lang>20||![0,1].includes(c.path)||!Number.isInteger(c.id)||c.id<0x312||c.id>0x315||c.label!==labels[c.id-0x312]||c.utf16_hex!==utf16(labels[c.id-0x312])))return false;
    if(!Array.isArray(menu.raw_candidate_icon_cases)||menu.raw_candidate_icon_cases.length!==8||new Set(menu.raw_candidate_icon_cases.map((c:any)=>c.original+':'+c.id)).size!==8||menu.raw_candidate_icon_cases.some((c:any)=>![0,1].includes(c.original)||!Number.isInteger(c.id)||c.id<0x29f||c.id>0x2a2||c.label!==labels[c.id-0x29f]||c.row!==2+c.original+c.id-0x29f))return false;
    if(curve.actual_arm_calls!==163880||curve.rows?.length!==10||backend.setters!==972||backend.setterCases?.length!==972||backend.gammaControlCases?.length!==165||backend.pairCases?.length!==12||backend.matrixCases?.length!==432||backend.parserCases!==512||raw.gold_setter_change_cases!==972||raw.ordered_four_style_pair_cancel_cases!==24)return false;
    if(!storage.save_allocation_failure_preserves_previous_record||!storage.allocation_null_module_returns_zero||storage.record?.old_prefix_roundtrip_banks!==8||storage.record?.roundtrip_banks!==8||storage.record?.file_bytes!==1172||storage.io_heap?.live!==0||storage.malformed_cases?.length<13||storage.bank_cases?.length<13)return false;
    if(storage.record?.key!==(v92?12:11))return false;
    if(v92){const life=evidence('persistence_apdata13_probe'),g=report.gates.find((g:any)=>g.id==='persistence-lifecycle').evidence;if(life.status!=='PASS_APDATA13_FINAL_PAYLOAD'||life.memory_patches_applied!==false||life.payload_sha256!==report.payloadSha256||life.custom_control_positions!==864||!Array.isArray(life.failures)||life.failures.length!==8||new Set(life.failures).size!==8||life.failures.some((x:any)=>typeof x!=='string'||!['missing','bad-checksum','registry-header','read-failure','allocation-failure','bundle-allocation-failure','filename-allocation-failure','writer-failure-native-may-delete-previous-file'].includes(x))||life.failures.slice().sort().join(',')!==['missing','bad-checksum','registry-header','read-failure','allocation-failure','bundle-allocation-failure','filename-allocation-failure','writer-failure-native-may-delete-previous-file'].sort().join(',')||life.cases?.length!==2||life.cases.map((x:any)=>x.order).sort().join(',')!=='custom-stock,stock-custom'||life.cases.some((x:any)=>x.fresh_boot!==true||x.stock_bytes!==2||x.custom_banks!==8||x.bundle_files!==13||x.native_import!==true||x.native_cache_only!==true||x.all_values_non_neutral!==true)||g?.name!=='persistence_apdata13_probe'||g.status!=='PASS'||g.finalPayloadSha256!==report.payloadSha256)return false;}
    if(icon.assets?.length!==4||icon.old_dimension_pairs!==671||icon.old_native_renders!==14||icon.null_UserData_failure_frames!==4||icon.malformed_lz4_failure_frames!==4||icon.decoder_truncated_blocks_rejected!==icon.assets.reduce((n:number,a:any)=>n+a.compressed_bytes,0)||!icon.framebuffer_and_scratch_canaries_checked||!icon.decoder_callee_saved_r4_r10_and_sp_checked||icon.assets.some((a:any)=>a.rotations?.length!==3))return false;
    if(capacity.results?.length!==14||capacity.results.filter((x:any)=>x.version==='V9').length!==2||capacity.results.filter((x:any)=>x.version==='V9').some((x:any)=>x.failure?.pc!=='0x53394760'||JSON.stringify(x.overflow_rows)!=='[17]'))return false;
    if(capacity.candidate_rom_sha256!==report.payloadSha256||memory.frozen_rom_sha256!==report.payloadSha256||shared.candidate_payload_sha256!==report.payloadSha256)return false;
    if(memory.factory_wrapper_prefix_cases!==44*3*13*3||shared.cases?.length!==18)return false;
    if(!reference){
      const r=report.gates.find((g:any)=>g.id==='independent-final-readback').evidence,c=report.gates.find((g:any)=>g.id==='candidate-native-curves').evidence;
      const slots=report.candidate?.slots;
      if(!Array.isArray(slots)||slots.length!==4||slots.some((s:any,i:number)=>![65,257].includes(s.nodes)||!validCameraName(s.nativeLabel)||s.nativeLabel!==s.styleName||s.logical!==25+i||s.raw!==13+i||s.tone!==268+i||s.token!==['Gold200','Cine800T','Ektar100','Metropolis'][i]||!/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s.uuid)||!(/^[a-f0-9]{64}$/.test(s.iconSha256)&&/^[a-f0-9]{64}$/.test(s.recipeSha256))||s.fit&&(s.acceptedFitHash!==s.fit.fit_sha256||s.cubeSha256!==s.fit.input_cube_sha256||s.recipeSha256!==s.fit.recipe_sha256||s.nodes!==s.fit.curve_nodes||s.fit.model_sha256!==MODEL_SHA256||s.fit.wasm_sha256!==FIT_WASM_SHA256||s.fit.rust_source_sha256!==FIT_RUST_SOURCE_SHA256||s.fit.evaluator_source_sha256!==FIT_EVALUATOR_SOURCE_SHA256||s.fit.holdout?.samples!==4096||s.fit.holdout_seed!==72226||s.fit.camera_calibrated!==false||s.fit.review_required!==true||!/^[a-f0-9]{64}$/.test(s.packageSha256))))return false;
      for(const s of slots){
        if(s.fit)continue;
        if(REFERENCE_PINS[s.uuid]?.recipeSha256!==s.recipeSha256)return false;
        const iconSha256=s.iconDefinition?await sha256(renderIcon(s.iconDefinition)):REFERENCE_PINS[s.uuid]?.iconSha256;
        if(iconSha256!==s.iconSha256)return false;
      }
      const modules=report.candidate.modules;
      if(!Array.isArray(modules)||modules.length!==6||modules.map((m:any)=>m.name).sort().join(',')!=='backend,icon,menu,raw,storage,text'||modules.some((m:any)=>!Number.isInteger(m.base)||m.base%4||m.bytes<=0||m.end!==m.base+m.bytes||!/^[a-f0-9]{64}$/.test(m.sha256)||!/^[a-f0-9]{64}$/.test(m.sourceSha256)||!((m.base>=0x53000d50&&m.end<=0x53002000)||(m.base>=0x53002080&&m.end<=0x53004000)))||report.candidate.moduleBytes!==modules.reduce((n:number,m:any)=>n+m.bytes,0))return false;
      const sortedModules=[...modules].sort((a:any,b:any)=>a.base-b.base);if(sortedModules.some((m:any,i:number)=>i&&sortedModules[i-1].end>m.base)||backend.module_sha256!==modules.find((m:any)=>m.name==='backend').sha256||icon.icon_sha256!==modules.find((m:any)=>m.name==='icon').sha256)return false;
      if(JSON.stringify(report.candidate.displayOrder)!=='[4,5,0,1,2,3,6,7,8,9,10,11,12,13,14,15,16,17]'||new Set(slots.map((s:any)=>s.uuid)).size!==4)return false;
      if(icon.assets.some((a:any,i:number)=>a.pixel_sha256!==slots[i].iconSha256)||c?.rows?.some((row:any)=>!Number.isInteger(row.slot)||row.slot<0||row.slot>3||!Number.isInteger(row.channel)||row.channel<0||row.channel>2||row.nodes!==slots[row.slot].nodes||row.fullQ14Domain!==true||!/^[a-f0-9]{64}$/.test(row.tableSha256))||new Set(c?.rows?.map((row:any)=>row.slot+':'+row.channel)).size!==12)return false;
      if(r?.status!=='PASS'||!r.fullPayloadOwnership||!r.precompiledCodeCompared||!r.displayPermutationChecked||!r.factoryTablesPreserved||r.curveSamplesCompared!==slots.reduce((n:number,s:any)=>n+s.nodes*3,0)||r.matrixCoefficientsCompared!==36||r.iconPixelsCompared!==4096||!r.uuidHeaderChecked||c?.status!=='PASS_CANDIDATE_FINAL_ROM_NATIVE_CURVES'||c.rows?.length!==12||c.fullDomainInputs!==12*16385)return false;
    }
    return true;
  }catch{return false;}
}
