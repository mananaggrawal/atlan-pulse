import type { PublicCard } from '../store/runs.ts';
import { THEME } from './theme.ts';
import { fontFaceCss } from './fonts.ts';

/**
 * The card: the only artifact that leaves the account.
 *
 * It carries a score, five sub-scores, a token count, a money estimate and an
 * engine stamp. It carries no skill names, no descriptions and no findings —
 * because the people most likely to post one publish skills for a living, and
 * the promise that makes this shareable at all is "share the score, you never
 * share the skill."
 *
 * Rendered by the same Chromium that prints the PDF. An earlier plan used
 * satori and resvg to avoid a browser dependency; once the PDF required one
 * anyway, a second rendering stack bought nothing but a second set of layout
 * bugs.
 */

const WIDTH = 1200;
const HEIGHT = 630;

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderCardHtml(card: PublicCard): string {
  const pct = Math.round((card.listingTokens / card.listingBudgetTokens) * 100);

  const bars = card.components
    .map(
      (c) => `<div class="row">
        <span class="label">${esc(c.name)}</span>
        <span class="track"><span class="fill" style="width:${Math.round((c.score / c.max) * 100)}%"></span></span>
        <span class="val">${c.score}<em>/${c.max}</em></span>
      </div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{box-sizing:border-box;margin:0}
body{width:${WIDTH}px;height:${HEIGHT}px;background:${THEME.inkDeep};color:#fff;
  font-family:Inter,-apple-system,sans-serif;display:flex;flex-direction:column;justify-content:space-between;
  padding:56px 64px;
  background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);
  background-size:60px 60px}
.top{display:flex;justify-content:space-between;align-items:baseline}
.lockup{font-family:"Funnel Display",sans-serif;font-weight:600;font-size:27px;letter-spacing:-.015em}
.lockup b{color:${THEME.cyan};font-weight:600}
.stamp{font-family:"JetBrains Mono",monospace;font-size:13px;color:#8F8FA6;letter-spacing:.04em}
.mid{display:flex;align-items:center;gap:58px}
.score{font-family:"Funnel Display",sans-serif;font-weight:600;font-size:188px;line-height:.86;letter-spacing:-.03em}
.score em{font-style:normal;font-size:46px;color:#8F8FA6}
.band{font-family:"JetBrains Mono",monospace;font-size:14px;color:${THEME.cyan};margin-top:14px;letter-spacing:.06em}
.bars{flex:1;display:flex;flex-direction:column;gap:13px}
.row{display:grid;grid-template-columns:132px 1fr 86px;align-items:center;gap:16px;font-size:16px}
.label{color:#A7A7BD;text-transform:capitalize}
.track{display:block;height:9px;background:rgba(255,255,255,.11);border-radius:5px;overflow:hidden}
.fill{display:block;height:100%;background:${THEME.cyan};border-radius:5px}
.val{display:block;text-align:right;font-family:"JetBrains Mono",monospace;font-size:15px}
.val em{font-style:normal;color:#77778E}
.bottom{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,.12);padding-top:22px}
.facts{display:flex;gap:44px}
.fact dt{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#77778E;font-weight:600}
.fact dd{font-family:"JetBrains Mono",monospace;font-size:21px;margin-top:7px}
.fact dd u{text-decoration:none;color:${THEME.cyan}}
.tag{font-size:14px;color:#8F8FA6;text-align:right;line-height:1.5}
.tag b{display:block;color:#fff;font-weight:500}
</style></head><body>
  <div class="top">
    <span class="lockup">Atlan <b>Pulse</b></span>
    <span class="stamp">skill health &middot; engine ${esc(card.engineVersion)}</span>
  </div>

  <div class="mid">
    <div>
      <div class="score">${card.total}<em>/100</em></div>
      <div class="band">band ${esc(card.band)}</div>
    </div>
    <div class="bars">${bars}</div>
  </div>

  <div class="bottom">
    <div class="facts">
      <div class="fact"><dt>Skills</dt><dd>${card.skillCount}</dd></div>
      <div class="fact"><dt>Always-on tokens</dt><dd>${card.listingTokens.toLocaleString('en-US')} <u>${pct}%</u></dd></div>
      <div class="fact"><dt>Est. monthly cost</dt><dd>$${card.monthlyUsd}</dd></div>
    </div>
    <div class="tag"><b>Share the score, never the skill.</b>No skill names leave your account.</div>
  </div>
</body></html>`;
}

export const CARD_SIZE = { width: WIDTH, height: HEIGHT };
