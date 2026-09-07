# Atlan Pulse

**Skill health for Claude Code and Codex.** One command, no signup, nothing leaves your laptop.

```bash
npx atlan-pulse
```

You get a terminal summary and a standalone, shareable HTML report:

> **47 skills installed. 12 of them have never run.**
> Your skill descriptions cost an estimated 4,100 tokens on every request — 205% of the budget the listing is allotted — and 38% of that is skills you have never invoked.

---

## Why this exists

There are already a dozen places to *put* your agent skills — registries, marketplaces, package managers, a git repo with a README. There is nowhere that tells you whether the skills you already have are any good.

That matters more than it sounds. Every skill you keep is described to the model on *every single request*, whether or not it is ever used. A skill you wrote in March and forgot about is not free; it is a standing tax on every prompt, and it competes for the model's attention with the skills you actually rely on.

Pulse reads what is already on your machine and tells you which skills are earning their place.

## What it checks

| Check | What it means |
|---|---|
| **Context budget** | What your skill descriptions cost on every request, and how much of that is spent on skills nobody invokes |
| **Never invoked** | In your catalogue, zero invocations in the window |
| **Concentration** | What share of all your runs comes from just three skills |
| **Broad permissions** | Skills declaring shell execution, network access or deletion |
| **Likely duplicates** | Near-identical skills — what people create when they cannot find what already exists |
| **Oversized descriptions** | Descriptions past the 1,536-character listing limit, which risk being truncated |
| **Stale** | Untouched in over 180 days — which matters most where a skill is *also* heavily used |
| **No owner** | No owner or author declared in frontmatter |

Five of the eight need no history at all and work on a machine you installed this morning. The three invocation-based ones read your local session transcripts.

## The report

The report is the point of the tool. It is a single self-contained HTML file, written to your working directory, with no scripts in it and no network calls beyond webfonts — so it can be dropped in Slack, attached to an email, committed next to your skills, opened on a phone, or printed to PDF with Cmd-P and still be itself.

It opens with the headline number and a key-takeaways summary, then runs six numbered chapters:

1. **The context tax** — what your skills cost before anyone types a prompt, and how much of it is spent on skills that never run
2. **What you actually use** — a usage leaderboard with each skill's share, and the full never-invoked list
3. **What needs attention** — every finding, with the skills behind it
4. **Inventory** — a breakdown by location and owner, then every skill found
5. **Recommended actions** — the specific list, ordered by payoff, generated from the findings rather than written
6. **Method and limits** — every location searched, every constant used, and what the tool cannot see

Nothing in it is hidden or hand-waved: the constants that produce each number are printed in chapter 6, next to where they came from.

## Send it to someone

```bash
npx atlan-pulse pack                        # bundle your best skills
npx atlan-pulse install <url-to-bundle>     # what your teammate runs
```

`pack` takes the skills you actually use, writes them to a single JSON file, and prints one line to send someone. Ranking is by real invocation count, so a colleague gets the skills that earn their keep — not a folder dump.

### `install` is deliberately boring

It writes Markdown files and nothing else. It never executes anything. It refuses names that could escape the skills directory, requires https, prints exactly what it is about to write, and asks before writing. Existing skills are skipped unless you pass `--force`.

## Options

```
npx atlan-pulse
  --dir <path>          also scan this directory (repeatable)
  --transcripts <path>  session transcripts (default: ~/.claude/projects)
  --days <n>            invocation window, default 90
  --stale-days <n>      staleness threshold, default 180
  --out <path>          report path, default ./atlan-pulse-report.html
  --json                print the report model instead of writing HTML
  --debug-transcripts   show what was found in the transcripts, then stop
```

## Privacy

Everything runs locally. There is no account, no telemetry, no network call except the one `install` makes when you hand it a URL. The report is a file on your disk. The package has **zero runtime dependencies** — the whole thing is auditable in an afternoon, which is rather the point for a tool that reads your prompts.

## What it cannot see

Worth stating plainly, because a tool like this is easy to over-trust:

- **Token counts are estimates** from character length, not a tokeniser run.
- **Duplicate detection is trigram similarity** on names and descriptions. It is a hint to go and look, not a verdict.
- **The permissions check reads declared frontmatter.** It is not a security scan and cannot see what a skill actually does.
- **Invocation counts depend on local session transcripts.** If none are found, the three invocation-based checks are reported as unavailable rather than estimated. Run `--debug-transcripts` to see what was found. Transcript formats change between versions; if yours is not recognised, the tool names in that output are the fix, and they live in one place: `SKILL_TOOL_NAMES` in `src/adapters/local.js`.
- **Everything here describes one machine.** Cross-person duplication and real ownership are not knowable from a solo scan. They become answerable the moment a second person runs it.

## Adding a check

Checks are separate modules on purpose. A new one is a file and a line:

```js
// src/checks/my-check.js
export default {
  id: 'my-check',
  title: 'My check',
  severity: 'medium',
  run({ skills, hasInvocationData, options }) {
    const hits = skills.filter((s) => /* ... */);
    if (!hits.length) return null;
    return {
      severity: 'medium',
      headline: `${hits.length} skills need a look.`,
      items: hits.map((s) => ({ name: s.name, note: 'why', path: s.relPath })),
    };
  },
};
```

Then add it to `CHECKS` in `src/engine.js`. Checks receive normalised facts and never touch the filesystem, which is what keeps a hosted version possible without rewriting any of them.

```bash
node --test test/*.test.js
```

## Disclosure

Atlan Pulse is a working prototype built as a work sample. It is **not an official Atlan product**, and is not affiliated with, endorsed by, or operated by Atlan.

MIT licensed.
