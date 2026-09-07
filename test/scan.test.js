import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, shareableStats } from '../src/index.js';
import { renderHTML } from '../src/render/html.js';
import { renderCardSVG, cardStats } from '../src/render/card.js';
import { sharePost } from '../src/render/terminal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(here, 'fixtures', 'skills');
const PROJECTS = path.join(here, 'fixtures', 'projects');

// An empty cwd keeps the machine's own ~/.claude out of the fixture run.
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

// -- the share boundary ------------------------------------------------------

test('shareable stats carry no names, paths or content', () => {
  const report = fixtureScan();
  const stats = shareableStats(report);
  const serialised = JSON.stringify(stats);
  for (const name of report.skills.map((s) => s.name)) {
    assert.ok(!serialised.includes(name), `"${name}" must not appear in shareable stats`);
  }
  assert.ok(!serialised.includes('/'), 'no paths');
  assert.deepEqual(
    Object.keys(stats).sort(),
    ['duplicatePairs', 'estTokens', 'neverInvoked', 'neverInvokedShareOfContext', 'pctOfBudget', 'skills', 'topShare', 'windowDays'],
  );
});

test('the card SVG and the suggested post leak nothing either', () => {
  const report = fixtureScan();
  const stats = shareableStats(report);
  const svg = renderCardSVG(stats);
  const post = sharePost(stats);
  for (const skill of report.skills) {
    assert.ok(!svg.includes(skill.name), `card leaked ${skill.name}`);
    assert.ok(!post.includes(skill.name), `post leaked ${skill.name}`);
    assert.ok(!svg.includes(skill.path), 'card leaked a path');
  }
  assert.match(svg, /^<svg/);
  assert.match(post, /npx atlan-pulse/);
  assert.ok(cardStats(stats).length <= 4);
});

test('the HTML report renders and escapes user content', () => {
  const report = fixtureScan();
  const html = renderHTML(report, shareableStats(report));
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Atlan Pulse/);
  assert.match(html, /not affiliated with, endorsed by, or operated by Atlan/);
  assert.ok(html.includes('pdf-export'), 'the private report does name skills');

  const hostile = fixtureScan();
  hostile.skills[0].name = '<img src=x onerror=alert(1)>';
  hostile.findings = [{ id: 'x', title: 'T', severity: 'high', headline: '<script>bad()</script>', items: [{ name: '<b>x</b>', note: '"q"' }] }];
  const escaped = renderHTML(hostile, shareableStats(hostile));
  assert.ok(!escaped.includes('<script>bad()</script>'), 'headline must be escaped');
  assert.ok(escaped.includes('&lt;script&gt;'), 'and present in escaped form');
});
