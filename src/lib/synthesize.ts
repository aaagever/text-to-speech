// Orchestrates a full synthesis run: clean text is chunked to fit the model's
// limit, each chunk is synthesized sequentially (with progress, cancellation,
// a too-long auto-split, and a single 429 retry), then the parts are assembled
// into one in-memory blob. Nothing is ever written to disk or a server.

import type { ChunkAudio, Progress, SynthesisOutput, TTSProvider } from "./types";
import { charLimitFor } from "./providers";
import { chunkText } from "./chunker";
import { mergeChunksToWav } from "./audio";
import { TtsError } from "./errors";
import { createLogger } from "./log";
import {
  finishDebugRecord,
  startDebugRecord,
  type DebugRecord,
} from "./debug";

export const WARN_INPUT_CHARS = 60_000;
export const MAX_INPUT_CHARS = 200_000;

export interface SynthesizeParams {
  provider: TTSProvider;
  model: string;
  voice: string;
  apiKey: string;
  text: string;
}

export interface SynthesizeOptions {
  signal: AbortSignal;
  onProgress: (progress: Progress) => void;
}

const log = createLogger("synth");

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true }
    );
  });
}

// Split an over-long unit near its middle, preferring a sentence boundary.
function splitInHalf(text: string): [string, string] {
  const mid = Math.floor(text.length / 2);
  let cut = -1;
  let bestDist = Infinity;
  const re = /[.!?…]\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const pos = m.index + 1;
    const dist = Math.abs(pos - mid);
    if (dist < bestDist) {
      bestDist = dist;
      cut = pos;
    }
  }
  if (cut <= 0) cut = text.lastIndexOf(" ", mid);
  if (cut <= 0) cut = mid;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function makeFilenameBase(): string {
  const d = new Date();
  return `t2s-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Synthesize one unit of text, returning one or more audio chunks. Recurses to
// split a too-long unit; retries once on a rate-limit. `depth` bounds recursion.
async function synthesizeUnit(
  provider: TTSProvider,
  base: { model: string; voice: string; apiKey: string },
  unit: string,
  previousText: string | undefined,
  nextText: string | undefined,
  signal: AbortSignal,
  rec: DebugRecord,
  depth: number
): Promise<ChunkAudio[]> {
  if (signal.aborted) throw abortError();
  const startedAt = Date.now();
  try {
    const audio = await provider.synthesize(
      { ...base, text: unit, previousText, nextText },
      signal
    );
    rec.chunks.push({
      index: rec.chunks.length,
      chars: unit.length,
      ms: Date.now() - startedAt,
      bytes: audio.data.byteLength,
      status: depth > 0 ? "retried" : "ok",
    });
    return [audio];
  } catch (err) {
    if (isAbortError(err)) throw err;

    if (err instanceof TtsError && err.tooLong && depth < 2 && unit.length > 60) {
      log.warn(`part too long (${unit.length} chars); splitting and retrying`);
      const [a, b] = splitInHalf(unit);
      const left = await synthesizeUnit(provider, base, a, previousText, b, signal, rec, depth + 1);
      const right = await synthesizeUnit(provider, base, b, a, nextText, signal, rec, depth + 1);
      return [...left, ...right];
    }

    if (err instanceof TtsError && err.retryable && depth === 0) {
      log.warn("rate-limited; retrying once after 2s");
      await delay(2000, signal);
      return synthesizeUnit(provider, base, unit, previousText, nextText, signal, rec, depth + 1);
    }

    rec.chunks.push({
      index: rec.chunks.length,
      chars: unit.length,
      ms: Date.now() - startedAt,
      bytes: 0,
      status: "failed",
    });
    throw err;
  }
}

async function assemble(
  chunks: ChunkAudio[],
  rec: DebugRecord
): Promise<SynthesisOutput> {
  const base = makeFilenameBase();

  // Fast path: a single MP3 chunk passes through untouched (no re-encode, no
  // quality loss). This is the common case for a post or a short document.
  if (chunks.length === 1 && chunks[0].format === "mp3") {
    rec.assembly = "passthrough-mp3";
    const blob = new Blob([chunks[0].data], { type: "audio/mpeg" });
    log.info(`assembled passthrough mp3, ${blob.size} bytes`);
    return {
      blob,
      mimeType: "audio/mpeg",
      extension: "mp3",
      filename: `${base}.mp3`,
      durationSec: null,
      chunkCount: 1,
    };
  }

  // Otherwise decode every part and stitch into one WAV (Gemini PCM, or any
  // multi-chunk result). WAV keeps it dependency-free and correctly seekable.
  rec.assembly = "merged-wav";
  const blob = await mergeChunksToWav(chunks);
  log.info(`assembled merged wav from ${chunks.length} parts, ${blob.size} bytes`);
  return {
    blob,
    mimeType: "audio/wav",
    extension: "wav",
    filename: `${base}.wav`,
    durationSec: null,
    chunkCount: chunks.length,
  };
}

export async function synthesizeText(
  params: SynthesizeParams,
  opts: SynthesizeOptions
): Promise<SynthesisOutput> {
  const { provider, model, voice, apiKey, text } = params;
  const { signal, onProgress } = opts;

  const rec = startDebugRecord({
    provider: provider.id,
    model,
    voice,
    inputChars: text.length,
  });

  try {
    if (!text.trim()) {
      throw new TtsError("There's no text to speak. Paste some text or drop in a file.");
    }
    if (text.length > MAX_INPUT_CHARS) {
      throw new TtsError(
        `That's ${text.length.toLocaleString()} characters, which is more than this tool handles in one go. Split it into pieces under ${MAX_INPUT_CHARS.toLocaleString()} characters.`
      );
    }

    const limit = charLimitFor(provider.id, model);
    const chunks = chunkText(text, limit);
    rec.chunkPlan = chunks.length;
    log.info(
      `run ${rec.runId}: ${provider.id}/${model}/${voice}, ${text.length} chars -> ${chunks.length} part(s) at limit ${limit}`
    );

    const audioChunks: ChunkAudio[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) throw abortError();
      onProgress({ current: i + 1, total: chunks.length });
      try {
        const units = await synthesizeUnit(
          provider,
          { model, voice, apiKey },
          chunks[i],
          chunks[i - 1],
          chunks[i + 1],
          signal,
          rec,
          0
        );
        audioChunks.push(...units);
      } catch (err) {
        // Tag which part failed when there is more than one.
        if (!isAbortError(err) && chunks.length > 1 && err instanceof TtsError) {
          throw new TtsError(`Part ${i + 1} of ${chunks.length}: ${err.message}`, {
            status: err.status,
            providerCode: err.providerCode,
            bodySnippet: err.bodySnippet,
            tooLong: err.tooLong,
            retryable: err.retryable,
          });
        }
        throw err;
      }
    }

    const output = await assemble(audioChunks, rec);
    finishDebugRecord(rec, "success", output.durationSec);
    return output;
  } catch (err) {
    if (isAbortError(err)) {
      log.info(`run ${rec.runId} cancelled`);
      finishDebugRecord(rec, "cancelled");
      throw err;
    }
    if (err instanceof TtsError) {
      rec.error = {
        message: err.message,
        status: err.status,
        providerCode: err.providerCode,
        bodySnippet: err.bodySnippet,
      };
    } else {
      rec.error = { message: err instanceof Error ? err.message : String(err) };
    }
    finishDebugRecord(rec, "error");
    throw err;
  }
}
