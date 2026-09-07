import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/index.js';
import { buildBundle } from '../src/commands/pack.js';
import { validateBundle, slugify, runInstall } from '../src/commands/install.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(here, 'fixtures', 'skills');
const PROJECTS = path.join(here, 'fixtures', 'projects');
// See scan.test.js: mtimes do not survive a git clone.
before(() => {
  const stale = path.join(SKILLS, 'legacy-thing', 'SKILL.md');
  const d = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(stale, d, d);
});

const report = () => scan({ cwd: path.join(here, 'fixtures'), extraDirs: [SKILLS], transcriptDir: PROJECTS });

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));

test('pack ranks by invocations and excludes never-invoked skills', () => {
  const bundle = buildBundle(report(), { top: 3 });
  assert.equal(bundle.format, 'atlan-pulse-bundle');
  assert.equal(bundle.skills[0].name, 'pdf-export', 'most invoked goes first');
  assert.ok(!bundle.skills.some((s) => s.name === 'never-used'), 'do not ship a teammate dead skills');
  assert.ok(bundle.skills.every((s) => s.content.includes('---')), 'full file content travels');
});

test('pack --only selects by name', () => {
  const bundle = buildBundle(report(), { only: ['bash-runner'] });
  assert.deepEqual(bundle.skills.map((s) => s.name), ['bash-runner']);
});

test('validateBundle rejects anything that is not one of ours', () => {
  assert.throws(() => validateBundle(null), /not an object/i);
  assert.throws(() => validateBundle({ format: 'something-else', skills: [] }), /Not an Atlan Pulse bundle/);
  assert.throws(() => validateBundle({ format: 'atlan-pulse-bundle', skills: [] }), /no skills/i);
  assert.throws(
    () => validateBundle({ format: 'atlan-pulse-bundle', skills: [{ name: 'x' }] }),
    /no content/i,
  );
});

test('slugify defuses path traversal in skill names', () => {
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugify('/absolute/path'), 'absolute-path');
  assert.equal(slugify('Nice Name'), 'nice-name');
  assert.ok(!slugify('../../x').includes('..'));
});

test('a bundle with a traversal name cannot escape the target directory', async () => {
  const dir = tmp();
  const bundlePath = path.join(dir, 'b.json');
  fs.writeFileSync(
    bundlePath,
    JSON.stringify({
      format: 'atlan-pulse-bundle',
      version: 1,
      skills: [{ name: '../../../../tmp/pwned', description: 'no', content: '---\nname: x\n---\nhi' }],
    }),
  );
  const into = path.join(dir, 'skills');
  const code = await runInstall(bundlePath, { into, yes: true });
  assert.equal(code, 0);
  assert.ok(!fs.existsSync('/tmp/pwned'), 'must not have escaped');
  const written = fs.readdirSync(into);
  assert.deepEqual(written, ['tmp-pwned'], 'name was flattened into a safe slug');
});

test('install writes SKILL.md files and nothing else, and skips existing', async () => {
  const dir = tmp();
  const into = path.join(dir, 'skills');
  const bundlePath = path.join(dir, 'b.json');
  fs.writeFileSync(bundlePath, JSON.stringify(buildBundle(report(), { top: 2 })));

  assert.equal(await runInstall(bundlePath, { into, yes: true }), 0);
  const dirs = fs.readdirSync(into).sort();
  assert.ok(dirs.length === 2);
  for (const d of dirs) {
    assert.deepEqual(fs.readdirSync(path.join(into, d)), ['SKILL.md']);
  }

  // second run without --force changes nothing
  const before = fs.readFileSync(path.join(into, dirs[0], 'SKILL.md'), 'utf8');
  fs.writeFileSync(path.join(into, dirs[0], 'SKILL.md'), 'LOCAL EDIT');
  await runInstall(bundlePath, { into, yes: true });
  assert.equal(fs.readFileSync(path.join(into, dirs[0], 'SKILL.md'), 'utf8'), 'LOCAL EDIT', 'existing file untouched');

  await runInstall(bundlePath, { into, yes: true, force: true });
  assert.equal(fs.readFileSync(path.join(into, dirs[0], 'SKILL.md'), 'utf8'), before, '--force restores');
});

test('install refuses plain http', async () => {
  const code = await runInstall('http://example.com/bundle.json', { into: tmp(), yes: true });
  assert.equal(code, 1);
});
