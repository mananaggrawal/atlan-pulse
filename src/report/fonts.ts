import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * The brand typefaces, embedded.
 *
 * The report links Google Fonts for the browser, but a PDF is printed by a
 * server that may have no outbound network at all — and a report that silently
 * falls back to the system sans is a report that does not look like the
 * product. So the three faces ship as npm packages and are inlined as data
 * URIs, which also makes the PDF byte-identical wherever it is rendered.
 *
 * If a font package is missing the CSS is simply empty and the stack falls
 * back. Typography is not worth a boot failure.
 */

const require = createRequire(import.meta.url);

interface FaceSpec {
  family: string;
  weight: number;
  file: string;
}

const FACES: FaceSpec[] = [
  { family: 'Funnel Display', weight: 600, file: '@fontsource/funnel-display/files/funnel-display-latin-600-normal.woff2' },
  { family: 'Inter', weight: 400, file: '@fontsource/inter/files/inter-latin-400-normal.woff2' },
  { family: 'Inter', weight: 500, file: '@fontsource/inter/files/inter-latin-500-normal.woff2' },
  { family: 'Inter', weight: 600, file: '@fontsource/inter/files/inter-latin-600-normal.woff2' },
  { family: 'JetBrains Mono', weight: 400, file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2' },
  { family: 'JetBrains Mono', weight: 500, file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2' },
];

let cached: string | null = null;

export function fontFaceCss(): string {
  if (cached !== null) return cached;

  const blocks: string[] = [];
  for (const face of FACES) {
    try {
      const data = readFileSync(require.resolve(face.file)).toString('base64');
      blocks.push(
        `@font-face{font-family:"${face.family}";font-style:normal;font-weight:${face.weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2")}`,
      );
    } catch {
      // Missing package or file: fall back to the system stack for this face.
    }
  }
  cached = blocks.join('\n');
  return cached;
}
