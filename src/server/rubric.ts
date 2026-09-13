import type { AuditKind } from '../engine/types.ts';

/**
 * The open questions handed back to the reviewer.
 *
 * This is the contract between the deterministic half and the model half. It
 * lives here, in one place, rather than being restated in the skill text —
 * so a check added to the engine cannot silently leave the reviewer still
 * answering last month's questions.
 *
 * Every entry names the reference file that explains how to answer it, so the
 * skill can stay short and load exactly one file per dimension.
 */
export interface RubricQuestion {
  check: string;
  question: string;
  /** What a submitted finding of this kind must contain to be accepted. */
  requires: string;
}

export interface RubricSection {
  audit: AuditKind;
  reference: string;
  questions: RubricQuestion[];
}

const SECTIONS: RubricSection[] = [
  {
    audit: 'security',
    reference: 'references/reviewing-security.md',
    questions: [
      {
        check: 'injection-reachability',
        question:
          'Does content this skill fetches at run time reach a point where the agent would treat it as an instruction?',
        requires: 'the line that closes the loop, quoted — the follow-the-instructions line, not the URL',
      },
      {
        check: 'false-positive',
        question:
          'Is any flagged credential a documented placeholder, or any flagged capability plainly justified by what the skill does?',
        requires: 'the flagged line, quoted, and one clause saying why it is fine',
      },
    ],
  },
  {
    audit: 'vulnerability',
    reference: 'references/reviewing-security.md',
    questions: [
      {
        check: 'undisclosed-capability',
        question:
          'Does the skill — or any file it bundles — do something its description does not admit to?',
        requires: 'the line that performs the undisclosed action, quoted',
      },
    ],
  },
  {
    audit: 'dedupe',
    reference: 'references/reviewing-dedupe.md',
    questions: [
      {
        check: 'intent-overlap',
        question:
          'Do any two skills do the same job while describing it in completely different words?',
        requires: 'both skill names, and the line that convinced you, quoted',
      },
      {
        check: 'trigger-collision',
        question:
          'Do any two skills that do different jobs claim the same triggering phrase?',
        requires: 'the competing phrase, quoted, and the narrowing clause you propose',
      },
    ],
  },
  {
    audit: 'tokens',
    reference: 'references/reviewing-tokens.md',
    questions: [
      {
        check: 'description-can-be-shorter',
        question:
          'For each over-budget description, what is the shorter text that still wins the near-misses?',
        requires: 'the current description quoted, and the actual replacement text — not advice about writing one',
      },
      {
        check: 'dormant-but-loaded',
        question:
          'For each skill listed on every prompt and never invoked, is it unwanted, mis-triggered, or rare by design?',
        requires: 'which of the three, and the description quoted when you claim the trigger is the reason',
      },
    ],
  },
  {
    audit: 'improvement',
    reference: 'references/reviewing-improvement.md',
    questions: [
      {
        check: 'trigger-quality',
        question:
          'Would this description win the request it is for, and lose the ones it is not for?',
        requires: 'the current description quoted, and the replacement text',
      },
      {
        check: 'instructions-are-unfollowable',
        question:
          'If the model followed this body literally, could it finish? Where does it stop?',
        requires: 'the step that breaks, quoted',
      },
    ],
  },
];

export function rubricFor(audits: AuditKind[]): RubricSection[] {
  return SECTIONS.filter((s) => audits.includes(s.audit));
}

/** Every check name a reviewer is allowed to submit. */
export function reviewerChecks(): Set<string> {
  return new Set(SECTIONS.flatMap((s) => s.questions.map((q) => q.check)));
}
