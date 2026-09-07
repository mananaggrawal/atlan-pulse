<img src="https://raw.githubusercontent.com/mananaggrawal/atlan-pulse/master/assets/hero.png" alt="Atlan Pulse — which of your agent skills are dead weight?" width="100%">

# Atlan Pulse

[![npm](https://img.shields.io/npm/v/atlan-pulse?color=2026D2&label=npm)](https://www.npmjs.com/package/atlan-pulse)
[![node](https://img.shields.io/node/v/atlan-pulse?color=2026D2)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-2026D2)](package.json)

**Skill health for Claude Code and Codex.** One command, no signup, nothing leaves your laptop.

```bash
npx atlan-pulse
```

Requires **Node 20 or newer** and nothing else — there are no dependencies to install. Check with `node -v`; if that command is not found, install Node from [nodejs.org](https://nodejs.org) or `brew install node`.

You get a terminal summary and a standalone, shareable HTML report:

> **41 skills installed. 14 of them have never run.**
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

It opens with the headline number and a key-takeaways summary, then runs five numbered chapters:

1. **The context tax** — what your skills cost before anyone types a prompt, and how much of it is spent on skills that never run
2. **What you actually use** — a usage leaderboard with each skill's share, and the full never-invoked list
3. **What needs attention** — every finding, with the skills behind it
4. **Inventory** — a breakdown by location and owner, then every skill found
5. **Method and limits** — every location searched, every constant used, and what the tool cannot see

Pulse reports what it observed — it does not tell you what to do about it.

Nothing in it is hidden or hand-waved: the constants that produce each number are printed in chapter 6, next to where they came from.

## Post the score

```bash
npx atlan-pulse --card
```

Writes `atlan-pulse-card.html` next to the report. Open it, hit **Download PNG**, and you have something sized for a timeline: your skill count, your invocations, how many have never run, and the command you ran to find out.

It carries numbers and nothing else — no skill names, no descriptions, no hint of what you work on. That is the point. Plenty of people who would not publish their skill library to a timeline will happily publish a score, and a score gives away nothing a competitor could use. There is a test in the suite that fails if a skill name ever reaches the card.

The skills themselves are meant to be shared — just privately, and with people you pick. That is `pack`, next.

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
  --transcripts <path>  session transcripts
                        (default: ~/.claude/projects, ~/.claude/sessions,
                         and the Codex session directories)
  --days <n>            invocation window, default 90
  --stale-days <n>      staleness threshold, default 180
  --out <path>          report path, default ./atlan-pulse-report.html
  --card                also write a share card you can post
  --logo <path>         logo for the report masthead (svg or png)
  --json                print the report model instead of writing HTML
  --debug-transcripts   show what was found in the transcripts, then stop
```

## Branding the report

The report ships with a built-in mark. To put your own logo on it, drop the file at `assets/logo.svg` in this repo, or point at one anywhere:

```bash
npx atlan-pulse --logo ~/Downloads/logo.svg
```

An SVG is inlined so the report stays one self-contained file; a PNG or JPG is embedded as a data URI. Any `<script>` in a supplied SVG is stripped — the report has no scripts in it and keeps it that way. Nothing is downloaded for you and no logo is bundled: use artwork you have the right to use.

## Privacy

Everything runs locally. There is no account, no telemetry, no network call except the one `install` makes when you hand it a URL. The report is a file on your disk. The package has **zero runtime dependencies** — the whole thing is auditable in an afternoon, which is rather the point for a tool that reads your prompts.

## What it cannot see

Worth stating plainly, because a tool like this is easy to over-trust:

- **Token counts are estimates** from character length, not a tokeniser run.
- **Duplicate detection is trigram similarity** on names and descriptions. It is a hint to go and look, not a verdict.
- **The permissions check reads declared frontmatter.** It is not a security scan and cannot see what a skill actually does.
- **Skills have to be on disk.** Scanned: `~/.claude/skills`, the Claude desktop app's materialised skills, this project's `.claude/skills`, `~/.claude/plugins`, and the Codex paths. Point it anywhere else with `--dir`. The desktop app writes a fresh copy per session, so only the most recent one is read — scanning them all would report every skill once per session and invent a duplicate pair for each.
- **Invocation counts depend on local session transcripts, which only the Claude Code CLI writes.** Verified against its `~/.claude/projects/**/*.jsonl` format. The Claude desktop app keeps no readable session history on disk — `~/.claude/sessions` there holds encryption keys, not transcripts — so on a desktop-only machine the three invocation-based checks report as unavailable rather than guessing. Run `--debug-transcripts` to see exactly what was searched and found; if a format is unrecognised, the tool names in that output are the fix, and they live in one place: `SKILL_TOOL_NAMES` in `src/adapters/local.js`.
- **It reads transcripts and nothing else.** Files that look like keys or credentials are never opened, and their names are withheld from diagnostic output — that output ends up in screenshots and issues.
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
