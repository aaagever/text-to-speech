// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeArticleText,
  displayNameFor,
  fetchArticle,
  looksLikeUrl,
  normalizeUrl,
  JINA_READER_BASE,
  MIN_ARTICLE_CHARS,
} from "./fetch-article";
import { formatDebugReport, getFetchAttempts } from "./debug";

function fakeResponse(props: {
  ok: boolean;
  status?: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}): Response {
  return props as unknown as Response;
}

function article(chars = 500): string {
  return "a".repeat(chars);
}

function okResponse(data: { title?: string; content?: string; url?: string }): Response {
  return fakeResponse({ ok: true, status: 200, json: () => Promise.resolve({ data }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeUrl", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(normalizeUrl("example.com/post")).toBe("https://example.com/post");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com/");
  });

  it("preserves an explicit http scheme", () => {
    expect(normalizeUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  it("preserves path, query, and fragment", () => {
    expect(normalizeUrl("example.com/a/b?x=1&y=2#frag")).toBe(
      "https://example.com/a/b?x=1&y=2#frag"
    );
  });

  it("rejects non-http protocols", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow(/web address/i);
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(/web address/i);
    expect(() => normalizeUrl("mailto:a@b.com")).toThrow(/web address/i);
  });

  it("rejects empty, malformed, and dotless hosts", () => {
    expect(() => normalizeUrl("")).toThrow(/web address/i);
    expect(() => normalizeUrl("   ")).toThrow(/web address/i);
    expect(() => normalizeUrl("not a url")).toThrow(/web address/i);
    expect(() => normalizeUrl("https://")).toThrow(/web address/i);
    expect(() => normalizeUrl("localhost:3000")).toThrow(/web address/i);
  });
});

describe("looksLikeUrl", () => {
  it("recognizes a link with or without a scheme", () => {
    expect(looksLikeUrl("https://example.com/a?b=1")).toBe(true);
    expect(looksLikeUrl("http://example.com")).toBe(true);
    expect(looksLikeUrl("example.com")).toBe(true);
    expect(looksLikeUrl("www.example.co.il/article/123")).toBe(true);
    expect(looksLikeUrl("  example.com/post  ")).toBe(true);
  });

  it("rejects prose, which is never one bare token", () => {
    expect(looksLikeUrl("Hello there.")).toBe(false);
    expect(looksLikeUrl("Read example.com for more")).toBe(false);
    expect(looksLikeUrl("Line one\nexample.com")).toBe(false);
    expect(looksLikeUrl("שלום עולם")).toBe(false);
  });

  it("rejects tokens that only look domain-ish", () => {
    expect(looksLikeUrl("e.g.")).toBe(false); // trailing dot, no TLD
    expect(looksLikeUrl("hello")).toBe(false); // no dot
    expect(looksLikeUrl("3.5")).toBe(false); // numeric TLD
    expect(looksLikeUrl("")).toBe(false);
    expect(looksLikeUrl("   ")).toBe(false);
  });

  it("rejects a very long single token", () => {
    expect(looksLikeUrl(`example.com/${"a".repeat(2100)}`)).toBe(false);
  });
});

describe("composeArticleText", () => {
  it("prepends the title with a terminal period", () => {
    expect(composeArticleText("My Title", "Body text.")).toBe("My Title.\n\nBody text.");
  });

  it("does not double the punctuation when the title already ends with some", () => {
    expect(composeArticleText("Why bother?", "Body.")).toBe("Why bother?\n\nBody.");
  });

  it("does not repeat a title the content already starts with", () => {
    expect(composeArticleText("My Title", "My Title\n\nBody.")).toBe("My Title\n\nBody.");
  });

  it("passes the content through when there is no usable title", () => {
    expect(composeArticleText(undefined, "Body.")).toBe("Body.");
    expect(composeArticleText("   ", "Body.")).toBe("Body.");
  });
});

describe("displayNameFor", () => {
  it("prefers the title", () => {
    expect(displayNameFor("A Post", "https://www.example.com/a")).toBe("A Post");
  });

  it("falls back to the hostname without www", () => {
    expect(displayNameFor(undefined, "https://www.example.com/a")).toBe("example.com");
    expect(displayNameFor("  ", "https://example.com/a")).toBe("example.com");
  });
});

describe("fetchArticle", () => {
  it("requests the encoded URL through Jina with the expected headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ title: "T", content: article() }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchArticle("example.com/a?b=1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${JINA_READER_BASE}${encodeURIComponent("https://example.com/a?b=1")}`);
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers["X-Retain-Images"]).toBe("none");
    expect(init.headers["X-Timeout"]).toBe("30");
  });

  it("returns composed text and a source name on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ title: "Great Work", content: article() }))
    );
    const out = await fetchArticle("example.com/a");
    expect(out.sourceName).toBe("Great Work");
    expect(out.text.startsWith("Great Work.\n\n")).toBe(true);
  });

  it("maps rate limiting to wait-a-minute copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ ok: false, status: 429, text: () => Promise.resolve("rate limited") })
      )
    );
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/wait a minute/i);
  });

  it("maps paywall-ish statuses to a paywall message", async () => {
    for (const status of [401, 403, 422, 451]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(fakeResponse({ ok: false, status, text: () => Promise.resolve("") }))
      );
      await expect(fetchArticle("example.com/a")).rejects.toThrow(/paywall or a login/i);
    }
  });

  it("maps 404 and 5xx to their own messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404, text: () => Promise.resolve("") }))
    );
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/couldn't be found/i);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 503, text: () => Promise.resolve("") }))
    );
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/server error/i);
  });

  it("maps a network failure and a timeout to distinct messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/couldn't reach/i);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    );
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/took too long/i);
  });

  it("rethrows a user abort untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))
    );
    const err = await fetchArticle("example.com/a").catch((e) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });

  it("treats malformed JSON as an extraction failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ ok: true, status: 200, json: () => Promise.reject(new Error("bad json")) })
      )
    );
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/readable article text/i);
  });

  it("rejects content just under the minimum and accepts it at the minimum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ content: article(MIN_ARTICLE_CHARS - 1) }))
    );
    await expect(fetchArticle("example.com/a")).rejects.toThrow(/readable article text/i);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ content: article(MIN_ARTICLE_CHARS) }))
    );
    await expect(fetchArticle("example.com/a")).resolves.toBeTruthy();
  });
});

describe("debug recording of fetch attempts", () => {
  it("records a failure with status and body snippet, and shows it in the report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          ok: false,
          status: 451,
          text: () => Promise.resolve("blocked for legal reasons"),
        })
      )
    );
    await fetchArticle("example.com/paywalled").catch(() => {});

    const attempt = getFetchAttempts()[0];
    expect(attempt.outcome).toBe("failed");
    expect(attempt.httpStatus).toBe(451);
    expect(attempt.bodySnippet).toContain("blocked for legal reasons");

    const report = formatDebugReport();
    expect(report).toContain("url fetches:");
    expect(report).toContain("example.com/paywalled");
    expect(report).toContain("blocked for legal reasons");
  });

  it("records a success with the character count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ title: "T", content: article(300) }))
    );
    await fetchArticle("example.com/ok");

    const attempt = getFetchAttempts()[0];
    expect(attempt.outcome).toBe("ok");
    expect(attempt.contentChars).toBeGreaterThan(300);
  });

  it("records a user cancel as cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))
    );
    await fetchArticle("example.com/cancelled").catch(() => {});

    expect(getFetchAttempts()[0].outcome).toBe("cancelled");
  });
});
