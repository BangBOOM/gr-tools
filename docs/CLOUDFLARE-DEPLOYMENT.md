# Cloudflare deployment

## Target

`wrangler.jsonc` owns the account, Worker name `gr-tools`, and custom domain `gr.fireloop.xyz`. Workers Static Assets serves the complete `dist/` directory. There is no compute handler, upload endpoint, or remote RAW/firmware processor. The configuration disables `workers.dev` and version preview URLs.

The owner authorizes public deployment at `https://gr.fireloop.xyz`. The hostname has no authentication. This decision does not complete asset rights review, qualified IP review, or public native source delivery; keep these items pending under the [distribution gates](../public/LICENSING.md#public-release-gate). The deployment decision does not relax final-candidate Firmware gates or substitute for camera acceptance. Do not change unrelated Workers or zone records.

## Deployment status

This repository has no deployment job yet. `.github/workflows/web.yml` runs the static checks only: `npm run check`, `npm run test:unit`, the fit and preflight tests, `npm run build`, `npm run deploy:check`, and `npm run test:smoke`. Automatic deployment from this repository is deferred.

`tools/smoke_web.mjs` checks COOP, COEP, and the WASM MIME type; the Studio first paint with JavaScript disabled; Studio and Firmware startup with `crossOriginIsolated`; and the absence of page errors and external requests. It uses no DNG or firmware base. It does not replace `npm run test:web`, `npm run test:firmware:web`, or the public acceptance below.

## Prepare and verify locally

Use the locked Node dependencies and a clean checkout:

```sh
npm ci
npm run check
npm run test:unit
npm run build
npm run deploy:check
npx --no-install wrangler dev --local --ip 127.0.0.1 --port 8799
```

In a second terminal, run the production tests sequentially with a real DNG and the official base:

```sh
GR_FIRMWARE_TEST_URL=http://127.0.0.1:8799 npm run test:firmware:web
GR_STUDIO_TEST_URL=http://127.0.0.1:8799 npm run test:web
uv run python -m unittest gr_firmware.test_release_gate
uv run python -O -m unittest gr_firmware.test_release_gate
```

These commands use the real Wrangler asset server. Studio requires a real DNG; `GR_DNG_PATH` selects it. Firmware requires the official local base. Never copy those inputs into `public/` or `dist/`. A dry run validates configuration and bundling; it does not provision DNS, TLS, or validate the public origin.

## Prepare public source and rights evidence

1. Review the exact files to be conveyed, including JS/WASM, platform/probe data, and reference model data. Bind the rights decision to their identities. Remove or replace unsupported material without weakening final-candidate checks.
2. Package the matching project source revision and required build/install scripts. Do not publish the research archive without a separate rights decision.
3. Include the source archives identified in `distribution/native/unicorn-arm/SHA256SUMS` and `distribution/native/libraw-threaded/SOURCE-ARCHIVES.sha256`, plus the actual dependency materials and notices. Verify every archive and the source-to-runtime build records. Each asset must fit the 25 MiB Static Assets limit; split by component, not by omitting required source.
4. Publish the approved corresponding-source package with the application. Add accessible matching source links to `public/legal.html`. Preserve AGPL Studio, the Firmware GPL-2.0 grant, and third-party/reference terms.
5. Record qualified review of the actual release contents and Ricoh agreement. Keep camera acceptance separate from legal and source evidence.

Native source archives currently reside in ignored local release staging. They are not copied to `dist/` automatically. Source availability is still pending until the approved matching packages and application are publicly accessible.

## Formal public release

Save the approved Git commit, `dist/` file hashes, native source manifests, and release decisions. Run `npm run build` and `npm run deploy:check` again for that revision. Use the locked Wrangler version:

```sh
npx --no-install wrangler whoami
npx --no-install wrangler deploy --strict --message "GR Tools approved public release"
```

The custom-domain route provisions the hostname and certificate through Cloudflare. Do not add a competing manual CNAME. Store the actual deployment/version ID and domain status as release evidence. Wait for HTTPS before acceptance.

## Public acceptance and rollback

Check `/`, `/apps/studio/`, `/apps/firmware/`, `/legal.html`, notices, and every source download through `https://gr.fireloop.xyz`. Require a successful status and the expected content; an HTML fallback is not a valid WASM response. Verify document COOP `same-origin`, COEP `require-corp`, and WASM `application/wasm` responses.

Run both production tests sequentially with `GR_STUDIO_TEST_URL=https://gr.fireloop.xyz` and `GR_FIRMWARE_TEST_URL=https://gr.fireloop.xyz`. The browser tests permit same-origin GET requests only and reject uploads or compute APIs. Verify `crossOriginIsolated`, RAW decode/export/cancel, all final Firmware gates, and Worker release on the public origin. Local PASS is not this acceptance.

Record the source revision, artifact/source hashes, deployment ID, hostname status, test results, and checks not run. Do not report online acceptance as passed before these checks pass. For updates, retain the previous approved source and static build. Redeploy that exact build to roll back; do not assume a Worker script rollback restores its asset set. The first deployment has no prior application version to restore.

Wrangler 4.148.0 can leave its CLI process running after it prints completion. In observed runs, the dry run and actual deployment both require process cleanup. Set `WRANGLER_SEND_METRICS=false` for unattended execution. If the CLI still remains open, first confirm the deployment ID, active version, and HTTPS content through independent reads. Terminate only the completed CLI process; do not retry an already successful deployment solely because the process does not exit.
