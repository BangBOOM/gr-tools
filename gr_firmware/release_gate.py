"""Development release gate: explicit checks survive Python -O.

No frozen build script or historical PASS is executed or trusted. This entry
independently reads the final container in Python and invokes the current strict
Node report verifier. It is not an end-user Python dependency or camera approval.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
import stat
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OFFICIAL = 'd6a3c9c288d784080e7b283222ecdd8752adfeed6faa36dab44f73115354bfd4'
SOURCE = '53da690797f35ad6dc2c429d8ca1d0de8e333c211ed959816813982cd093b703'
REFERENCE_V92 = '0e946a4570c5a2a33430e5821d062179f2472efac727b417e66f0b3c175c3911'
PLAN_V92 = '1c76f1d3689939d7484c4f2e2c4cf193049975215175be38d64584d2581033c1'
REFERENCE = '58135687e2b990636369d80ef36475cab0ea28a5128184322f2cd94ba46352d5'
PAYLOAD_BYTES = 59_718_388
MAX_CONTAINER = 32 * 1024 * 1024
SYNC = bytes.fromhex('4c024c02a55a5aa5')

class GateFailure(ValueError):
    """A required release invariant was not established."""

def require(condition, message):
    if not condition:
        raise GateFailure(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def strict_json(data):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'duplicate JSON field')
            out[key] = value
        return out
    def reject(_):
        raise GateFailure('nonfinite JSON number')
    try:
        def finite_float(source):
            value = float(source)
            require(math.isfinite(value), 'nonfinite JSON number')
            return value
        value = json.loads(data, object_pairs_hook=pairs, parse_constant=reject, parse_float=finite_float)
        def depth(node, level=0):
            require(level <= 100, 'JSON nesting bound')
            if isinstance(node, dict):
                for item in node.values(): depth(item, level + 1)
            elif isinstance(node, list):
                for item in node: depth(item, level + 1)
        depth(value)
        return value
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise GateFailure('invalid JSON') from error

def read_bounded(path, limit):
    with Path(path).open('rb') as stream:
        info = __import__('os').fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_size <= limit, 'input type/size bound')
        data = stream.read(limit + 1)
    require(len(data) <= limit and len(data) == info.st_size, 'input changed while reading')
    return data

def checksum(data):
    require(len(data) % 4 == 0, 'unaligned checksum input')
    return sum(word[0] for word in struct.iter_unpack('<I', data)) & 0xffffffff

def decode_container(raw):
    """Independent bounded Python decoder; imports no encoder or research code."""
    require(128 <= len(raw) <= MAX_CONTAINER, 'container input bound')
    require(raw[:8] == b'RICOH\0\0\0' and raw[8:16] == b'GR III\0\0', 'unsupported camera header')
    require(raw[56:58] == bytes([2,10]) and raw[120:128] == SYNC, 'unsupported version/header sync')
    out = bytearray()
    frames = []
    position = 128
    zero = None
    while position + 2 <= len(raw):
        prefix = int.from_bytes(raw[position:position+2], 'big')
        position += 2
        if prefix == 0:
            zero = position - 2
            break
        require(len(frames) < 4096, 'frame count bound')
        end = position + (prefix & 32767)
        require(end <= len(raw), 'truncated frame')
        before = len(out)
        def take():
            nonlocal position
            require(position < end, 'truncated compressed token')
            value = raw[position]
            position += 1
            return value
        if prefix & 32768:
            require(len(out) + end - position <= PAYLOAD_BYTES, 'decoded size bound')
            out.extend(raw[position:end])
            position = end
        else:
            terminated = False
            while position < end and not terminated:
                flags = take() * 256 + take()
                for bit in range(15,-1,-1):
                    if position >= end:
                        break
                    if not flags & (1 << bit):
                        require(len(out) < PAYLOAD_BYTES, 'decoded size bound')
                        out.append(take())
                        continue
                    first, second = take(), take()
                    distance, length = (first >> 3)*256 + second, first & 7
                    if length == 7:
                        while True:
                            extra = take()
                            length += extra
                            if extra != 255:
                                break
                    if distance == 0:
                        require(position == end, 'trailing compressed data')
                        terminated = True
                        break
                    length += 3
                    require(0 < distance <= min(8191,len(out)), 'invalid back reference')
                    require(len(out) + length <= PAYLOAD_BYTES, 'decoded size bound')
                    start = len(out) - distance
                    if length <= distance:
                        out.extend(out[start:start+length])
                    else:
                        pattern = out[start:]
                        out.extend((pattern * ((length+distance-1)//distance))[:length])
            require(terminated, 'missing compressed frame terminator')
        frames.append(len(out)-before)
    require(zero is not None, 'missing stream terminator')
    aligned = (zero+5) & ~3
    require(len(out) == PAYLOAD_BYTES and len(raw) == aligned+24, 'exact payload/footer length')
    require(raw[zero+2:aligned] == bytes(aligned-zero-2) and raw[aligned:aligned+8] == SYNC, 'footer padding/sync')
    require(struct.unpack_from('<III',raw,aligned+8) == (2,zero+2-128,len(out)), 'footer lengths/type')
    require(checksum(raw) == 0 and checksum(out) == 0, 'container or payload checksum')
    return bytes(out), frames

def run_node_gate(report_path, candidate_path, base_path, project_path, report_sha, candidate_sha, project_sha):
    try:
        completed = subprocess.run(['node',str(Path(__file__).with_name('report_gate.mjs')),
            str(report_path),str(candidate_path),str(base_path),str(project_path),report_sha,candidate_sha,project_sha],
            capture_output=True,text=True,timeout=120,check=False,cwd=ROOT)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise GateFailure('strict report verifier could not execute') from error
    require(completed.returncode == 0, 'strict report verifier rejected evidence: '+completed.stderr[-1000:])
    outcome = strict_json(completed.stdout)
    require(outcome == {'valid':True,'reportFileSha256':report_sha,'candidateSha256':candidate_sha,'projectSha256':project_sha,'independentFinalReadback':True,'freshNativeArmRun':False}, 'unexpected verifier outcome')

def verify_paths(base_path, candidate_path, report_path, project_path):
    base_path,candidate_path,report_path,project_path = map(lambda p:Path(p).resolve(),(base_path,candidate_path,report_path,project_path))
    project_bytes = read_bounded(project_path,64*1024*1024)
    strict_json(project_bytes)
    report_bytes = read_bounded(report_path,8*1024*1024)
    report = strict_json(report_bytes)
    require(isinstance(report,dict) and report.get('schema') == 'gr3-web-build-report-v1' and report.get('status') == 'PASS', 'unsupported or failed build report')
    require(report.get('buildProfile') in ('V9.1-reference','V9.1-four-slot','V9.2-reference','V9.2-four-slot'), 'unknown build profile')
    require(report.get('deviceAcceptance') == 'REQUIRES_DEVICE_TEST', 'device acceptance must remain pending')
    base,candidate = read_bounded(base_path,MAX_CONTAINER),read_bounded(candidate_path,MAX_CONTAINER)
    require(len(base) == 30391780 and sha(base) == OFFICIAL == report.get('baseSha256'), 'official source binding mismatch')
    candidate_sha = sha(candidate)
    require(candidate_sha == report.get('candidateSha256') and len(candidate) == report.get('bytes'), 'candidate bytes/report binding mismatch')
    run_node_gate(report_path,candidate_path,base_path,project_path,sha(report_bytes),candidate_sha,sha(project_bytes))
    original,frames = decode_container(base)
    payload,next_frames = decode_container(candidate)
    require(sha(original) == SOURCE, 'official payload mismatch')
    require(sha(payload) == report.get('payloadSha256'), 'final payload/report binding mismatch')
    require(frames == next_frames and len(frames) == report.get('frameCount') == 2430, 'frame schedule changed')
    require(base[:128] == candidate[:128], 'official header changed')
    # Derive allowed payload ownership from the pinned platform, never from a
    # candidate's self-declared mutation list. Node verifies the current pin.
    platform_bytes = read_bounded(ROOT/'packages/firmware-core/platform/platform.json',4*1024*1024)
    require(sha(platform_bytes) == report['toolchain']['platformSha256'], 'platform binding mismatch')
    runtime_dir = ROOT/'packages/firmware-checks/vendor/source-build-2026-10-09'
    runtime_source = strict_json((runtime_dir/'SOURCE.json').read_bytes())
    require(sha((runtime_dir/'unicorn_arm.mjs').read_bytes()) == report['toolchain']['unicornRuntimeSha256'] == runtime_source['distributed_sha256'], 'executor binding mismatch')
    platform = strict_json(platform_bytes)
    version = 'V9.2' if report['buildProfile'].startswith('V9.2-') else 'V9.1'
    plan_asset = platform['assets'][platform['plans'][version]]
    if version == 'V9.2':
        require(plan_asset['sha256'] == PLAN_V92, 'V9.2 plan pin mismatch')
    plan_bytes = base64.b64decode(plan_asset['base64'],validate=True)
    require(sha(plan_bytes) == plan_asset['sha256'], 'frozen plan asset mismatch')
    plan = strict_json(plan_bytes)
    ownership = bytearray(PAYLOAD_BYTES)
    expected = bytearray(original)
    prior = 0
    for patch in plan['patches']:
        at = int(patch['va'],0)-0x53000000+0x10870
        old,new = bytes.fromhex(patch['old_hex']),bytes.fromhex(patch['new_hex'])
        require(prior <= at and 0 < len(old) == len(new) and at+len(old) <= PAYLOAD_BYTES-4, 'frozen patch span')
        require(original[at:at+len(old)] == old, 'frozen patch old bytes')
        prior = at+len(old)
        expected[at:prior] = new
        ownership[at:prior] = bytes([1])*len(old)
    if report['buildProfile'].endswith('-reference'):
        require(candidate_sha == (REFERENCE_V92 if version == 'V9.2' else REFERENCE), 'reference BIN differs from frozen Python output')
        struct.pack_into('<I',expected,PAYLOAD_BYTES-4,(-checksum(expected[:-4])) & 0xffffffff)
        require(payload == expected, 'reference full-payload whitelist mismatch')
    else:
        for a,z in ((0x53000d50,0x53002000),(0x53002080,0x53004000)):
            start,end = a-0x53000000+0x10870,z-0x53000000+0x10870
            ownership[start:end] = bytes([1])*(end-start)
        ownership[-4:] = bytes([1])*4
        require(all(owned or left == right for owned,left,right in zip(ownership,original,payload)), 'unowned full-payload code/data change')
    # Detect TOCTOU changes across the verifier subprocess and readback.
    require(sha(read_bounded(base_path,MAX_CONTAINER)) == OFFICIAL and sha(read_bounded(candidate_path,MAX_CONTAINER)) == candidate_sha and sha(read_bounded(report_path,8*1024*1024)) == sha(report_bytes) and sha(read_bounded(project_path,64*1024*1024)) == sha(project_bytes), 'release inputs changed during verification')
    return {'schema':'gr-python-release-gate/v1','status':'PASS_EXPLICIT_RELEASE_GATE',
        'build_profile':report['buildProfile'],'candidate_sha256':candidate_sha,
        'report_sha256':report['reportSha256'],'payload_sha256':sha(payload),'frames':len(frames),
        'python_independent_container_readback':True,'current_strict_node_report_gate':True,
        'independent_final_code_data_readback':True,'project_sha256':sha(project_bytes),'fresh_native_arm_run':False,
        'historical_python_PASS_trusted':False,'camera_validated':False,'device_acceptance':'REQUIRES_DEVICE_TEST'}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('base','candidate','report','project'):
        parser.add_argument('--'+name,required=True,type=Path)
    args = parser.parse_args(argv)
    try:
        result = verify_paths(args.base,args.candidate,args.report,args.project)
    except (OSError,ValueError,KeyError,TypeError,struct.error) as error:
        print(json.dumps({'status':'FAIL_NO_RELEASE','error':str(error)}))
        return 1
    print(json.dumps(result,indent=2,allow_nan=False))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
