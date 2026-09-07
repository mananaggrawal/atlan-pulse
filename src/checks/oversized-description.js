import { ANCHORS } from '../lib/constants.js';
import { plural, agrees } from '../lib/text.js';

export default {
  id: 'oversized-description',
  title: 'Oversized descriptions',
  severity: 'medium',
  run({ skills }) {
    const over = skills.filter((s) => s.descriptionChars > ANCHORS.MAX_DESCRIPTION_CHARS);
    if (!over.length) return null;
    return {
      severity: 'medium',
      headline: `${plural(over.length, 'skill')} ${agrees(over.length, 'exceeds', 'exceed')} the ${ANCHORS.MAX_DESCRIPTION_CHARS}-character description limit.`,
      detail: 'Descriptions beyond the limit risk being truncated in the listing, which is what the model actually reads when deciding whether to use a skill.',
      items: over
        .sort((a, b) => b.descriptionChars - a.descriptionChars)
        .map((s) => ({ name: s.name, note: `${s.descriptionChars} chars (+${s.descriptionChars - ANCHORS.MAX_DESCRIPTION_CHARS})`, path: s.relPath })),
    };
  },
};
