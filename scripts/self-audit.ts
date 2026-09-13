/**
 * Pulse audits Pulse.
 *
 * Run in CI. If our own skills stop scoring 100, the build fails — a product
 * that grades skill libraries cannot ship a sloppy one, and the cheapest way
 * to guarantee that is to make it impossible to merge.
 *
 * Usage:
 *   node --experimental-strip-types scripts/self-audit.ts [skillsRoot ...]
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readSkillRoots } from '../src/loader/read-skills.ts';
import { runDeterministicAudit } from '../src/engine/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const roots = process.argv.slice(2);
const selfCheck = roots.length === 0;
const targets = selfCheck ? [resolve(here, '../plugin/skills')] : roots;

const skills = await readSkillRoots(targets);
if (skills.length === 0) {
  console.error(`No skills found under: ${targets.join(', ')}`);
  process.exit(2);
}

const result = runDeterministicAudit(skills);
const { score, totals } = result;

const pct = Math.round((totals.listingTokens / totals.listingBudgetTokens) * 100);
console.log(`\nPulse ${score.total}/100  (${score.band})   engine ${score.engineVersion}`);
console.log(`${skills.length} skills · ${totals.listingTokens.toLocaleString()} listing tokens (${pct}% of budget) · ~$${totals.cost.monthlyUsd}/mo est.\n`);

for (const [kind, c] of Object.entries(score.components)) {
  console.log(`  ${kind.padEnd(14)} ${String(c.score).padStart(5)}/${c.max}   ${c.basis}`);
}

if (result.findings.length > 0) {
  console.log('\nFindings');
  for (const f of result.findings) {
    console.log(`  [${f.severity}] ${f.check} — ${f.skillName ?? 'catalog'}: ${f.headline}`);
  }
}

if (selfCheck) {
  const blocking = result.findings.filter((f) => f.severity !== 'info');
  if (score.total < 100 || blocking.length > 0) {
    console.error(
      `\nFAIL: Pulse's own skills scored ${score.total}/100 with ${blocking.length} finding(s). ` +
        `Fix the skills, not the threshold.`,
    );
    process.exit(1);
  }
  console.log('\nOK: Pulse passes its own audit.');
}
