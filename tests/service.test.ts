import { describe, it, expect } from 'vitest';
import { AuditService } from '../src/server/service.ts';
import { MemoryRunStore, toPublicCard } from '../src/store/runs.ts';
import type { AuditSkillInput } from '../src/engine/index.ts';

const SECRET_BODY = 'Set the key:\nAPI_KEY = "AKIAIOSFODNN7EXAMPLE"\nthen run it.\n';

function skill(over: Partial<AuditSkillInput> = {}): AuditSkillInput {
  return {
    name: 'invoice-chaser',
    path: '~/.claude/skills/invoice-chaser',
    description: 'Use when the user asks to chase an invoice.',
    body: 'Ask for the client name, then draft the reminder.\n',
    owners: ['manan@example.com'],
    files: [],
    ...over,
  };
}

function svc() {
  const store = new MemoryRunStore();
  return { store, service: new AuditService(store, 'https://pulse.test') };
}

describe('the three-call shape', () => {
  it('fixes the score at start, and reviewer findings cannot move it', async () => {
    const { store, service } = svc();
    const started = await service.start({ accountId: 'acct', skills: [skill()] });
    const before = started.score.total;

    await service.submit(started.runId, [
      {
        check: 'trigger-quality',
        skillName: 'invoice-chaser',
        headline: 'Trigger does not name the moment',
        evidenceQuote: 'Use when the user asks to chase an invoice.',
      },
    ]);

    const run = await store.get(started.runId);
    expect(run!.reviewerFindings).toHaveLength(1);
    expect(run!.deterministic.score.total).toBe(before);
    const finished = await service.finish(started.runId);
    expect(finished.score).toBe(before);
  });

  it('hands back a rubric for exactly the dimensions that ran', async () => {
    const { service } = svc();
    const started = await service.start({ accountId: 'acct', skills: [skill()], audits: ['security', 'dedupe'] });
    expect(started.rubric.map((s) => s.audit).sort()).toEqual(['dedupe', 'security']);
  });
});

describe('reviewer findings are validated, not trusted', () => {
  it('rejects an invented check name', async () => {
    const { service } = svc();
    const s = await service.start({ accountId: 'acct', skills: [skill()] });
    const out = await service.submit(s.runId, [
      { check: 'vibes', skillName: 'invoice-chaser', headline: 'Feels wrong', evidenceQuote: 'x' },
    ]);
    expect(out.accepted).toBe(0);
    expect(out.rejected[0]!.reason).toMatch(/unknown check/);
  });

  it('rejects a finding with no quote', async () => {
    const { service } = svc();
    const s = await service.start({ accountId: 'acct', skills: [skill()] });
    const out = await service.submit(s.runId, [
      { check: 'trigger-quality', skillName: 'invoice-chaser', headline: 'Weak trigger', evidenceQuote: '  ' },
    ]);
    expect(out.rejected[0]!.reason).toMatch(/evidenceQuote/);
  });

  it('rejects a finding about a skill that was not in the run', async () => {
    const { service } = svc();
    const s = await service.start({ accountId: 'acct', skills: [skill()] });
    const out = await service.submit(s.runId, [
      { check: 'trigger-quality', skillName: 'something-else', headline: 'x', evidenceQuote: 'y' },
    ]);
    expect(out.rejected[0]!.reason).toMatch(/not in this run/);
  });

  it('refuses to accept findings once the run is finished', async () => {
    const { service } = svc();
    const s = await service.start({ accountId: 'acct', skills: [skill()] });
    await service.finish(s.runId);
    await expect(
      service.submit(s.runId, [
        { check: 'trigger-quality', skillName: 'invoice-chaser', headline: 'x', evidenceQuote: 'y' },
      ]),
    ).rejects.toThrow(/finished/);
  });
});

describe('PRIVACY CONTRACT', () => {
  it('never stores a skill body, only a hash of it', async () => {
    const { store, service } = svc();
    const started = await service.start({ accountId: 'acct', skills: [skill({ body: SECRET_BODY })] });
    const stored = JSON.stringify(await store.get(started.runId));

    expect(stored).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(stored).not.toContain('draft the reminder');
    expect(stored).toMatch(/"bodySha256":"[a-f0-9]{64}"/);
  });

  it('keeps skill names out of a published card', async () => {
    const { store, service } = svc();
    const started = await service.start({ accountId: 'acct', skills: [skill({ name: 'client-billing-secret-sauce' })] });
    await service.finish(started.runId, { publish: true });
    const card = toPublicCard((await store.get(started.runId))!);

    expect(JSON.stringify(card)).not.toContain('client-billing-secret-sauce');
    expect(card!.total).toBeGreaterThan(0);
    expect(card!.slug).toHaveLength(12);
  });

  it('mints a slug only on publish, and clears it when not published', async () => {
    const { store, service } = svc();
    const a = await service.start({ accountId: 'acct', skills: [skill()] });
    await service.finish(a.runId);
    expect((await store.get(a.runId))!.slug).toBeNull();
    expect(toPublicCard((await store.get(a.runId))!)).toBeNull();
  });

  it('suppresses a percentile until there are enough published runs', async () => {
    const { service } = svc();
    const s = await service.start({ accountId: 'acct', skills: [skill()] });
    const out = await service.finish(s.runId, { publish: true });
    expect(out.percentile).toBeNull();
  });
});
