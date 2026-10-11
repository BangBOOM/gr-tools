# Independent release gate

This Python package independently verifies a final Firmware candidate during
development. End users build in the Web/Rust Firmware app. Python is not an
end-user runtime dependency. The package uses the Python standard library only.

```sh
uv run python -m gr_firmware.release_gate \
  --base fwdc239b.bin \
  --candidate apps/firmware/test/artifacts/custom-candidate.bin \
  --report apps/firmware/test/artifacts/custom-report.json \
  --project apps/firmware/test/artifacts/exported-project.json
uv run python -m unittest gr_firmware.test_release_gate
uv run python -O -m unittest gr_firmware.test_release_gate
```

The Web/Rust app identifies the official GR III 2.10 base and supports four fixed
recipe/icon slots. Names follow the installed styles while slot numbers and menu
order remain fixed. The current default is V9.2, with a separate APData12 custom
record, a complete 13-key native bundle and Still refresh synchronization. V9.1
remains available only as a historical reference regression target.

`release_gate.py` uses explicit exceptions throughout, so Python `-O` does not
remove its decisions. It independently decodes the final container in bounded
Python code, checks header/framing/terminators/back references/footers/checksums,
compares the official source SHA, final payload SHA and original frame schedule,
and derives full-payload ownership from the pinned platform. Frozen-reference
output additionally must match the original Python BIN hash and every requested
payload byte. It invokes a fixed Node 24 verifier for the current exact report
schema, gate/suite inventories, source/toolchain/model pins, report self-hash,
counts and actual candidate SHA. Custom verification also requires the exported installation
project containing the original style packages. It independently decodes the actual
final BIN, extracts bounded native matrices/curves, and validates those recipes
against each original package/CUBE and the independently recomputed fit metrics.
It reconstructs the fixed-platform candidate, compares every precompiled code byte,
relocation, resource, full final payload, complete candidate report and plan hash.
This closes the gap left by a coarse arena ownership whitelist and an unsigned
report alone. Node execution or verification failure blocks
release. Inputs are checked again after verification to reject changes mid-run.

This gate rechecks evidence and artifacts; it does not rerun native ARM suites or
re-fit a CUBE. It explicitly reports `fresh_native_arm_run: false`. Successful evidence comes from the complete current Web/Rust build
and is tied to its candidate. A report hash is not a signature, and an unsigned acceptance hash cannot prove
that a person historically approved that approximation. The Python decoder
establishes container and payload ownership invariants; the current independently
implemented TypeScript readback inside the build establishes resource/code
invariants. Camera acceptance remains pending for every new output.

`npm run test:firmware:web` writes `exported-project.json` as development-only
evidence from the known test packages and actual browser mapping after a successful
custom build. It does not restore a Project feature to the product.

Integration tests require the user's official BIN and complete browser-generated
candidate/report (default paths above, overridable with `GR_RELEASE_BASE`,
`GR_RELEASE_CANDIDATE`, `GR_RELEASE_REPORT`, `GR_RELEASE_PROJECT`). Missing fixtures fail, never skip.
The same real-artifact and rehashed fault-injection suite runs in both Python
modes. Firmware and test outputs remain ignored and are not redistributed.
