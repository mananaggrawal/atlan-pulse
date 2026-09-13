# Atlan Pulse

Skill health for Claude. Connect it, ask for an audit, get a scored report and a
card you can post.

One job: tell you what your skills cost, which ones collide, which ones are
unsafe to install, and how to make them better. Nothing else.

## What it checks

| Dimension | Measured (scored) | Reviewed by the model (not scored) |
|---|---|---|
| **tokens** | listing tokens against budget, per-skill description cost, body cost, dormant-but-loaded | is this description as short as it can be without losing a near-miss? |
| **dedupe** | description trigram overlap, body shingle overlap | intent overlap two skills describe in different words; trigger collision |
| **security** | credential shapes (never the value), permission-mode bypass, unconstrained shell grants, fetch-and-follow instructions | injection reachability; false positives |
| **vulnerability** | fetch-and-execute, obfuscated payloads, off-registry installs, unpinned installs, files hidden in dot-directories | capability the description does not disclose |
| **improvement** | description present, trigger phrasing, owner, broken references, line ceiling, keyword stuffing, reference weight | trigger quality; instructions that cannot be followed |

The score comes only from the measured half. Reviewer findings arrive after the
score is written, are shown separately, and `computeScore` throws if one ever
reaches it. That separation is the reason the number is worth anything.

## Install

**Plugin (recommended).** One command each:

```
/plugin marketplace add <host>
/plugin install atlan-pulse
```

Then say *audit my skills*. The plugin carries both the audit skill and the MCP
connection.

**Connector only.** Add the server URL in Connectors. No skill is installed, so
the same procedure ships as an MCP prompt — it appears as `/pulse:audit`. One
source file, two delivery paths.

## Connect

`/connect` mints a token, shows it once, and stores only its SHA-256. The MCP
endpoint takes it as a bearer header. Reports are capability URLs — a random
run id, no login, shareable with a colleague. Cards are one step more public
and carry no names at all.

This is the honest interim, not the destination: a hosted Pulse should speak
MCP's OAuth 2.1 flow so nobody copies a string around. `requireAccount` in
`src/server/http.ts` is the surface that gets replaced.

## Run it locally

```
npm install
npm test                 # 70 tests
npm run typecheck
npm run audit:self       # Pulse audits its own skills; must score 100
npm run dev              # http://localhost:3001
PULSE_ALLOW_ANONYMOUS=1 npm run dev   # skip tokens while developing
```

Generate a report from real skill folders:

```
node --experimental-strip-types scripts/demo-report.ts ~/.claude/skills out
```

## Routes

- `POST /api/mcp` — the MCP endpoint (`start_audit`, `submit_audit_findings`, `finish_audit`, prompt `audit`)
- `GET /r/:runId` — the report
- `GET /r/:runId.pdf` — the same document, printed
- `GET /` and `/connect` — landing and connect pages
- `GET /c/:slug` — a published card: a page, `.png` for unfurls, `.json` for the values. Numbers, never names.
- `GET /method` — weights, thresholds and rules, public and unauthenticated

## Two promises the code has to keep

**Skill text is not retained.** The engine reads it, produces findings, and the
text is dropped. What persists is findings, counts and a SHA-256 per skill.
There is a test asserting a stored run contains neither a skill body nor a
secret that was in one.

**A card carries no names.** `toPublicCard` is the only constructor, copying
field by field — never a spread. There is a test for that too.

## What this does not prove

A clean report means nothing hostile is visible in the files as shipped.
Published research has defeated static skill scanners by hiding payloads in
directories scanners skip, by rewriting strings, and by fetching the real
payload at run time. Pulse reads dot-directories and reports fetch-at-run-time
constructions, which closes part of that gap and not all of it. The report says
so on its own last page, and always will.
