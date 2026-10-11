// Generated from re/tools/V9_1_memory_arm.cjs SHA256 12d348d9323158a26981da4f0dd92007fd98a771ecc19a57a98b30e1762a46dd
export default function(require, Buffer, process, console, __dirname, module, exports) {
// Actual repaired candidate; independent native vector append and ABI regression.
// Independent frozen-ROM memory audit. No builder imports, no output firmware.
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const R = path.resolve(__dirname, '..');
const M = require(R + '/analysis/AV-independent-arm/package/dist/unicorn_arm.js');
const rom = fs.readFileSync(R + '/build/V9-1-integrated/unpackedFW.before-checksum.bin');
const stock = fs.readFileSync(R + '/extract/unpackedFW');
const planBytes = fs.readFileSync(R + '/build/V9-1-integrated/plan.json');
const rawManifest = JSON.parse(fs.readFileSync(R + '/build/V9-raw/manifest.json'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const off = a => a - 0x53000000 + 0x10870;
assert.equal(sha(rom), (process.expectedPayloadSha256 || '4332e9babb26aea76cebd3a28a9dd46572f152d83de1f33ef42bf1b0b4aebd84'));

return M().then(u => {
  let e, lastPC = 0, minSP = 0, reads = [], recordReads = false, allocations = [], freed = [];
  const RET = 0x56000000, RAW = 0x56001000, CTRL = 0x56002000;
  const VIEW = 0x56003000, VECTOR = VIEW + 0xf0, ALLOC = 0x56004000, VTABLE = 0x56004100;
  const ARG = 0x56005000, NODE = 0x56010000, SP = 0x567ff000;
  let heap = 0x56100000;
  const reg = (n, v) => e.reg_write_i32(u['ARM_REG_' + n], v);
  const val = n => e.reg_read_i32(u['ARM_REG_' + n]) >>> 0;
  const rd = (a, n) => Buffer.from(e.mem_read(a, n));
  const wr = (a, v, n = 4) => { const b = Buffer.alloc(n); if (n === 1) b[0] = v; else b.writeUInt32LE(v >>> 0); e.mem_write(a, b); };
  const ret = v => { if (v !== undefined) reg('R0', v); reg('PC', val('LR')); };
  function setup(patched = false) {
    e = new u.Unicorn(u.ARCH_ARM, u.MODE_ARM);
    for (const [a, n] of [[0x53000000, 0x1400000], [0x55000000, 0x400000], [0x56000000, 0x800000]]) e.mem_map(a, n, u.PROT_ALL);
    e.mem_write(0x53000000, rom.subarray(off(0x53000000), off(0x54400000)));
    e.mem_write(0x55000000, rom.subarray(off(0x5407b540), off(0x5407b540) + 0x3a080));
    if (patched) wr(0x532833bc, 0xe3a00013); // In-memory diagnostic: capacity getter 15 -> 19.
    e.hook_add(u.HOOK_CODE, (_e, a) => { lastPC = Number(a); minSP = Math.min(minSP, val('SP')); });
    e.hook_add(u.HOOK_MEM_READ, (_e, _t, a, n) => { if (recordReads) reads.push({ pc: lastPC, address: Number(a), bytes: n }); });
    e.hook_add(u.HOOK_CODE, () => ret(0x56006000), {}, 0x5320ad88, 0x5320ad88);
    e.hook_add(u.HOOK_CODE, () => ret(RAW), {}, 0x5320b37c, 0x5320b37c);
    e.hook_add(u.HOOK_CODE, () => ret(0x04000025), {}, 0x5316d8d4, 0x5316d8d4);
    e.hook_add(u.HOOK_CODE, () => { throw Error('native stack guard failed'); }, {}, 0x53820074, 0x53820074);
    // Real vector growth, copy, size/capacity updates execute. Only raw heap is replaced.
    e.hook_add(u.HOOK_CODE, () => {
      const size = val('R0'), a = heap; heap += (size + 31) & ~15;
      allocations.push({ pointer: a, bytes: size }); e.mem_write(a, Buffer.alloc(size, 0xaa)); ret(a);
    }, {}, 0x536af31c, 0x536af31c);
    e.hook_add(u.HOOK_CODE, () => { freed.push(val('R0')); ret(); }, {}, 0x536af358, 0x536af358);
    wr(ALLOC, VTABLE); wr(VTABLE + 8, 0x536b6dac); wr(VTABLE + 12, 0x536b6dcc);
    wr(VECTOR + 4, 0); wr(VECTOR + 8, 0); wr(VECTOR + 12, 0); wr(VECTOR + 16, ALLOC);
    allocations = []; freed = []; heap = 0x56100000;
  }
  function prepare(a = 0, b = 0, c = 0, d = 0, flags = 0xa80a0010) {
    for (let i = 0; i < 13; i++) reg('R' + i, 0x11110000 + i);
    reg('CPSR', flags); reg('R0', a); reg('R1', b); reg('R2', c); reg('R3', d); reg('SP', SP); reg('LR', RET); minSP = SP;
  }
  function call(pc, a = 0, b = 0, c = 0, d = 0) {
    prepare(a, b, c, d); e.emu_start(pc, RET, 0, 100000); assert.equal(val('PC'), RET); assert.equal(val('SP'), SP); return val('R0');
  }
  const capacityCases = [];
  for (const patched of [false]) {
    setup(patched);
    const count = call(0x53189b38, CTRL); assert.equal(count,19);
    for (let flag = 0; flag < 2; flag++) {
      wr(RAW + 5, flag, 1);
      const live = call(0x53189ca0, CTRL);
      capacityCases.push({ patched, original_available: flag, constructed_rows: count, live_rows: live, fits: live <= count });
    }
    for (let i = 0; i < count; i++) {
      wr(NODE + i * 16, 0x60000000 + i); wr(ARG, NODE + i * 16);
      assert.equal(call(0x536b6f5c, VECTOR, ARG), 1);
    }
    const begin = rd(VECTOR + 4, 4).readUInt32LE(), end = rd(VECTOR + 8, 4).readUInt32LE(), cap = rd(VECTOR + 12, 4).readUInt32LE();
    assert.equal((end - begin) / 4, count); assert.equal((cap - begin) / 4, 32);
    assert.equal(call(0x53394758, VIEW, count - 1), 0x60000000 + count - 1);
    const rowReads = [];
    for (let row = 17; row < 19; row++) {
      reads = []; recordReads = true; let error = null, result = null;
      prepare(VIEW, row);
      try { e.emu_start(0x53394758, RET, 0, 20); result = val('R0'); } catch (err) { error = String(err); }
      recordReads = false;
      rowReads.push({ row, logical_oob: row >= count, physically_in_allocated_vector: begin + row * 4 < cap,
        entry_word: rd(begin + row * 4, 4).readUInt32LE(), result, error, last_pc: lastPC, reads });
      if (count === 19) { assert.equal(result, 0x60000000 + row); assert.equal(error, null); }
      else { assert(error, 'unused capacity poison must fail node dereference'); assert.equal(lastPC, 0x53394760); }
    }
    capacityCases.push({ patched, vector_size: (end - begin) / 4, vector_capacity: (cap - begin) / 4,
      allocation_byte_sizes: allocations.map(x => x.bytes), freed_buffers: freed.length, rowReads });
    e.close();
  }
  // Every factory dispatch wrapper must reach its original second instruction
  // with exactly the original first instruction's register/flag result.
  setup(); let factoryCases = 0, maxAddedStack = 0;
  for (const m of rawManifest.methods) {
    const a = Number(m.va), originalWord = stock.subarray(off(a), off(a) + 4);
    const direct = 0x56070000; e.mem_write(direct, originalWord);
    for (let slot = 0; slot < 3; slot++) for (let inner = 0; inner < 13; inner++) for (const flags of [0x10, 0xa80a0010, 0xe80a0010]) {
      wr(RAW + 0x82, slot, 1); for (let s = 0; s < 3; s++) wr(RAW + 0x83 + s, inner, 1);
      prepare(RAW, 7, 8, 9, flags); e.emu_start(direct, direct + 4, 0, 5);
      const expected = { r: Array.from({ length: 13 }, (_, i) => val('R' + i)), sp: val('SP'), lr: val('LR'), cpsr: val('CPSR') };
      prepare(RAW, 7, 8, 9, flags); e.emu_start(a, a + 4, 0, 1000);
      assert.equal(val('PC'), a + 4);
      const actual = { r: Array.from({ length: 13 }, (_, i) => val('R' + i)), sp: val('SP'), lr: val('LR'), cpsr: val('CPSR') };
      assert.deepEqual(actual, expected, 'factory ABI prefix ' + m.va);
      maxAddedStack = Math.max(maxAddedStack, SP - minSP); factoryCases++;
    }
  }
  e.close();
  const output = { status: 'PASS_ACTUAL_V9_1_NATIVE_MEMORY_REGRESSION', frozen_rom_sha256: sha(rom), plan_sha256: sha(planBytes),
    capacityCases, factory_wrapper_prefix_cases: factoryCases, factory_wrapper_max_extra_stack_bytes: maxAddedStack,
    diagnosed_defect: 'Repaired plan constructs19 primary RAW items; all live18/19 rows fit and boundary items17/18 are valid with real vector growth.',
    diagnostic_memory_patch: { va: '0x532833bc', original_word: 'e3a0000f', replacement_word: 'e3a00013', scope: 'Candidate contains this instruction; no diagnostic write used in actual-plan checks' },
    limitations: ['Heap primitives and manager acquisition are shims; real vector append/getter and capacity/count native instructions execute.',
      'Poisoned unused vector capacity illustrates a valid failure state; actual heap residue on camera unknown.',
      'Does not emulate framebuffer, asynchronous preview, or camera task stack; this is not whole-camera validation.',
      'Factory wrapper check stops after original first instruction; later native call-chain behavior remains untested here.'] };
  fs.mkdirSync(R + '/analysis/V9-1-memory-review', { recursive: true });
  fs.writeFileSync(R + '/analysis/V9-1-memory-review/checks.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ status: output.status, factory_cases: factoryCases, factory_stack: maxAddedStack, capacity_cases: capacityCases.length }));
}).catch(err => { console.error(err); process.exit(1); });

}
