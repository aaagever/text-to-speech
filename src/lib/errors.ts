// Turns provider HTTP failures and network errors into clear, actionable
// messages, and carries diagnostic detail (status, provider code, body snippet)
// for the "Copy details" debug report. Adapted from the sibling speech-to-text
// project's error layer, extended for three providers whose error shapes differ.

import type { ProviderId } from "./types";
import { createLogger } from "./log";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  gemini: "Google Gemini",
};

export type TtsStep = "voices" | "synthesize";

export interface TtsErrorContext {
  provider: ProviderId;
  step: TtsStep;
}

export interface TtsErrorDetail {
  status?: number;
  providerCode?: string;
  bodySnippet?: string;
  tooLong?: boolean;
  retryable?: boolean;
}

// A friendly Error whose message is safe to show the user, with structured
// detail attached for logging and the debug report.
export class TtsError extends Error {
  readonly status?: number;
  readonly providerCode?: string;
  readonly bodySnippet?: string;
  readonly tooLong: boolean;
  readonly retryable: boolean;

  constructor(message: string, detail: TtsErrorDetail = {}) {
    super(message);
    this.name = "TtsError";
    this.status = detail.status;
    this.providerCode = detail.providerCode;
    this.bodySnippet = detail.bodySnippet;
    this.tooLong = detail.tooLong ?? false;
    this.retryable = detail.retryable ?? false;
  }
}

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 500);
}

function looksTooLong(text: string): boolean {
  return /too long|maximum context|max.*length|exceeds|token limit|string_too_long|too many characters/i.test(
    text
  );
}

// Parse a provider's JSON error body into a normalized shape. Each provider
// reports errors differently; see each branch.
function mapProviderError(
  provider: ProviderId,
  status: number,
  body: string
): { message: string; detail: TtsErrorDetail } {
  const label = PROVIDER_LABEL[provider];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Non-JSON (e.g. an HTML gateway page) — fall through to status mapping.
  }
  const detail: TtsErrorDetail = { status, bodySnippet: snippet(body) };

  // Pull out the provider's own message + code where present.
  let providerMsg = "";
  let code = "";
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const err = obj.error as Record<string, unknown> | undefined; // OpenAI, Gemini
    const det = obj.detail; // ElevenLabs
    if (err) {
      providerMsg = String(err.message ?? "");
      code = String(err.code ?? err.status ?? err.type ?? "");
    } else if (det && typeof det === "object" && !Array.isArray(det)) {
      const d = det as Record<string, unknown>;
      providerMsg = String(d.message ?? "");
      code = String(d.status ?? "");
    } else if (Array.isArray(det) && det.length) {
      const d0 = det[0] as Record<string, unknown>;
      providerMsg = String(d0.msg ?? "");
      code = String(d0.type ?? "");
    }
  }
  detail.providerCode = code || undefined;

  const tooLong =
    status === 400 && (looksTooLong(providerMsg) || looksTooLong(body));
  detail.tooLong = tooLong;
  if (tooLong) {
    return {
      message: `This part of the text was too long for ${label}. Retrying with smaller pieces...`,
      detail,
    };
  }

  // Bad API key. OpenAI/ElevenLabs use 401; Gemini uses 400 "API key not valid".
  const badKey =
    status === 401 ||
    status === 403 ||
    (provider === "gemini" && status === 400 && /api key not valid/i.test(providerMsg + body));
  // ElevenLabs signals exhausted credits with a 401 whose detail.status is
  // "quota_exceeded" — a 401 that is NOT a bad key.
  const outOfCredits =
    /quota_exceeded|insufficient_quota|out of credits|exceeded your current quota/i.test(
      code + " " + providerMsg + " " + body
    );

  if (outOfCredits) {
    return {
      message: `Your ${label} account is out of credits or has hit its quota. Add credits or check your plan, then try again.`,
      detail,
    };
  }
  if (badKey) {
    return {
      message: `${label} rejected the API key. Check that you pasted the right key for this provider, then save it again.`,
      detail,
    };
  }
  if (status === 429) {
    detail.retryable = true;
    const daily =
      provider === "gemini"
        ? " Free Gemini keys have a small daily TTS quota; it may reset tomorrow."
        : "";
    return {
      message: `${label} is rate-limiting requests.${daily} Wait a moment and try again.`,
      detail,
    };
  }
  if (status >= 500) {
    detail.retryable = true;
    return {
      message: `${label} hit a server error (status ${status}). This is on their end -- try again in a moment.`,
      detail,
    };
  }

  // Other 4xx: surface the provider's own short message if it is useful.
  const extra = providerMsg && providerMsg.length < 200 ? ` ${providerMsg}` : "";
  return {
    message: `${label} rejected the request (status ${status}).${extra}`,
    detail,
  };
}

// fetch() that injects the abort signal, translates network-level failures, and
// converts any non-OK response into a TtsError. Returns the Response untouched
// on success so callers can read arrayBuffer() / json() themselves.
export async function ttsFetch(
  url: string,
  init: RequestInit,
  ctx: TtsErrorContext,
  signal: AbortSignal
): Promise<Response> {
  const log = createLogger(ctx.provider);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    // Rethrow aborts untouched so the caller can tell "cancelled" from "failed".
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    log.error(`network error during ${ctx.step}:`, err);
    throw new TtsError(
      `Couldn't reach ${PROVIDER_LABEL[ctx.provider]}. Check your internet connection and try again.`,
      {}
    );
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).trim();
    const { message, detail } = mapProviderError(ctx.provider, res.status, body);
    log.error(
      `${ctx.step} failed: status=${res.status} code=${detail.providerCode ?? "-"} body=${detail.bodySnippet ?? ""}`
    );
    throw new TtsError(message, detail);
  }

  return res;
}
