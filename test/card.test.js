import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, breakdowns } from '../src/index.js';
import { cardModel, renderCard } from '../src/render/card.js';
import { RUN_COMMAND } from '../src/lib/constants.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(here, 'fixtures', 'skills');
const PROJECTS = path.join(here, 'fixtures', 'projects');

const STALE_FIXTURE = path.join(SKILLS, 'legacy-thing', 'SKILL.md');
const STALE_DATE = new Date('2020-01-01T00:00:00Z');
before(() => {
  fs.utimesSync(STALE_FIXTURE, STALE_DATE, STALE_DATE);
});

const withUsage = () =>
  scan({ cwd: path.join(here, 'fixtures'), extraDirs: [SKILLS], transcriptDir: PROJECTS });

// No transcript directory means no invocation data, which every surface has to
// respect rather than estimate around.
const withoutUsage = () =>
  scan({ cwd: path.join(here, 'fixtures'), extraDirs: [SKILLS], transcriptDir: path.join(here, 'fixtures', 'nope') });

test('leads on never-run when usage is known', () => {
  const report = withUsage();
  const model = cardModel(report, breakdowns(report));
  assert.equal(model.lead, '6 skills installed.');
  assert.equal(model.turn, '2 of them have never run.');
  assert.match(model.post, /npx atlan-pulse/, 'suggested post must carry a command that runs');
});

test('claims nothing about usage when there are no transcripts', () => {
  const report = withoutUsage();
  assert.equal(report.hasInvocationData, false);

  const model = cardModel(report, breakdowns(report));
  const everything = JSON.stringify(model);
  assert.doesNotMatch(everything, /never run/i, 'cannot know what never ran');
  assert.doesNotMatch(everything, /invocation/i, 'cannot know invocation counts');
  assert.match(model.turn, /tokens on every request/);
});

// The whole reason anyone posts this is that it gives away a score and not the
// library behind it. If a skill name ever reaches the card, that promise breaks.
test('never puts a skill name on the card', () => {
  const report = withUsage();
  const model = cardModel(report, breakdowns(report));
  const surface = JSON.stringify(model);

  for (const skill of report.skills) {
    assert.ok(!surface.includes(skill.name), `card leaked skill name: ${skill.name}`);
  }
});

test('renders a self-contained page carrying the command and the post', () => {
  const report = withUsage();
  const html = renderCard(report, breakdowns(report));

  assert.match(html, /<canvas/);
  assert.ok(html.includes(RUN_COMMAND), 'card carries the runnable command');
  assert.doesNotMatch(html, /<script src=/, 'no third-party script tags');

  for (const skill of report.skills) {
    assert.ok(!html.includes(skill.name), `card page leaked skill name: ${skill.name}`);
  }
});

test('flattens pattern fills so a logo actually rasterises on canvas', () => {
  const report = withUsage();
  const html = renderCard(report, breakdowns(report));
  // A <pattern> that survived into the payload would paint nothing on a canvas.
  assert.doesNotMatch(html, /\\u003cpattern/i);
  assert.doesNotMatch(html, /url\(#/);
});

// The card is the acquisition surface. A command that 404s is worse here than
// anywhere else in the tool, because the person posting it cannot see it fail.
test('the card and its post carry a command that actually resolves', () => {
  const report = withUsage();
  const model = cardModel(report, breakdowns(report));
  const html = renderCard(report, breakdowns(report));

  assert.ok(model.post.includes(RUN_COMMAND));
  assert.ok(html.includes(RUN_COMMAND));
  // atlan-pulse@0.1.0 is on the npm registry as of 2026-09-07, so the bare
  // command resolves. Before that it did not, and this assertion was inverted:
  // it required the github: prefix and banned the bare form.
  assert.match(model.post, /\bnpx atlan-pulse\b/);
  assert.doesNotMatch(model.post, /github:/, 'no longer needs the repo prefix');
});
