import { THEME } from './theme.ts';

/**
 * Screen and print in one stylesheet.
 *
 * The print rules are not an afterthought here: `@page` sets the margin box,
 * `break-inside: avoid` keeps a finding from splitting across a page, and the
 * cover and each dimension start on a fresh page. Rendering to PDF is then
 * just printing this page, which is why the PDF and the web report can never
 * disagree about what the audit said.
 */
export const REPORT_CSS = `
:root{
  --blue:${THEME.blue}; --cyan:${THEME.cyan}; --pink:${THEME.pink};
  --ink:${THEME.ink}; --ink-strong:${THEME.inkStrong}; --ink-deep:${THEME.inkDeep};
  --muted:${THEME.muted}; --page:${THEME.page}; --surface:${THEME.surface};
  --surface-2:${THEME.surfaceAlt}; --line:${THEME.line}; --line-soft:${THEME.lineSoft};
  --display:${THEME.display}; --body:${THEME.body}; --mono:${THEME.mono};
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font-family:var(--body);font-size:14.5px;line-height:1.62}
.wrap{max-width:980px;margin:0 auto;padding:0 34px 90px}
h1,h2,h3{font-family:var(--display);color:var(--ink-strong);letter-spacing:-.018em;margin:0}
h1{font-size:52px;line-height:1.05;max-width:15ch}
h2{font-size:23px;margin:0 0 18px}
h3{font-size:16px;margin:0 0 8px}
a{color:var(--blue)}
.mono{font-family:var(--mono)}
.eyebrow{font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--blue);margin:0 0 18px}
.masthead{display:flex;align-items:center;justify-content:space-between;padding:26px 0 0;margin-bottom:56px}
.lockup{font-family:var(--display);font-weight:600;font-size:19px;color:var(--ink-strong)}
.lockup b{color:var(--blue);font-weight:600}
.kicker{font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}

/* cover */
.cover{min-height:62vh}
.byline{display:flex;flex-wrap:wrap;gap:0 30px;padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:30px 0 40px}
.byline div{display:flex;flex-direction:column}
.byline dt{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}
.byline dd{margin:3px 0 0;font-size:14px;color:var(--ink-strong);font-weight:500;font-family:var(--mono)}

/* the score */
.scoreblock{display:flex;gap:34px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px 30px;margin-bottom:34px}
.total{font-family:var(--display);font-size:78px;line-height:.9;color:var(--blue);font-weight:600}
.total span{font-size:22px;color:var(--muted)}
.bars{flex:1;display:flex;flex-direction:column;gap:11px;min-width:0}
.bar{display:grid;grid-template-columns:112px 1fr 62px;gap:12px;align-items:center;font-size:12.5px}
.bar .track{height:7px;background:var(--line-soft);border-radius:4px;overflow:hidden}
.bar .fill{display:block;height:100%;background:var(--blue);border-radius:4px}
.bar .num{text-align:right;font-family:var(--mono);color:var(--ink-strong)}
.bar .name{color:var(--muted);text-transform:capitalize}
.basis{font-size:12px;color:var(--muted);margin-top:14px;line-height:1.5}

/* headline stat */
.hero{background:var(--ink-deep);color:#fff;border-radius:12px;padding:34px 36px;margin:0 0 34px}
.hero .big{font-family:var(--display);font-size:46px;line-height:1.05;margin:0 0 12px;color:#fff}
.hero .big em{font-style:normal;color:var(--cyan)}
.hero p{margin:0;color:#C9C9D8;font-size:13.5px;max-width:62ch}
.hero .assump{margin-top:16px;font-family:var(--mono);font-size:11.5px;color:#8F8FA6}

.callout{border-left:3px solid var(--blue);background:var(--surface-2);padding:16px 20px;margin:22px 0;font-size:13.5px}
.section{padding-top:14px;margin-bottom:44px}
.section-head{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:20px}
.section-head .count{font-family:var(--mono);font-size:12px;color:var(--muted)}

/* findings */
.finding{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:16px 18px;margin-bottom:12px;break-inside:avoid}
.finding .top{display:flex;gap:10px;align-items:baseline;margin-bottom:6px}
.sev{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:4px;border:1px solid currentColor}
.finding .skill{font-family:var(--mono);font-size:12px;color:var(--ink-strong)}
.finding .headline{font-size:14.5px;color:var(--ink-strong);font-weight:500;margin:0 0 6px}
.finding .rule{font-size:12px;color:var(--muted);font-family:var(--mono)}
.finding .detail{font-size:13px;margin-top:8px}
.finding .quote{margin:10px 0 0;padding:9px 12px;background:var(--surface-2);border-left:2px solid var(--cyan);font-family:var(--mono);font-size:11.5px;color:var(--ink-strong);white-space:pre-wrap;word-break:break-word}
.evidence{margin-top:8px;font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.reviewer{border-style:dashed}
.reviewer .badge{font-size:10px;color:var(--blue);font-weight:600;letter-spacing:.06em;text-transform:uppercase}

/* tables */
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding:0 10px 8px 0}
td{padding:9px 10px 9px 0;border-bottom:1px solid var(--line-soft);vertical-align:top}
td.num,th.num{text-align:right;font-family:var(--mono)}
.over{color:var(--pink)}

.footnote{font-size:12px;color:var(--muted);margin-top:10px}
.limits{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:26px 28px}
.limits li{margin-bottom:10px}

@media print{
  @page{size:A4;margin:16mm 14mm}
  body{background:#fff;font-size:10.5pt}
  .wrap{max-width:none;padding:0}
  .masthead{margin-bottom:26px}
  .cover{min-height:auto}
  h1{font-size:34pt}
  .hero,.bar .fill,.bar .track,.sev,.quote{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hero{background:${THEME.inkDeep}}
  h1{max-width:24ch}
  .hero .big{font-size:24pt}
  .total{font-size:48pt}
  .page-break{break-before:page}
  .finding,.scoreblock,.limits,tr{break-inside:avoid}
  a{text-decoration:none}
}
`;
