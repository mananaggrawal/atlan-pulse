const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const rgb = (r, g, b) => (s) => (useColor ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s);

export const c = {
  blue: rgb(32, 38, 210),
  cyan: rgb(60, 170, 200),
  pink: rgb(243, 77, 119),
  ink: rgb(62, 76, 89),
  muted: rgb(119, 119, 142),
  bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
};

const BADGE = {
  high: (s) => c.pink(`● ${s}`),
  medium: (s) => c.blue(`● ${s}`),
  low: (s) => c.muted(`○ ${s}`),
  info: (s) => c.cyan(`◇ ${s}`),
};

const wrap = (text, width = 76, indent = '     ') =>
  text
    .split(' ')
    .reduce((lines, word) => {
      const last = lines[lines.length - 1];
      if ((last + ' ' + word).trim().length > width) lines.push(word);
      else lines[lines.length - 1] = (last + ' ' + word).trim();
      return lines;
    }, [''])
    .map((l) => indent + l)
    .join('\n');

export function renderTerminal(report, { reportPath, cardPath } = {}) {
  const out = [];
  const t = report.totals;

  out.push('');
  out.push(`  ${c.blue('◆')} ${c.bold('Atlan Pulse')} ${c.dim('· skill health')}`);
  out.push('');

  if (!t.skills) {
    out.push(`  ${c.pink('No skills found.')}`);
    out.push('');
    out.push(c.muted('  Looked in:'));
    for (const r of report.roots) out.push(c.muted(`    ${r.found ? '·' : '✗'} ${r.label}`));
    out.push('');
    out.push(c.muted('  Point it somewhere else with --dir <path>.'));
    out.push('');
    return out.join('\n');
  }

  const found = report.roots.filter((r) => r.found && r.count);
  out.push(
    `  ${c.bold(String(t.skills))} skills across ${found.length} location${found.length === 1 ? '' : 's'}` +
      (report.hasInvocationData
        ? `, ${c.bold(t.totalInvocations.toLocaleString())} invocations in ${report.options.windowDays} days`
        : `  ${c.dim('· no invocation data')}`),
  );
  out.push('');

  for (const f of report.findings) {
    if (!f.headline) continue;
    const badge = (BADGE[f.severity] || BADGE.info)(f.title);
    out.push(`  ${badge}`);
    out.push(wrap(f.headline, 74));
    if (f.items?.length) {
      const shown = f.items.slice(0, 5);
      for (const item of shown) {
        out.push(c.muted(`       ${item.name}${item.note ? c.dim(`  — ${item.note}`) : ''}`));
      }
      if (f.items.length > shown.length) {
        out.push(c.dim(`       …and ${f.items.length - shown.length} more in the report`));
      }
    }
    out.push('');
  }

  if (reportPath) out.push(`  ${c.blue('→')} Full report  ${c.bold(reportPath)}`);
  if (cardPath) out.push(`  ${c.blue('→')} Share card   ${c.bold(cardPath)}`);
  out.push('');
  out.push(c.dim('  The report stays on this machine. Nothing was uploaded.'));
  out.push('');
  return out.join('\n');
}

/** A post the user can paste. Aggregate numbers only — never skill names. */
export function sharePost(stats) {
  const bits = [`I scanned my ${stats.skills} Claude Code skills.`];
  if (stats.neverInvoked !== null && stats.neverInvoked > 0) {
    bits.push(`${stats.neverInvoked} have never been invoked.`);
  }
  if (stats.topShare !== null) bits.push(`3 of them account for ${stats.topShare}% of all my invocations.`);
  if (stats.neverInvokedShareOfContext) {
    bits.push(`The dead ones eat ${stats.neverInvokedShareOfContext}% of my skill-listing context budget.`);
  } else {
    bits.push(`They cost ~${stats.estTokens.toLocaleString()} tokens of context on every single request.`);
  }
  bits.push('\nCheck yours:  npx atlan-pulse');
  return bits.join(' ');
}
