# Reviewing how a skill is written

The server checked structure: description present, trigger phrasing present,
owner recorded, references resolving, line count, keyword stuffing. All of that
is presence and shape. None of it is quality.

Two questions are yours.

## `trigger-quality`

**The question:** would this description actually win the request it is for,
and lose the ones it is not for?

Structural presence of "use when" proves nothing. The failure modes worth
reporting:

- **Describes the skill rather than the moment.** "Handles invoicing" tells the
  model what the skill *is*. "Use when the user asks to raise or chase an
  invoice" tells it *when to reach for it*. The second is what makes a skill
  fire.
- **Triggers on vocabulary the user would never type.** A description written in
  the team's internal noun ("run a GTM motion sweep") cannot match the sentence
  the user actually writes.
- **No boundary.** A skill adjacent to another one needs a clause saying what it
  is *not* for. Adjacent skills without boundaries are how a catalog develops a
  reputation for firing the wrong thing.

Write the replacement, don't describe it. Quote the current description.

## `instructions-are-unfollowable`

**The question:** if the model followed this body literally, could it finish?

Read the body as an operator with no context, not as the author. What stops a
run:

- A step with no object ("update the record" — which record, where?).
- An ordering that cannot hold (step 4 needs output step 6 produces).
- A decision with no rule attached ("use your judgment about which template" —
  judgment against what?).
- A referenced file, tool or command that is not bundled and not named
  precisely enough to find.
- Three hundred lines of prose with no steps at all, where the model has to
  guess what the procedure was.

Quote the step that breaks. One finding per skill is usually enough; if the
whole body is unfollowable, say that once rather than itemising ten symptoms.

## Progressive disclosure

If a skill is long *and* its length is mostly reference material — tables,
rubrics, examples, edge cases — the fix is not "make it shorter". It is to move
the reference material into files the body points at, so the common path stays
cheap and the detail is still there when it is needed. Say which sections
should move, by heading.

## The standard to hold it to

The best skill in the selection is the comparison, not an abstract ideal. If
one of the user's own skills already does triggers well, name it. "Match the
shape of `<their skill>`" is a more useful instruction than any rule, and it
is theirs, so it will be followed.
