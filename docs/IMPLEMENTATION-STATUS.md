# Implementation status

Updated 2026-10-12. The Web products run locally in the browser. The site `https://gr.fireloop.xyz` serves the products. This repository does not deploy it yet; see [deployment status](CLOUDFLARE-DEPLOYMENT.md#deployment-status). Use the [roadmap](IMPLEMENTATION-PLAN.md) for remaining release gates and the [development guide](WEB-DEVELOPMENT.md#workspace-ui) for current UI behavior.

## Current implementation

| Component | Implemented scope | Remaining boundary |
| --- | --- | --- |
| GR Studio | Local DNG sensor development, author controls, configuration migration, automatic local styles, film-label icons with legacy compatibility, reviewed style packages, preview and full-size JPEG/PNG, the eight camera styles as Starting Styles and camera-chain GR Preview with the highlight desaturation stages (within 1.3 codes at zero controls; 1.7 codes on a highlight scene), My Styles delete | MultiAxial record selection; non-zero camera controls; highlights above raw white; additional cameras and browser acceptance |
| GR Firmware | Official 2.10 base identification, four fixed slots, exact imported CUBE fitting, style names/icons, final-candidate checks, BIN/report/device checklist downloads | Physical camera acceptance for every new candidate; expanded menu management |
| Shared core | Strict JSON/ZIP/CUBE contracts, v1/v2 packages, frozen font, author model, host/file interfaces, Rust/WASM build and fit, independent readback, Unicorn ARM execution | Public native source archives, asset rights, and combined-license review |
| Static distribution | `dist/` build, assets-only hosting configuration, cross-origin isolation, deploy dry run, smoke tests | Automatic deployment from this repository; online acceptance with real DNG and firmware inputs for each deployed revision |

Formal Web workflows require neither Python nor a compute API. English is the initial UI language; [Chinese localization](LOCALIZATION-TODO.md) is deferred. Firmware Project UI, batch style import, and the desktop shell are deferred.

## V9.2 persistence repair

The current platform fixes two independently reproduced defects. The old custom record reused factory DebugModel's APData11; factory writes could replace the 1,164-byte custom payload with two bytes. A Still refresh path also bypassed custom parameter synchronization; the real event82 receiver wrote defaults into picture properties, and detail backup/cancel could write those defaults back to the custom record.

V9.2 preserves factory APData11 and places custom data in APData12. Native allocation, bounds, caching, pack/import, and deletion support 13 files. The new refresh hook validates and synchronizes all nine custom controls before snapshot submission. Factory, Movie, invalid slot, and damaged-parameter paths retain factory behavior. Final relocated branches must target the actual candidate code.

GR Firmware defaults to V9.2. `V9.1-reference` remains a historical reproduction target. First installation initializes the new custom record; users must set controls again. The repair does not recover values already overwritten. The camera version remains 2.10. **Every new output still requires GR III HDF device acceptance.**

The current build runs 13 required ARM suites. Coverage includes the native 13-file lifecycle and final-code refresh properties. Reports must reject type confusion, missing/duplicate coverage, stale hashes, and resealed wrong code. Offline checks do not emulate flash submission, power loss, complete boot scheduling, task stack high-water marks, or long-term stability.

The maintainer reports that custom parameters remain after camera restart with the exact V9.2 reference BIN. Do not infer a restart count, all styles/slots/modes, power-interruption behavior, or long-term stability. Full camera acceptance remains incomplete. The [V9.2 experimental firmware release](https://github.com/BangBOOM/gr3-film-sim-firmware/releases/tag/v9.2-persistence-fix-experimental) is published in a separate repository.

Detailed acceptance records, measurements, and historical evidence remain in the research archive, which is not part of this repository.

## Remaining release gates

- **P5 device:** upgrade, cold/warm startup, menu/ADJ, all RAW pages, style/factory transitions, three-slot isolation, nine controls at −4/0/+4, save/restart/U modes, cancel/confirm, icons, and sustained operation. Each output remains labeled offline-verified and device-unverified.
- **P5 distribution:** original project work uses AGPL-3.0-only; user-owned LUTs remain outside the code license. Public native source archives, embedded asset rights, legal review, and deployed-site acceptance remain pending; follow the [distribution gates](../public/LICENSING.md#public-release-gate).
- **P6 desktop (deferred):** not part of this repository.
- **P7 menus:** expansion, hide/delete, ordering, and historical-reference migration require a new platform and device acceptance.

The [development release gate](../gr_firmware/README.md) independently checks the actual candidate and report against original inputs with explicit errors in normal and optimized Python. It reports `fresh_native_arm_run: false`; it does not replace native execution. Report hashes are not signatures or proof of historical human fit approval.
