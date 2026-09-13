import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Accounts and connection tokens.
 *
 * Deliberately the smallest thing that is not a lie about security:
 *
 * - A token is 32 random bytes, shown once, and **stored only as a SHA-256**.
 *   A leaked store does not hand anyone a working connection.
 * - Comparison is constant-time. Token checks are the one place in this
 *   codebase where timing matters.
 * - Reports are capability URLs — a random v4 run id, unguessable, no login
 *   needed to open one you were given. That is a deliberate trade: a person
 *   who has the link can read the report, which is what makes a report
 *   shareable with a colleague without an account. Cards are the same, one
 *   level more public, and carry no names at all.
 *
 * What this is not: OAuth. A hosted Pulse should speak MCP's OAuth 2.1 flow so
 * the desktop client can connect without anyone copying a string around. The
 * token below is the honest interim — it works today, and the surface it
 * occupies (`requireAccount`) is the one an OAuth implementation replaces.
 */

export interface Account {
  accountId: string;
  tokenSha256: string;
  createdAt: string;
  label: string;
}

export function mintToken(): { token: string; sha256: string } {
  const token = `pulse_${randomBytes(32).toString('base64url')}`;
  return { token, sha256: createHash('sha256').update(token).digest('hex') };
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class AccountStore {
  private accounts = new Map<string, Account>();
  private file: string | null;

  constructor(dir?: string) {
    this.file = dir ? join(dir, 'accounts.json') : null;
  }

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = await readFile(this.file, 'utf8');
      for (const a of JSON.parse(raw) as Account[]) this.accounts.set(a.accountId, a);
    } catch {
      // No file yet: first boot.
    }
  }

  private async persist(): Promise<void> {
    if (!this.file) return;
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(this.file, JSON.stringify([...this.accounts.values()], null, 2), 'utf8');
  }

  async create(label = 'Claude'): Promise<{ account: Account; token: string }> {
    const { token, sha256 } = mintToken();
    const account: Account = {
      accountId: randomBytes(9).toString('base64url'),
      tokenSha256: sha256,
      createdAt: new Date().toISOString(),
      label,
    };
    this.accounts.set(account.accountId, account);
    await this.persist();
    return { account, token };
  }

  /** Returns the account a bearer token belongs to, or null. */
  verify(token: string | undefined): Account | null {
    if (!token) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    for (const account of this.accounts.values()) {
      if (sameHash(account.tokenSha256, hash)) return account;
    }
    return null;
  }

  size(): number {
    return this.accounts.size;
  }
}
