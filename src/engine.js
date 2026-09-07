// The engine. Takes facts, runs every registered check, returns findings.
//
// Adding a check is: write a module in src/checks that exports
// { id, title, severity, run(ctx) }, then add one import line below.
// That is on purpose — the live-extension part of a demo should be boring.

import contextCost from './checks/context-cost.js';
import neverInvoked from './checks/never-invoked.js';
import concentration from './checks/concentration.js';
import oversizedDescription from './checks/oversized-description.js';
import stale from './checks/stale.js';
import orphaned from './checks/orphaned.js';
import nearDuplicate from './checks/near-duplicate.js';
import riskyPermissions from './checks/risky-permissions.js';

export const CHECKS = [
  contextCost,
  neverInvoked,
  concentration,
  riskyPermissions,
  nearDuplicate,
  oversizedDescription,
  stale,
  orphaned,
];

const SEVERITY_RANK = { high: 0, medium: 1, low: 2, info: 3 };

/**
 * @param {object} ctx
 * @param {Array} ctx.skills
 * @param {boolean} ctx.hasInvocationData
 * @param {object} ctx.options
 */
export function runChecks(ctx) {
  const findings = [];
  for (const check of CHECKS) {
    let result;
    try {
      result = check.run(ctx);
    } catch (err) {
      findings.push({
        id: check.id,
        title: check.title,
        severity: 'info',
        skipped: true,
        headline: `Check failed to run: ${err.message}`,
        items: [],
      });
      continue;
    }
    if (!result) continue;
    findings.push({ id: check.id, title: check.title, items: [], ...result });
  }

  // context-cost is the headline and always leads, regardless of severity —
  // it is the number that reframes everything below it.
  findings.sort((a, b) => {
    if (a.id === 'context-cost') return -1;
    if (b.id === 'context-cost') return 1;
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (b.items?.length || 0) - (a.items?.length || 0);
  });
  return findings;
}
