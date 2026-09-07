/** "1 skill" / "2 skills" */
export const plural = (n, word, pluralForm) => `${n} ${n === 1 ? word : pluralForm ?? `${word}s`}`;
/** the verb that agrees with a count: 1 skill declares, 2 skills declare */
export const agrees = (n, singular, pluralForm) => (n === 1 ? singular : pluralForm);
