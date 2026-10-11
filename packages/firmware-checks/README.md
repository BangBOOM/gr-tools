# Browser native ARM checks

The reviewed probes remain frozen in the research archive. Its development-time
exporter generates the static ESM wrappers in `generated/` with a restricted
in-memory fixture adapter. There is no eval, dynamic source loading, filesystem
access or server emulator. Missing assets, changed hashes, exceptions, missing
reports and unknown outcomes fail closed.

The final decoded candidate ROM is mapped directly for candidate execution.
Historical V7/V8/V9 baselines are reconstructed from the same user official base
and pinned manifests. In particular, the known defective V9 remains a native
capacity negative control, expected to fail at PC `0x53394760`, row 17. No complete
ROM fixture is shipped.

Each suite gets a fresh Unicorn instance, preserving original Node-process guest
isolation. Run in a dedicated Worker; cancellation terminates that Worker.

The adapter computes SHA-256 once per check run through `digestCache()`. It seeds
native WebCrypto digests of the official source, final payload, and candidate
assets. It reuses a digest of an input of at least 1 MiB only after an exact byte
comparison with a private snapshot. Every hash, including the per-suite final
payload hash that detects mutation, therefore equals SHA-256 of the current bytes.
JavaScript SHA-256 runs at about 80 MB/s in Chrome; without reuse, hashing took
about 40 s of a 62 s browser build.

Coverage includes 972 setters (`4×3×9×9`), 165 gamma/cache cases including all
sixteen joint extrema of four brightness controls, ordered style cancel paths,
432 matrices, 512 parser cases, eight-bank storage/corruption/failure behavior,
icon rotations/canaries/old dimensions, shared RAW pages and native memory bounds.
The gamma base generator uses separately instruction-interpreted original-ROM
fixtures; the shipped cache and color hooks execute as ARM. A release-only scalar
suite separately checks all `9^4` control combinations. Neither is described as
hardware ISP validation.

Candidate twelve-curve codec tests read code and tables from final ROM, exercise
all 196620 Q14 domain inputs and check blocked table truncations, invalid offsets,
index bounds, callee registers, stack and unmapped-page guards. Blocked257 full
domain compares real ARM node lookup plus integer interpolation; integrated ARM
backend cases additionally execute the actual interpolation hook.

`generated/SOURCE.json` records every original and adapted source SHA and the
explicit assertion adaptations. `vendor/SOURCE.json` retains the former npm runtime identity. The active
`vendor/source-build-2026-10-09/SOURCE.json` records the fixed source-built runtime,
compatibility patch, adapter, and reproduction materials. Its independent pin
binds current build reports; old reports without that identity are rejected.
The frozen platform's Unicorn fields identify its original reference executor,
not the active source-built executor. Unicorn's
GPL-2.0 license is retained in `vendor/LICENSE`; review distribution obligations
before publishing an application containing the emulator. See
`distribution/native/unicorn-arm/README.md` for source reproduction.
