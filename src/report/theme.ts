/**
 * The brand kit, in one file, used by both the web report and the PDF.
 *
 * One template renders both. A separate PDF template would look the same on
 * the day it was written and drift by the third change — and the PDF is the
 * artifact people keep, so it is the one that must not drift.
 */
export const THEME = {
  blue: '#2026D2',
  blueHover: '#1D22BC',
  cyan: '#62E1FC',
  pink: '#F34D77',
  ink: '#3E4C59',
  inkStrong: '#252530',
  inkDeep: '#141517',
  muted: '#77778E',
  page: '#F9F9FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F8FA',
  line: '#DDDDE3',
  lineSoft: '#E9E9F0',
  display: '"Funnel Display",-apple-system,BlinkMacSystemFont,sans-serif',
  body: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  mono: '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace',
} as const;

/** Severity colours. Deliberately not red/amber/green — a band is not a verdict. */
export const SEVERITY_COLOR: Record<string, string> = {
  high: THEME.pink,
  medium: '#C2410C',
  low: THEME.muted,
  info: THEME.muted,
};
