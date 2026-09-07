// Skills declare the tools they are allowed to reach. A skill that can run a
// shell or reach the network is one you should have read before installing —
// and most people install skills they have not read.
// Deliberately narrow. An earlier version flagged any skill declaring Write,
// which fired on almost every skill and so told you nothing. What is left is
// the set where "you should read this file before installing it" is true:
// running commands, reaching the network, and deleting things.
const RISKY = [
  { match: /^bash$|shell|execute|run_command|terminal/i, label: 'shell execution' },
  { match: /webfetch|websearch|fetch|http|curl|network/i, label: 'network access' },
  { match: /delete|remove|rm\b|destroy/i, label: 'deletion' },
];

import { plural, agrees } from '../lib/text.js';

export default {
  id: 'risky-permissions',
  title: 'Declared tool access',
  severity: 'medium',
  run({ skills }) {
    const flagged = [];
    for (const skill of skills) {
      const reasons = new Set();
      for (const tool of skill.allowedTools) {
        for (const rule of RISKY) if (rule.match.test(tool)) reasons.add(rule.label);
      }
      if (reasons.size) flagged.push({ skill, reasons: [...reasons] });
    }
    if (!flagged.length) return null;

    const shellCount = flagged.filter((f) => f.reasons.includes('shell execution')).length;
    return {
      severity: shellCount ? 'high' : 'medium',
      headline: `${plural(flagged.length, 'skill')} ${agrees(flagged.length, 'declares', 'declare')} shell, network or deletion tools${shellCount ? `; ${shellCount} of them shell execution` : ''}.`,
      rule: 'declared tool name matches shell, network or deletion patterns',
      detail: 'Read from the declared allowed-tools frontmatter only. Not a security scan: it cannot see what a skill does at runtime.',
      items: flagged.map((f) => ({
        name: f.skill.name,
        note: f.reasons.join(', '),
        path: f.skill.relPath,
      })),
    };
  },
};
