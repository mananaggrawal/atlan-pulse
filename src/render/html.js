// The report.
//
// This file is the product. Everything else exists to fill it in. It is one
// self-contained HTML file with no scripts and no network calls beyond
// webfonts, which means it can be dropped in Slack, attached to an email,
// committed to a repo, or printed to PDF with Cmd-P and still be itself.
//
// The visual grammar follows Atlan's published documents: masthead wordmark,
// eyebrow, a headline whose second line is the turn, a metadata byline bar,
// a bordered key-takeaways card with check bullets, then numbered chapters.

import { ANCHORS, RUN_COMMAND } from '../lib/constants.js';
import { resolveLogo } from '../lib/logo.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const n = (v) => Number(v ?? 0).toLocaleString();
const pct = (v) => `${Math.round(v)}%`;

// No verdict labels. Each finding prints the threshold that fired instead.

const dateShort = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ---------------------------------------------------------------------------

function headline(report) {
  const t = report.totals;
  if (!t.skills) return { lead: 'No skills found.', turn: 'Nothing to report yet.' };
  if (report.hasInvocationData && t.neverInvoked > 0) {
    return { lead: `${t.skills} skills installed.`, turn: `${t.neverInvoked} of them have never run.` };
  }
  if (t.duplicatePairs > 0) {
    return { lead: `${t.skills} skills installed.`, turn: `${t.duplicatePairs} pair${t.duplicatePairs === 1 ? '' : 's'} above the similarity threshold.` };
  }
  return { lead: `${t.skills} skills installed.`, turn: `${n(t.estTokens)} tokens on every request.` };
}

function takeaways(report, rolled) {
  const t = report.totals;
  const out = [];

  out.push(
    `Skill descriptions total an estimated <strong>${n(t.estTokens)} tokens per request</strong> — ${pct(t.pctOfBudget)} of the listing budget.`,
  );

  if (report.hasInvocationData) {
    if (t.neverInvoked > 0) {
      out.push(
        `<strong>${t.neverInvoked} of ${t.skills} skills</strong> recorded zero invocations in the last ${report.options.windowDays} days` +
          (t.neverInvokedShareOfContext ? `, accounting for ${pct(t.neverInvokedShareOfContext)} of the description tokens.` : '.'),
      );
    }
    if (t.topShare !== null && rolled.leaderboard.length) {
      out.push(
        `<strong>Three skills</strong> account for ${pct(t.topShare)} of ${n(t.totalInvocations)} recorded invocations.`,
      );
    }
  } else {
    out.push(
      `No session transcripts were found. The three usage checks report as unavailable; the other five do not need transcripts.`,
    );
  }

  if (t.duplicatePairs) {
    out.push(`<strong>${t.duplicatePairs} pair${t.duplicatePairs === 1 ? '' : 's'}</strong> of skills ${t.duplicatePairs === 1 ? 'scores' : 'score'} at or above the ${pct(report.options.duplicateThreshold * 100)} name-and-description similarity threshold.`);
  }
  const risky = report.findings.find((f) => f.id === 'risky-permissions');
  if (risky?.items?.length) {
    out.push(`<strong>${risky.items.length} skill${risky.items.length === 1 ? '' : 's'}</strong> ${risky.items.length === 1 ? 'declares' : 'declare'} shell, network or deletion tools in frontmatter.`);
  }
  if (t.ownerless) {
    out.push(`<strong>${t.ownerless} of ${t.skills}</strong> ${t.ownerless === 1 ? 'declares' : 'declare'} no owner in frontmatter.`);
  }
  return out;
}

// ---------------------------------------------------------------------------

function budgetBar(report) {
  const t = report.totals;
  const used = Math.min(t.pctOfBudget, 100);
  const dead = report.hasInvocationData && t.neverInvokedShareOfContext
    ? Math.min((t.neverInvokedShareOfContext / 100) * used, used)
    : 0;
  const live = used - dead;
  const over = t.pctOfBudget > 100;

  return `<div class="bar-wrap">
      <div class="bar" role="img" aria-label="${pct(t.pctOfBudget)} of the listing budget used">
        <span class="seg live" style="width:${live}%"></span>
        <span class="seg dead" style="width:${dead}%"></span>
      </div>
      <div class="bar-key">
        <span><i class="sw live"></i>In use — ${n(t.estTokens - Math.round((t.estTokens * (t.neverInvokedShareOfContext || 0)) / 100))} tokens</span>
        ${dead ? `<span><i class="sw dead"></i>Never invoked — ${n(Math.round((t.estTokens * t.neverInvokedShareOfContext) / 100))} tokens</span>` : ''}
        <span><i class="sw rest"></i>Budget ${n(t.budgetTokens)} tokens</span>
      </div>
      ${over ? `<p class="warn">Over the listing budget by ${pct(t.pctOfBudget - 100)}.</p>` : ''}
    </div>`;
}

const statGrid = (items) =>
  `<div class="stats">${items
    .map(
      (s) =>
        `<div class="stat"><span class="s-v">${esc(s.value)}</span><span class="s-l">${esc(s.label)}</span>${s.note ? `<span class="s-n">${esc(s.note)}</span>` : ''}</div>`,
    )
    .join('')}</div>`;

const table = (head, rows, cls = '') =>
  `<table class="${cls}"><thead><tr>${head.map((h) => `<th${h.num ? ' class="num"' : ''}>${esc(h.label ?? h)}</th>`).join('')}</tr></thead>
     <tbody>${rows
       .map((r) => `<tr>${r.map((cell) => (typeof cell === 'object' ? `<td class="${cell.cls || ''}">${cell.html ?? esc(cell.text)}</td>` : `<td>${esc(cell)}</td>`)).join('')}</tr>`)
       .join('')}</tbody></table>`;

// ---------------------------------------------------------------------------

function chapterFindings(report) {
  const real = report.findings.filter((f) => f.headline && f.id !== 'context-cost' && f.id !== 'concentration');
  if (!real.length) return '<p class="empty">Nothing flagged.</p>';

  return real
    .map((f) => {
      const items = (f.items || []).length
        ? table(
            ['Skill', { label: 'Detail', num: true }],
            f.items.map((i) => [{ text: i.name, cls: 'mono' }, { text: i.note || '', cls: 'num muted' }]),
            'items',
          )
        : '';
      return `<div class="finding sev-${esc(f.severity)}">
        <div class="f-head">
          <span class="dot"></span>
          <h3>${esc(f.title)}</h3>
          <span class="sev">${esc(f.rule || '')}</span>
        </div>
        <p class="f-line">${esc(f.headline)}</p>
        ${f.detail ? `<p class="f-detail">${esc(f.detail)}</p>` : ''}
        ${items}
      </div>`;
    })
    .join('\n');
}

function chapterUsage(report, rolled) {
  if (!report.hasInvocationData) {
    return `<div class="panel note">
        <h3>Usage data unavailable</h3>
        <p class="f-detail">No session transcripts were found at <code>${esc(report.transcripts.dir)}</code>. Nothing in this section is estimated in their absence. Run <code>atlan-pulse --debug-transcripts</code> to list the paths searched.</p>
      </div>`;
  }

  const lead = rolled.leaderboard.slice(0, 15);
  const board = lead.length
    ? table(
        ['#', 'Skill', { label: 'Runs', num: true }, { label: 'Share', num: true }, { label: 'Last modified', num: true }],
        lead.map((s) => [
          { text: String(s.rank), cls: 'rank' },
          { text: s.name, cls: 'mono' },
          { text: n(s.invocations), cls: 'num' },
          { html: `<span class="track"><i style="width:${Math.min(s.share, 100)}%"></i></span>${s.share}%`, cls: 'num share' },
          { text: `${s.daysSinceModified}d ago`, cls: 'num muted' },
        ]),
      )
    : '<p class="empty">No invocations recorded in the window.</p>';

  const unused = rolled.unused.length
    ? table(
        ['Skill', 'Owner', { label: 'Description', num: true }, { label: 'Last modified', num: true }],
        rolled.unused.map((s) => [
          { text: s.name, cls: 'mono' },
          { text: s.owner || '—', cls: s.owner ? '' : 'muted' },
          { text: `${n(s.descriptionChars)} chars`, cls: 'num muted' },
          { text: `${s.daysSinceModified}d ago`, cls: 'num muted' },
        ]),
      )
    : '<p class="empty">Every skill ran at least once in the window.</p>';

  return `${board}
    <h3 class="sub">Never invoked in ${report.options.windowDays} days</h3>
    <p class="f-detail">Zero recorded invocations in the window. Description characters shown are still counted in the listing.</p>
    ${unused}`;
}

function chapterInventory(report, rolled) {
  const bySource = table(
    ['Location', { label: 'Skills', num: true }, { label: 'Description size', num: true }, { label: 'Runs', num: true }, { label: 'Unused', num: true }],
    rolled.bySource.map((r) => [
      { text: r.label, cls: 'mono' },
      { text: n(r.count), cls: 'num' },
      { text: `${n(r.chars)} chars`, cls: 'num muted' },
      { text: report.hasInvocationData ? n(r.invocations) : '—', cls: 'num' },
      { text: report.hasInvocationData ? n(r.unused) : '—', cls: 'num muted' },
    ]),
  );

  const named = rolled.owners.filter((o) => o.owner);
  const owners = named.length
    ? table(
        ['Owner', { label: 'Skills', num: true }, { label: 'Runs', num: true }],
        named.map((o) => [o.owner, { text: n(o.count), cls: 'num' }, { text: report.hasInvocationData ? n(o.invocations) : '—', cls: 'num' }]),
      )
    : '<p class="empty">No skill declares an owner.</p>';

  const all = table(
    ['Skill', 'Owner', { label: 'Runs', num: true }, { label: 'Description', num: true }, { label: 'Age', num: true }],
    [...report.skills]
      .sort((a, b) => (b.invocations || 0) - (a.invocations || 0) || a.name.localeCompare(b.name))
      .map((s) => [
        { text: s.name, cls: 'mono' },
        { text: s.owner || '—', cls: s.owner ? '' : 'muted' },
        { text: report.hasInvocationData ? n(s.invocations) : '—', cls: 'num' },
        { text: n(s.descriptionChars), cls: 'num muted' },
        { text: `${s.daysSinceModified}d`, cls: 'num muted' },
      ]),
  );

  return `${bySource}
    <h3 class="sub">Ownership</h3>
    <p class="f-detail">${rolled.busFactor ? `The largest single owner holds ${pct(rolled.busFactor)} of the catalogue.` : 'No ownership is declared anywhere in the catalogue.'}</p>
    ${owners}
    <h3 class="sub">Full inventory</h3>
    ${all}`;
}

function chapterMethod(report) {
  const roots = table(
    ['Location searched', { label: 'Result', num: true }],
    report.roots.map((r) => [
      { text: r.label, cls: 'mono' },
      { text: r.found ? `${n(r.count)} skill${r.count === 1 ? '' : 's'}` : 'not found', cls: r.found ? 'num' : 'num muted' },
    ]),
  );

  const tr = report.transcripts;
  const transcripts = table(
    ['Session transcripts', { label: '', num: true }],
    [
      ...(tr.searched ?? [{ dir: tr.dir, found: tr.available }]).map((x) => [
        { text: 'Location searched', cls: 'mono' },
        { text: `${x.dir}${x.found ? '' : ' — not found'}`, cls: 'num muted' },
      ]),
      [{ text: 'Files read', cls: 'mono' }, { text: n(tr.filesRead), cls: 'num' }],
      [{ text: 'Lines read', cls: 'mono' }, { text: n(tr.linesRead), cls: 'num' }],
      [{ text: 'Skill invocations matched', cls: 'mono' }, { text: n(tr.eventsFound), cls: 'num' }],
      [{ text: 'Matched by', cls: 'mono' }, { text: Object.keys(tr.signatures).join(', ') || 'nothing matched', cls: 'num muted' }],
      [{ text: 'Window', cls: 'mono' }, { text: `${tr.windowDays} days`, cls: 'num muted' }],
    ],
  );

  const anchors = table(
    ['Constant', 'Value', { label: 'Where it comes from', num: true }],
    [
      ['Skill-listing budget', `${ANCHORS.LISTING_BUDGET_FRACTION * 100}% of context`, { text: 'Anthropic skills documentation', cls: 'num muted' }],
      ['Assumed context window', `${n(ANCHORS.CONTEXT_WINDOW_TOKENS)} tokens`, { text: 'configurable', cls: 'num muted' }],
      ['Description limit', `${n(ANCHORS.MAX_DESCRIPTION_CHARS)} chars`, { text: 'Anthropic skills documentation', cls: 'num muted' }],
      ['Token estimate', `${ANCHORS.CHARS_PER_TOKEN} chars per token`, { text: 'approximation, not a tokeniser', cls: 'num muted' }],
      ['Staleness threshold', `${report.options.staleDays} days`, { text: '--stale-days', cls: 'num muted' }],
      ['Duplicate threshold', `${Math.round(report.options.duplicateThreshold * 100)}% trigram overlap`, { text: 'name + description', cls: 'num muted' }],
    ],
  );

  return `${roots}
    <h3 class="sub">Usage sources</h3>
    ${transcripts}
    <h3 class="sub">Constants used</h3>
    <p class="f-detail">Every number in this report derives from the values below. All are overridable at the command line.</p>
    ${anchors}`;
}

// ---------------------------------------------------------------------------

export function renderHTML(report, rolled) {
  const logo = resolveLogo(report.options.logo);
  const h = headline(report);
  const t = report.totals;
  const generated = new Date(report.generatedAt);

  const chapters = [
    { id: 'cost', title: 'Context cost', blurb: 'Estimated tokens the skill listing adds to every request.' },
    { id: 'usage', title: 'Invocations', blurb: 'Recorded skill invocations within the usage window.' },
    { id: 'attention', title: 'Findings', blurb: 'Checks that returned a result, and the threshold each one uses.' },
    { id: 'inventory', title: 'Inventory', blurb: 'Every skill found, where it lives, and who owns it.' },
    { id: 'method', title: 'Method', blurb: 'Paths searched, constants and thresholds behind every number.' },
  ];

  const body = {
    cost: `${statGrid([
      { value: n(t.estTokens), label: 'tokens per request', note: 'estimated' },
      { value: pct(t.pctOfBudget), label: 'of listing budget' },
      { value: n(t.descriptionChars), label: 'characters of description' },
      report.hasInvocationData
        ? { value: pct(t.neverInvokedShareOfContext ?? 0), label: 'of tokens from zero-invocation skills' }
        : { value: String(t.skills), label: 'skills described every request' },
    ])}
    ${budgetBar(report)}`,
    usage: chapterUsage(report, rolled),
    attention: chapterFindings(report),
    inventory: chapterInventory(report, rolled),
    method: chapterMethod(report),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlan Pulse — Skill Health Report</title>
<meta name="description" content="Skill health report: ${esc(t.skills)} skills, ${esc(n(t.estTokens))} tokens per request.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --blue:#2026D2; --blue-hover:#1D22BC; --cyan:#62E1FC; --pink:#F34D77;
  --ink:#3E4C59; --ink-strong:#252530; --ink-deep:#141517;
  --muted:#77778E; --page:#F9F9FC; --surface:#FFFFFF; --surface-2:#F8F8FA;
  --line:#DDDDE3; --line-soft:#E9E9F0;
  --display:"Funnel Display",-apple-system,BlinkMacSystemFont,sans-serif;
  --body:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.62;
  background-image:linear-gradient(rgba(0,0,0,.032) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.032) 1px,transparent 1px);
  background-size:64px 64px;}
.wrap{max-width:1000px;margin:0 auto;padding:0 32px 96px}

/* masthead */
.masthead{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 0 0;margin-bottom:52px;flex-wrap:wrap}
.lockup{display:flex;align-items:center;gap:9px}
.mark{display:block;flex:none}
.logo{display:block;flex:none;height:26px;width:auto;max-width:190px}
.lockup .rule{display:block;width:1px;height:20px;background:var(--line);margin:0 3px}
.wordmark{font-family:var(--display);font-weight:600;font-size:20px;letter-spacing:-.015em;color:var(--ink-strong)}
.wordmark b{color:var(--blue);font-weight:600}
.masthead .kicker{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}

/* cover */
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--blue);margin:0 0 20px}
h1{font-family:var(--display);font-weight:600;letter-spacing:-.022em;font-size:clamp(36px,5.6vw,60px);line-height:1.06;margin:0 0 26px;color:var(--ink-strong);max-width:16ch}
h1 .turn{color:var(--blue)}
.byline{display:flex;flex-wrap:wrap;gap:0 26px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:34px}
.byline div{display:flex;flex-direction:column}
.byline dt{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}
.byline dd{margin:2px 0 0;font-size:14px;color:var(--ink-strong);font-weight:500}

.takeaways{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:26px 28px;margin-bottom:56px}
.takeaways h2{font-family:var(--display);font-size:18px;font-weight:600;color:var(--ink-strong);margin:0 0 16px;letter-spacing:-.01em;text-transform:none}
.takeaways ul{list-style:none;margin:0;padding:0}
.takeaways li{position:relative;padding-left:28px;margin-bottom:12px;font-size:14.5px;color:var(--ink)}
.takeaways li:last-child{margin-bottom:0}
.takeaways li::before{content:"";position:absolute;left:0;top:6px;width:15px;height:9px;border-left:2px solid var(--blue);border-bottom:2px solid var(--blue);transform:rotate(-45deg)}
.takeaways strong{color:var(--ink-strong);font-weight:600}

/* contents */
.toc{margin-bottom:64px}
.toc ol{list-style:none;counter-reset:c;margin:0;padding:0;border-top:1px solid var(--line)}
.toc li{counter-increment:c;border-bottom:1px solid var(--line)}
.toc a{display:flex;align-items:baseline;gap:16px;padding:13px 2px;text-decoration:none;color:var(--ink-strong)}
.toc a:hover{color:var(--blue)}
.toc a::before{content:counter(c,decimal-leading-zero);font-family:var(--mono);font-size:11.5px;color:var(--blue);flex:none}
.toc .t{font-family:var(--display);font-weight:600;font-size:15.5px;flex:none}
.toc .b{font-size:13px;color:var(--muted)}

/* chapters */
h2{font-family:var(--display);font-weight:600;letter-spacing:-.015em;font-size:28px;color:var(--ink-strong);margin:0 0 6px}
.chapter{margin-bottom:72px;scroll-margin-top:20px}
.chapter-head{border-top:2px solid var(--ink-strong);padding-top:18px;margin-bottom:26px}
.chapter-num{font-family:var(--mono);font-size:11.5px;color:var(--blue);display:block;margin-bottom:10px;letter-spacing:.06em}
.chapter-head p{margin:0;color:var(--muted);font-size:14px}
h3.sub{font-family:var(--display);font-weight:600;font-size:16.5px;color:var(--ink-strong);margin:36px 0 8px;letter-spacing:-.01em}
.prose{max-width:74ch;font-size:15px;color:var(--ink);margin:22px 0 0}
.empty{color:var(--muted);font-size:14px;font-style:italic}

/* stats */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:26px}
.stat{background:var(--surface);padding:18px 20px;display:flex;flex-direction:column;min-width:0}
.s-v{font-family:var(--display);font-weight:600;font-size:32px;line-height:1.1;color:var(--ink-strong);letter-spacing:-.02em}
.s-l{font-size:12.5px;color:var(--ink);margin-top:4px}
.s-n{font-size:11px;color:var(--muted);margin-top:2px}

/* budget bar */
.bar-wrap{margin:26px 0 0}
.bar{display:flex;height:14px;border-radius:3px;overflow:hidden;background:var(--line-soft);border:1px solid var(--line)}
.seg{display:block;height:100%}
.seg.live{background:var(--blue)} .seg.dead{background:var(--pink)}
.bar-key{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:10px;font-size:12px;color:var(--muted)}
.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px}
.sw.live{background:var(--blue)} .sw.dead{background:var(--pink)} .sw.rest{background:var(--line)}
.warn{margin:14px 0 0;font-size:13.5px;color:var(--pink);font-weight:500}

/* findings */
.finding,.panel{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:22px 24px;margin-bottom:14px}
.panel.note{border-left:3px solid var(--cyan)}
.f-head{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.f-head h3{font-family:var(--display);font-weight:600;font-size:17px;margin:0;color:var(--ink-strong);flex:1}
.panel h3{font-family:var(--display);font-weight:600;font-size:17px;margin:0 0 10px;color:var(--ink-strong)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--muted);flex:none}
.sev-high .dot{background:var(--pink)} .sev-medium .dot{background:var(--blue)} .sev-info .dot{background:var(--cyan)}
.sev{font-family:var(--mono);font-size:10.5px;color:var(--muted);letter-spacing:0;text-align:right;max-width:34ch;flex:none}
.f-line{margin:0 0 7px;font-size:16px;color:var(--ink-strong);font-weight:500}
.f-detail{margin:0;font-size:13.5px;color:var(--muted);max-width:76ch}

/* tables */
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13.5px}
thead th{text-align:left;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;
  padding:0 0 9px;border-bottom:1px solid var(--line)}
thead th.num{text-align:right}
td{padding:9px 0;border-bottom:1px solid var(--line-soft);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
td.num{text-align:right;white-space:nowrap;padding-left:18px}
td.muted{color:var(--muted)}
td.mono{font-family:var(--mono);font-size:12.5px;color:var(--ink-strong);word-break:break-word}
td.rank{font-family:var(--mono);font-size:12px;color:var(--muted);width:28px}
td.share{white-space:nowrap}
.track{display:inline-block;width:58px;height:5px;border-radius:3px;background:var(--line-soft);margin-right:10px;vertical-align:middle;overflow:hidden}
.track i{display:block;height:100%;background:var(--blue);border-radius:3px}
.finding table{margin-top:16px;border-top:1px solid var(--line);padding-top:4px}


.limits{margin:14px 0 0;padding-left:20px;font-size:13.5px;color:var(--muted);max-width:78ch}
.limits li{margin-bottom:7px}
.limits strong{color:var(--ink);font-weight:600}
code{font-family:var(--mono);font-size:12.5px;background:rgba(32,38,210,.06);padding:1px 5px;border-radius:3px;color:var(--blue)}

footer{margin-top:24px;padding-top:22px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);max-width:80ch}
footer p{margin:0 0 7px}
footer .cta{font-family:var(--mono);color:var(--blue);font-size:13px}

@media(max-width:680px){
  .wrap{padding:0 18px 64px}
  .byline{gap:0 18px}
  .toc a{flex-wrap:wrap;gap:4px 14px}
  .toc .b{width:100%;padding-left:26px}
  table{font-size:12.5px}
  .track{display:none}
}

@media print{
  @page{margin:16mm 14mm}
  body{background:#fff;background-image:none;font-size:10.5pt;line-height:1.5;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .wrap{max-width:none;padding:0}
  .masthead{margin-bottom:26px;padding-top:0}
  h1{font-size:30pt}
  .chapter{margin-bottom:26px;page-break-inside:auto}
  .chapter-head{page-break-after:avoid;page-break-inside:avoid}
  h2,h3{page-break-after:avoid}
  .takeaways,.finding,.panel,.stats{page-break-inside:avoid;box-shadow:none}
  /* Keep the contents together, but do not force a break after it — that
     left a near-empty page whenever the list did not fill one. */
  .toc{page-break-inside:avoid}
  tr,td,th{page-break-inside:avoid}
  thead{display:table-header-group}
  a{color:inherit;text-decoration:none}
}
</style>
</head>
<body>
<div class="wrap">

  <header class="masthead">
    <div class="lockup">${logo.html}${logo.isCustom ? '<span class="rule"></span><span class="wordmark">Pulse</span>' : '<span class="wordmark">Atlan <b>Pulse</b></span>'}</div>
    <span class="kicker">Skill Health Report</span>
  </header>

  <p class="eyebrow">Local skill catalogue</p>
  <h1>${esc(h.lead)}<br><span class="turn">${esc(h.turn)}</span></h1>

  <dl class="byline">
    <div><dt>Generated</dt><dd>${esc(generated.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }))}</dd></div>
    <div><dt>Scope</dt><dd>${esc(n(t.skills))} skills, ${esc(String(report.roots.filter((r) => r.found && r.count).length))} location${report.roots.filter((r) => r.found && r.count).length === 1 ? '' : 's'}</dd></div>
    <div><dt>Usage window</dt><dd>${esc(String(report.options.windowDays))} days</dd></div>
    <div><dt>Invocations</dt><dd>${report.hasInvocationData ? esc(n(t.totalInvocations)) : 'unavailable'}</dd></div>
    <div><dt>Version</dt><dd>Pulse v${esc(report.version)}</dd></div>
  </dl>

  <section class="takeaways">
    <h2>Key takeaways</h2>
    <ul>${takeaways(report, rolled).map((line) => `<li>${line}</li>`).join('')}</ul>
  </section>

  <nav class="toc">
    <ol>${chapters
      .map((ch) => `<li><a href="#${ch.id}"><span class="t">${esc(ch.title)}</span><span class="b">${esc(ch.blurb)}</span></a></li>`)
      .join('')}</ol>
  </nav>

  ${chapters
    .map(
      (ch, i) => `<section class="chapter" id="${ch.id}">
    <div class="chapter-head">
      <span class="chapter-num">${String(i + 1).padStart(2, '0')}</span>
      <h2>${esc(ch.title)}</h2>
      <p>${esc(ch.blurb)}</p>
    </div>
    ${body[ch.id]}
  </section>`,
    )
    .join('\n  ')}

  <footer>
    <p>Generated ${esc(generated.toLocaleString())} by Atlan Pulse v${esc(report.version)}. This file was written to your disk. Nothing was uploaded, and there is no telemetry in this tool.</p>
    <p class="cta">Run it yourself:  ${RUN_COMMAND}</p>
    <p>Atlan Pulse is a working prototype built as a work sample. It is not an official Atlan product, and is not affiliated with, endorsed by, or operated by Atlan.</p>
  </footer>
</div>
</body>
</html>`;
}
