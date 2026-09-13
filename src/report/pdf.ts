import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * HTML to PDF.
 *
 * The same document the browser shows, printed. No second template, no second
 * layout engine, no chance of the PDF quietly disagreeing with the web report
 * about what the audit found.
 *
 * Chromium is the dependency this buys. In production it ships in the image
 * rather than being downloaded at boot; `PULSE_CHROMIUM` points at it. Nothing
 * else in the codebase depends on a browser, so if the cost of that image ever
 * stops being worth it, this is the one file to replace.
 */
export interface PdfOptions {
  executablePath?: string;
  /** Printed at the foot of every page. */
  footer?: string;
}

/**
 * Find a Chromium without downloading one. `PULSE_CHROMIUM` wins; otherwise a
 * browser already present in the image is used. Playwright's own default is
 * last, because in a container with no browser it fails with a message telling
 * you to run an installer that has no network — which is not a useful error to
 * surface from a report route.
 */
function findChromium(explicit?: string): string | undefined {
  const candidates = [explicit, process.env.PULSE_CHROMIUM].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;

  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean) as string[];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
        const full = join(root, dir, rel);
        if (existsSync(full)) return full;
      }
    }
  }
  return undefined;
}

/** A PNG of a fixed-size HTML page — the card. Same browser as the PDF. */
export async function htmlToPng(
  html: string,
  size: { width: number; height: number },
  options: PdfOptions = {},
): Promise<Buffer> {
  const executablePath = findChromium(options.executablePath);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
}

export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const executablePath = findChromium(options.executablePath);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:7.5pt;font-family:Inter,sans-serif;color:#77778E;padding:0 14mm;display:flex;justify-content:space-between">
        <span>${(options.footer ?? 'Atlan Pulse — skill health').replace(/</g, '')}</span>
        <span class="pageNumber"></span>
      </div>`,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
  } finally {
    await browser.close();
  }
}
