// A deliberately small YAML-subset parser.
//
// Skill frontmatter in practice uses: `key: value`, `key: [a, b]`, quoted
// strings, and block lists. That is the subset handled here. Anything more
// exotic is preserved as a raw string rather than guessed at — a wrong parse
// is worse than an unparsed value, because every check downstream trusts this.

const stripQuotes = (s) => {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
};

const coerce = (raw) => {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((x) => stripQuotes(x)).filter(Boolean);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  return stripQuotes(v);
};

/**
 * Split a SKILL.md into { frontmatter, body }.
 * Returns frontmatter as an empty object when the file has none.
 */
export function parseFrontmatter(text) {
  const normalised = text.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(normalised);
  if (!match) return { frontmatter: {}, body: normalised, hadFrontmatter: false };

  const body = normalised.slice(match[0].length);
  const lines = match[1].split(/\r?\n/);
  const fm = {};

  let currentKey = null;
  let blockList = null;
  let blockScalar = null;

  const flush = () => {
    if (currentKey && blockList) fm[currentKey] = blockList;
    if (currentKey && blockScalar !== null) fm[currentKey] = blockScalar.join('\n').trim();
    blockList = null;
    blockScalar = null;
  };

  for (const line of lines) {
    if (!line.trim() && !blockScalar) continue;

    // continuation of a block list: "  - item"
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentKey && blockList) {
      blockList.push(stripQuotes(listItem[1]));
      continue;
    }
    // continuation of a block scalar (| or >)
    if (blockScalar && /^\s+/.test(line)) {
      blockScalar.push(line.trim());
      continue;
    }

    const kv = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;

    flush();
    currentKey = kv[1];
    const rest = kv[2];

    if (rest === '' ) {
      // could be a block list or an empty value; decide on the next line
      blockList = [];
      fm[currentKey] = '';
      continue;
    }
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      blockScalar = [];
      continue;
    }
    fm[currentKey] = coerce(rest);
  }
  flush();

  // A key opened as a block list that never received items is just empty.
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v) && v.length === 0) fm[k] = '';
  }

  return { frontmatter: fm, body, hadFrontmatter: true };
}

/** Normalise the several spellings a skill's tool allowance goes by. */
export function readAllowedTools(fm) {
  const raw = fm['allowed-tools'] ?? fm.allowedTools ?? fm.tools ?? '';
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Owner goes by several names too, and often by none. */
export function readOwner(fm) {
  for (const key of ['owner', 'author', 'maintainer', 'owners', 'team']) {
    const v = fm[key];
    if (Array.isArray(v) && v.length) return v.join(', ');
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
