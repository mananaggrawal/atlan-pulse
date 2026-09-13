# Reviewing duplication

The server measured two things: description overlap (trigram similarity) and
body overlap (shingles). Both catch skills that duplicate each other *in
wording*. Neither catches the case that matters most.

## `intent-overlap`

**The question:** do any two skills in this selection do the same job while
describing it in completely different words?

This is the expensive failure. Two skills that read alike get noticed by their
author eventually. Two skills that do the same work — one called
`invoice-chaser`, one called `payment-followup`, written months apart, sharing
no vocabulary — score near zero on every measurement and compete for the same
request forever. The model picks one, differently on different days, and the
user experiences it as the agent being unreliable rather than as a catalog
problem.

How to find it: ignore the words and ask what a user would have to type to want
each skill. If two skills answer the same sentence, they overlap, whatever
their descriptions look like.

Then check the inverse, which is just as real: two skills that *read* alike but
do genuinely different jobs. The server may have paired them on similarity. Say
so — `check: "false-positive"` with the line that distinguishes them — and the
report stops telling the user to merge two things that should stay apart.

## Say which one to keep

A duplicate pair with no recommendation is a problem handed back to the user.
For each real overlap, name the skill to keep and why, in one line. The usual
deciding factors, in order:

1. Which one actually gets invoked (the report has usage when telemetry exists).
2. Which one is more specific — a narrow skill that fires correctly beats a
   broad one that fires ambiguously.
3. Which one is maintained (the report has the last-commit date).

Then say what the survivor needs absorbed from the other: a trigger phrasing,
a step, an edge case. "Keep A, delete B" loses whatever B knew.

## Trigger collision without duplication

A third shape worth reporting, and nothing else on the market looks for it: two
skills that do different jobs but whose descriptions claim the same trigger
phrase. Nothing is duplicated — the overlap is in when they fire.

Report it against the skill whose description is the vaguer of the two, quote
the competing phrase, and suggest the narrowing clause that separates them
("…for outbound email; not for replies").

## What to submit

One finding per pair, not one per skill. Name the other skill in
`relatedSkillName`. Quote the line that convinced you — for intent overlap,
that is usually a step in the body, not the description.
