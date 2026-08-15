// Fetches a web article by URL and returns clean, speakable text.
//
// The app is fully static and cannot fetch arbitrary pages directly (almost no
// site sends permissive CORS headers), so this goes through Jina Reader
// (r.jina.ai), a free service that renders the page, strips ads/nav/boilerplate,
// and returns article Markdown. Verified to allow browser calls from this app's
// origin. No API key is involved: the keyless tier allows roughly 20 requests a
// minute, which is plenty for one person. The page URL is sent to Jina; nothing
// else leaves the browser (see decisions.md for the privacy note and why Exa and
// a self-hosted proxy were not chosen).
//
// The returned Markdown needs no special cleanup here: App runs stripMarkdown on
// all text, which turns links into their text, images into alt text, tables into
// spoken cells, and drops code blocks.

import { createLogger } from "./log";
import { recordFetchAttempt } from "./debug";

const log = createLogger("fetch");

export const JINA_READER_BASE = "https://r.jina.ai/";

// Client-side ceiling for the whole fetch. Jina is also asked to cap its own
// page rendering (X-Timeout below); this covers everything else.
export const FETCH_TIMEOUT_MS = 45_000;

// Less article text than this means extraction failed (a cookie wall, a paywall
// stub, a login page), even when the request itself succeeded.
export const MIN_ARTICLE_CHARS = 200;

export interface FetchedArticle {
  text: string;
  // Human label for the "Loaded: X" line: the article title, or the hostname.
  sourceName: string;
}

// Same terminal-punctuation set the Markdown stripper uses, so a composed title
// gets a pause exactly when it needs one.
const TERMINAL = /[.!?…:;]$/;

const INVALID_URL_MESSAGE =
  "That doesn't look like a web address. Paste a full link like example.com/article.";

// Accept what a person actually pastes: a bare domain, a full URL, or one with
// stray whitespace. Throws a friendly Error when it can't be made sense of.
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(INVALID_URL_MESSAGE);

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : // A scheme-less "mailto:x" style string must not silently become a URL.
      /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(INVALID_URL_MESSAGE);
  }
  // A hostname with no dot is not a public page (also excludes localhost, which
  // Jina could not reach anyway).
  if (!url.hostname.includes(".")) throw new Error(INVALID_URL_MESSAGE);

  return url.toString();
}

// Put the article title at the top so the audio starts by saying what this is.
// Skipped when the extracted content already opens with the title.
export function composeArticleText(
  title: string | undefined,
  content: string
): string {
  const t = (title ?? "").trim();
  const body = content.trim();
  if (!t) return body;
  if (body.toLowerCase().startsWith(t.toLowerCase())) return body;
  return `${t}${TERMINAL.test(t) ? "" : "."}\n\n${body}`;
}

export function displayNameFor(
  title: string | undefined,
  finalUrl: string
): string {
  const t = (title ?? "").trim();
  if (t) return t;
  try {
    return new URL(finalUrl).hostname.replace(/^www\./, "");
  } catch {
    return finalUrl;
  }
}

function messageForStatus(status: number): string {
  if (status === 404 || status === 410) {
    return "That page couldn't be found. Check the address is right and publicly reachable.";
  }
  if (status === 401 || status === 403 || status === 422 || status === 451) {
    return "That page couldn't be read. It may be behind a paywall or a login.";
  }
  if (status === 429) {
    return "The article service is rate-limited right now (about 20 fetches a minute). Wait a minute and try again.";
  }
  if (status >= 500) {
    return "The article service hit a server error. This is on their end; try again in a moment.";
  }
  return `The article service couldn't read that page (status ${status}).`;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

interface JinaResponse {
  data?: { title?: string; content?: string; url?: string };
}

// Fetch one article. Rethrows the caller's AbortError untouched so a user cancel
// stays distinct from a failure; every other problem becomes a friendly Error.
// Each attempt is recorded for the "Copy details" report.
export async function fetchArticle(
  rawUrl: string,
  signal?: AbortSignal
): Promise<FetchedArticle> {
  const url = normalizeUrl(rawUrl); // throws before any attempt is recorded
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const record = (
    outcome: "ok" | "failed" | "cancelled",
    extra: { httpStatus?: number; contentChars?: number; error?: string; bodySnippet?: string } = {}
  ) => {
    recordFetchAttempt({ url, startedAt, ms: Date.now() - startMs, outcome, ...extra });
  };

  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  log.info(`fetching ${url}`);

  let res: Response;
  try {
    res = await fetch(`${JINA_READER_BASE}${encodeURIComponent(url)}`, {
      headers: {
        Accept: "application/json",
        // Image markdown would just be spoken as alt text noise.
        "X-Retain-Images": "none",
        // Cap Jina's own page rendering, under our client timeout.
        "X-Timeout": "30",
      },
      signal: combined,
    });
  } catch (err) {
    if (isAbort(err)) {
      log.info("fetch cancelled");
      record("cancelled");
      throw err;
    }
    if (isTimeout(err)) {
      const message =
        "Fetching that page took too long. The site may be slow or blocking readers; try again in a moment.";
      log.error(message);
      record("failed", { error: message });
      throw new Error(message);
    }
    const message =
      "Couldn't reach the article service. Check your internet connection and try again.";
    log.error("network error while fetching:", err);
    record("failed", { error: `${message} (${err instanceof Error ? err.message : String(err)})` });
    throw new Error(message);
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
    const message = messageForStatus(res.status);
    log.error(`fetch failed: status=${res.status} body=${body}`);
    record("failed", { httpStatus: res.status, error: message, bodySnippet: body || undefined });
    throw new Error(message);
  }

  const extractionFailed =
    "Couldn't find readable article text at that address.";

  let json: JinaResponse;
  try {
    json = (await res.json()) as JinaResponse;
  } catch (err) {
    if (isAbort(err)) {
      record("cancelled");
      throw err;
    }
    log.error("could not parse the reader response:", err);
    record("failed", { httpStatus: res.status, error: extractionFailed });
    throw new Error(extractionFailed);
  }

  const content = (json.data?.content ?? "").trim();
  if (content.length < MIN_ARTICLE_CHARS) {
    log.error(`extraction too short: ${content.length} chars`);
    record("failed", {
      httpStatus: res.status,
      contentChars: content.length,
      error: extractionFailed,
    });
    throw new Error(extractionFailed);
  }

  const text = composeArticleText(json.data?.title, content);
  const sourceName = displayNameFor(json.data?.title, json.data?.url ?? url);
  log.info(`fetched "${sourceName}", ${text.length} chars`);
  record("ok", { httpStatus: res.status, contentChars: text.length });
  return { text, sourceName };
}
