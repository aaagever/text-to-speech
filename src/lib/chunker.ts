// Splits long text into chunks that fit a provider/model's per-request limit,
// preferring natural boundaries so the seams between synthesized parts land at
// paragraph and sentence breaks (where a short pause sounds natural).
//
// Guarantees:
//   - no chunk exceeds maxChars
//   - no characters are lost (only whitespace at boundaries is dropped)
// Works unchanged for Hebrew and other scripts: it only splits on whitespace
// and shared terminal punctuation (. ! ? …), never on letters.

// Split a paragraph into sentences: after . ! ? … followed by whitespace, and
// on single newlines. Decimals like "3.5" survive (no whitespace after the dot).
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Last resort for a single "sentence" longer than the limit (a wall of text
// with no punctuation): break at the last space before the limit, or hard-cut
// if there is no space at all.
function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = "";
  };

  // Greedily append a unit (paragraph or sentence, each already <= maxChars) to
  // the current chunk, starting a new chunk when it would overflow.
  const add = (unit: string, sep: string) => {
    if (!current) {
      current = unit;
    } else if (current.length + sep.length + unit.length <= maxChars) {
      current += sep + unit;
    } else {
      flush();
      current = unit;
    }
  };

  for (const paragraph of trimmed.split(/\n{2,}/)) {
    const p = paragraph.trim();
    if (!p) continue;

    if (p.length <= maxChars) {
      add(p, "\n\n");
      continue;
    }

    for (const sentence of splitSentences(p)) {
      if (sentence.length <= maxChars) {
        add(sentence, " ");
      } else {
        for (const piece of hardSplit(sentence, maxChars)) add(piece, " ");
      }
    }
  }

  flush();
  return chunks;
}
