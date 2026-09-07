#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { scan, breakdowns, recommendations, VERSION } from './index.js';
import { renderTerminal, c } from './render/terminal.js';
import { renderHTML } from './render/html.js';
import { runPack } from './commands/pack.js';
import { runInstall } from './commands/install.js';
import { DEFAULTS } from './lib/constants.js';

const HELP = `
  ${c.blue('◆')} ${c.bold('Atlan Pulse')} ${c.dim(`v${VERSION}`)}  — skill health for Claude Code and Codex

  ${c.bold('USAGE')}
    npx atlan-pulse                    scan this machine, write a report
    npx atlan-pulse pack               bundle your best skills to send someone
    npx atlan-pulse install <url>      install a bundle someone sent you

  ${c.bold('SCAN')}
    --dir <path>          also scan this directory (repeatable)
    --transcripts <path>  session transcript directory
                          ${c.dim('(default: ~/.claude/projects)')}
    --days <n>            invocation window, default ${DEFAULTS.WINDOW_DAYS}
    --stale-days <n>      staleness threshold, default ${DEFAULTS.STALE_DAYS}
    --out <path>          report path, default ./atlan-pulse-report.html
    --logo <path>         logo for the report masthead (svg/png)
                          ${c.dim('(or drop one at assets/logo.svg)')}
    --json                print the raw report model instead
    --debug-transcripts   show what was found in the transcripts and stop

  ${c.bold('PACK')}
    --top <n>             how many skills, default ${DEFAULTS.PACK_TOP_N}
    --only <a,b,c>        pack these skills by name instead
    --out <path>          default ./atlan-pulse-bundle.json

  ${c.bold('INSTALL')}
    --into <path>         default ~/.claude/skills
    --yes                 skip the confirmation prompt
    --force               overwrite skills that already exist

  Everything runs locally. Nothing is uploaded.
`;

const OPTIONS = {
  dir: { type: 'string', multiple: true, default: [] },
  transcripts: { type: 'string' },
  days: { type: 'string' },
  'stale-days': { type: 'string' },
  out: { type: 'string' },
  logo: { type: 'string' },
  json: { type: 'boolean', default: false },
  'debug-transcripts': { type: 'boolean', default: false },
  top: { type: 'string' },
  only: { type: 'string' },
  into: { type: 'string' },
  yes: { type: 'boolean', default: false },
  force: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
};

function debugTranscripts(report) {
  const t = report.transcripts;
  console.log('');
  console.log(`  ${c.blue('◆')} ${c.bold('Transcripts')}`);
  console.log('');
  for (const s of t.searched ?? []) {
    console.log(`     ${s.found ? c.cyan('·') : c.muted('✗')} ${s.found ? s.dir : c.muted(s.dir)}`);
  }
  console.log('');
  console.log(`     files read      ${t.filesRead.toLocaleString()}`);
  console.log(`     lines read      ${t.linesRead.toLocaleString()}`);
  console.log(`     parse errors    ${t.parseErrors.toLocaleString()}`);
  console.log(`     window          ${t.windowDays} days`);
  console.log(`     skill events    ${c.bold(t.eventsFound.toLocaleString())}`);
  console.log(`     matched via     ${Object.keys(t.signatures).join(', ') || c.muted('nothing matched')}`);
  console.log('');

  const exts = Object.entries(t.seenExtensions ?? {}).sort((a, b) => b[1] - a[1]);
  if (exts.length) {
    console.log(c.dim('  Files seen in those directories, by extension:'));
    console.log('');
    for (const [ext, count] of exts) console.log(`     ${String(count).padStart(7)}  ${ext}`);
    console.log('');
  }
  if (t.sensitiveSkipped) {
    console.log(c.dim(`  ${t.sensitiveSkipped} file(s) look like keys or credentials. They were not opened,`));
    console.log(c.dim('  and their names are withheld from this output on purpose.'));
    console.log('');
  }
  if (t.skippedFiles) {
    console.log(c.dim(`  ${t.skippedFiles} file(s) were not read because the extension is not .json or .jsonl:`));
    console.log('');
    for (const f of t.sampleSkipped ?? []) console.log(c.muted(`     ${f}`));
    console.log('');
    console.log(c.dim('  If those are transcripts, tell me the format and the reader can be'));
    console.log(c.dim('  taught it — the walker is in collectInvocations, src/adapters/local.js.'));
    console.log('');
  }

  const tools = Object.entries(t.toolHistogram).sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (tools.length) {
    console.log(c.dim('  Tool names seen in these transcripts (top 25):'));
    console.log('');
    for (const [name, n] of tools) console.log(`     ${String(n).padStart(7)}  ${name}`);
  } else {
    console.log(c.muted('  No tool_use blocks were found at all.'));
  }
  console.log('');
  if (!t.eventsFound) {
    console.log(c.dim('  No skill invocations matched. If a tool name above is how skills are'));
    console.log(c.dim('  invoked on this version, add it to SKILL_TOOL_NAMES in'));
    console.log(c.dim('  src/adapters/local.js — that is the only place it is encoded.'));
    console.log('');
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({ options: OPTIONS, allowPositionals: true, args: process.argv.slice(2) });
  } catch (err) {
    console.log(`\n  ${c.pink(err.message)}\n  Try ${c.bold('npx atlan-pulse --help')}\n`);
    return 1;
  }
  const { values: v, positionals } = parsed;

  if (v.version) { console.log(VERSION); return 0; }
  if (v.help) { console.log(HELP); return 0; }

  const command = positionals[0] || 'scan';
  const scanOptions = {
    extraDirs: v.dir ?? [],
    transcriptDir: v.transcripts ?? null,
    windowDays: Number(v.days) || DEFAULTS.WINDOW_DAYS,
    staleDays: Number(v['stale-days']) || DEFAULTS.STALE_DAYS,
    logo: v.logo ?? null,
  };

  if (command === 'help') { console.log(HELP); return 0; }

  if (command === 'pack') {
    return runPack({
      ...scanOptions,
      top: Number(v.top) || DEFAULTS.PACK_TOP_N,
      only: v.only ? v.only.split(',').map((s) => s.trim()).filter(Boolean) : [],
      out: v.out,
    });
  }

  if (command === 'install') {
    const source = positionals[1];
    if (!source) {
      console.log(`\n  ${c.pink('Give me a bundle to install.')}\n  ${c.dim('npx atlan-pulse install <url-or-path>')}\n`);
      return 1;
    }
    return await runInstall(source, { into: v.into, yes: v.yes, force: v.force });
  }

  if (command !== 'scan') {
    console.log(`\n  ${c.pink(`Unknown command: ${command}`)}\n  Try ${c.bold('npx atlan-pulse --help')}\n`);
    return 1;
  }

  const report = scan(scanOptions);

  if (v['debug-transcripts']) { debugTranscripts(report); return 0; }

  const rolled = breakdowns(report);
  const recs = recommendations(report, rolled);

  if (v.json) {
    const { skills, ...rest } = report;
    console.log(
      JSON.stringify(
        { ...rest, skills: skills.map(({ frontmatter, ...s }) => s), breakdowns: rolled, recommendations: recs },
        null,
        2,
      ),
    );
    return 0;
  }

  let reportPath = null;
  if (report.totals.skills) {
    reportPath = path.resolve(v.out || 'atlan-pulse-report.html');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderHTML(report, rolled, recs));
  }

  console.log(renderTerminal(report, { reportPath, recs }));
  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(`\n  ${c.pink('Something went wrong.')}  ${err.message}\n`);
    if (process.env.PULSE_DEBUG) console.error(err.stack);
    process.exit(1);
  });
