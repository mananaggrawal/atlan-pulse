// Scan orchestration: adapter → engine → report model.
// Every renderer and the --json output consume the same model.

import { collectSkills, collectInvocations, attachInvocations } from './adapters/local.js';
import { runChecks } from './engine.js';
import { DEFAULTS, listingBudgetTokens, estimateTokens } from './lib/constants.js';

export const VERSION = '0.1.0';

export function scan(options = {}) {
  const opts = {
    cwd: options.cwd ?? process.cwd(),
    extraDirs: options.extraDirs ?? [],
    transcriptDir: options.transcriptDir ?? null,
    windowDays: options.windowDays ?? DEFAULTS.WINDOW_DAYS,
    staleDays: options.staleDays ?? DEFAULTS.STALE_DAYS,
    duplicateThreshold: options.duplicateThreshold ?? DEFAULTS.NEAR_DUPLICATE_THRESHOLD,
  };

  const { skills, roots } = collectSkills({ cwd: opts.cwd, extraDirs: opts.extraDirs });
  const { counts, lastSeen, report: transcripts } = collectInvocations({
    transcriptDir: opts.transcriptDir,
    windowDays: opts.windowDays,
  });

  const hasInvocationData = transcripts.available && transcripts.eventsFound > 0;
  if (transcripts.available) attachInvocations(skills, counts, lastSeen);

  const findings = runChecks({ skills, hasInvocationData, options: opts });

  const descriptionChars = skills.reduce((n, s) => n + s.descriptionChars, 0);
  const estTokens = estimateTokens(descriptionChars);
  const budgetTokens = listingBudgetTokens();
  const totalInvocations = skills.reduce((n, s) => n + (s.invocations || 0), 0);
  const neverInvoked = hasInvocationData ? skills.filter((s) => s.invocations === 0).length : null;
  const deadChars = hasInvocationData
    ? skills.filter((s) => s.invocations === 0).reduce((n, s) => n + s.descriptionChars, 0)
    : 0;

  const ranked = [...skills].sort((a, b) => (b.invocations || 0) - (a.invocations || 0));
  const topShare = hasInvocationData && totalInvocations
    ? Math.round((ranked.slice(0, 3).reduce((n, s) => n + s.invocations, 0) / totalInvocations) * 100)
    : null;

  const duplicateFinding = findings.find((f) => f.id === 'near-duplicate');

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    options: opts,
    hasInvocationData,
    transcripts,
    roots,
    skills,
    findings,
    totals: {
      skills: skills.length,
      descriptionChars,
      estTokens,
      budgetTokens,
      pctOfBudget: budgetTokens ? Math.round((estTokens / budgetTokens) * 100) : 0,
      totalInvocations,
      neverInvoked,
      neverInvokedShareOfContext:
        hasInvocationData && descriptionChars ? Math.round((deadChars / descriptionChars) * 100) : null,
      topShare,
      duplicatePairs: duplicateFinding?.items?.length ?? 0,
      ownerless: skills.filter((s) => !s.owner).length,
    },
  };
}

/**
 * Derived rollups the report leans on. Kept here rather than in the renderer
 * so --json carries the same numbers a reader sees on the page.
 */
export function breakdowns(report) {
  const { skills, hasInvocationData } = report;

  const bySource = [];
  for (const skill of skills) {
    let row = bySource.find((r) => r.label === skill.sourceLabel);
    if (!row) {
      row = { label: skill.sourceLabel, source: skill.source, count: 0, chars: 0, invocations: 0, unused: 0 };
      bySource.push(row);
    }
    row.count += 1;
    row.chars += skill.descriptionChars;
    row.invocations += skill.invocations || 0;
    if (hasInvocationData && skill.invocations === 0) row.unused += 1;
  }
  bySource.sort((a, b) => b.count - a.count);

  const total = report.totals.totalInvocations;
  const leaderboard = [...skills]
    .filter((s) => (s.invocations || 0) > 0)
    .sort((a, b) => b.invocations - a.invocations)
    .map((s, i) => ({
      rank: i + 1,
      name: s.name,
      invocations: s.invocations,
      share: total ? Math.round((s.invocations / total) * 1000) / 10 : 0,
      lastInvokedAt: s.lastInvokedAt,
      daysSinceModified: s.daysSinceModified,
      owner: s.owner,
      sourceLabel: s.sourceLabel,
    }));

  const unused = skills
    .filter((s) => hasInvocationData && s.invocations === 0)
    .sort((a, b) => b.descriptionChars - a.descriptionChars)
    .map((s) => ({
      name: s.name,
      descriptionChars: s.descriptionChars,
      daysSinceModified: s.daysSinceModified,
      owner: s.owner,
      sourceLabel: s.sourceLabel,
    }));

  const owners = [];
  for (const skill of skills) {
    const key = skill.owner || null;
    let row = owners.find((o) => o.owner === key);
    if (!row) { row = { owner: key, count: 0, invocations: 0 }; owners.push(row); }
    row.count += 1;
    row.invocations += skill.invocations || 0;
  }
  owners.sort((a, b) => b.count - a.count);

  const busFactor = owners.length
    ? Math.round((Math.max(...owners.filter((o) => o.owner).map((o) => o.count), 0) / skills.length) * 100)
    : 0;

  return { bySource, leaderboard, unused, owners, busFactor };
}

/**
 * The concrete "do this" list. Generated from findings rather than written,
 * so it can never disagree with the numbers above it.
 */
export function recommendations(report, rolled) {
  const out = [];
  const t = report.totals;

  if (rolled.unused.length) {
    const chars = rolled.unused.reduce((n, s) => n + s.descriptionChars, 0);
    out.push({
      action: `Archive or delete ${rolled.unused.length} never-invoked skill${rolled.unused.length === 1 ? '' : 's'}`,
      why: `Reclaims roughly ${estimateTokens(chars).toLocaleString()} tokens on every request. Nothing calls them today.`,
      effort: 'minutes',
    });
  }
  const dupes = report.findings.find((f) => f.id === 'near-duplicate');
  if (dupes?.items?.length) {
    out.push({
      action: `Reconcile ${dupes.items.length} likely-duplicate pair${dupes.items.length === 1 ? '' : 's'}`,
      why: 'Two skills describing the same job make the model choose, and it will not always choose the one you meant.',
      effort: 'an hour',
    });
  }
  const risky = report.findings.find((f) => f.id === 'risky-permissions');
  if (risky?.items?.length) {
    out.push({
      action: `Read ${risky.items.length} skill${risky.items.length === 1 ? ' that declares' : 's that declare'} broad permissions before sharing`,
      why: 'These can run commands, reach the network, or delete things. Anyone you send them to inherits that.',
      effort: 'minutes',
    });
  }
  const over = report.findings.find((f) => f.id === 'oversized-description');
  if (over?.items?.length) {
    out.push({
      action: `Trim ${over.items.length} oversized description${over.items.length === 1 ? '' : 's'}`,
      why: 'Past the listing limit the text risks truncation, and the description is what the model reads when deciding to use a skill at all.',
      effort: 'minutes',
    });
  }
  if (t.ownerless) {
    out.push({
      action: `Add an owner to ${t.ownerless} skill${t.ownerless === 1 ? '' : 's'}`,
      why: 'Cosmetic on one laptop. The moment a second person depends on one of these, it decides who fixes it.',
      effort: 'minutes',
    });
  }
  if (rolled.leaderboard.length) {
    const top = rolled.leaderboard.slice(0, 3);
    const drifting = top.filter((s) => s.daysSinceModified > report.options.staleDays);
    if (drifting.length) {
      out.push({
        action: `Review your ${drifting.length} most-used skill${drifting.length === 1 ? '' : 's'} for drift`,
        why: `Heavily invoked and untouched for over ${report.options.staleDays} days is where quietly-wrong instructions live.`,
        effort: 'an hour',
      });
    }
  }
  return out;
}
