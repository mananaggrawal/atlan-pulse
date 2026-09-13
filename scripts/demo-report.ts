/**
 * End-to-end proof: read real skill folders, run the audit, add the reviewer
 * findings a real run would produce, and write the report and the PDF.
 *
 * Usage: node --experimental-strip-types scripts/demo-report.ts <skillsRoot> [outDir]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readSkillRoots } from '../src/loader/read-skills.ts';
import { AuditService } from '../src/server/service.ts';
import { MemoryRunStore } from '../src/store/runs.ts';
import { renderReport } from '../src/report/render.ts';
import { htmlToPdf } from '../src/report/pdf.ts';

const root = process.argv[2];
const outDir = resolve(process.argv[3] ?? 'out');
if (!root) {
  console.error('usage: demo-report.ts <skillsRoot> [outDir]');
  process.exit(2);
}

const skills = await readSkillRoots([root]);
const store = new MemoryRunStore();
const service = new AuditService(store, 'https://skillhealth.dev');

const started = await service.start({ accountId: 'local', skills });
console.log(`${skills.length} skills · ${started.score.total}/100 · $${started.totals.cost.monthlyUsd}/mo est.`);

// A reviewer pass would go here. Two representative findings so the report
// renders both halves; a real run's come from the model answering the rubric.
const first = skills[0]!;
await service.submit(started.runId, [
  {
    check: 'trigger-quality',
    skillName: first.name,
    severity: 'low',
    headline: 'Trigger names the artifact but not the moment the user asks for it',
    evidenceQuote: first.description.slice(0, 160),
    detail: 'Demo reviewer finding, included so the report renders the reviewer half.',
  },
]);

const finished = await service.finish(started.runId, { publish: true });
const run = (await store.get(started.runId))!;
const html = renderReport(run);

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'report.html'), html, 'utf8');
const pdf = await htmlToPdf(html, {
  executablePath: process.env.PULSE_CHROMIUM,
  footer: `Atlan Pulse · skill health · ${run.deterministic.score.total}/100 · engine ${run.engineVersion}`,
});
await writeFile(join(outDir, 'report.pdf'), pdf);

console.log(`report  ${join(outDir, 'report.html')}`);
console.log(`pdf     ${join(outDir, 'report.pdf')} (${Math.round(pdf.length / 1024)} KB)`);
console.log(`card    ${finished.cardUrl}`);
