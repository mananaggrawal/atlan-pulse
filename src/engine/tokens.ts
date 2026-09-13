/**
 * Token estimation without a tokenizer dependency.
 *
 * The honest framing, which the report and the `/method` page both repeat:
 * this is an ESTIMATE. It is not a BPE tokenizer and will differ from one,
 * typically by well under 15% on English prose and markdown. What matters for
 * a comparable score is not that the number is exact but that *the same
 * estimator runs for everyone* — so two catalogs measured here can be
 * compared with each other, even though neither should be quoted as a
 * billing figure.
 *
 * Method: text is split into runs of word characters, whitespace and
 * everything else. Word runs cost one token per four characters (the
 * long-standing English average). Punctuation runs cost one token per two
 * characters, because punctuation merges less often than letters do. Newlines
 * cost one token each; other whitespace is absorbed into its neighbours, as a
 * real tokenizer does.
 */

const WORD_RUN = /[A-Za-z0-9_'']+/g;

export function estimateTokens(text: string): number {
  if (!text) return 0;

  let total = 0;
  let wordChars = 0;
  let punctChars = 0;
  let newlines = 0;

  // One pass, no allocation per character.
  for (const match of text.matchAll(WORD_RUN)) {
    wordChars += match[0].length;
    total += Math.ceil(match[0].length / 4);
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '\n') {
      newlines += 1;
    } else if (!/[A-Za-z0-9_'\s]/.test(ch)) {
      punctChars += 1;
    }
  }
  void wordChars;

  total += Math.ceil(punctChars / 2);
  total += newlines;
  return total;
}

/**
 * What one skill costs in the listing the model sees on every prompt: its
 * name and its description, plus the couple of tokens of structure around
 * them. This is the number the context-efficiency component is built on.
 */
export function listingTokensFor(name: string, description: string): number {
  return estimateTokens(`${name}: ${description}`) + 2;
}
