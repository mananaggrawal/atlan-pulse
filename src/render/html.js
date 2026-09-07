// The standalone report. One file, no network at load beyond webfonts, no
// analytics, nothing phoned home. Opened straight off the filesystem.
//
// Visual language follows atlan.com: Funnel Display over Inter, Persian Blue
// as the single interactive colour, cyan reserved for the turn in a headline,
// pink reserved for what is actually wrong.

import { cardStats } from './card.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const SEVERITY_LABEL = { high: 'needs attention', medium: 'worth a look', low: 'minor', info: 'context' };

function headline(report) {
  const t = report.totals;
  if (!t.skills) return { lead: 'No skills found.', turn: 'Nothing to report yet.' };
  if (report.hasInvocationData && t.neverInvoked > 0) {
    return {
      lead: `You have ${t.skills} skills.`,
      turn: `${t.neverInvoked} of them have never run.`,
    };
  }
  if (t.duplicatePairs > 0) {
    return {
      lead: `You have ${t.skills} skills.`,
      turn: `${t.duplicatePairs} pair${t.duplicatePairs === 1 ? '' : 's'} look like duplicates.`,
    };
  }
  return {
    lead: `You have ${t.skills} skills.`,
    turn: `They cost ${t.estTokens.toLocaleString()} tokens on every request.`,
  };
}

function chips(report) {
  const t = report.totals;
  const list = [
    { value: t.skills, label: 'skills' },
    { value: `${t.pctOfBudget}%`, label: 'of listing budget' },
  ];
  if (report.hasInvocationData) {
    list.push({ value: t.totalInvocations.toLocaleString(), label: `invocations / ${report.options.windowDays}d` });
    list.push({ value: t.neverInvoked, label: 'never invoked' });
  }
  if (t.duplicatePairs) list.push({ value: t.duplicatePairs, label: 'duplicate pairs' });
  if (t.ownerless) list.push({ value: t.ownerless, label: 'without an owner' });
  return list
    .map(
      (c) =>
        `<div class="chip"><span class="chip-v">${esc(c.value)}</span><span class="chip-l">${esc(c.label)}</span></div>`,
    )
    .join('');
}

function findingBlock(f) {
  const items = (f.items || [])
    .map(
      (item) =>
        `<tr><td class="i-name">${esc(item.name)}</td><td class="i-note">${esc(item.note || '')}</td></tr>`,
    )
    .join('');

  const table = items
    ? `<details${f.severity === 'high' ? ' open' : ''}><summary>${f.items.length} item${f.items.length === 1 ? '' : 's'}</summary><table>${items}</table></details>`
    : '';

  return `<section class="finding sev-${esc(f.severity)}">
      <div class="f-head">
        <span class="dot"></span>
        <h3>${esc(f.title)}</h3>
        <span class="sev">${esc(SEVERITY_LABEL[f.severity] || '')}</span>
      </div>
      <p class="f-line">${esc(f.headline)}</p>
      ${f.detail ? `<p class="f-detail">${esc(f.detail)}</p>` : ''}
      ${table}
    </section>`;
}

function sourcesBlock(report) {
  const rows = report.roots
    .map(
      (r) =>
        `<tr><td class="i-name">${esc(r.label)}</td><td class="i-note">${r.found ? `${r.count} skill${r.count === 1 ? '' : 's'}` : 'not found'}</td></tr>`,
    )
    .join('');

  const tr = report.transcripts;
  const transcriptLine = tr.available
    ? `Read ${tr.filesRead.toLocaleString()} transcript file${tr.filesRead === 1 ? '' : 's'} (${tr.linesRead.toLocaleString()} lines) from <code>${esc(tr.dir)}</code> and matched ${tr.eventsFound.toLocaleString()} skill invocation${tr.eventsFound === 1 ? '' : 's'}.`
    : `No session transcripts were found at <code>${esc(tr.dir)}</code>, so every invocation-based number is omitted rather than estimated.`;

  return `<section class="panel">
      <h3>What this could see</h3>
      <table>${rows}</table>
      <p class="f-detail">${transcriptLine}</p>
    </section>`;
}

export function renderHTML(report, shareStats) {
  const h = headline(report);
  const stats = cardStats(shareStats);
  const post = report.sharePost || '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlan Pulse — Skill Health Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --blue:#2026D2; --blue-hover:#1D22BC; --cyan:#62E1FC; --pink:#F34D77;
  --ink:#3E4C59; --ink-strong:#252530; --ink-deep:#141517;
  --muted:#77778E; --page:#F9F9FC; --surface:#FFFFFF; --line:#DDDDE3; --line-soft:#E9E9F0;
  --display:"Funnel Display",-apple-system,BlinkMacSystemFont,sans-serif;
  --body:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.6;
  background-image:linear-gradient(rgba(0,0,0,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.035) 1px,transparent 1px);
  background-size:64px 64px;}
.wrap{max-width:940px;margin:0 auto;padding:64px 28px 96px}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--blue);margin:0 0 20px}
h1{font-family:var(--display);font-weight:600;letter-spacing:-.02em;font-size:clamp(34px,5.4vw,58px);line-height:1.08;margin:0 0 22px;color:var(--ink-strong)}
h1 .turn{color:var(--blue)}
.lede{font-size:17px;max-width:60ch;margin:0 0 34px;color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:56px}
.chip{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;min-width:112px}
.chip-v{font-family:var(--display);font-weight:600;font-size:24px;color:var(--ink-strong);line-height:1.15}
.chip-l{font-size:11.5px;color:var(--muted);letter-spacing:.02em}
h2{font-family:var(--display);font-weight:600;letter-spacing:-.01em;font-size:13px;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);margin:0 0 18px}
.finding,.panel{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:22px 24px;margin-bottom:14px}
.f-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.f-head h3{font-family:var(--display);font-weight:600;font-size:17px;margin:0;color:var(--ink-strong);flex:1}
.panel h3{font-family:var(--display);font-weight:600;font-size:17px;margin:0 0 14px;color:var(--ink-strong)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--muted);flex:none}
.sev-high .dot{background:var(--pink)} .sev-medium .dot{background:var(--blue)} .sev-info .dot{background:var(--cyan)}
.sev{font-size:11px;color:var(--muted);letter-spacing:.04em}
.f-line{margin:0 0 8px;font-size:16px;color:var(--ink-strong);font-weight:500}
.f-detail{margin:0;font-size:13.5px;color:var(--muted);max-width:72ch}
details{margin-top:14px;border-top:1px solid var(--line-soft);padding-top:12px}
summary{cursor:pointer;font-size:12.5px;color:var(--blue);font-weight:500;letter-spacing:.02em}
table{width:100%;border-collapse:collapse;margin-top:10px}
td{padding:7px 0;border-bottom:1px solid var(--line-soft);vertical-align:top;font-size:13.5px}
tr:last-child td{border-bottom:none}
.i-name{font-family:var(--mono);font-size:12.5px;color:var(--ink-strong);white-space:pre-line}
.i-note{color:var(--muted);text-align:right;font-size:12.5px;white-space:nowrap;padding-left:18px}
.share{background:var(--ink-deep);border-radius:10px;padding:28px;margin:0 0 14px;color:#fff}
.share h3{font-family:var(--display);font-weight:600;font-size:18px;margin:0 0 6px;color:#fff}
.share p{color:#9A9AB4;font-size:13.5px;margin:0 0 20px;max-width:64ch}
canvas{width:100%;height:auto;border-radius:6px;display:block;border:1px solid rgba(255,255,255,.1)}
.actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.btn{font-family:var(--body);font-size:14px;font-weight:600;padding:9px 16px;border-radius:6px;border:1.5px solid var(--blue);
  background:var(--blue);color:#fff;cursor:pointer;text-decoration:none;display:inline-block;line-height:1.2}
.btn:hover{background:var(--blue-hover);border-color:var(--blue-hover)}
.btn.ghost{background:transparent;border-color:rgba(255,255,255,.28);color:#fff}
.btn.ghost:hover{border-color:#fff;background:rgba(255,255,255,.06)}
code{font-family:var(--mono);font-size:12.5px;background:rgba(32,38,210,.06);padding:1px 5px;border-radius:3px;color:var(--blue)}
footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);max-width:76ch}
footer p{margin:0 0 6px}
@media(max-width:640px){.wrap{padding:40px 18px 64px}.i-note{white-space:normal}}
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">Skill health report</p>
  <h1>${esc(h.lead)}<br><span class="turn">${esc(h.turn)}</span></h1>
  <p class="lede">Every skill you keep is described to the model on every single request, whether or not it is ever used. This is what yours are costing you, and which ones are earning it.</p>
  <div class="chips">${chips(report)}</div>

  <h2>Findings</h2>
  ${report.findings.filter((f) => f.headline).map(findingBlock).join('\n  ')}

  <h2>Share</h2>
  <div class="share">
    <h3>Post the numbers, not the names</h3>
    <p>This card carries counts and percentages only. No skill name, description or file path from your machine is on it, or in the suggested post.</p>
    <canvas id="card" width="1200" height="630"></canvas>
    <div class="actions">
      <a class="btn" id="dl" download="atlan-pulse-card.png">Download PNG</a>
      <button class="btn ghost" id="copy">Copy post text</button>
    </div>
  </div>

  <h2>Method</h2>
  ${sourcesBlock(report)}

  <footer>
    <p>Generated ${esc(new Date(report.generatedAt).toLocaleString())} by Atlan Pulse v${esc(report.version)}. This file was written to your disk and nothing was uploaded.</p>
    <p><strong>Limitations.</strong> Token counts are estimates from character length, not a tokeniser run. Duplicate detection is trigram similarity — a hint, not a verdict. The permissions check reads declared frontmatter and cannot see what a skill actually does. Everything here describes one machine: cross-person duplication and real ownership are not knowable from a solo scan.</p>
    <p>Atlan Pulse is a working prototype built as a work sample. It is not an official Atlan product, and is not affiliated with, endorsed by, or operated by Atlan.</p>
  </footer>
</div>
<script>
var STATS = ${JSON.stringify(stats)};
var POST = ${JSON.stringify(post)};

function drawCard(){
  var c = document.getElementById('card');
  var x = c.getContext('2d');
  var W = 1200, H = 630;
  x.fillStyle = '#141517'; x.fillRect(0,0,W,H);
  x.strokeStyle = 'rgba(255,255,255,0.04)'; x.lineWidth = 2;
  for (var gx = 0; gx <= W; gx += 64){ x.beginPath(); x.moveTo(gx,0); x.lineTo(gx,H); x.stroke(); }
  for (var gy = 0; gy <= H; gy += 64){ x.beginPath(); x.moveTo(0,gy); x.lineTo(W,gy); x.stroke(); }

  var g = x.createLinearGradient(100,0,220,0);
  g.addColorStop(0,'#2026D2'); g.addColorStop(1,'#62E1FC');
  x.fillStyle = g; x.fillRect(100,96,120,4);

  x.fillStyle = '#62E1FC';
  x.font = '600 19px Inter, sans-serif';
  var eyebrow = 'ATLAN PULSE — SKILL HEALTH', ex = 100;
  for (var i = 0; i < eyebrow.length; i++){ x.fillText(eyebrow[i], ex, 152); ex += x.measureText(eyebrow[i]).width + 3; }

  x.fillStyle = '#FFFFFF';
  x.font = '600 44px "Funnel Display", sans-serif';
  x.fillText('Most of my agent skills are dead weight.', 100, 232);

  var cols = STATS.length <= 2 ? STATS.length : 2;
  for (var j = 0; j < STATS.length; j++){
    var px = 100 + (j % cols) * (1000 / cols);
    var py = 322 + Math.floor(j / cols) * 140;
    x.fillStyle = '#FFFFFF';
    x.font = '700 72px "Funnel Display", sans-serif';
    x.fillText(STATS[j].value, px, py);
    x.fillStyle = '#9A9AB4';
    x.font = '400 21px Inter, sans-serif';
    x.fillText(STATS[j].label, px, py + 34);
  }

  x.fillStyle = '#FFFFFF';
  x.font = '500 26px "JetBrains Mono", monospace';
  x.fillText('npx atlan-pulse', 100, 566);
  x.fillStyle = '#77778E';
  x.font = '400 18px Inter, sans-serif';
  x.textAlign = 'right';
  x.fillText('aggregate numbers only — no skill names left this machine', 1100, 566);
  x.textAlign = 'left';

  document.getElementById('dl').href = c.toDataURL('image/png');
}

if (document.fonts && document.fonts.ready) { document.fonts.ready.then(drawCard); setTimeout(drawCard, 1200); }
else { drawCard(); }

document.getElementById('copy').addEventListener('click', function(e){
  var btn = e.currentTarget;
  navigator.clipboard.writeText(POST).then(function(){
    btn.textContent = 'Copied';
    setTimeout(function(){ btn.textContent = 'Copy post text'; }, 1800);
  }, function(){ btn.textContent = 'Copy failed — select it manually'; });
});
</script>
</body>
</html>`;
}
