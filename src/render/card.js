// The share card: aggregate numbers only.
//
// This file must never emit a skill name, a description, a file path or any
// other content from the user's machine. That is the whole reason the card is
// separate from the report — the report is private, the card is postable, and
// the boundary is enforced here by only ever being handed `shareableStats`.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** The three-or-four numbers the card leads with. */
export function cardStats(stats) {
  const out = [{ value: String(stats.skills), label: 'skills installed' }];

  if (stats.neverInvoked !== null && stats.neverInvoked !== undefined) {
    out.push({ value: String(stats.neverInvoked), label: `never invoked in ${stats.windowDays} days` });
  }
  if (stats.topShare !== null && stats.topShare !== undefined) {
    out.push({ value: `${stats.topShare}%`, label: 'of all runs are just 3 skills' });
  }
  if (stats.neverInvokedShareOfContext) {
    out.push({ value: `${stats.neverInvokedShareOfContext}%`, label: 'of context spent on dead skills' });
  } else {
    out.push({ value: `${stats.pctOfBudget}%`, label: 'of the skill-listing budget used' });
  }
  return out.slice(0, 4);
}

/**
 * A standalone 1200x630 SVG. Uses a system font stack on purpose: this file is
 * meant to survive being opened anywhere, including tools that will not fetch
 * a webfont.
 */
export function renderCardSVG(stats) {
  const items = cardStats(stats);
  const cols = items.length <= 2 ? items.length : 2;
  const colW = 1000 / cols;

  const cells = items
    .map((item, i) => {
      const x = 100 + (i % cols) * colW;
      const y = 322 + Math.floor(i / cols) * 140;
      return `
    <text x="${x}" y="${y}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="72" font-weight="700" fill="#FFFFFF">${esc(item.value)}</text>
    <text x="${x}" y="${y + 34}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="21" fill="#9A9AB4">${esc(item.label)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Skill health summary">
  <defs>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0 L0 0 0 64" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="2"/>
    </pattern>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2026D2"/>
      <stop offset="100%" stop-color="#62E1FC"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#141517"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect x="100" y="96" width="120" height="4" fill="url(#rule)"/>
  <text x="100" y="152" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="19" font-weight="600" letter-spacing="3" fill="#62E1FC">ATLAN PULSE — SKILL HEALTH</text>
  <text x="100" y="232" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#FFFFFF">Most of my agent skills are dead weight.</text>
  ${cells}
  <text x="100" y="566" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26" fill="#FFFFFF">npx atlan-pulse</text>
  <text x="1100" y="566" text-anchor="end" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="18" fill="#77778E">aggregate numbers only — no skill names left this machine</text>
</svg>`;
}
