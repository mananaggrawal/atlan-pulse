import type {
  AuditFinding,
  AuditKind,
  AuditOptions,
  AuditSkillInput,
  CostEstimate,
  DeterministicAuditResult,
} from './types.ts';
import { ALL_AUDITS, SEVERITY_ORDER } from './types.ts';
import { COST_ASSUMPTIONS, ENGINE_VERSION, LISTING_BUDGET_TOKENS } from './constants.ts';
import { checkContextCost } from './checks/context-cost.ts';
import { checkStructure } from './checks/structure.ts';
import { checkFreshness } from './checks/freshness.ts';
import { checkUsage } from './checks/usage.ts';
import { checkAuthoring } from './checks/authoring.ts';
import { checkSimilarity } from './checks/similarity.ts';
import { checkSecrets } from './checks/secrets.ts';
import { checkToolAccess } from './checks/tool-access.ts';
import { checkRemoteFetch } from './checks/remote-fetch.ts';
import { checkPermissionBypass } from './checks/permission-bypass.ts';
import { checkSupplyChain } from './checks/supply-chain.ts';
import { computeScore } from './score.ts';
import { listingTokensFor } from './tokens.ts';

export * from './types.ts';
export * from './constants.ts';
export { estimateTokens, listingTokensFor } from './tokens.ts';
export { computeScore, bandFor, assertDeterministicOnly } from './score.ts';
export { shannonEntropy } from './checks/secrets.ts';
export { classifyTools, splitToolName } from './checks/tool-access.ts';
export { jaccard } from './checks/similarity.ts';

/**
 * Findings sort by severity, then by audit, then by skill name — so the same
 * input always produces the same array in the same order. Anything less and
 * two runs of an identical catalog would diff, which is exactly the property
 * the score depends on.
 */
function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.audit.localeCompare(b.audit) ||
      a.check.localeCompare(b.check) ||
      (a.skillName ?? '').localeCompare(b.skillName ?? '') ||
      (a.relatedSkillName ?? '').localeCompare(b.relatedSkillName ?? ''),
  );
}

/**
 * Listing tokens turned into money.
 *
 * Deliberately simple arithmetic, with every assumption returned alongside
 * the answer. The estimate is only ever as good as `turnsPerDay`, which
 * varies enormously between users — so the product's job is to show the
 * assumption next to the number, not to hide it behind a confident figure.
 */
function estimateCost(
  listingTokens: number,
  dormantListingTokens: number | null,
  overrides: Partial<CostEstimate['assumptions']> = {},
): CostEstimate {
  const assumptions = { ...COST_ASSUMPTIONS, ...overrides };
  const perMonth = (tokens: number) =>
    Math.round(
      ((tokens * assumptions.turnsPerDay * assumptions.daysPerMonth) / 1_000_000) *
        assumptions.inputUsdPerMillionTokens *
        100,
    ) / 100;

  return {
    monthlyUsd: perMonth(listingTokens),
    assumptions,
    dormantMonthlyUsd: dormantListingTokens === null ? null : perMonth(dormantListingTokens),
  };
}

/**
 * Run the deterministic half of an audit.
 *
 * The score is always computed over the dimensions that actually ran. A
 * dimension that did not run scores full marks and says so, which is correct
 * but means a partial run's total is not comparable with a full run's. Only
 * full runs may be published as a card.
 */
export function runDeterministicAudit(
  skills: AuditSkillInput[],
  options: AuditOptions = {},
): DeterministicAuditResult {
  const audits: AuditKind[] = options.audits?.length
    ? [...new Set(options.audits)].sort()
    : [...ALL_AUDITS];
  const budget = options.listingBudgetTokens ?? LISTING_BUDGET_TOKENS;
  const now = options.now ?? new Date();

  const findings: AuditFinding[] = [];

  let listingTokens = 0;
  let bodyTokens = 0;
  let referenceTokens = 0;
  let skillsWithoutOwner = 0;
  let staleSkills = 0;
  let neverInvoked: number | null = null;
  let structureAttempted = 0;
  let structurePassed = 0;
  let duplicatePairs = 0;
  let skillsInPairs = new Set<string>();
  let secretFindings = 0;
  let supplyChainFindings = 0;

  // The listing cost is measured whenever it is needed — by the tokens
  // dimension for its own findings, and by the cost estimate regardless.
  const cost = checkContextCost(skills, budget);
  listingTokens = cost.listingTokens;
  bodyTokens = cost.bodyTokens;

  if (audits.includes('tokens')) {
    findings.push(...cost.findings);

    const usage = checkUsage(skills);
    findings.push(...usage.findings);
    neverInvoked = usage.neverInvoked;
  }

  if (audits.includes('improvement')) {
    const structure = checkStructure(skills);
    findings.push(...structure.findings);
    skillsWithoutOwner = structure.skillsWithoutOwner;
    structureAttempted = structure.attempted;
    structurePassed = structure.passed;

    const fresh = checkFreshness(skills, now);
    findings.push(...fresh.findings);
    staleSkills = fresh.staleSkills;

    const authoring = checkAuthoring(skills);
    findings.push(...authoring.findings);
    referenceTokens = authoring.referenceTokens;
  }

  if (audits.includes('dedupe')) {
    const sim = checkSimilarity(skills);
    findings.push(...sim.findings);
    duplicatePairs = sim.duplicatePairs;
    skillsInPairs = sim.skillsInPairs;
  }

  if (audits.includes('security')) {
    const secrets = checkSecrets(skills);
    findings.push(...secrets.findings);
    secretFindings = secrets.secretFindings;

    findings.push(...checkToolAccess(skills).findings);
    findings.push(...checkRemoteFetch(skills).findings);
    findings.push(...checkPermissionBypass(skills).findings);
  }

  if (audits.includes('vulnerability')) {
    const supply = checkSupplyChain(skills);
    findings.push(...supply.findings);
    supplyChainFindings = supply.supplyChainFindings;
  }

  const sorted = sortFindings(findings);

  const score = computeScore({
    skillCount: skills.length,
    listingTokens,
    listingBudgetTokens: budget,
    structureAttempted,
    structurePassed,
    staleSkills,
    skillsInDuplicatePairs: skillsInPairs.size,
    findings: sorted,
    audits,
  });

  const withTelemetry = skills.filter((s) => typeof s.invocations === 'number');
  const dormantListingTokens =
    withTelemetry.length === 0
      ? null
      : withTelemetry
          .filter((s) => s.invocations === 0)
          .reduce((n, s) => n + listingTokensFor(s.name, s.description), 0);

  return {
    engineVersion: ENGINE_VERSION,
    audits,
    findings: sorted,
    totals: {
      skillCount: skills.length,
      listingTokens,
      listingBudgetTokens: budget,
      bodyTokens,
      referenceTokens,
      duplicatePairs,
      secretFindings,
      supplyChainFindings,
      skillsWithoutOwner,
      staleSkills,
      neverInvoked,
      cost: estimateCost(listingTokens, dormantListingTokens, options.cost),
    },
    score,
  };
}
