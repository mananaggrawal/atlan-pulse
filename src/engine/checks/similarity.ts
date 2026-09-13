import type { AuditFinding, AuditSkillInput } from '../types.ts';
import { DESCRIPTION_SIMILARITY_THRESHOLD, BODY_SHINGLE_THRESHOLD } from '../constants.ts';

/**
 * Two ways two skills can be the same thing, both measurable.
 *
 * `description-similarity` catches the pair that would compete for the same
 * request — the expensive kind, because the model has to choose and may
 * choose differently each time. `body-near-duplicate` catches the copy-paste
 * fork: someone took a working skill, changed a heading and a couple of
 * nouns, and now there are two to maintain.
 *
 * Neither of these catches two skills that do the same job in completely
 * different words. That one needs a model, and it lives in the reviewer
 * layer, where it stays out of the score.
 */

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Descriptions are mostly trigger boilerplate — "use when the user asks to…"
 * opens a large share of every well-written one. Left in, that shared
 * scaffolding alone pushes two completely unrelated short descriptions past
 * the threshold, which is how a duplicate check earns a reputation for crying
 * wolf. Stripping it compares what the skills are actually FOR.
 */
const STOPWORDS = new Set(
  ('a an the to of for and or in on at with from by this that it is are be am was were use used using user users ' +
    'when whenever while ask asks asked asking want wants wanted need needs needed should would could will shall ' +
    'please you your they their them we our us i me my if then than so as any some all each every into out up down ' +
    'about over under again further once here there where which who whom what how why do does did doing done')
    .split(' '),
);

function contentWords(text: string): string {
  return normalise(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .join(' ');
}

function trigrams(text: string): Set<string> {
  const t = contentWords(text);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i += 1) out.add(t.slice(i, i + 3));
  return out;
}

function shingles(text: string, n = 5): Set<string> {
  const words = normalise(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(' '));
  return out;
}

/** Jaccard: shared members over total distinct members. 0 when both are empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

export function checkSimilarity(skills: AuditSkillInput[]): {
  findings: AuditFinding[];
  duplicatePairs: number;
  /** Names involved in at least one pair — the uniqueness component needs the count. */
  skillsInPairs: Set<string>;
} {
  const findings: AuditFinding[] = [];
  const skillsInPairs = new Set<string>();

  const prepared = skills.map((s) => ({
    skill: s,
    descTrigrams: trigrams(s.description ?? ''),
    bodyShingles: shingles(s.body ?? ''),
  }));

  let duplicatePairs = 0;

  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i]!;
      const b = prepared[j]!;

      // Too little left after stripping boilerplate to compare honestly.
      const comparable = a.descTrigrams.size >= 8 && b.descTrigrams.size >= 8;
      const descScore = comparable ? jaccard(a.descTrigrams, b.descTrigrams) : 0;
      const bodyScore = jaccard(a.bodyShingles, b.bodyShingles);

      const descHit = descScore >= DESCRIPTION_SIMILARITY_THRESHOLD;
      const bodyHit = bodyScore >= BODY_SHINGLE_THRESHOLD;
      if (!descHit && !bodyHit) continue;

      duplicatePairs += 1;
      skillsInPairs.add(a.skill.name);
      skillsInPairs.add(b.skill.name);

      if (descHit) {
        findings.push({
          audit: 'dedupe',
          check: 'description-similarity',
          severity: 'medium',
          skillName: a.skill.name,
          relatedSkillName: b.skill.name,
          headline: `Description overlaps "${b.skill.name}" at ${Math.round(descScore * 100)}%`,
          rule: `>=${Math.round(DESCRIPTION_SIMILARITY_THRESHOLD * 100)}% trigram overlap between descriptions`,
          detail:
            'Two descriptions this close compete for the same request, so which one runs is not stable.',
          stat: { similarityPct: Math.round(descScore * 1000) / 10 },
        });
      }
      if (bodyHit) {
        findings.push({
          audit: 'dedupe',
          check: 'body-near-duplicate',
          severity: 'medium',
          skillName: a.skill.name,
          relatedSkillName: b.skill.name,
          headline: `Body overlaps "${b.skill.name}" at ${Math.round(bodyScore * 100)}%`,
          rule: `>=${Math.round(BODY_SHINGLE_THRESHOLD * 100)}% overlap of 5-word body sequences`,
          detail: 'Measured on 5-word sequences, so reordered paragraphs still match.',
          stat: { similarityPct: Math.round(bodyScore * 1000) / 10 },
        });
      }
    }
  }

  return { findings, duplicatePairs, skillsInPairs };
}
