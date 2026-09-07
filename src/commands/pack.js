// pack — turn the good half of your skills into something you can send.
//
// The report on its own ends in a diagnosis. This ends in a file plus one
// command, so sharing is an act of giving a teammate something useful rather
// than asking them for a favour.

import fs from 'node:fs';
import path from 'node:path';
import { scan } from '../index.js';
import { DEFAULTS } from '../lib/constants.js';
import { c } from '../render/terminal.js';
import { plural } from '../lib/text.js';

export const BUNDLE_FORMAT = 'atlan-pulse-bundle';

export function buildBundle(report, { top = DEFAULTS.PACK_TOP_N, only = [] } = {}) {
  let chosen = report.skills;

  if (only.length) {
    const wanted = new Set(only.map((s) => s.toLowerCase()));
    chosen = chosen.filter((s) => wanted.has(s.name.toLowerCase()) || wanted.has(s.dirName.toLowerCase()));
  } else {
    chosen = [...chosen]
      .sort((a, b) => {
        const byUse = (b.invocations || 0) - (a.invocations || 0);
        if (byUse !== 0) return byUse;
        return a.daysSinceModified - b.daysSinceModified;
      })
      .filter((s) => (report.hasInvocationData ? s.invocations > 0 : true))
      .slice(0, top);
  }

  const skills = chosen.map((s) => ({
    name: s.name,
    description: s.description,
    owner: s.owner,
    allowedTools: s.allowedTools,
    invocations: s.invocations,
    content: fs.readFileSync(s.path, 'utf8'),
  }));

  return {
    format: BUNDLE_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    generator: `atlan-pulse@${report.version}`,
    skills,
  };
}

export function runPack(options) {
  const report = scan(options);
  if (!report.skills.length) {
    console.log(`\n  ${c.pink('No skills found to pack.')}\n`);
    return 1;
  }

  const bundle = buildBundle(report, { top: options.top, only: options.only });
  if (!bundle.skills.length) {
    console.log(`\n  ${c.pink('Nothing matched.')} Nothing was written.\n`);
    return 1;
  }

  const out = path.resolve(options.out || 'atlan-pulse-bundle.json');
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2));

  const totalKb = Math.max(1, Math.round(fs.statSync(out).size / 1024));
  console.log('');
  console.log(`  ${c.blue('◆')} ${c.bold('Packed')} ${plural(bundle.skills.length, 'skill')} ${c.dim(`(${totalKb} KB)`)}`);
  console.log('');
  for (const s of bundle.skills) {
    console.log(c.muted(`     ${s.name}${s.invocations ? c.dim(`  — ${plural(s.invocations, 'invocation')}`) : ''}`));
  }
  console.log('');
  console.log(`  ${c.blue('→')} ${c.bold(out)}`);
  console.log('');
  console.log(c.dim('  Put that file anywhere your teammate can reach it — a gist, a PR, Slack —'));
  console.log(c.dim('  then send them one line:'));
  console.log('');
  console.log(`     ${c.cyan(`npx atlan-pulse install <url-to-the-json>`)}`);
  console.log('');
  console.log(c.dim('  Their install is the moment this stops being your private tooling.'));
  console.log('');
  return 0;
}
