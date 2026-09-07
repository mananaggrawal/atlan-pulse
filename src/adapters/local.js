// Local adapter: turns a laptop into SkillFact[].
//
// This is the only module that knows about the filesystem. Everything
// downstream (engine, checks, renderers) works on the plain objects it
// returns, which is what keeps a hosted adapter possible later without
// rewriting a single check.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFrontmatter, readAllowedTools, readOwner } from '../lib/frontmatter.js';
import { DEFAULTS } from '../lib/constants.js';

const HOME = os.homedir();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']);

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

/** Recursively collect SKILL.md paths under a root. */
function findSkillFiles(root, depth = 0, out = []) {
  if (depth > 6) return out;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findSkillFiles(full, depth + 1, out);
    } else if (entry.isFile() && /^SKILL\.mdx?$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The places skills live, in the order we report them. */
export function defaultSkillRoots(cwd = process.cwd()) {
  return [
    { dir: path.join(HOME, '.claude', 'skills'), source: 'personal', label: '~/.claude/skills' },
    { dir: path.join(cwd, '.claude', 'skills'), source: 'project', label: '.claude/skills (this project)' },
    { dir: path.join(HOME, '.claude', 'plugins'), source: 'plugin', label: '~/.claude/plugins' },
    { dir: path.join(HOME, '.codex', 'skills'), source: 'codex', label: '~/.codex/skills' },
    { dir: path.join(HOME, '.config', 'codex', 'skills'), source: 'codex', label: '~/.config/codex/skills' },
  ];
}

export function collectSkills({ cwd = process.cwd(), extraDirs = [] } = {}) {
  const roots = [
    ...defaultSkillRoots(cwd),
    ...extraDirs.map((d) => ({ dir: path.resolve(d), source: 'custom', label: d })),
  ];

  const skills = [];
  const rootReport = [];
  const seen = new Set();
  const now = Date.now();

  for (const root of roots) {
    if (!exists(root.dir)) {
      rootReport.push({ ...root, found: false, count: 0 });
      continue;
    }
    const files = findSkillFiles(root.dir);
    let count = 0;
    for (const file of files) {
      const real = fs.realpathSync(file);
      if (seen.has(real)) continue;
      seen.add(real);

      let text; let stat;
      try {
        text = fs.readFileSync(file, 'utf8');
        stat = fs.statSync(file);
      } catch { continue; }

      const { frontmatter, body, hadFrontmatter } = parseFrontmatter(text);
      const dirName = path.basename(path.dirname(file));
      const name = String(frontmatter.name || dirName).trim();
      const description = String(frontmatter.description || '').trim();
      const mtime = stat.mtime;

      skills.push({
        name,
        dirName,
        path: file,
        relPath: file.startsWith(HOME) ? file.replace(HOME, '~') : file,
        source: root.source,
        sourceLabel: root.label,
        description,
        descriptionChars: description.length,
        hasFrontmatter: hadFrontmatter,
        frontmatter,
        owner: readOwner(frontmatter),
        allowedTools: readAllowedTools(frontmatter),
        bodyChars: body.length,
        mtime,
        daysSinceModified: Math.floor((now - mtime.getTime()) / 86_400_000),
        invocations: null,
        lastInvokedAt: null,
      });
      count += 1;
    }
    rootReport.push({ ...root, found: true, count });
  }

  return { skills, roots: rootReport };
}

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

// Claude Code writes one JSONL file per session under ~/.claude/projects/<slug>/.
// The exact shape of a skill invocation has changed across versions and is not
// documented, so rather than betting on one schema we try several known ones
// and record which fired. `--debug-transcripts` prints the tool-name histogram
// so an unrecognised shape can be identified from a real machine in one round
// trip instead of guessed at.

const SKILL_TOOL_NAMES = new Set(['skill', 'get_skill', 'runskill', 'invokeskill']);

const cleanSkillName = (raw) => {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^\//, '');            // /foo  → foo
  s = s.split(/\s+/)[0];               // "foo --flag" → foo
  if (s.includes(':')) s = s.split(':').pop(); // plugin:skill → skill
  return s || null;
};

/** Pull a skill name out of a single tool_use block, if it is one. */
function skillFromToolUse(block) {
  const rawName = String(block?.name || '');
  const lower = rawName.toLowerCase();
  const input = block?.input ?? {};

  const isSkillTool =
    SKILL_TOOL_NAMES.has(lower) ||
    lower.endsWith('__get_skill') ||
    lower.endsWith('__skill');

  if (isSkillTool) {
    const candidate =
      input.skill ?? input.command ?? input.name ?? input.skill_name ?? input.skillName ?? input.path;
    const cleaned = cleanSkillName(candidate);
    if (cleaned) return { skill: cleaned, signature: 'skill-tool' };
  }

  if (lower === 'slashcommand' || lower === 'slash_command') {
    const cleaned = cleanSkillName(input.command ?? input.name);
    if (cleaned) return { skill: cleaned, signature: 'slash-command' };
  }
  return null;
}

export function collectInvocations({ transcriptDir, windowDays = DEFAULTS.WINDOW_DAYS } = {}) {
  const dir = transcriptDir ? path.resolve(transcriptDir) : path.join(HOME, '.claude', 'projects');
  const report = {
    dir: dir.startsWith(HOME) ? dir.replace(HOME, '~') : dir,
    available: false,
    filesRead: 0,
    linesRead: 0,
    parseErrors: 0,
    eventsFound: 0,
    windowDays,
    signatures: {},
    toolHistogram: {},
    earliest: null,
    latest: null,
  };

  if (!exists(dir)) return { counts: new Map(), lastSeen: new Map(), report };

  const files = [];
  const walk = (d, depth = 0) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(dir);

  const cutoff = Date.now() - windowDays * 86_400_000;
  const counts = new Map();
  const lastSeen = new Map();

  for (const file of files) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    report.filesRead += 1;

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      report.linesRead += 1;

      let evt;
      try { evt = JSON.parse(line); } catch { report.parseErrors += 1; continue; }

      const ts = Date.parse(evt.timestamp ?? evt.ts ?? '');
      const when = Number.isNaN(ts) ? null : ts;
      if (when !== null) {
        if (!report.earliest || when < report.earliest) report.earliest = when;
        if (!report.latest || when > report.latest) report.latest = when;
        if (when < cutoff) continue;
      }

      const content = evt?.message?.content ?? evt?.content;
      const blocks = Array.isArray(content) ? content : [];

      for (const block of blocks) {
        if (block?.type !== 'tool_use') continue;
        const toolName = String(block.name || 'unknown');
        report.toolHistogram[toolName] = (report.toolHistogram[toolName] || 0) + 1;

        const hit = skillFromToolUse(block);
        if (!hit) continue;
        counts.set(hit.skill, (counts.get(hit.skill) || 0) + 1);
        if (when !== null) {
          const prev = lastSeen.get(hit.skill) || 0;
          if (when > prev) lastSeen.set(hit.skill, when);
        }
        report.signatures[hit.signature] = (report.signatures[hit.signature] || 0) + 1;
        report.eventsFound += 1;
      }

      // Some versions record the skill on the result envelope instead.
      const envelopeSkill = cleanSkillName(evt?.toolUseResult?.skillName ?? evt?.skillName);
      if (envelopeSkill) {
        counts.set(envelopeSkill, (counts.get(envelopeSkill) || 0) + 1);
        report.signatures.envelope = (report.signatures.envelope || 0) + 1;
        report.eventsFound += 1;
      }
    }
  }

  report.available = report.filesRead > 0;
  return { counts, lastSeen, report };
}

/** Join invocation counts onto skills. Matching is deliberately forgiving. */
export function attachInvocations(skills, counts, lastSeen) {
  const index = new Map();
  for (const [key, value] of counts) index.set(key.toLowerCase(), value);

  for (const skill of skills) {
    // A Set, because a skill whose frontmatter name matches its directory name
    // would otherwise have every invocation counted twice.
    const keys = [...new Set([skill.name, skill.dirName].filter(Boolean).map((k) => k.toLowerCase()))];
    let total = 0;
    let seen = null;
    for (const key of keys) {
      if (index.has(key)) total += index.get(key);
      const ls = lastSeen.get(key) ?? lastSeen.get(key.replace(/\s+/g, '-'));
      if (ls && (!seen || ls > seen)) seen = ls;
    }
    skill.invocations = total;
    skill.lastInvokedAt = seen ? new Date(seen) : null;
  }
  return skills;
}
