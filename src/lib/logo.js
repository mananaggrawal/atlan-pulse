// Logo resolution.
//
// The report ships with an original Pulse mark. If you want a different one —
// your company's actual logo asset — drop the file at assets/logo.svg in this
// repo, or pass --logo <path>, and it is inlined into the masthead instead.
// Nothing is fetched: the file has to be one you already have the right to use.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** The built-in mark: bars of varying height reading as an activity trace. */
export const DEFAULT_MARK = `<svg class="mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
  <rect x="1"  y="14" width="4" height="8"  rx="1.4" fill="#2026D2"/>
  <rect x="7"  y="9"  width="4" height="13" rx="1.4" fill="#2026D2"/>
  <rect x="13" y="3"  width="4" height="19" rx="1.4" fill="#62E1FC"/>
  <rect x="19" y="11" width="4" height="11" rx="1.4" fill="#2026D2"/>
</svg>`;

const CANDIDATES = [
  path.join(PKG_ROOT, 'assets', 'logo.svg'),
  path.join(PKG_ROOT, 'assets', 'logo.png'),
];

/**
 * @returns {{ html: string, source: string|null, isCustom: boolean }}
 */
export function resolveLogo(explicitPath) {
  const tried = explicitPath ? [path.resolve(explicitPath)] : CANDIDATES;

  for (const file of tried) {
    let raw;
    try { raw = fs.readFileSync(file); } catch { continue; }

    const ext = path.extname(file).toLowerCase();
    if (ext === '.svg') {
      // Inline it so the report stays a single self-contained file. The class
      // and a height are forced on so it sits on the masthead baseline; the
      // artwork itself is untouched.
      const svg = raw
        .toString('utf8')
        .replace(/<\?xml[\s\S]*?\?>/g, '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .trim()
        .replace(/^<svg\b/i, '<svg class="logo" aria-label="logo"');
      if (!svg.startsWith('<svg')) continue;
      return { html: svg, source: file, isCustom: true };
    }

    if (MIME[ext]) {
      const uri = `data:${MIME[ext]};base64,${raw.toString('base64')}`;
      return { html: `<img class="logo" src="${uri}" alt="">`, source: file, isCustom: true };
    }
  }

  return { html: DEFAULT_MARK, source: null, isCustom: false };
}
