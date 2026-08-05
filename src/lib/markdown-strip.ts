// Converts Markdown (and plain pasted text) into speech-friendly plain text,
// so a screen reader / TTS engine never voices "hashtag hashtag title" or reads
// a raw URL character by character.
//
// Every rule targets ASCII Markdown markers only, so non-ASCII scripts
// (Hebrew, Arabic, CJK) pass through untouched. It is also safe to run on plain
// prose: the heading rule requires "# " (hash + space), so "#1 priority" and
// "issue #42" survive unchanged.

const TERMINAL = /[.!?…:;]$/;

// Collapse intra-line whitespace and excess blank lines. Paragraph boundaries
// (one blank line) are preserved so the chunker can split on them later.
export function finalizeSpeechText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trimEnd();
}

// Give a heading / cell / list item a terminal pause when it lacks one, so the
// voice doesn't run it into the next line.
function withPause(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return TERMINAL.test(t) ? t : t + ".";
}

// ---- Pass 2: per-line block transforms --------------------------------------

function transformLine(line: string): string | null {
  // Horizontal rule / setext underline: --- *** ___ === (drop entirely).
  if (/^\s{0,3}([-*_=])(\s*\1){2,}\s*$/.test(line)) return null;

  // ATX heading: keep the text, strip trailing closing hashes, add a pause.
  const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
  if (heading) return withPause(heading[1]);

  // Link reference definition: [label]: https://...  (drop).
  if (/^\s*\[[^\]]+\]:\s+\S+/.test(line)) return null;

  // Table rows (any line containing a pipe).
  if (line.includes("|")) {
    // Delimiter row ( |---|:--:| ) -> drop.
    if (/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line)) return null;
    const cells = line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length) return withPause(cells.join(", "));
    return null;
  }

  // Blockquote markers (possibly nested): "> > text".
  let out = line.replace(/^(\s*>\s?)+/, "");

  // List markers: bullets (- * +) and ordered (1. / 1)), then task checkboxes.
  out = out.replace(/^(\s*)([-*+]|\d{1,3}[.)])\s+/, "$1");
  out = out.replace(/^(\s*)\[[ xX]\]\s+/, "$1");

  return out;
}

// ---- Pass 3: inline transforms (run on the whole text) ----------------------

// Backslash-escaped punctuation is swapped for atomic placeholder codepoints
// (one per character, in the Private Use Area) BEFORE any markup parsing, then
// restored last. This keeps an escaped "\*" from being read as emphasis.
const ESCAPE_BASE = 0xe000;
const PLACEHOLDER_RE = new RegExp("[\\uE000-\\uE0ff]", "g");

function protectEscapes(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_m, ch: string) =>
    String.fromCharCode(ESCAPE_BASE + ch.charCodeAt(0))
  );
}

function restoreEscapes(text: string): string {
  return text.replace(PLACEHOLDER_RE, (m) =>
    String.fromCharCode(m.charCodeAt(0) - ESCAPE_BASE)
  );
}

function transformInline(text: string): string {
  return restoreEscapes(
    protectEscapes(text)
      // Images -> alt text (drop when alt is empty).
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Inline links [text](url) and reference links [text][ref] -> text.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
      // Autolinks: <https://x> -> bare url (handled below), <mailto:a@b> -> a@b.
      .replace(/<(https?:\/\/[^>]+)>/gi, "$1")
      .replace(/<mailto:([^>]+)>/gi, "$1")
      // Bare URLs -> hostname without www (reading a full URL aloud is the worst
      // artifact; the hostname keeps the referent).
      .replace(/\bhttps?:\/\/([^\s/]+)(?:\/[^\s]*)?/gi, (_m, host: string) =>
        host.replace(/^www\./i, "")
      )
      // Emphasis, longest marker first so nesting resolves outer-to-inner.
      .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, "$1")
      // Italic underscore only when not word-internal, so snake_case survives.
      .replace(/(?<![A-Za-z0-9_])_(?!_)(.+?)_(?![A-Za-z0-9_])/g, "$1")
      // Strikethrough and inline code keep their inner text.
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      // Footnote references [^1] -> drop.
      .replace(/\[\^[^\]]+\]/g, "")
      // HTML tags -> strip tag, keep inner text. Requires a letter after "<",
      // so arithmetic like "3 < 5" is left alone.
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
  );
}

export function stripMarkdown(input: string): string {
  // Normalize line endings, then remove HTML comments (they may span lines).
  const text = input.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");

  const lines = text.split("\n");

  // Drop YAML frontmatter, but only when the document actually starts with it.
  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === "---" || t === "...") {
        start = i + 1;
        break;
      }
    }
  }

  const out: string[] = [];
  let inFence = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks (``` or ~~~): drop the fences and everything between.
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const transformed = transformLine(line);
    if (transformed !== null) out.push(transformed);
  }

  return finalizeSpeechText(transformInline(out.join("\n")));
}
