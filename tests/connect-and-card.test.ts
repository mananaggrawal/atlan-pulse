import { describe, it, expect } from 'vitest';
import { AccountStore, mintToken } from '../src/store/accounts.ts';
import { renderCardHtml } from '../src/report/card.ts';
import { connectPage, landingPage } from '../src/report/pages.ts';
import { AuditService } from '../src/server/service.ts';
import { MemoryRunStore, toPublicCard } from '../src/store/runs.ts';

describe('connection tokens', () => {
  it('mints a prefixed token and stores only its hash', async () => {
    const store = new AccountStore();
    const { account, token } = await store.create();

    expect(token.startsWith('pulse_')).toBe(true);
    expect(account.tokenSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(account)).not.toContain(token);
  });

  it('verifies the right token and rejects everything else', async () => {
    const store = new AccountStore();
    const { account, token } = await store.create();

    expect(store.verify(token)?.accountId).toBe(account.accountId);
    expect(store.verify(`${token}x`)).toBeNull();
    expect(store.verify(mintToken().token)).toBeNull();
    expect(store.verify(undefined)).toBeNull();
    expect(store.verify('')).toBeNull();
  });

  it('keeps accounts apart', async () => {
    const store = new AccountStore();
    const a = await store.create();
    const b = await store.create();
    expect(store.verify(a.token)!.accountId).not.toBe(store.verify(b.token)!.accountId);
  });
});

describe('the card', () => {
  it('renders the numbers and none of the names', async () => {
    const store = new MemoryRunStore();
    const service = new AuditService(store, 'https://pulse.test');
    const started = await service.start({
      accountId: 'acct',
      skills: [
        {
          name: 'client-billing-secret-sauce',
          path: '~/.claude/skills/x',
          description: 'Use when the user asks about the Northwind account.',
          body: 'Open the Northwind ledger.\n',
          files: [],
        },
      ],
    });
    await service.finish(started.runId, { publish: true });

    const card = toPublicCard((await store.get(started.runId))!)!;
    const html = renderCardHtml(card);

    expect(html).not.toContain('client-billing-secret-sauce');
    expect(html).not.toContain('Northwind');
    expect(html).toContain(String(card.total));
    expect(html).toContain('Share the score, never the skill.');
  });
});

describe('the public pages', () => {
  it('gives the connect page both install routes', () => {
    const html = connectPage('https://pulse.test');
    expect(html).toContain('/plugin marketplace add https://pulse.test');
    expect(html).toContain('/plugin install atlan-pulse');
    expect(html).toContain('https://pulse.test/api/mcp');
    expect(html).toContain('audit my skills');
  });

  it('states the limits on the landing page, not only in the report', () => {
    const html = landingPage('https://pulse.test');
    expect(html).toMatch(/not a safety guarantee/i);
    expect(html).toMatch(/never stored|not stored/i);
  });
});
