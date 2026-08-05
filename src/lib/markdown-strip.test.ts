import { describe, it, expect } from "vitest";
import { stripMarkdown } from "./markdown-strip";

describe("stripMarkdown headings", () => {
  it("keeps heading text and drops the hashes", () => {
    expect(stripMarkdown("## The Onboarding Trap")).toBe("The Onboarding Trap.");
  });

  it("adds a terminal pause only when missing", () => {
    expect(stripMarkdown("# Ready?")).toBe("Ready?");
    expect(stripMarkdown("# Let's go!")).toBe("Let's go!");
  });

  it("strips trailing closing hashes", () => {
    expect(stripMarkdown("## Heading ##")).toBe("Heading.");
  });

  it("leaves '#1 priority' and 'issue #42' alone (no space after hash)", () => {
    expect(stripMarkdown("#1 priority")).toBe("#1 priority");
    expect(stripMarkdown("issue #42 is open")).toBe("issue #42 is open");
  });
});

describe("stripMarkdown code and frontmatter", () => {
  it("drops fenced code blocks entirely", () => {
    const md = "Before.\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\nAfter.";
    expect(stripMarkdown(md)).toBe("Before.\n\nAfter.");
  });

  it("drops tilde fences too", () => {
    expect(stripMarkdown("A\n\n~~~\ncode\n~~~\n\nB")).toBe("A\n\nB");
  });

  it("removes YAML frontmatter only at the document start", () => {
    const md = "---\ntitle: Hi\ndate: 2026\n---\n\nBody text.";
    expect(stripMarkdown(md)).toBe("Body text.");
  });

  it("treats a mid-document --- as a horizontal rule, not frontmatter", () => {
    expect(stripMarkdown("Part one.\n\n---\n\nPart two.")).toBe(
      "Part one.\n\nPart two."
    );
  });
});

describe("stripMarkdown inline", () => {
  it("unwraps nested emphasis", () => {
    expect(stripMarkdown("This is **bold with *italic* inside** here")).toBe(
      "This is bold with italic inside here"
    );
  });

  it("keeps snake_case intact", () => {
    expect(stripMarkdown("call snake_case_word now")).toBe(
      "call snake_case_word now"
    );
  });

  it("turns links into their anchor text", () => {
    expect(stripMarkdown("see [the docs](https://example.com/x) now")).toBe(
      "see the docs now"
    );
  });

  it("reduces bare URLs to the hostname without www", () => {
    expect(stripMarkdown("read https://www.example.com/a/b?x=1 today")).toBe(
      "read example.com today"
    );
  });

  it("uses image alt text and drops empty alt", () => {
    expect(stripMarkdown("![a chart](chart.png) shows growth")).toBe(
      "a chart shows growth"
    );
    expect(stripMarkdown("![](logo.png) after")).toBe("after");
  });

  it("keeps inline code and strikethrough content", () => {
    expect(stripMarkdown("use `npm run dev` and ~~stop~~ go")).toBe(
      "use npm run dev and stop go"
    );
  });

  it("resolves backslash escapes", () => {
    expect(stripMarkdown("a literal \\*asterisk\\* here")).toBe(
      "a literal *asterisk* here"
    );
  });

  it("strips HTML tags but leaves arithmetic like 3 < 5", () => {
    expect(stripMarkdown("bold <b>text</b> and 3 < 5 holds")).toBe(
      "bold text and 3 < 5 holds"
    );
  });
});

describe("stripMarkdown blocks", () => {
  it("linearizes all list types, dropping the markers", () => {
    const md = "- first\n- second\n\n1. one\n2. two";
    expect(stripMarkdown(md)).toBe("first\nsecond\n\none\ntwo");
  });

  it("strips task checkboxes", () => {
    expect(stripMarkdown("- [ ] todo\n- [x] done")).toBe("todo\ndone");
  });

  it("strips blockquote markers including nested", () => {
    expect(stripMarkdown("> outer\n> > inner")).toBe("outer\ninner");
  });

  it("renders a table row per line and drops the delimiter row", () => {
    const md = "| Name | Role |\n| :--- | ---: |\n| Ann | PM |\n| Bo | Eng |";
    expect(stripMarkdown(md)).toBe("Name, Role.\nAnn, PM.\nBo, Eng.");
  });
});

describe("stripMarkdown Hebrew safety", () => {
  it("passes Hebrew heading text and emphasis through untouched", () => {
    expect(stripMarkdown("## שלום עולם")).toBe("שלום עולם.");
    expect(stripMarkdown("זה **מודגש** טקסט")).toBe("זה מודגש טקסט");
  });

  it("leaves a full RTL paragraph unchanged", () => {
    const he = "המוצר שלנו עוזר לצוותים לצמוח מהר יותר.";
    expect(stripMarkdown(he)).toBe(he);
  });
});

describe("stripMarkdown whitespace", () => {
  it("collapses excess blank lines and spaces", () => {
    expect(stripMarkdown("a\n\n\n\nb    c")).toBe("a\n\nb c");
  });

  it("is a no-op on clean plain prose", () => {
    const plain = "The best onboarding is an activation experiment.";
    expect(stripMarkdown(plain)).toBe(plain);
  });
});
