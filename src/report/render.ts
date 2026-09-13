import type { AuditFinding, AuditKind } from '../engine/types.ts';
import type { AuditRun } from '../store/runs.ts';
import { REPORT_CSS } from './css.ts';
import { fontFaceCss } from './fonts.ts';
import { SEVERITY_COLOR } from './theme.ts';
import {
  BODY_LINE_LIMIT,
  DESCRIPTION_SIMILARITY_THRESHOLD,
  LISTING_BUDGET_TOKENS,
  SCORE_WEIGHTS,
  STALE_DAYS,
} from '../engine/constants.ts';

/**
 * The report.
 *
 * Two rules govern the layout, and both are about trust rather than taste.
 *
 * **Measurements and judgment are never mixed in the same list.** Within each
 * dimension the deterministic findings come first, then a visibly separate
 * "Reviewer notes" block. A reader must always be able to tell which half of
 * the report a given sentence came from, because only one of the two halves is
 * reproducible.
 *
 * **The last page says what the audit cannot see.** It is not a disclaimer
 * buried in small print; it is a section with a heading, because a scanner
 * that implies it can certify safety is worse than no scanner.
 */

const DIMENSION_TITLE: Record<AuditKind, string> = {
  tokens: 'Token cost',
  dedupe: 'Duplication',
  security: 'Security',
  vulnerability: 'Supply chain',
  improvement: 'Authoring quality',
};

const DIMENSION_BLURB: Record<AuditKind, string> = {
  tokens:
    'What this catalog costs before anyone uses it. A skill’s name and description are carried on every prompt; its body costs nothing until it runs.',
  dedupe:
    'Skills that compete for the same request. When two skills can answer the same sentence, the model picks one — not always the same one.',
  security:
    'Credential-shaped strings, capability grants that skip the approval prompt, and instructions that hand control to something outside the skill.',
  vulnerability:
    'What the skill pulls in from elsewhere: remote scripts, unpinned installs, redirected registries, and files placed where reviewers do not look.',
  improvement:
    'Whether each skill is written the way it needs to be written to be found, triggered and maintained.',
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function n(value: number): string {
  return value.toLocaleString('en-US');
}

function findingHtml(f: AuditFinding): string {
  const color = SEVERITY_COLOR[f.severity] ?? SEVERITY_COLOR.info!;
  const evidence =
    f.evidence && f.evidence.length > 0
      ? `<div class="evidence">${f.evidence
          .map((e) => `${esc(e.file)}:${e.line} &middot; ${esc(e.patternClass)}`)
          .join('<br>')}</div>`
      : '';
  const quote = f.evidenceQuote
    ? `<pre class="quote">${esc(f.evidenceQuote.trim())}</pre>`
    : '';
  const related = f.relatedSkillName ? ` &harr; ${esc(f.relatedSkillName)}` : '';

  return `<div class="finding${f.source === 'reviewer' ? ' reviewer' : ''}">
  <div class="top">
    <span class="sev" style="color:${color}">${esc(f.severity)}</span>
    <span class="skill">${esc(f.skillName ?? 'whole catalog')}${related}</span>
    ${f.source === 'reviewer' ? '<span class="badge">reviewer</span>' : ''}
  </div>
  <p class="headline">${esc(f.headline)}</p>
  <div class="rule">${esc(f.rule)}</div>
  ${f.detail ? `<div class="detail">${esc(f.detail)}</div>` : ''}
  ${quote}
  ${evidence}
</div>`;
}

function dimensionSection(run: AuditRun, kind: AuditKind): string {
  const deterministic = run.deterministic.findings.filter((f) => f.audit === kind);
  const reviewer = run.reviewerFindings.filter((f) => f.audit === kind);
  const component = run.deterministic.score.components[kind];

  if (!run.audits.includes(kind)) return '';

  const body =
    deterministic.length === 0
      ? '<p class="footnote">No findings from the measured checks in this dimension.</p>'
      : deterministic.map(findingHtml).join('\n');

  const notes =
    reviewer.length === 0
      ? `<p class="footnote">No reviewer notes. The measured checks found what they found; nothing was added by judgment.</p>`
      : reviewer.map(findingHtml).join('\n');

  return `<section class="section page-break">
  <div class="section-head">
    <h2>${DIMENSION_TITLE[kind]}</h2>
    <span class="count">${component.score}/${component.max}</span>
  </div>
  <p>${DIMENSION_BLURB[kind]}</p>
  <div class="callout">${esc(component.basis)}</div>
  <h3>Measured</h3>
  ${body}
  <h3 style="margin-top:22px">Reviewer notes</h3>
  <p class="footnote" style="margin-top:0">Model judgment, each with the line it came from. These are excluded from the score.</p>
  ${notes}
</section>`;
}

export function renderReport(run: AuditRun): string {
  const { score, totals } = run.deterministic;
  const cost = totals.cost;
  const pct = Math.round((totals.listingTokens / totals.listingBudgetTokens) * 100);

  const weakest = Object.entries(score.components)
    .map(([name, c]) => ({ name, lost: c.max - c.score, c }))
    .sort((a, b) => b.lost - a.lost)
    .filter((x) => x.lost > 0)
    .slice(0, 2);

  const bars = Object.entries(score.components)
    .map(
      ([name, c]) => `<div class="bar">
      <span class="name">${esc(name)}</span>
      <span class="track"><span class="fill" style="width:${Math.round((c.score / c.max) * 100)}%"></span></span>
      <span class="num">${c.score}/${c.max}</span>
    </div>`,
    )
    .join('\n');

  const skillRows = run.skills
    .map(
      (s) => `<tr>
      <td class="mono">${esc(s.name)}</td>
      <td class="num${s.listingTokens > 140 ? ' over' : ''}">${n(s.listingTokens)}</td>
      <td class="num">${n(s.bodyTokens)}</td>
      <td class="num">${s.invocations === null ? '&mdash;' : n(s.invocations)}</td>
      <td class="num">${
        run.deterministic.findings.filter((f) => f.skillName === s.name).length +
        run.reviewerFindings.filter((f) => f.skillName === s.name).length
      }</td>
    </tr>`,
    )
    .join('\n');

  const dormantLine =
    cost.dormantMonthlyUsd === null
      ? 'No invocation data was supplied, so dormant cost is unknown rather than zero.'
      : `About <em>$${cost.dormantMonthlyUsd}</em> of that is spent listing skills that were never invoked.`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill health report &mdash; ${n(totals.skillCount)} skills, ${score.total}/100</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${fontFaceCss()}
${REPORT_CSS}</style>
</head><body><div class="wrap">

<div class="masthead">
  <span class="lockup">Atlan <b>Pulse</b></span>
  <span class="kicker">Skill health &middot; engine ${esc(score.engineVersion)}</span>
</div>

<section class="cover">
  <p class="eyebrow">Skill health report</p>
  <h1>${n(totals.skillCount)} skills, scored on what they cost and what they carry.</h1>
  <div class="byline">
    <div><dt>Score</dt><dd>${score.total}/100</dd></div>
    <div><dt>Band</dt><dd>${esc(score.band)}</dd></div>
    <div><dt>Dimensions</dt><dd>${run.audits.length}/5</dd></div>
    <div><dt>Generated</dt><dd>${esc(run.createdAt.slice(0, 10))}</dd></div>
    <div><dt>Engine</dt><dd>${esc(score.engineVersion)}</dd></div>
  </div>

  <div class="hero">
    <p class="big">These skills cost about <em>$${cost.monthlyUsd}</em> a month before one of them fires.</p>
    <p>${n(totals.listingTokens)} tokens of names and descriptions are carried on every prompt &mdash; ${pct}% of a ${n(totals.listingBudgetTokens)}-token budget. ${dormantLine}</p>
    <p class="assump">estimate &middot; ${cost.assumptions.turnsPerDay} turns/day &middot; ${cost.assumptions.daysPerMonth} days/month &middot; $${cost.assumptions.inputUsdPerMillionTokens}/M input tokens</p>
  </div>

  <div class="scoreblock">
    <div class="total">${score.total}<span>/100</span></div>
    <div class="bars">${bars}
      <div class="basis">${weakest.length === 0 ? 'Every dimension scored full marks.' : `Weakest: ${weakest.map((w) => `<strong>${esc(w.name)}</strong> &mdash; ${esc(w.c.basis)}`).join(' ')}`}</div>
    </div>
  </div>
</section>

<section class="section page-break">
  <div class="section-head"><h2>Summary</h2><span class="count">${run.deterministic.findings.length} measured &middot; ${run.reviewerFindings.length} reviewer</span></div>
  <table>
    <thead><tr><th>Dimension</th><th class="num">Score</th><th>What drove it</th></tr></thead>
    <tbody>
      ${Object.entries(score.components)
        .map(
          ([name, c]) =>
            `<tr><td class="mono">${esc(name)}</td><td class="num">${c.score}/${c.max}</td><td>${esc(c.basis)}</td></tr>`,
        )
        .join('\n')}
    </tbody>
  </table>
  <p class="footnote">Token counts are estimated with a consistent estimator rather than a BPE tokenizer; they are comparable between catalogs, and should not be quoted as a billing figure.</p>
</section>

${(['tokens', 'dedupe', 'security', 'vulnerability', 'improvement'] as AuditKind[])
  .map((k) => dimensionSection(run, k))
  .join('\n')}

<section class="section page-break">
  <div class="section-head"><h2>Every skill</h2><span class="count">${run.skills.length}</span></div>
  <table>
    <thead><tr><th>Skill</th><th class="num">Listing</th><th class="num">Body</th><th class="num">Invocations</th><th class="num">Findings</th></tr></thead>
    <tbody>${skillRows}</tbody>
  </table>
  <p class="footnote">Listing tokens are paid on every prompt. Body tokens are paid only when the skill runs. Invocation counts cover traffic through Pulse and nothing else.</p>
</section>

<section class="section page-break">
  <div class="section-head"><h2>Method</h2><span class="count">engine ${esc(score.engineVersion)}</span></div>
  <p>Every threshold is published so a finding can be argued with. A score is comparable only within one engine version, which is why the version is stamped on this page and on any card generated from this run.</p>
  <table>
    <thead><tr><th>Dimension</th><th class="num">Weight</th><th>Scored on</th></tr></thead>
    <tbody>
      <tr><td class="mono">tokens</td><td class="num">${SCORE_WEIGHTS.tokens}</td><td>Listing tokens against a ${n(LISTING_BUDGET_TOKENS)}-token budget. Full marks at or under; zero at 2.5&times;.</td></tr>
      <tr><td class="mono">dedupe</td><td class="num">${SCORE_WEIGHTS.dedupe}</td><td>Share of skills in no duplicate pair. Descriptions pair at ${Math.round(DESCRIPTION_SIMILARITY_THRESHOLD * 100)}% trigram overlap.</td></tr>
      <tr><td class="mono">security</td><td class="num">${SCORE_WEIGHTS.security}</td><td>Weighted security findings per skill (high &times;3, medium &times;1, low &times;0.25).</td></tr>
      <tr><td class="mono">vulnerability</td><td class="num">${SCORE_WEIGHTS.vulnerability}</td><td>The same weighting over supply-chain findings.</td></tr>
      <tr><td class="mono">improvement</td><td class="num">${SCORE_WEIGHTS.improvement}</td><td>Structure checks passed, discounted by the share unchanged for ${STALE_DAYS} days. SKILL.md ceiling ${n(BODY_LINE_LIMIT)} lines.</td></tr>
    </tbody>
  </table>
  <p class="footnote">Reviewer notes never touch the score. They arrive after it is written, and the scoring function raises an error if one reaches it.</p>
</section>

<section class="section page-break">
  <div class="section-head"><h2>What this report does not prove</h2></div>
  <div class="limits">
    <ul>
      <li><strong>A clean result means nothing hostile is visible in the text as shipped.</strong> It is not a safety guarantee, and no static audit can be one.</li>
      <li><strong>Scanners get evaded.</strong> Published research has defeated static skill scanners by packing payloads into directories scanners skip, by rewriting strings, and by fetching the real payload only at run time. Pulse reads dot-directories and reports fetch-at-run-time constructions; that closes part of the gap and not all of it.</li>
      <li><strong>Token counts are estimates.</strong> Consistent between catalogs, not identical to a tokenizer's.</li>
      <li><strong>The money figure is arithmetic on an assumption.</strong> The assumptions are printed next to it; change them and the number changes.</li>
      <li><strong>Invocation data covers traffic through Pulse only.</strong> A skill shown as never invoked may be running somewhere Pulse cannot see.</li>
      <li><strong>Reviewer notes are model judgment.</strong> Each carries the line it came from so you can check it. They are excluded from the score for exactly this reason.</li>
    </ul>
  </div>
  <p class="footnote">Skill text is not retained. This report was produced from the files as submitted; what persists is findings, counts, and a hash per skill.</p>
</section>

</div></body></html>`;
}
