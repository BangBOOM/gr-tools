import { defineConfig } from 'vite';
import { appHeader } from './packages/ui/app-header.ts';
import { presetCardsHTML } from './apps/studio/presets.ts';
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
// Fill shared markup into static pages so the first paint already has the final layout.
const staticMarkup = { name: 'gr-static-markup', transformIndexHtml: (html: string) => html
  .replace(/<header class="topbar app-header" data-tool="(studio|firmware)"><\/header>/, (_, tool) => appHeader(tool))
  .replace('<!-- vite.config.ts renders apps/studio/presets.ts cards here. -->', presetCardsHTML) };
export default defineConfig({
  plugins: [staticMarkup],
  server: { headers }, preview: { headers },
  worker: { format: 'es' },
  build: { target: 'es2022', rollupOptions: { input: {
    home: 'index.html', studio: 'apps/studio/index.html', firmware: 'apps/firmware/index.html',
  } } },
});
