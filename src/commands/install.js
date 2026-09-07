// install — the teammate side.
//
// Deliberately conservative. A skill bundle is a file someone sends you, which
// makes this the one command with a trust problem, so: it writes Markdown and
// nothing else, it refuses names that could escape the skills directory, it
// prints exactly what it is about to do, and it asks first.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { BUNDLE_FORMAT } from './pack.js';
import { c } from '../render/terminal.js';

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')   // separators and anything exotic become dashes
    .replace(/\.{2,}/g, '')            // ".." can never survive, in any position
    .replace(/^[.\-]+|[.\-]+$/g, '')   // no leading dot: no hidden dirs, no traversal
    .replace(/-{2,}/g, '-')
    .slice(0, 64);
}

export function validateBundle(data) {
  if (!data || typeof data !== 'object') throw new Error('Bundle is not an object.');
  if (data.format !== BUNDLE_FORMAT) throw new Error(`Not an Atlan Pulse bundle (format: ${data.format ?? 'missing'}).`);
  if (!Array.isArray(data.skills) || !data.skills.length) throw new Error('Bundle contains no skills.');

  return data.skills.map((s, i) => {
    if (typeof s?.content !== 'string' || !s.content.trim()) throw new Error(`Skill #${i + 1} has no content.`);
    const slug = slugify(s.name || '');
    if (!slug || !SAFE_NAME.test(slug)) throw new Error(`Skill #${i + 1} has an unusable name: ${JSON.stringify(s.name)}`);
    return { ...s, slug };
  });
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    if (!/^https:\/\//i.test(source)) throw new Error('Refusing to download over plain HTTP. Use an https URL.');
    const res = await fetch(source, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return await res.text();
  }
  return fs.readFileSync(path.resolve(source), 'utf8');
}

export async function runInstall(source, options = {}) {
  const targetRoot = path.resolve(options.into || path.join(os.homedir(), '.claude', 'skills'));

  let skills;
  try {
    skills = validateBundle(JSON.parse(await readSource(source)));
  } catch (err) {
    console.log(`\n  ${c.pink('Could not read that bundle.')}  ${err.message}\n`);
    return 1;
  }

  const plan = skills.map((s) => {
    const dir = path.join(targetRoot, s.slug);
    const file = path.join(dir, 'SKILL.md');
    // Belt and braces: the slug is already validated, this catches anything exotic.
    if (!file.startsWith(targetRoot + path.sep)) throw new Error(`Refusing to write outside ${targetRoot}`);
    return { ...s, dir, file, exists: fs.existsSync(file) };
  });

  console.log('');
  console.log(`  ${c.blue('◆')} ${c.bold('Atlan Pulse')} ${c.dim('· install')}`);
  console.log('');
  console.log(`  ${plan.length} skill${plan.length === 1 ? '' : 's'} from ${c.bold(source)}`);
  console.log(c.dim(`  into ${targetRoot}`));
  console.log('');
  for (const p of plan) {
    const status = p.exists ? (options.force ? c.pink('overwrite') : c.muted('skip, exists')) : c.cyan('new');
    console.log(`     ${p.slug.padEnd(28)} ${status}`);
    if (p.description) console.log(c.dim(`       ${p.description.slice(0, 88)}`));
  }
  console.log('');
  console.log(c.dim('  Markdown files only. Nothing is executed, now or later.'));
  console.log('');

  const toWrite = plan.filter((p) => !p.exists || options.force);
  if (!toWrite.length) {
    console.log(`  ${c.muted('Everything is already installed. Use --force to overwrite.')}\n`);
    return 0;
  }

  if (!options.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`  Write ${toWrite.length} file${toWrite.length === 1 ? '' : 's'}? [y/N] `)).trim().toLowerCase();
    rl.close();
    if (answer !== 'y' && answer !== 'yes') {
      console.log(`\n  ${c.muted('Nothing written.')}\n`);
      return 0;
    }
  }

  for (const p of toWrite) {
    fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.file, p.content);
  }

  console.log('');
  console.log(`  ${c.blue('→')} Installed ${toWrite.length} skill${toWrite.length === 1 ? '' : 's'} into ${c.bold(targetRoot)}`);
  console.log(c.dim('  Run  npx atlan-pulse  to see how they land in your own context budget.'));
  console.log('');
  return 0;
}
