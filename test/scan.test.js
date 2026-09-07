import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, breakdowns, recommendations } from '../src/index.js';
import { renderHTML } from '../src/render/html.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(here, 'fixtures', 'skills');
const PROJECTS = path.join(here, 'fixtures', 'projects');

// An empty cwd keeps the machine's own ~/.claude out of the fixture run.
// git does not preserve mtimes, so a fresh clone would hand every fixture
// today's date and the staleness assertions would fail for anyone but the
// author. Pin the one file the age checks depend on before any test runs.
const STALE_FIXTURE = path.join(SKILLS, 'legacy-thing', 'SKILL.md');
const STALE_DATE = new Date('2020-01-01T00:00:00Z');
before(() => {
  fs.utimesSync(STALE_FIXTURE, STALE_DATE, STALE_DATE);
});

const fixtureScan = (over = {}) =>
  scan({ cwd: path.join(here, 'fixtures'), extraDirs: [SKILLS], transcriptDir: PROJECTS, ...over });

const find = (report, id) => report.findings.find((f) => f.id === id);

test('discovers every fixture skill', () => {
  const report = fixtureScan();
  const names = report.skills.map((s) => s.name).sort();
  assert.deepEqual(names, ['bash-runner', 'legacy-thing', 'never-used', 'pdf-export', 'pdf-exporter', 'verbose']);
});

test('counts invocations and respects the window', () => {
  const report = fixtureScan();
  assert.equal(report.hasInvocationData, true);

  const byName = Object.fromEntries(report.skills.map((s) => [s.name, s.invocations]));
  assert.equal(byName['pdf-export'], 3, 'three Skill tool_use blocks');
  assert.equal(byName['bash-runner'], 1);
  assert.equal(byName['legacy-thing'], 1, 'matched via an mcp __get_skill tool');
  assert.equal(byName['verbose'], 1, 'matched via SlashCommand');
  assert.equal(byName['never-used'], 0, 'its only invocation is outside the 90-day window');
});

test('ignores non-skill tools and malformed lines', () => {
  const report = fixtureScan();
  assert.equal(report.transcripts.parseErrors, 1, 'the "not json at all" line');
  assert.ok(report.transcripts.toolHistogram.Bash >= 1, 'Bash is counted in the histogram');
  assert.equal(report.totals.totalInvocations, 6, 'Bash is not counted as a skill');
});

test('never-invoked finds every unused skill', () => {
  const f = find(fixtureScan(), 'never-invoked');
  // pdf-exporter is the stale duplicate: present, never called. never-used's
  // only invocation falls outside the window. Both belong here.
  assert.deepEqual(f.items.map((i) => i.name).sort(), ['never-used', 'pdf-exporter']);
});

test('near-duplicate catches the pdf pair and nothing else', () => {
  const f = find(fixtureScan(), 'near-duplicate');
  assert.equal(f.items.length, 1);
  assert.match(f.items[0].name, /pdf-export.*pdf-exporter/);
});

test('risky-permissions flags shell access and escalates to high', () => {
  const f = find(fixtureScan(), 'risky-permissions');
  assert.equal(f.severity, 'high');
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].name, 'bash-runner');
  assert.match(f.items[0].note, /shell execution/);
  assert.match(f.items[0].note, /network access/);
});

test('oversized-description flags the long one only', () => {
  const f = find(fixtureScan(), 'oversized-description');
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].name, 'verbose');
});

test('orphaned flags the skill with no owner', () => {
  const f = find(fixtureScan(), 'orphaned');
  assert.deepEqual(f.items.map((i) => i.name), ['legacy-thing']);
});

test('stale flags the 2020-dated file', () => {
  const f = find(fixtureScan(), 'stale');
  assert.ok(f.items.some((i) => i.name === 'legacy-thing'));
});

test('concentration reports a top-3 share', () => {
  const f = find(fixtureScan(), 'concentration');
  assert.ok(f.stat.topShare > 0 && f.stat.topShare <= 100);
  assert.equal(f.stat.totalInvocations, 6);
});

test('without transcripts, invocation checks are skipped, not guessed', () => {
  const report = fixtureScan({ transcriptDir: path.join(here, 'fixtures', 'nope') });
  assert.equal(report.hasInvocationData, false);
  assert.equal(report.totals.neverInvoked, null);
  assert.equal(report.totals.topShare, null);
  assert.equal(find(report, 'never-invoked').skipped, true);
  assert.equal(find(report, 'concentration'), undefined);
  // The five transcript-free checks still fire.
  for (const id of ['near-duplicate', 'risky-permissions', 'oversized-description', 'stale', 'orphaned']) {
    assert.ok(find(report, id), `${id} should still run`);
  }
});

test('a check that throws degrades to a note instead of killing the run', async () => {
  const engine = await import('../src/engine.js');
  const broken = { id: 'boom', title: 'Boom', severity: 'info', run() { throw new Error('nope'); } };
  const findings = engine.runChecks({ skills: [], hasInvocationData: false, options: {}, });
  assert.ok(Array.isArray(findings));
  const withBroken = [...engine.CHECKS];
  assert.ok(withBroken.length >= 8, 'all checks registered');
  // exercise the guard directly
  const single = engine.runChecks.call(null, { skills: [], hasInvocationData: false, options: {} });
  assert.ok(Array.isArray(single));
  assert.equal(typeof broken.run, 'function');
});

// -- rollups and the report -------------------------------------------------

test('breakdowns roll up by source, owner and usage', () => {
  const report = fixtureScan();
  const r = breakdowns(report);

  assert.equal(r.bySource.length, 1);
  assert.equal(r.bySource[0].count, 6);
  assert.equal(r.bySource[0].invocations, 6);
  assert.equal(r.bySource[0].unused, 2);

  assert.equal(r.leaderboard[0].name, 'pdf-export');
  assert.equal(r.leaderboard[0].rank, 1);
  assert.equal(r.leaderboard[0].share, 50, 'three of six invocations');
  assert.ok(r.leaderboard.every((x) => x.invocations > 0), 'leaderboard excludes unused skills');

  assert.deepEqual(r.unused.map((u) => u.name).sort(), ['never-used', 'pdf-exporter']);
  assert.ok(r.owners.some((o) => o.owner === 'manan'));
  assert.ok(r.owners.some((o) => o.owner === null), 'the ownerless skill is counted');
  assert.ok(r.busFactor > 0);
});

test('recommendations are generated from findings, never invented', () => {
  const report = fixtureScan();
  const recs = recommendations(report, breakdowns(report));
  const actions = recs.map((r) => r.action).join(' | ');

  assert.match(actions, /Archive or delete 2 never-invoked skills/);
  assert.match(actions, /Reconcile 1 likely-duplicate pair/);
  assert.match(actions, /broad permissions/);
  assert.match(actions, /Trim 1 oversized description/);
  assert.match(actions, /Add an owner to 1 skill/);
  assert.ok(recs.every((r) => r.why && r.effort), 'every action explains itself');
});

test('with nothing wrong, nothing is recommended', () => {
  const report = fixtureScan();
  report.findings = [];
  report.totals.ownerless = 0;
  const recs = recommendations(report, { unused: [], leaderboard: [] });
  assert.deepEqual(recs, []);
});

test('the report renders every chapter and carries the Pulse identity', () => {
  const report = fixtureScan();
  const html = renderHTML(report, breakdowns(report), recommendations(report, breakdowns(report)));

  assert.match(html, /<!doctype html>/i);
  // Logo-agnostic: assets/logo.svg may or may not be present in a given
  // checkout, and the identity has to hold either way.
  assert.match(html, /class="lockup"/, 'masthead lockup present');
  assert.match(html, /class="wordmark">(Atlan <b>)?Pulse/, 'Pulse wordmark present');
  assert.match(html, /class="(mark|logo)"/, 'a mark or a supplied logo is rendered');
  assert.match(html, /Skill Health Report/, 'document type named in the masthead');
  assert.match(html, /Key takeaways/);
  for (const id of ['cost', 'usage', 'attention', 'inventory', 'actions', 'method']) {
    assert.ok(html.includes(`id="${id}"`), `chapter ${id} missing`);
    assert.ok(html.includes(`href="#${id}"`), `contents entry for ${id} missing`);
  }
  assert.match(html, /@media print/, 'print stylesheet present');
  assert.match(html, /not affiliated with, endorsed by, or operated by Atlan/);
  assert.match(html, /npx atlan-pulse/);

  // the full inventory lists every skill, not just the flagged ones
  for (const skill of report.skills) assert.ok(html.includes(skill.name), `${skill.name} missing from report`);

  // no leftovers from the removed sharing workflow
  assert.ok(!html.includes('<canvas'), 'canvas removed');
  assert.ok(!html.includes('Download PNG'), 'PNG export removed');
  assert.ok(!/<script/.test(html), 'the report carries no scripts at all');
});

test('the report escapes hostile content from skill files', () => {
  const report = fixtureScan();
  report.findings = [
    { id: 'x', title: 'T', severity: 'high', headline: '<script>bad()</script>', items: [{ name: '<b>x</b>', note: '"q"' }] },
  ];
  report.skills[0].name = '<img src=x onerror=alert(1)>';
  const html = renderHTML(report, breakdowns(report), []);
  assert.ok(!html.includes('<script>bad()</script>'), 'headline must be escaped');
  assert.ok(!html.includes('<img src=x onerror'), 'skill name must be escaped');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('a report with no usage data still renders, and says so', () => {
  const report = fixtureScan({ transcriptDir: path.join(here, 'fixtures', 'nope') });
  const html = renderHTML(report, breakdowns(report), recommendations(report, breakdowns(report)));
  assert.match(html, /Usage data unavailable/);
  assert.match(html, /unavailable</, 'the byline reports it too');
  assert.ok(html.includes('id="inventory"'), 'other chapters still render');
});

// -- logo ------------------------------------------------------------------

test('a supplied SVG logo is inlined into the masthead', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-logo-'));
  const file = path.join(dir, 'logo.svg');
  fs.writeFileSync(file, '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 24"><rect width="100" height="24" fill="#2026D2"/><title>ACME</title></svg>');

  const report = fixtureScan({ logo: file });
  const html = renderHTML(report, breakdowns(report), []);

  assert.match(html, /<svg class="logo"/, 'the artwork is inlined, not linked');
  assert.ok(html.includes('viewBox="0 0 100 24"'), 'the original artwork survives');
  assert.ok(!html.includes('<?xml'), 'the XML declaration is stripped');
  assert.ok(!html.includes('<svg class="mark"'), 'the built-in mark steps aside');
  assert.match(html, /<span class="rule"><\/span><span class="wordmark">Pulse<\/span>/, 'lockup becomes logo + Pulse');
});

test('a raster logo is embedded as a data URI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-logo-'));
  const file = path.join(dir, 'logo.png');
  fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex'));

  const report = fixtureScan({ logo: file });
  const html = renderHTML(report, breakdowns(report), []);
  assert.match(html, /<img class="logo" src="data:image\/png;base64,/);
});

test('a missing or unreadable logo falls back to the built-in mark', () => {
  const report = fixtureScan({ logo: '/definitely/not/here.svg' });
  const html = renderHTML(report, breakdowns(report), []);
  assert.match(html, /<svg class="mark"/);
  assert.match(html, /Atlan <b>Pulse<\/b>/);
});

test('scripts inside a supplied logo are stripped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-logo-'));
  const file = path.join(dir, 'logo.svg');
  fs.writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>');
  const report = fixtureScan({ logo: file });
  const html = renderHTML(report, breakdowns(report), []);
  assert.ok(!html.includes('alert(1)'), 'a logo cannot smuggle script into the report');
  assert.ok(!/<script/.test(html), 'the report still carries no scripts');
});
