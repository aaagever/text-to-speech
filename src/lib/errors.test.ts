import { afterEach, describe, expect, it, vi } from "vitest";
import { ttsFetchArrayBuffer, ttsFetchJson, TtsError } from "./errors";
import type { TtsErrorContext } from "./errors";

const CTX: TtsErrorContext = { provider: "openai", step: "synthesize" };
const signal = () => new AbortController().signal;

function fakeResponse(props: {
  ok: boolean;
  status?: number;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  json?: () => Promise<unknown>;
}): Response {
  return props as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("network and body-read handling", () => {
  it("turns a fetch rejection into a retryable TtsError with a friendly message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await ttsFetchArrayBuffer("u", {}, CTX, signal()).catch((e) => e);
    expect(err).toBeInstanceOf(TtsError);
    expect((err as TtsError).retryable).toBe(true);
    expect((err as TtsError).message).toMatch(/couldn't reach openai/i);
  });

  it("turns a body-read failure (connection dropped mid-download) into a retryable TtsError", async () => {
    // This is Error 2 from the field: res.arrayBuffer() rejects with a raw
    // "Failed to fetch" after an OK status. It used to escape unwrapped.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          ok: true,
          arrayBuffer: () => Promise.reject(new TypeError("Failed to fetch")),
        })
      )
    );
    const err = await ttsFetchArrayBuffer("u", {}, CTX, signal()).catch((e) => e);
    expect(err).toBeInstanceOf(TtsError);
    expect((err as TtsError).retryable).toBe(true);
    expect((err as TtsError).message).toMatch(/lost the connection/i);
  });

  it("rethrows a user abort untouched, not as a TtsError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))
    );
    const err = await ttsFetchArrayBuffer("u", {}, CTX, signal()).catch((e) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(err).not.toBeInstanceOf(TtsError);
  });
});

describe("HTTP error mapping is preserved through the read helpers", () => {
  it("maps a 401 to a non-retryable bad-key error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          ok: false,
          status: 401,
          text: () => Promise.resolve(JSON.stringify({ error: { message: "bad key" } })),
        })
      )
    );
    const err = await ttsFetchJson("u", {}, CTX, signal()).catch((e) => e);
    expect(err).toBeInstanceOf(TtsError);
    expect((err as TtsError).status).toBe(401);
    expect((err as TtsError).retryable).toBe(false);
    expect((err as TtsError).message).toMatch(/rejected the API key/i);
  });

  it("marks a 429 rate-limit as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          ok: false,
          status: 429,
          text: () => Promise.resolve(JSON.stringify({ error: { message: "slow down" } })),
        })
      )
    );
    const err = await ttsFetchJson("u", {}, CTX, signal()).catch((e) => e);
    expect(err).toBeInstanceOf(TtsError);
    expect((err as TtsError).retryable).toBe(true);
  });

  it("marks a 5xx server error as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ ok: false, status: 503, text: () => Promise.resolve("") })
      )
    );
    const err = await ttsFetchJson("u", {}, CTX, signal()).catch((e) => e);
    expect(err).toBeInstanceOf(TtsError);
    expect((err as TtsError).retryable).toBe(true);
  });
});
