# GR Tools

Local browser tools for creating Ricoh GR III film simulations and building camera updates from a user-supplied official firmware.

Site: <https://gr.fireloop.xyz>

## Vision

Make DIY image styles practical: create a look from a DNG, exchange it as a portable style package, and build a camera update from a user-supplied official firmware. Keep the full creative LUT separate from its native camera approximation. Add capabilities through versioned, independently verified platforms.

## Architecture

| Layer | Role | Location |
| --- | --- | --- |
| GR Studio | Develop DNG, author styles, review camera approximations, and export style packages or JPEG/PNG | `apps/studio/` |
| GR Firmware | Inspect the official base, arrange styles, verify compiled recipes, and check the final BIN | `apps/firmware/` |
| Shared core | TypeScript contracts and scheduling; Rust/WASM processing; Unicorn ARM verification | `packages/` |
| Development verification | Python style-package reference and independent final-artifact gate | `stylepack/`, `gr_firmware/` |

Studio exports `.grstyle` packages for Firmware. Both products run locally in the browser without uploads or a compute backend. Python serves development verification only.

The current firmware scope is a fixed four-slot platform for the official GR III 2.10 firmware. Each candidate requires its own camera acceptance; offline checks do not establish physical reboot behavior or camera stability.

## Run

Use Node 24 or newer:

```sh
npm ci
npm run dev
```

Open `/apps/studio/` or `/apps/firmware/` at the URL printed by Vite. `npm run build` produces the static `dist/` directory.

## Guides

- [AGENTS.md](AGENTS.md): development and writing rules.
- [Development](docs/WEB-DEVELOPMENT.md): tests, static hosting, and assets.
- [Internal architecture](docs/ARCHITECTURE.md): module boundaries and data contracts.
- [Implementation status](docs/IMPLEMENTATION-STATUS.md) and [roadmap](docs/IMPLEMENTATION-PLAN.md): status and release gates.
- [Firmware core](packages/firmware-core/README.md): platform scope and download gates.

## Sources and licenses

Studio uses [AGPL-3.0-only](LICENSE). Firmware uses the [GPL-2.0-only alternative grant](FIRMWARE-LICENSE) for its combination with Unicorn; see the [copyright notice](NOTICE). Users choose the license for their original LUTs, Style configurations, and photos. Third-party and firmware-derived material retains separate terms; see [license scope and release gates](public/LICENSING.md) and [third-party notices](public/THIRD-PARTY-NOTICES.md).

GR Tools is independent and is not endorsed by Ricoh. The project license grants no rights to Ricoh firmware. This repository contains no official or complete modified firmware; users supply the official base locally.
