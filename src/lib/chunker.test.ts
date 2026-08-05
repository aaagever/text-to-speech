import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

const lettersOnly = (s: string) => s.replace(/\s+/g, "");

describe("chunkText basics", () => {
  it("returns a single chunk when under the limit", () => {
    expect(chunkText("short text", 100)).toEqual(["short text"]);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunkText("", 100)).toEqual([]);
    expect(chunkText("   \n\n  ", 100)).toEqual([]);
  });

  it("packs whole paragraphs greedily", () => {
    const text = "aaaa\n\nbbbb\n\ncccc"; // 3 paragraphs of 4 chars
    // limit 10 fits two 4-char paragraphs + "\n\n" (10) per chunk
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(["aaaa\n\nbbbb", "cccc"]);
  });
});

describe("chunkText invariants (property checks)", () => {
  const samples = [
    "Paragraph one is here. It has several sentences! Does it split well? Yes.\n\n" +
      "Paragraph two continues the thought with more words and clauses, going on.",
    "אחת שתיים שלוש. משפט נוסף בעברית כדי לבדוק פיצול נכון! והנה עוד משפט ארוך מאוד.",
    "wordwithoutanyspacesorpunctuationthatgoesonandonandonforalongwhile".repeat(5),
    "Mix of לעברית and English in one paragraph, testing boundaries and limits here.",
  ];

  for (const limit of [20, 50, 120]) {
    it(`never exceeds the limit (${limit})`, () => {
      for (const s of samples) {
        for (const chunk of chunkText(s, limit)) {
          expect(chunk.length).toBeLessThanOrEqual(limit);
        }
      }
    });

    it(`never loses characters (${limit})`, () => {
      for (const s of samples) {
        const chunks = chunkText(s, limit);
        expect(lettersOnly(chunks.join(""))).toBe(lettersOnly(s));
      }
    });
  }
});

describe("chunkText boundary strategy", () => {
  it("splits an oversized paragraph at sentence boundaries", () => {
    const text = "First sentence here. Second sentence here. Third one here.";
    const chunks = chunkText(text, 30);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30);
    expect(chunks.length).toBeGreaterThan(1);
    // keeps decimals intact (3.5 must not become a boundary)
    expect(chunkText("The rate is 3.5 percent today.", 100)).toEqual([
      "The rate is 3.5 percent today.",
    ]);
  });

  it("hard-splits a spaceless wall of text", () => {
    const wall = "x".repeat(250);
    const chunks = chunkText(wall, 100);
    expect(chunks).toEqual(["x".repeat(100), "x".repeat(100), "x".repeat(50)]);
  });
});
