"""The same fault matrix runs under normal Python and -O; no asserts in gate."""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from . import release_gate as gate

ROOT = gate.ROOT
BASE = Path(os.environ.get('GR_RELEASE_BASE',ROOT/'fwdc239b.bin'))
CANDIDATE = Path(os.environ.get('GR_RELEASE_CANDIDATE',ROOT/'apps/firmware/test/artifacts/custom-candidate.bin'))
REPORT = Path(os.environ.get('GR_RELEASE_REPORT',ROOT/'apps/firmware/test/artifacts/custom-report.json'))
PROJECT = Path(os.environ.get('GR_RELEASE_PROJECT',ROOT/'apps/firmware/test/artifacts/exported-project.json'))

class StructuralTests(unittest.TestCase):
    def test_duplicate_and_nonfinite_json_rejected(self):
        for source in ('{"status":1,"status":2}','{"n":NaN}','{"n":Infinity}','{"n":1e309}','{"n":-1e309}','['*102+'0'+']'*102):
            with self.subTest(source=source), self.assertRaises(gate.GateFailure):
                gate.strict_json(source)

    def test_decoder_bad_header_frame_and_reference_rejected(self):
        header=bytearray(128)
        header[:8]=b'RICOH\0\0\0';header[8:16]=b'GR III\0\0';header[56:58]=bytes([2,10]);header[120:128]=gate.SYNC
        for tail in (b'',bytes.fromhex('0010'),bytes.fromhex('000480000001'),bytes.fromhex('000480000000')):
            with self.subTest(tail=tail.hex()),self.assertRaises(gate.GateFailure):
                gate.decode_container(bytes(header)+tail)
        with self.assertRaises(gate.GateFailure):gate.decode_container(bytes(128))

class ArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing private inputs are failures, never silent skips or mock PASS.
        for path in (BASE,CANDIDATE,REPORT,PROJECT):
            if not path.is_file():raise RuntimeError('release test input missing: '+str(path))
        cls.report=json.loads(REPORT.read_bytes())

    def test_real_final_artifact_passes_python_readback_and_current_node_gate(self):
        result=gate.verify_paths(BASE,CANDIDATE,REPORT,PROJECT)
        self.assertEqual(result['status'],'PASS_EXPLICIT_RELEASE_GATE')
        self.assertEqual(result['candidate_sha256'],self.report['candidateSha256'])
        self.assertFalse(result['historical_python_PASS_trusted'])
        self.assertFalse(result['camera_validated'])

    def reseal(self,path):
        # Node's existing semantic JSON implementation avoids treating Python
        # number serialization as a substitute for JS canonical JSON.
        script="import{readFile,writeFile}from'node:fs/promises';import{sealReport}from'./packages/firmware-core/src/report.ts';const p=process.argv[1];await writeFile(p,JSON.stringify(await sealReport(JSON.parse(await readFile(p,'utf8')))));"
        subprocess.run(['node','--input-type=module','-e',script,str(path)],cwd=ROOT,check=True,capture_output=True)

    def test_rehashed_missing_failed_duplicate_and_old_evidence_rejected(self):
        def no_suite(r):r['gates']=[g for g in r['gates'] if g['id']!='native-arm']
        def no_refresh(r):r['gates']=[g for g in r['gates'] if g['id']!=('refresh-properties' if r['buildProfile'].startswith('V9.2-') else 'native-arm')]
        def duplicate(r):r['gates'][0]=copy.deepcopy(r['gates'][1])
        def failed(r):r['gates'][0]['status']='FAIL'
        def stale_hash(r):r['candidateSha256']='0'*64
        def old_pass(r):r['gates']=[{'id':'native-arm','status':'PASS','detail':'historical PASS'}]
        def wrong_native_status(r):
            suite=next(g for g in r['gates'] if g['id']=='native-arm')['evidence'][0]
            next(iter(suite['reports'].values()))['status']='PASS_OLD_PREFIX'
        def stale_fit(r):r['candidate']['slots'][0]['fit']['evaluator_source_sha256']='0'*64
        def extra_candidate_field(r):r['candidate']['reportSha256']='0'*64
        def missing_executor(r):del r['toolchain']['unicornRuntimeSha256']
        def wrong_executor(r):r['toolchain']['unicornRuntimeSha256']='0'*64
        def missing_origin(r):r['candidate']['slots'][0].pop('fitOrigin',None)
        def false_refit(r):r['candidate']['slots'][0]['fitOrigin']='explicit-refit'
        faults=[no_suite,no_refresh,duplicate,failed,stale_hash,old_pass,wrong_native_status,stale_fit,extra_candidate_field,missing_executor,wrong_executor]
        if self.report['candidate']['slots'][0].get('fitOrigin')=='compiled-style':
            faults.extend((missing_origin,false_refit))
        icon_slot=next((i for i,s in enumerate(self.report['candidate']['slots']) if 'iconDefinition' in s),None)
        if icon_slot is not None:
            def missing_icon_definition(r):del r['candidate']['slots'][icon_slot]['iconDefinition']
            def changed_icon_definition(r):r['candidate']['slots'][icon_slot]['iconDefinition']['top_text']='WRNG'
            faults.extend((missing_icon_definition,changed_icon_definition))
        for mutate in faults:
            with self.subTest(fault=mutate.__name__),tempfile.TemporaryDirectory() as tmp:
                report=copy.deepcopy(self.report);mutate(report)
                path=Path(tmp)/'report.json';path.write_text(json.dumps(report));self.reseal(path)
                with self.assertRaises(gate.GateFailure):gate.verify_paths(BASE,CANDIDATE,path,PROJECT)

    def test_repacked_resealed_arena_code_with_all_public_hashes_replaced_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            completed = subprocess.run(['node',str(ROOT/'gr_firmware/test_forge.mjs'),str(BASE),str(CANDIDATE),str(REPORT),tmp],cwd=ROOT,check=True,capture_output=True,text=True,timeout=120)
            self.assertTrue(json.loads(completed.stdout)['reportIntegrityAccepted'])
            with self.assertRaisesRegex(gate.GateFailure,'menu code byte changed'):
                gate.verify_paths(BASE,Path(tmp)/'bad-opcode.bin',Path(tmp)/'forged-report.json',PROJECT)

    def test_wrong_project_pins_and_slot_binding_rejected(self):
        original=json.loads(PROJECT.read_bytes())
        def bad_pin(p):p['platform']['sha256']='0'*64
        def bad_slot(p):p['slots'][0]='reference:gold'
        faults=[bad_pin,bad_slot]
        if original['schema']=='gr-firmware-project/v2':
            def bad_icon(p):next(s for s in p['styles'] if 'reference' in s and 'reference:'+s['reference'] in p['slots'])['icon']['top_text']='WRNG'
            faults.append(bad_icon)
        for mutate in faults:
            with self.subTest(fault=mutate.__name__),tempfile.TemporaryDirectory() as tmp:
                project=copy.deepcopy(original);mutate(project)
                path=Path(tmp)/'project.json';path.write_text(json.dumps(project))
                with self.assertRaises(gate.GateFailure):gate.verify_paths(BASE,CANDIDATE,REPORT,path)

    def test_changed_candidate_source_and_executor_failure_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad=Path(tmp)/'bad.bin';data=bytearray(CANDIDATE.read_bytes());data[1000]^=1;bad.write_bytes(data)
            with self.assertRaises(gate.GateFailure):gate.verify_paths(BASE,bad,REPORT,PROJECT)
            bad.write_bytes(bytes(256))
            with self.assertRaises(gate.GateFailure):gate.verify_paths(bad,CANDIDATE,REPORT,PROJECT)
        with patch.object(gate.subprocess,'run',side_effect=OSError('deliberate unavailable verifier')):
            with self.assertRaises(gate.GateFailure):gate.verify_paths(BASE,CANDIDATE,REPORT,PROJECT)
        with patch.object(gate.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'{"valid":true}','')):
            with self.assertRaises(gate.GateFailure):gate.verify_paths(BASE,CANDIDATE,REPORT,PROJECT)

if __name__ == '__main__':unittest.main()
