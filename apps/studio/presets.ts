/** Starting Style presentation copy and card markup: the eight camera styles. The hashed color model in packages/color-engine owns preset values. */
export const presetCopy: Record<string, { name: string; caption: string; monogram: string }> = {
  original: { name: 'Standard', caption: 'Camera default', monogram: 'Std' },
  vivid: { name: 'Vivid', caption: 'Camera built-in', monogram: 'Vivid' },
  nega: { name: 'Negative Film', caption: 'Camera built-in', monogram: 'Nega' },
  posi: { name: 'Positive Film', caption: 'Camera built-in', monogram: 'Posi' },
  gold: { name: 'Gold 200', caption: 'Installed slot', monogram: 'Gold' },
  tungsten: { name: 'Tungsten 800', caption: 'Installed slot', monogram: '800T' },
  ektar: { name: 'Ektar 100', caption: 'Installed slot', monogram: 'Ektar' },
  metro: { name: 'Metropolis', caption: 'Installed slot', monogram: 'Metro' },
};

/** Cards in pages of four. vite.config.ts renders this into #preset-list; the editor binds the result. */
export function presetCardsHTML(): string {
  const cards = Object.entries(presetCopy).map(([id, p]) => `<button class="preset-card${id === 'original' ? ' active' : ''}" data-id="${id}"><div class="preset-image"><span class="preset-placeholder">${p.monogram}</span><canvas width="160" height="104" hidden></canvas></div><strong>${p.name}</strong><small>${p.caption}</small></button>`);
  const pages = [];
  for (let index = 0; index < cards.length; index += 4) pages.push(`<div class="starting-page" role="group" aria-label="Starting styles ${index + 1}–${Math.min(index + 4, cards.length)}">${cards.slice(index, index + 4).join('')}</div>`);
  return pages.join('');
}
