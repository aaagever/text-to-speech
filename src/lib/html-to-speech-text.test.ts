// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { htmlToSpeechText } from "./html-to-speech-text";

describe("htmlToSpeechText", () => {
  it("gives headings and paragraphs their own sentence with a pause", () => {
    const html = "<h1>The Report</h1><p>Body goes here</p>";
    expect(htmlToSpeechText(html)).toBe("The Report.\n\nBody goes here.");
  });

  it("keeps existing terminal punctuation", () => {
    expect(htmlToSpeechText("<p>Already done.</p>")).toBe("Already done.");
  });

  it("linearizes list items", () => {
    const html = "<ul><li>first</li><li>second</li></ul>";
    expect(htmlToSpeechText(html)).toBe("first.\n\nsecond.");
  });

  it("reads table rows cell by cell", () => {
    const html =
      "<table><tr><td>Name</td><td>Role</td></tr><tr><td>Ann</td><td>PM</td></tr></table>";
    expect(htmlToSpeechText(html)).toBe("Name, Role.\n\nAnn, PM.");
  });

  it("flattens inline formatting inside a paragraph", () => {
    const html = "<p>This is <strong>bold</strong> and <em>italic</em>.</p>";
    expect(htmlToSpeechText(html)).toBe("This is bold and italic.");
  });

  it("ignores images", () => {
    const html = '<p>Before</p><img src="x.png" /><p>After</p>';
    expect(htmlToSpeechText(html)).toBe("Before.\n\nAfter.");
  });

  it("handles Hebrew content", () => {
    const html = "<h2>כותרת</h2><p>פסקה בעברית</p>";
    expect(htmlToSpeechText(html)).toBe("כותרת.\n\nפסקה בעברית.");
  });
});
