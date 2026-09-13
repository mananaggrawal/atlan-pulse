import { THEME } from './theme.ts';
import { LISTING_BUDGET_TOKENS, SCORE_WEIGHTS, ENGINE_VERSION } from '../engine/constants.ts';

/**
 * The public pages: the landing page and the connect page.
 *
 * Both are server-rendered strings with no client framework, because both are
 * read-only except for one button. The connect page is the whole onboarding
 * experience, so it is written to be followed rather than admired: the command
 * to copy sits above the fold, and the fallback for people who only add a
 * connector sits directly under it rather than on another page.
 */

/**
 * Pages link the faces from `/fonts.css` rather than embedding them: a landing
 * page that ships 170KB of base64 on every visit is a landing page nobody
 * waits for. The report and the card still embed, because a document and an
 * image have to be self-contained wherever they are rendered.
 */
const SHELL_CSS = `
:root{--blue:${THEME.blue};--cyan:${THEME.cyan};--ink:${THEME.ink};--ink-strong:${THEME.inkStrong};
  --ink-deep:${THEME.inkDeep};--muted:${THEME.muted};--page:${THEME.page};--surface:${THEME.surface};
  --line:${THEME.line};--line-soft:${THEME.lineSoft}}
*{box-sizing:border-box;margin:0}
body{background:var(--page);color:var(--ink);font-family:Inter,-apple-system,sans-serif;font-size:15px;line-height:1.62;
  background-image:linear-gradient(rgba(0,0,0,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.03) 1px,transparent 1px);
  background-size:64px 64px}
.wrap{max-width:940px;margin:0 auto;padding:0 30px 100px}
h1,h2,h3{font-family:"Funnel Display",sans-serif;font-weight:600;color:var(--ink-strong);letter-spacing:-.02em}
h1{font-size:clamp(38px,6vw,62px);line-height:1.04;margin:0 0 22px;max-width:17ch}
h2{font-size:24px;margin:0 0 16px}
h3{font-size:16px;margin:0 0 6px}
a{color:var(--blue)}
p{margin:0 0 14px;max-width:68ch}
.masthead{display:flex;justify-content:space-between;align-items:center;padding:26px 0 0;margin-bottom:70px}
.lockup{font-family:"Funnel Display",sans-serif;font-weight:600;font-size:20px;color:var(--ink-strong)}
.lockup b{color:var(--blue);font-weight:600}
.kicker{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--blue);margin-bottom:18px}
.lede{font-size:19px;line-height:1.55;color:var(--ink-strong);max-width:58ch;margin-bottom:34px}
code,pre,.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
pre{background:var(--ink-deep);color:#E6E6F0;padding:17px 20px;border-radius:9px;font-size:13px;overflow-x:auto;margin:0 0 12px}
pre .c{color:#77778E}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:26px 28px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin:26px 0 46px}
.dim h3{font-family:"JetBrains Mono",monospace;font-size:13px;color:var(--blue);letter-spacing:.02em}
.dim p{font-size:13.5px;margin:0;color:var(--ink)}
.dim .w{float:right;font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--muted)}
section{margin-bottom:56px}
.btn{display:inline-block;background:var(--blue);color:#fff;border:0;border-radius:8px;padding:13px 22px;font-family:Inter,sans-serif;
  font-size:15px;font-weight:500;cursor:pointer;text-decoration:none}
.btn:disabled{opacity:.55;cursor:default}
.note{font-size:13px;color:var(--muted);max-width:64ch}
.steps{counter-reset:s;list-style:none;padding:0;margin:0}
.steps li{counter-increment:s;position:relative;padding-left:38px;margin-bottom:26px}
.steps li::before{content:counter(s);position:absolute;left:0;top:1px;width:24px;height:24px;border-radius:50%;
  background:var(--ink-deep);color:#fff;font-family:"JetBrains Mono",monospace;font-size:12px;display:flex;align-items:center;justify-content:center}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);padding:0 10px 8px 0}
td{padding:9px 10px 9px 0;border-bottom:1px solid var(--line-soft);vertical-align:top}
.limits li{margin-bottom:9px;font-size:13.5px}
@media (max-width:560px){.wrap{padding:0 18px 70px}}
`;

function shell(title: string, body: string, extraHead = ''): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${extraHead}
<link rel="stylesheet" href="/fonts.css">
<style>${SHELL_CSS}</style></head><body><div class="wrap">
<div class="masthead"><a href="/" style="text-decoration:none" class="lockup">Atlan <b>Pulse</b></a>
<span class="kicker">skill health &middot; engine ${ENGINE_VERSION}</span></div>
${body}
</div></body></html>`;
}

const DIMENSIONS: Array<[string, number, string]> = [
  ['tokens', SCORE_WEIGHTS.tokens, 'What the catalog costs on every prompt, before anything runs — and what that is per month.'],
  ['dedupe', SCORE_WEIGHTS.dedupe, 'Skills competing for the same request, including ones that overlap in intent but share no words.'],
  ['security', SCORE_WEIGHTS.security, 'Credential shapes, grants that skip the approval prompt, instructions that hand control to a URL.'],
  ['vulnerability', SCORE_WEIGHTS.vulnerability, 'Remote scripts, unpinned installs, redirected registries, payloads in directories reviewers skip.'],
  ['improvement', SCORE_WEIGHTS.improvement, 'Whether each skill is written to be found, triggered and maintained — with the rewrite, not advice about one.'],
];

export function landingPage(baseUrl: string): string {
  return shell(
    'Atlan Pulse — skill health for Claude',
    `<section>
  <p class="eyebrow">Skill health</p>
  <h1>Every linter grades one skill. Pulse grades your library.</h1>
  <p class="lede">Connect Claude, say <em>audit my skills</em>, and get a scored report on what your
  skills cost, which ones collide, which ones are unsafe to install, and how to fix them &mdash;
  plus a card you can post. Your skill text is never stored.</p>
  <a class="btn" href="/connect">Connect Claude &rarr;</a>
  <p class="note" style="margin-top:16px">Two commands, then one sentence. Nothing to sign up for first.</p>
</section>

<section>
  <h2>Five dimensions</h2>
  <div class="grid">
    ${DIMENSIONS.map(
      ([name, weight, blurb]) =>
        `<div class="card dim"><h3>${name}<span class="w">${weight} pts</span></h3><p>${blurb}</p></div>`,
    ).join('')}
  </div>
  <p class="note">Measured checks produce the score. A model then answers the questions measurement
  cannot &mdash; intent overlap, injection reachability, whether a description would actually fire &mdash;
  and every one of those findings carries the line it came from. They are shown separately and are
  <strong>excluded from the score</strong>, so two runs of the same library always produce the same number.
  The weights are published at <a href="/method">/method</a>.</p>
</section>

<section>
  <h2>Why this is worth ${LISTING_BUDGET_TOKENS.toLocaleString('en-US')} tokens of your attention</h2>
  <table>
    <thead><tr><th>What is true</th><th>Where it comes from</th></tr></thead>
    <tbody>
      <tr><td>A skill's name and description are carried on <strong>every prompt</strong>, whether or not it ever fires. The listing entry is truncated at 1,536 characters "to reduce context usage".</td><td>Anthropic's Claude Code documentation</td></tr>
      <tr><td>In one measured 2.1M-token session, <strong>11%</strong> of the tokens went to three skills that never fired. Trimming skill metadata took one task from <strong>$3.60 to $2.64</strong>.</td><td>Two independent practitioner benchmarks</td></tr>
      <tr><td>Of 3,984 public agent skills audited, <strong>36% contained security flaws</strong> and 76 carried confirmed malicious payloads.</td><td>Snyk, ToxicSkills, Feb 2026</td></tr>
      <tr><td>"Install skills only from trusted sources&hellip; thoroughly audit it before use."</td><td>Anthropic engineering</td></tr>
      <tr><td>No existing skill linter checks <strong>cross-skill overlap or trigger collision</strong>. They grade one file at a time.</td><td>Checked against the two serious public linters</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>Two promises, kept in the code</h2>
  <div class="card">
    <h3>Your skill text is not stored</h3>
    <p style="margin:6px 0 0">The engine reads it, produces findings, and drops it. What persists is findings, counts, and a SHA-256 per skill &mdash; enough to tell you next month that something changed, not enough to reconstruct a line of it.</p>
  </div>
  <div class="card">
    <h3>A card carries numbers, never names</h3>
    <p style="margin:6px 0 0">Share the score, you never share the skill. The public card object is built field by field, and there is a test that fails if a skill name ever reaches it.</p>
  </div>
</section>

<section>
  <h2>What this does not prove</h2>
  <div class="card">
    <ul class="limits">
      <li>A clean report means nothing hostile is <em>visible in the text as shipped</em>. It is not a safety guarantee, and no static audit can be one.</li>
      <li>Published research has defeated static skill scanners &mdash; by hiding payloads in directories scanners skip, rewriting strings, and fetching the real payload only at run time. Pulse reads dot-directories and reports fetch-at-run-time constructions. That closes part of the gap and not all of it.</li>
      <li>Token counts are estimates from a consistent estimator, comparable between libraries, not identical to a tokenizer's.</li>
      <li>The money figure is arithmetic on an assumption, and the assumption is printed next to it.</li>
    </ul>
  </div>
</section>

<p class="note">${baseUrl} &middot; <a href="/method">method</a> &middot; engine ${ENGINE_VERSION}</p>`,
  );
}

export function connectPage(baseUrl: string): string {
  const mcpUrl = `${baseUrl}/api/mcp`;
  return shell(
    'Connect Claude — Atlan Pulse',
    `<section>
  <p class="eyebrow">Connect</p>
  <h1>Two commands, then one sentence.</h1>
  <p class="lede">Pulse cannot read your machine &mdash; no server can. Claude reads your skills and hands
  them over, so the install is a plugin for your agent rather than an agent for your files.</p>
</section>

<section>
  <ol class="steps">
    <li>
      <h3>Get a connection token</h3>
      <p class="note">Shown once, stored only as a hash. It identifies your connection; it grants nothing else.</p>
      <button class="btn" id="mint">Generate token</button>
      <pre id="token" style="display:none;margin-top:12px"></pre>
    </li>
    <li>
      <h3>Install the plugin</h3>
      <p class="note">Carries the audit skill and the connection together.</p>
      <pre><span class="c"># in Claude Code</span>
/plugin marketplace add ${esc(baseUrl)}
/plugin install atlan-pulse</pre>
      <p class="note">Or, if you only want the connector, add this MCP server and use the <code>/pulse:audit</code>
      prompt it ships &mdash; same procedure, no plugin:</p>
      <pre id="config">{
  "mcpServers": {
    "atlan-pulse": {
      "type": "http",
      "url": "${esc(mcpUrl)}",
      "headers": { "Authorization": "Bearer &lt;your token&gt;" }
    }
  }
}</pre>
    </li>
    <li>
      <h3>Say it</h3>
      <pre>audit my skills</pre>
      <p class="note">Claude finds your skills, shows you the list, runs all five dimensions, reviews what
      the measurements cannot, and hands back a report, a PDF and &mdash; if you want one &mdash; a card.</p>
    </li>
  </ol>
</section>

<script>
document.getElementById('mint').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const res = await fetch('/api/connect', { method: 'POST' });
    const data = await res.json();
    const out = document.getElementById('token');
    out.textContent = data.token;
    out.style.display = 'block';
    btn.textContent = 'Copy this now — it is not shown again';
    document.getElementById('config').innerHTML =
      document.getElementById('config').innerHTML.replace('&lt;your token&gt;', data.token);
  } catch {
    btn.disabled = false;
    btn.textContent = 'Generate token';
  }
});
</script>`,
  );
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
