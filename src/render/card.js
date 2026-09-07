// The share card.
//
// The report is the thing you send to one person. This is the thing you post.
// It carries three numbers and no skill names: what you have, what you use,
// and what the dead weight is costing you. That distinction is deliberate —
// people who will not share a skill library will happily share a score, and a
// score gives away nothing a competitor could use.
//
// Output is a single HTML file that draws the card on a canvas and hands you a
// real PNG with one click. Canvas rather than a static image because this
// package has no dependencies and will not grow a headless browser to
// rasterise text. Everything happens in your browser, on your machine.

import { resolveLogo } from '../lib/logo.js';

const n = (v) => Number(v ?? 0).toLocaleString();

/**
 * What the card is allowed to say.
 *
 * Gated on hasInvocationData exactly like every other surface: with no
 * transcripts we cannot know what ran, so the card leads on context cost
 * instead of inventing a usage number.
 */
export function cardModel(report, rolled) {
  const t = report.totals;
  const stats = [];
  let lead;
  let turn;
  let post;

  if (report.hasInvocationData && t.neverInvoked > 0) {
    lead = `${t.skills} skills installed.`;
    turn = `${t.neverInvoked} of them have never run.`;
    post =
      `Ran a skill audit on my own setup. ${t.skills} skills installed, ` +
      `${t.neverInvoked} of them have never run once` +
      (t.neverInvokedShareOfContext
        ? ` — that's ${t.neverInvokedShareOfContext}% of what my skill listing costs on every request.`
        : '.') +
      `\n\nnpx atlan-pulse`;
  } else if (report.hasInvocationData) {
    lead = `${t.skills} skills installed.`;
    turn = `${n(t.totalInvocations)} invocations in ${report.options.windowDays} days.`;
    post =
      `Ran a skill audit on my own setup. ${t.skills} skills, ` +
      `${n(t.totalInvocations)} invocations in ${report.options.windowDays} days` +
      (t.topShare !== null ? `, and three of them account for ${t.topShare}% of it.` : '.') +
      `\n\nnpx atlan-pulse`;
  } else {
    lead = `${t.skills} skills installed.`;
    turn = `${n(t.estTokens)} tokens on every request.`;
    post =
      `Ran a skill audit on my own setup. ${t.skills} skills, costing an estimated ` +
      `${n(t.estTokens)} tokens on every single request before I type anything.` +
      `\n\nnpx atlan-pulse`;
  }

  stats.push({ label: 'Skills', value: n(t.skills) });

  if (report.hasInvocationData) {
    stats.push({ label: `Invocations · ${report.options.windowDays}d`, value: n(t.totalInvocations) });
    if (t.neverInvoked !== null) stats.push({ label: 'Never run', value: n(t.neverInvoked), tone: 'pink' });
    if (t.topShare !== null) stats.push({ label: 'Top 3 share', value: `${t.topShare}%`, tone: 'cyan' });
  } else {
    stats.push({ label: 'Est. tokens / request', value: n(t.estTokens) });
    stats.push({ label: 'Of listing budget', value: `${t.pctOfBudget}%`, tone: 'pink' });
    if (t.ownerless) stats.push({ label: 'No owner', value: n(t.ownerless) });
  }

  // The line under the stats. One sentence, and only one it can prove.
  let caption;
  if (report.hasInvocationData && t.neverInvokedShareOfContext) {
    caption = `${t.neverInvokedShareOfContext}% of my skill listing is skills I have never invoked.`;
  } else if (t.duplicatePairs) {
    caption = `${t.duplicatePairs} pair${t.duplicatePairs === 1 ? '' : 's'} of my skills describe the same job.`;
  } else {
    caption = `Estimated ${n(t.estTokens)} tokens spent describing skills, on every request.`;
  }

  return { lead, turn, stats: stats.slice(0, 4), caption, post };
}

/**
 * Replace `fill="url(#id)"` with the solid colour that pattern paints.
 *
 * Logos exported from design tools often wrap a flat colour in a <pattern>
 * with a patternTransform. That renders fine in a document, but an SVG drawn
 * onto a canvas from a data URI resolves those tiles against a different
 * origin and frequently paints nothing at all. Since these patterns are a
 * single solid rectangle, collapsing them to their colour is lossless here.
 */
function flattenPatternFills(svg) {
  const colours = new Map();
  for (const block of svg.matchAll(/<pattern\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/pattern>/gi)) {
    const [, id, body] = block;
    const fills = [...body.matchAll(/fill="(#[0-9a-f]{3,8})"/gi)].map((m) => m[1]);
    if (fills.length) colours.set(id, fills[fills.length - 1]);
  }
  if (!colours.size) return svg;

  let out = svg.replace(/<pattern\b[\s\S]*?<\/pattern>/gi, '');
  for (const [id, colour] of colours) {
    out = out.replace(new RegExp(`url\\(#${id}\\)`, 'g'), colour);
  }
  return out;
}

/** Give the logo SVG an intrinsic size so the browser can draw it to a canvas. */
function sizedLogo(explicitPath) {
  const { html, isCustom } = resolveLogo(explicitPath);
  const viewBox = /viewBox="([\d.\s-]+)"/i.exec(html);
  let w = 26;
  let h = 26;
  if (viewBox) {
    const parts = viewBox[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) { w = parts[2]; h = parts[3]; }
  }
  const svg = flattenPatternFills(html)
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace(/^<svg\b/i, `<svg width="${w}" height="${h}"`);
  return { svg, w, h, isCustom };
}

export function renderCard(report, rolled, options = {}) {
  const model = cardModel(report, rolled);
  const logo = sizedLogo(options.logo ?? report.options?.logo ?? null);
  const payload = JSON.stringify({ ...model, logo: logo.svg, logoW: logo.w, logoH: logo.h })
    .replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlan Pulse — share card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --blue:#2026D2; --cyan:#62E1FC; --pink:#F34D77;
  --ink:#3E4C59; --ink-strong:#252530; --muted:#77778E;
  --page:#F9F9FC; --surface:#FFFFFF; --line:#DDDDE3;
  --display:"Funnel Display",-apple-system,BlinkMacSystemFont,sans-serif;
  --body:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.6;
  background-image:linear-gradient(rgba(0,0,0,.032) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.032) 1px,transparent 1px);
  background-size:64px 64px;}
.wrap{max-width:1000px;margin:0 auto;padding:40px 32px 80px}
h1{font-family:var(--display);font-weight:600;font-size:30px;letter-spacing:-.025em;color:var(--ink-strong);margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 28px;max-width:62ch}
canvas{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 32px}
button{font-family:var(--body);font-size:14px;font-weight:600;padding:11px 18px;border-radius:6px;border:1.5px solid var(--blue);
  background:var(--blue);color:#fff;cursor:pointer;transition:.15s}
button:hover{background:#1D22BC;border-color:#1D22BC}
button.ghost{background:transparent;color:var(--blue)}
button.ghost:hover{background:#EDEEFD}
button:focus-visible{outline:2px solid var(--ink-strong);outline-offset:2px}
.post{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px 20px;white-space:pre-wrap;
  font-size:15px;color:var(--ink-strong);max-width:62ch}
.lbl{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.note{color:var(--muted);font-size:13.5px;margin-top:28px;max-width:64ch}
</style>
</head>
<body>
<div class="wrap">
  <h1>Your share card</h1>
  <p class="sub">Numbers only — no skill names, no file contents, nothing about what you actually work on. Download it, post it, and whoever asks gets the same command you ran.</p>

  <canvas id="card" width="2400" height="1350" aria-label="Atlan Pulse share card"></canvas>

  <div class="row">
    <button id="dl">Download PNG</button>
    <button class="ghost" id="copy">Copy post text</button>
  </div>

  <p class="lbl">Suggested post</p>
  <div class="post" id="post"></div>

  <p class="note">This file was written to your disk and nothing was uploaded. The card is drawn in your browser from the scan you just ran; closing this page does not send it anywhere.</p>
</div>

<script>
const D = ${payload};
const W = 1200, H = 675, S = 2;
const C = { blue:'#2026D2', cyan:'#62E1FC', pink:'#F34D77', ink:'#252530', body:'#3E4C59', muted:'#77778E', line:'#DDDDE3', page:'#F9F9FC' };

document.getElementById('post').textContent = D.post;

const canvas = document.getElementById('card');
const ctx = canvas.getContext('2d');

function text(str, x, y, { font, color, spacing = 0 }) {
  ctx.font = font;
  ctx.fillStyle = color;
  if (!spacing) { ctx.fillText(str, x, y); return; }
  // fillText handles alignment for us; letter-spacing has to do it by hand.
  const chars = [...str];
  const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0) - spacing;
  let cx = ctx.textAlign === 'right' ? x - width : ctx.textAlign === 'center' ? x - width / 2 : x;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  ctx.textAlign = align;
}

function draw(logoImg) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // ground + the 64px grid the report uses
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,.032)';
  ctx.lineWidth = 1;
  for (let x = 64; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 64; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }

  const P = 72;
  ctx.textBaseline = 'alphabetic';

  // masthead
  let cursor = P;
  if (logoImg) {
    const h = 26, w = (D.logoW / D.logoH) * h;
    ctx.drawImage(logoImg, P, P - 19, w, h);
    cursor = P + w + 14;
    ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(cursor - 7.5, P - 17); ctx.lineTo(cursor - 7.5, P - 1); ctx.stroke();
  }
  text('Pulse', cursor, P, { font: '600 21px var(--display-f)'.replace('var(--display-f)', '"Funnel Display", sans-serif'), color: C.ink });
  ctx.textAlign = 'right';
  text('SKILL HEALTH', W - P, P - 3, { font: '500 12px "JetBrains Mono", monospace', color: C.muted, spacing: 1.6 });
  ctx.textAlign = 'left';

  // headline — lead in ink, the turn in blue, exactly like the report
  text(D.lead, P, 250, { font: '600 62px "Funnel Display", sans-serif', color: C.ink });
  text(D.turn, P, 322, { font: '600 62px "Funnel Display", sans-serif', color: C.blue });

  // caption
  text(D.caption, P, 380, { font: '400 20px Inter, sans-serif', color: C.body });

  // rule
  ctx.strokeStyle = C.line;
  ctx.beginPath(); ctx.moveTo(P, 418.5); ctx.lineTo(W - P, 418.5); ctx.stroke();

  // stats
  const cols = D.stats.length;
  const colW = (W - P * 2) / cols;
  D.stats.forEach((s, i) => {
    const x = P + i * colW;
    text(s.label.toUpperCase(), x, 458, { font: '500 11px "JetBrains Mono", monospace', color: C.muted, spacing: 1.4 });
    const tone = s.tone === 'pink' ? C.pink : s.tone === 'cyan' ? C.blue : C.ink;
    text(s.value, x, 508, { font: '600 40px "Funnel Display", sans-serif', color: tone });
  });

  // footer: the command, which is the whole point of the post
  const cmd = 'npx atlan-pulse';
  ctx.font = '500 20px "JetBrains Mono", monospace';
  const cw = ctx.measureText(cmd).width;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = C.line;
  const bx = P, by = H - P - 46, bw = cw + 36, bh = 46;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7); else ctx.rect(bx, by, bw, bh);
  ctx.fill(); ctx.stroke();
  text(cmd, bx + 18, by + 30, { font: '500 20px "JetBrains Mono", monospace', color: C.blue });

  ctx.textAlign = 'right';
  text('Runs locally · nothing leaves your machine', W - P, by + 30, { font: '400 15px Inter, sans-serif', color: C.muted });
  ctx.textAlign = 'left';
}

function start() {
  if (!D.logo) { draw(null); return; }
  const img = new Image();
  img.onload = () => draw(img);
  img.onerror = () => draw(null);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(D.logo);
}

// Webfonts have to be resolved before the canvas can use them, otherwise the
// first paint silently falls back to a system face.
const faces = ['600 62px "Funnel Display"', '600 40px "Funnel Display"', '400 20px Inter', '500 20px "JetBrains Mono"'];
Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})))
  .then(() => document.fonts.ready)
  .catch(() => {})
  .then(start, start);

document.getElementById('dl').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'atlan-pulse-card.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});

document.getElementById('copy').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(D.post); e.target.textContent = 'Copied'; }
  catch { e.target.textContent = 'Select it and copy'; }
  setTimeout(() => { e.target.textContent = 'Copy post text'; }, 1600);
});
</script>
</body>
</html>
`;
}
