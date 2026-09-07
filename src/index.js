// Scan orchestration: adapter → engine → report model.
// Every renderer and the --json output consume the same model.

import { readFileSync } from 'node:fs';
import { collectSkills, collectInvocations, attachInvocations } from './adapters/local.js';
import { runChecks } from './engine.js';
import { DEFAULTS, listingBudgetTokens, estimateTokens } from './lib/constants.js';

// Single source of truth. Hardcoding this drifted once already: package.json
// said 0.1.4 while every report footer printed v0.1.0.
export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

export function scan(options = {}) {
  const opts = {
    cwd: options.cwd ?? process.cwd(),
    extraDirs: options.extraDirs ?? [],
    transcriptDir: options.transcriptDir ?? null,
    windowDays: options.windowDays ?? DEFAULTS.WINDOW_DAYS,
    staleDays: options.staleDays ?? DEFAULTS.STALE_DAYS,
    duplicateThreshold: options.duplicateThreshold ?? DEFAULTS.NEAR_DUPLICATE_THRESHOLD,
    logo: options.logo ?? null,
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
