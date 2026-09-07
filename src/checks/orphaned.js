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
      rule: 'no owner or author field in frontmatter',
      detail: 'Owner is read from the `owner` or `author` field in frontmatter. Nothing outside frontmatter is consulted.',
      items: orphans.map((s) => ({ name: s.name, note: 'no owner/author in frontmatter', path: s.relPath })),
    };
  },
};
