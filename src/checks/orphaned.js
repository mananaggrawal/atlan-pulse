export default {
  id: 'orphaned',
  title: 'No owner',
  severity: 'low',
  run({ skills }) {
    const orphans = skills.filter((s) => !s.owner);
    if (!orphans.length) return null;
    const pct = Math.round((orphans.length / skills.length) * 100);
    return {
      severity: pct > 80 ? 'medium' : 'low',
      headline: `${orphans.length} of ${skills.length} skills (${pct}%) ${orphans.length === 1 ? 'declares' : 'declare'} no owner.`,
      detail: 'On one laptop this is cosmetic. The moment a second person installs one of these, it is the difference between a skill someone maintains and a skill everyone assumes someone else maintains.',
      items: orphans.map((s) => ({ name: s.name, note: 'no owner/author in frontmatter', path: s.relPath })),
    };
  },
};
