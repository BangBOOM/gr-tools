/**
 * Smoke-test the static Web products without RAW or firmware inputs.
 * Without GR_SMOKE_URL it serves ./dist with production headers; with it, it checks that origin
 * and requires its Studio and Firmware pages to reference the same assets as ./dist.
 * It does not replace npm run test:web or test:firmware:web.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const dist = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
let base = process.env.GR_SMOKE_URL?.replace(/\/$/, ''), server;
if (!base) {
  server = createServer(async (req, res) => {
    try {
      let file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(dist + path.sep) && file !== dist) return res.writeHead(403).end();
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
const assets = html => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]).sort();
const results = { origin: base };

// A remote origin must serve this build. Cloudflare can take a short time to switch versions.
if (process.env.GR_SMOKE_URL) {
  for (const page of ['/apps/studio/', '/apps/firmware/']) {
    const expected = assets(await readFile(path.join(dist, page, 'index.html'), 'utf8'));
    let served = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      served = assets(await (await fetch(base + page, { cache: 'no-store' })).text());
      if (JSON.stringify(served) === JSON.stringify(expected)) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    assert.deepEqual(served, expected, `${page} serves this build's assets`);
  }
  results.sameBuild = true;
}
for (const page of ['/', '/apps/studio/', '/apps/firmware/', '/legal.html']) {
  const response = await fetch(base + page, { cache: 'no-store' });
  assert.equal(response.status, 200, page);
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin', `${page} COOP`);
  assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp', `${page} COEP`);
}
const wasm = (await readdir(path.join(dist, 'assets'))).find(name => name.endsWith('.wasm'));
assert.equal((await fetch(`${base}/assets/${wasm}`)).headers.get('content-type'), 'application/wasm', 'WASM MIME type');
results.headers = true;

const browser = await chromium.launch({ headless: true, channel: process.env.GR_BROWSER_CHANNEL ?? 'chrome' });
try {
  // The static HTML is the first paint: check it with JavaScript disabled.
  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base + '/apps/studio/');
  results.firstPaint = await staticPage.evaluate(() => ({
    header: !!document.querySelector('.app-header .tool-nav [aria-current="page"]'),
    stylesInStartPane: !!document.querySelector('#pane-style .looks-section'),
    cards: document.querySelectorAll('#preset-list .preset-card').length,
  }));
  assert.deepEqual(results.firstPaint, { header: true, stylesInStartPane: true, cards: 8 }, 'Studio first paint is the final layout');
  await staticContext.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [], external = [];
  context.on('weberror', error => errors.push(error.error().message));
  context.on('request', request => { if (new URL(request.url()).origin !== base) external.push(request.url()); });
  const page = await context.newPage();
  await page.goto(base + '/apps/studio/');
  await page.waitForFunction(() => !!window.studio?.bootstrap && !window.studio.renderDirty, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'Studio is cross-origin isolated');
  await page.locator('#tab-light').click();
  assert.equal(await page.locator('#pane-light').isVisible(), true, 'Studio controls respond');
  await page.goto(base + '/apps/firmware/');
  await page.locator('[data-slot-index="3"] canvas').waitFor({ timeout: 60000 });
  assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'Firmware is cross-origin isolated');
  assert.equal(await page.locator('[data-slot-index] canvas').count(), 4, 'Firmware renders four slots');
  assert.deepEqual(errors, [], 'no page errors');
  assert.deepEqual(external, [], 'no external requests');
  results.studio = results.firmware = true;
} finally {
  await browser.close();
  server?.close();
}
console.log(JSON.stringify({ ...results, status: 'PASS' }, null, 2));
