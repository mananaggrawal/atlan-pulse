import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { AuditFinding, DeterministicAuditResult, AuditSkillInput } from '../engine/types.ts';
import { estimateTokens, listingTokensFor } from '../engine/tokens.ts';

/**
 * Run storage.
 *
 * Two things about this file are product decisions, not implementation
 * details.
 *
 * **1. Skill bodies are never stored.** The engine gets the text, produces
 * findings, and the text is dropped. What persists is findings, counts, the
 * score, and a SHA-256 of each skill so a later run can say "this one
 * changed" without ever having kept a copy. The people this product is for
 * publish skills as their livelihood and will not hand the source to a server
 * to be graded — the architecture has to make that promise true rather than
 * the marketing copy claiming it.
 *
 * **2. A published card carries no names.** `toPublicCard` builds the public
 * object field by field, never by spreading a run. A spread is one careless
 * property away from leaking a skill name into a public URL.
 *
 * The backing store is a directory of JSON files. That is deliberate for now:
 * it deploys anywhere with a disk, and every method here is narrow enough to
 * put a real database behind later without touching a caller.
 */

export interface SkillDigest {
  name: string;
  /** SHA-256 of the body, so a re-run can detect change without keeping text. */
  bodySha256: string;
  listingTokens: number;
  bodyTokens: number;
  invocations: number | null;
}

export type RunStatus = 'open' | 'finished';

export interface AuditRun {
  runId: string;
  /** Which connection produced this run. Reports stay capability URLs. */
  accountId: string;
  createdAt: string;
  finishedAt: string | null;
  status: RunStatus;
  engineVersion: string;
  audits: string[];
  skills: SkillDigest[];
  deterministic: DeterministicAuditResult;
  /** Added after the score is written, and never folded back into it. */
  reviewerFindings: AuditFinding[];
  published: boolean;
  /** Minted on publish, cleared on unpublish. Published ⇔ slug is non-null. */
  slug: string | null;
}

/** A card is the only thing that ever leaves the account. It carries numbers. */
export interface PublicCard {
  slug: string;
  engineVersion: string;
  total: number;
  band: string;
  components: Array<{ name: string; score: number; max: number }>;
  skillCount: number;
  listingTokens: number;
  listingBudgetTokens: number;
  monthlyUsd: number;
  createdAt: string;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * Fixed-length slugs from a fixed alphabet. An earlier version base64url-encoded
 * random bytes and then stripped `-` and `_`, which produced variable-length
 * ids — shorter ones are more guessable, and a public card URL is the one
 * place that matters.
 */
export function mintSlug(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * What survives a run: a name, a hash, two counts. Enough to tell the user
 * next month that a skill changed, and not enough to reconstruct a line of it.
 */
export function digestSkills(skills: AuditSkillInput[]): SkillDigest[] {
  return skills.map((s) => ({
    name: s.name,
    bodySha256: sha256(s.body),
    listingTokens: listingTokensFor(s.name, s.description),
    bodyTokens: estimateTokens(s.body),
    invocations: s.invocations ?? null,
  }));
}

/**
 * The ONLY constructor of a public card. Field by field, never a spread — see
 * the note at the top of this file. There is a test asserting that no skill
 * name can appear in the output of this function.
 */
export function toPublicCard(run: AuditRun): PublicCard | null {
  if (!run.published || !run.slug) return null;
  const s = run.deterministic.score;
  return {
    slug: run.slug,
    engineVersion: s.engineVersion,
    total: s.total,
    band: s.band,
    components: Object.entries(s.components).map(([name, c]) => ({
      name,
      score: c.score,
      max: c.max,
    })),
    skillCount: run.deterministic.totals.skillCount,
    listingTokens: run.deterministic.totals.listingTokens,
    listingBudgetTokens: run.deterministic.totals.listingBudgetTokens,
    monthlyUsd: run.deterministic.totals.cost.monthlyUsd,
    createdAt: run.createdAt,
  };
}

export interface RunStore {
  create(run: AuditRun): Promise<AuditRun>;
  get(runId: string): Promise<AuditRun | null>;
  update(runId: string, patch: Partial<AuditRun>): Promise<AuditRun>;
  bySlug(slug: string): Promise<AuditRun | null>;
  publishedCount(): Promise<number>;
}

export class MemoryRunStore implements RunStore {
  protected runs = new Map<string, AuditRun>();

  async create(run: AuditRun): Promise<AuditRun> {
    this.runs.set(run.runId, run);
    return run;
  }
  async get(runId: string): Promise<AuditRun | null> {
    return this.runs.get(runId) ?? null;
  }
  async update(runId: string, patch: Partial<AuditRun>): Promise<AuditRun> {
    const current = this.runs.get(runId);
    if (!current) throw new Error(`No such run: ${runId}`);
    const next = { ...current, ...patch };
    this.runs.set(runId, next);
    return next;
  }
  async bySlug(slug: string): Promise<AuditRun | null> {
    for (const run of this.runs.values()) if (run.slug === slug) return run;
    return null;
  }
  async publishedCount(): Promise<number> {
    return [...this.runs.values()].filter((r) => r.published).length;
  }
}

/** The same store, persisted as one JSON file per run. */
export class FileRunStore extends MemoryRunStore {
  private dir: string;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const file of await readdir(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const run = JSON.parse(await readFile(join(this.dir, file), 'utf8')) as AuditRun;
      this.runs.set(run.runId, run);
    }
  }

  private async persist(run: AuditRun): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${run.runId}.json`), JSON.stringify(run, null, 2), 'utf8');
  }

  override async create(run: AuditRun): Promise<AuditRun> {
    await super.create(run);
    await this.persist(run);
    return run;
  }

  override async update(runId: string, patch: Partial<AuditRun>): Promise<AuditRun> {
    const next = await super.update(runId, patch);
    await this.persist(next);
    return next;
  }
}
