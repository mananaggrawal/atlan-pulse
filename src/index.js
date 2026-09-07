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

/** The aggregate-only numbers that are safe to publish. No names, no content. */
export function shareableStats(report) {
  const t = report.totals;
  return {
    skills: t.skills,
    neverInvoked: t.neverInvoked,
    topShare: t.topShare,
    pctOfBudget: t.pctOfBudget,
    neverInvokedShareOfContext: t.neverInvokedShareOfContext,
    duplicatePairs: t.duplicatePairs,
    estTokens: t.estTokens,
    windowDays: report.options.windowDays,
  };
}
