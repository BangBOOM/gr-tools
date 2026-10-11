# Implementation plan and acceptance criteria

This is the accepted Web product plan. Implementation completion does not establish public-release or camera acceptance. Preserve versioned evidence in package tests and `artifacts/web-tests/`. See [current status](IMPLEMENTATION-STATUS.md) for achieved and pending work.

| Phase | Work and exit criteria |
| --- | --- |
| P0 Freeze baseline | Preserve existing work and historical outputs. Reproduce the minimum model and platform assets from frozen sources. Restore required inputs in a clean environment. |
| P1 Protocol | Define independent configuration, strict legacy migration, v2 style packages, icons, and host interfaces. Pass Python/TypeScript fixtures in both directions. |
| P2 Web firmware core | Decode and repack the official container unchanged. Reproduce V9.1 bytes. Pass two independent decoders and complete final-candidate ARM suites. Measure time and memory. |
| P3 Studio | Preserve author controls. Validate DNG content. Support local projects, icons, exact LUT/package export, and original-size JPEG/PNG export. Serve static files with no compute API. |
| P4 Firmware | Fit the exact CUBE. Support four recipe/icon slots, frozen tasks, complete reports, cancellation/timeouts, fault injection, and legacy project reconstruction. |
| P5 Web release | Complete Chrome acceptance and the GR III HDF camera matrix. Provide static deployment files, versions, licenses, sources, and measured records. |
| P6 mygo | **Deferred to the next phase.** Produce two independent installers with a shared shell. Validate WKWebView, WASM, files, lifecycle, and clean installation for each. Complete signing and notarization. |
| P7 Menu | Support subsets, sorting, hide/delete, and historical reference migration. Enable new platforms only after platform validation and camera acceptance. |

P2 and P3 can run in parallel after P1. PySide6 is no longer the end-user runtime target. These phases record accepted scope, not current feature availability.

P6 is deferred to the next phase. The desktop shell is not part of this repository. Keep shared code free of desktop-specific logic so that P6 can resume on the current Web build.

## Automated acceptance

Firmware must pass the canonical [download gates](../packages/firmware-core/README.md#download-gates) and [independent release verification](../gr_firmware/README.md). Do not replace complete final-candidate checks with an old PASS or reference firmware result.

- Validate strict JSON/ZIP/CUBE/icon inputs and matching base, platform, tool, and resource SHA values.
- Check Q13/Q14 encoding, row sums, curve endpoints/monotonicity, independent holdout metrics, and exact CUBE identity.
- Check original bytes, disjoint patch ranges, capacity, addresses, branches, ABI, and protected regions.
- Run final ARM backend, storage, menu, RAW, parameter-page, text, icon, and factory fallback suites.
- Cover nine RAW page types × two Original states; four styles × three slots × nine controls × nine values = 972 setters; factory interleaving, cache identity, reset, eight storage banks, save/restore/cancel, and corrupt records.
- Check Gamma/exposure for every candidate. Release CI checks `9⁴` scalar-reference combinations for the four brightness controls and ARM boundaries.
- Retain the original V9 capacity negative control. Missing checks, stale PASS, wrong hashes, extra code changes, missing assets, executor failure, cancellation, or timeout must block output.
- Verify icon pixels, RGBA/ABGR words, compressed-resource readback, budgets, rotation, transparency, bounds, and corrupt data.
- Use two independent container decoders and a complete payload whitelist. Extract actual recipes and icons from the final candidate.
- Match required report fields and coverage counts exactly. Bind evidence to candidate SHA. Use explicit JavaScript errors and equivalent Python normal/`-O` decisions.
- Run browser ARM suites serially. Release instances and Workers. Keep instruction budgets and external timeouts active.

Studio must satisfy these numeric and lifecycle criteria:

- Compare against the frozen Python author engine. Q13/Q14 must match exactly; float64 error must be ≤ `1e-10`; float32 LUT error must be ≤ `1e-7`. Do not weaken thresholds.
- Cover all starting styles, extrema/combinations, gray axes, asymmetric RGB, fixed random points, curve plateaus, zero intensity, Python/JavaScript numeric differences, and legacy configurations.
- Independently check LUT axis order and trilinear interpolation. The 8-bit display may differ by at most one code value.
- Check DNG crop, orientation, WB, exposure, invalid input, cancellation, photo switching, and release after repeated imports.
- Require decoded PNG pixels to equal the output buffer. Check JPEG dimensions and lossy error; identical encoder bytes are not required.
- Test the actual static deployment in a browser. Intercept uploads, compute APIs, and external requests.

Use the [verification matrix](WEB-DEVELOPMENT.md#verification) for commands and required inputs.

## Camera acceptance

The maintainer operates a GR III HDF. Each record must bind firmware SHA, DNG SHA, camera model/version, and settings. Do not inherit camera acceptance from reference firmware.

| Check | Required record |
| --- | --- |
| Upgrade; cold/warm boot | Camera result pending |
| Menu, ADJ, all RAW pages, both Original states | Camera result pending |
| Four styles/factory switching, rapid switching, repeated development | Camera result pending |
| Three-slot isolation; nine controls at −4/0/+4 | Camera result pending |
| Save, reboot, U modes, cancel/confirm | Camera result pending |
| Icon border, text, and rotated display | Camera result pending |
| Long use, storage, and failure recovery | Camera result pending |

Offline tests do not establish real ISP behavior, scheduling, stack capacity, storage behavior, or long-term stability. Mark each new DIY output **offline checks passed; this artifact has no camera acceptance** until its own records exist. Generate the artifact-specific checklist from its final report with `tools/make_camera_checklist.mjs`.
