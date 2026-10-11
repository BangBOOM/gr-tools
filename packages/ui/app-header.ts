/** Shared tool navigation markup. Entries import theme.css and app-header.css; vite.config.ts injects it into static pages. */
type Tool = "studio" | "firmware";
const tools = [
  { id: "studio", name: "Studio", icon: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>' },
  { id: "firmware", name: "Firmware", icon: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>' },
] as const;

/** Tool navigation only; document names and editing actions live below it. */
export function appHeader(active: Tool): string {
  return `<header class="topbar app-header"><div class="header-context"><a class="brand" href="/" aria-label="GR Tools home"><span class="brand-mark">GR</span><span class="brand-name">Tools</span></a></div><nav class="tool-nav" aria-label="GR tools">${tools.map(tool => `<a href="/apps/${tool.id}/" ${tool.id === active ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${tool.icon}</svg><span>${tool.name}</span></a>`).join("")}</nav><div class="header-balance" aria-hidden="true"></div></header>`;
}

