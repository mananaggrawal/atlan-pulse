import { DEFAULTS } from '../lib/constants.js';

// Trigram Jaccard over name + description. No embeddings, no network, no
// model call — a duplicate pair should be explainable in one sentence.
const trigrams = (text) => {
  const clean = text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const set = new Set();
  for (let i = 0; i < clean.length - 2; i += 1) set.add(clean.slice(i, i + 3));
  return set;
};

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
};

export default {
  id: 'near-duplicate',
  title: 'Description similarity',
  severity: 'medium',
  run({ skills, options }) {
    const threshold = options.duplicateThreshold ?? DEFAULTS.NEAR_DUPLICATE_THRESHOLD;
    const grams = skills.map((s) => ({ skill: s, set: trigrams(`${s.name} ${s.description}`) }));
    const pairs = [];

    for (let i = 0; i < grams.length; i += 1) {
      for (let j = i + 1; j < grams.length; j += 1) {
        const score = jaccard(grams[i].set, grams[j].set);
        if (score >= threshold) {
          pairs.push({ a: grams[i].skill, b: grams[j].skill, score });
        }
      }
    }
    if (!pairs.length) return null;

    pairs.sort((x, y) => y.score - x.score);
    return {
      severity: 'medium',
      headline: `${pairs.length} pair${pairs.length === 1 ? '' : 's'} of skills ${pairs.length === 1 ? 'scores' : 'score'} at or above the ${Math.round(threshold * 100)}% similarity threshold.`,
      rule: `\u2265${Math.round(threshold * 100)}% trigram overlap`,
      detail: `Similarity is trigram Jaccard overlap on name + description. No embeddings, no model call. The score measures wording, not behaviour.`,
      items: pairs.map((p) => ({
        name: `${p.a.name}  ↔  ${p.b.name}`,
        note: `${Math.round(p.score * 100)}% similar`,
        path: `${p.a.relPath}\n${p.b.relPath}`,
      })),
    };
  },
};
