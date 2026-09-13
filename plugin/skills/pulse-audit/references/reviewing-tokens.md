# Reviewing the always-on cost

The server counted the tokens. It cannot tell you which of them were worth
spending.

Context: a skill's name and description are carried on **every** prompt,
whether or not the skill ever fires. The body costs nothing until it runs.
Anthropic's documentation truncates the listing entry at 1,536 characters and
budgets roughly 100 words of always-loaded metadata per skill for exactly this
reason.

## `description-can-be-shorter`

**The question:** which phrases in this description are buying recall, and
which are paying rent?

There is a real contradiction in the published guidance and the user is living
inside it. The official advice to skill authors is to be "a little bit pushy"
and enumerate triggers, because the dominant failure is a skill that never
fires. The same documentation caps the listing entry because every character is
carried on every prompt. Follow the first hard enough and you break the second.

Pulse's position, which you are applying: **enumerate triggers until the
near-misses are covered, then stop.** A near-miss is a request that shares
vocabulary with this skill but actually needs a different one. A phrase earns
its tokens if removing it would let a near-miss win. A phrase that only
restates a phrasing already present does not.

So, concretely: for each over-budget description, write the shorter version.
Not advice about writing a shorter version — the actual replacement text, which
the user can paste. Then state what you deliberately kept and why, in one
clause. A rewrite that quietly drops the one phrase holding the skill's
triggering together is worse than no rewrite.

Submit it as `check: "description-can-be-shorter"`, with the current
description as the `evidenceQuote` and the proposed text in the finding body.

## `dormant-but-loaded`

When telemetry is present, the report shows skills that were listed on every
prompt and never invoked. That number is usually the single most persuasive
line in the whole audit.

Your job is to say *why* each one is dormant, because the fix differs
completely:

- **Nobody needs it** → delete it. The cost was pure.
- **People need it but it never fires** → the description is the bug, not the
  skill. Under-triggering is the more common failure; rewrite the trigger
  rather than deleting useful work.
- **It fires rarely by design** (a quarterly close, an incident runbook) → it
  is dormant and that is correct. Say so, so nobody deletes it on the strength
  of a number.

Quote the description when you claim it is the reason a skill never fires.

## What not to do

Do not propose rewrites for descriptions that are already inside budget. The
report already lists them; rewriting a fine description to save nine tokens is
noise, and it teaches the reader to skim past the rewrites that matter.
