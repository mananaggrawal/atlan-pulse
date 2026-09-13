import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { AuditSkillFile, AuditSkillInput } from '../engine/types.ts';

/**
 * Reading skill folders off a disk.
 *
 * The hosted product never calls this — the agent reads the user's files and
 * pushes them, because a server cannot see a laptop. It exists for two other
 * callers: continuous integration, where Pulse audits its own skills and fails
 * the build if they regress, and the `npx` path, where someone tries the thing
 * before signing up for anything.
 *
 * It walks dot-directories on purpose. Published evasion research hides
 * payloads in exactly the directories that walkers skip.
 */

const SKIP_DIRS = new Set(['node_modules']);
const MAX_FILE_BYTES = 512 * 1024;

export interface ParsedFrontmatter {
  data: Record<string, string | string[] | boolean | number | null>;
  body: string;
}

/**
 * A deliberately small YAML subset: `key: value`, quoted or not, plus inline
 * `[a, b]` lists and `- item` block lists. Skill frontmatter is flat by
 * convention, and a full YAML dependency here would be a dependency the audit
 * engine has to trust.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };

  const data: ParsedFrontmatter['data'] = {};
  const lines = match[1]!.split(/\r?\n/);
  let currentKey: string | null = null;
  let block: string[] = [];

  const flush = () => {
    if (currentKey && block.length > 0) data[currentKey] = [...block];
    block = [];
  };

  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === '') continue;

    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && currentKey) {
      block.push(unquote(item[1]!));
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    flush();
    currentKey = kv[1]!;
    const raw = kv[2]!.trim();

    if (raw === '') {
      data[currentKey] = null;
      continue;
    }
    const inline = /^\[(.*)\]$/.exec(raw);
    if (inline) {
      data[currentKey] = inline[1]!
        .split(',')
        .map((p) => unquote(p.trim()))
        .filter(Boolean);
      currentKey = null;
      continue;
    }
    data[currentKey] = unquote(raw);
    currentKey = null;
  }
  flush();

  return { data, body: text.slice(match[0].length) };
}

function unquote(v: string): string {
  return v.replace(/^["'](.*)["']$/s, '$1').trim();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function walk(dir: string, root: string, out: AuditSkillFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(full);
    if (info.size > MAX_FILE_BYTES) continue;
    const rel = relative(root, full).split(sep).join('/');
    if (rel === 'SKILL.md') continue;
    out.push({ file: rel, content: await readFile(full, 'utf8') });
  }
}

/** Read one skill folder — a directory containing a SKILL.md. */
export async function readSkillFolder(folder: string): Promise<AuditSkillInput | null> {
  let raw: string;
  try {
    raw = await readFile(join(folder, 'SKILL.md'), 'utf8');
  } catch {
    return null;
  }

  const { data, body } = parseFrontmatter(raw);
  const files: AuditSkillFile[] = [];
  await walk(folder, folder, files);
  files.sort((a, b) => a.file.localeCompare(b.file));

  const name = typeof data.name === 'string' && data.name ? data.name : folder.split(sep).pop()!;
  const owners = [...asList(data.owners), ...asList(data.owner), ...asList(data.author)];

  return {
    name,
    path: folder,
    description: typeof data.description === 'string' ? data.description : '',
    body,
    allowedTools: [...asList(data['allowed-tools']), ...asList(data.allowedTools)],
    frontmatter: data,
    owners,
    lastCommitAt: null,
    files,
  };
}

/** Read every skill folder directly under one or more roots. */
export async function readSkillRoots(roots: string[]): Promise<AuditSkillInput[]> {
  const skills: AuditSkillInput[] = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readSkillFolder(join(root, entry.name));
      if (skill) skills.push(skill);
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
