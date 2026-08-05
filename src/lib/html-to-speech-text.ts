// Turns the HTML that mammoth extracts from a .docx into speech-friendly text.
//
// We use mammoth's convertToHtml (not extractRawText) so structure survives:
// headings, list items, and table rows each become their own sentence with a
// terminal pause, matching how the Markdown path reads. A flat extractRawText
// would jam a heading into the next paragraph with no pause.

import { finalizeSpeechText } from "./markdown-strip";

const BLOCK_WITH_PAUSE = new Set([
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "P",
  "LI",
]);
const SKIP = new Set(["IMG", "STYLE", "SCRIPT", "HEAD"]);
const TERMINAL = /[.!?…:;]$/;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function addSentence(lines: string[], text: string): void {
  const t = normalize(text);
  if (!t) return;
  lines.push(TERMINAL.test(t) ? t : t + ".");
}

function walk(node: Element, lines: string[]): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toUpperCase();
    if (SKIP.has(tag)) continue;

    if (BLOCK_WITH_PAUSE.has(tag)) {
      addSentence(lines, child.textContent || "");
    } else if (tag === "TABLE") {
      for (const row of Array.from(child.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll("th,td"))
          .map((c) => normalize(c.textContent || ""))
          .filter(Boolean);
        if (cells.length) addSentence(lines, cells.join(", "));
      }
    } else {
      // Containers (div, body, ul, ol, tbody, ...): recurse into their children.
      walk(child, lines);
    }
  }
}

export function htmlToSpeechText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  walk(doc.body, lines);
  return finalizeSpeechText(lines.join("\n\n"));
}
