---
name: pulse-audit
description: Use when the user asks to audit, review or health-check their Claude skills — what those skills cost in context, whether any duplicate each other, whether any are unsafe to install, or how to make them better. Produces a scored report and a shareable card. Not for authoring a new skill.
allowed-tools: Read, Glob, start_audit, submit_audit_findings, finish_audit
owner: Atlan Pulse
---

# Audit skill health

A Pulse audit is three calls with your judgment in the middle. The server
measures what is measurable. You answer what measurement cannot. The report is
the two halves side by side, kept visibly apart.

Never do only the first and last call. A run with no reviewer findings is a
linter, and the user can already get a linter for free.

## Run it

**1. Find the skills.** Look in the user's personal skills directory, the
project's `.claude/skills`, and any plugin skill folders they mention. Read
each `SKILL.md` in full — frontmatter and body — plus every bundled file in the
skill folder, including files inside dot-directories. Payloads hide there
precisely because reviewers skip them.

**2. Say what you found, then start.** List the skill names in one line and
begin the audit immediately. Add one sentence: *"Say 'skip <name>' if you want
any of these left out and I'll re-run."* Do not stop and wait — the user asked
for an audit, not a form. If a skill they named is missing, say which.

**3. Call `start_audit`** with every skill's name, description, body, bundled
files, declared `allowed-tools` and frontmatter. It returns a `runId`, the
deterministic findings, and a rubric: the open questions for the dimensions
that ran.

**4. Review.** This is the part that is yours. For each dimension with open
questions, read the matching file and answer only its questions:

| Dimension | Read |
|---|---|
| security | `references/reviewing-security.md` |
| vulnerability | `references/reviewing-security.md` |
| dedupe | `references/reviewing-dedupe.md` |
| tokens | `references/reviewing-tokens.md` |
| improvement | `references/reviewing-improvement.md` |

Read the file for the dimension you are working on and no others. Each one is
short and each one tells you what a finding must contain to be worth
submitting.

**5. Call `submit_audit_findings`** with what you found. Every finding needs a
`check` from the rubric, the `skillName`, a one-line factual `headline`, and an
`evidenceQuote` — the actual line from the file that convinced you, copied
exactly. A finding without a quote is an opinion; do not submit it.

**6. Call `finish_audit`** and give the user the report URL, the PDF link, and
the score with its two weakest components named. Then stop. Do not paraphrase
the report back at them — they are about to read it.

## Rules

**Quote, never characterise.** Every reviewer finding carries the line it came
from. If you cannot find the line, you do not have a finding.

**Never read a secret value.** When the server reports a credential-shaped
string at a file and line, that is the whole finding. Do not open the file to
see what the value is, do not repeat it, do not mask it and repeat it. Say
where it is and move on.

**Do not restate the measurements.** The deterministic findings are already in
the report. Adding "the report also notes 2,380 listing tokens" wastes the
user's attention on something they are looking at.

**Never state a score you were not given.** The score comes from
`finish_audit`. You cannot compute it, estimate it, or adjust it, and your
findings deliberately do not move it — that separation is the reason the number
is worth anything.

**One finding per real problem.** Three findings describing the same overlap
between the same two skills is one finding.

**Say what you could not check.** If a skill's files could not be read, or a
folder was inaccessible, name it in your handover. Silence reads as a clean
bill of health.

## What this audit cannot see

Say this plainly if the user treats a clean result as proof of safety:

A static audit reports what is visible in the files as shipped. Published
research has shown malicious skills evading scanners by hiding payloads in
directories scanners skip, by splitting strings, and by fetching the real
payload only at run time. Pulse reads dot-directories and reports
fetch-at-run-time constructions, which closes some of that gap and not all of
it. A clean report means nothing hostile is visible in the text. It is not a
guarantee, and the report says so on its own last page.

## When something goes wrong

- `start_audit` returns nothing or errors → say so and stop. Do not narrate a
  successful audit that did not happen.
- A skill folder cannot be read → audit the rest, name the one you skipped.
- The user asks for one dimension only ("just check security") → pass only that
  in `audits`. Tell them the score is not comparable with a full run's, because
  the dimensions that did not run score full marks by default.
