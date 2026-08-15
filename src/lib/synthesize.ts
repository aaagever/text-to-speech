// Orchestrates a full synthesis run: clean text is chunked to fit the model's
// limit, each chunk is synthesized sequentially (with progress, cancellation, a
// too-long auto-split, and bounded retries for transient failures), then the
// parts are assembled into one in-memory blob. Nothing is written to disk or a
// server. Retries cover rate limits, provider 5xx, and network drops (including
// a connection lost mid-download) so one flaky moment on a mobile network does
// not throw away a long multi-chunk run.

import type { ChunkAudio, Progress, SynthesisOutput, TTSProvider } from "./types";
import { charLimitFor } from "./providers";
import { chunkText } from "./chunker";
import { canDecodeChunk, canDecodeOggOpus, mergeChunksToWav } from "./audio";
import { TtsError } from "./errors";
import { createLogger } from "./log";
import {
  finishDebugRecord,
  startDebugRecord,
  type DebugRecord,
} from "./debug";

export const WARN_INPUT_CHARS = 60_000;
export const MAX_INPUT_CHARS = 200_000;

// Everything needed to pick a failed run back up where it stopped, so the parts
// that already succeeded (which took real time and real money) are not thrown
// away because one part failed. Held in memory only, for the session.
export interface ResumeState {
  // The original chunk plan, reused verbatim so seams land identically.
  chunks: string[];
  // Audio for every chunk before `failedIndex`.
  completed: ChunkAudio[];
  // Index into `chunks` to restart from.
  failedIndex: number;
  // Identifies the run this belongs to; a resume is only offered when the
  // provider, model, voice, and text still match.
  signature: string;
}

// Cheap deterministic fingerprint of a run's inputs. Used to decide whether a
// held resume state still applies to what is currently on screen.
export function runSignature(
  providerId: string,
  model: string,
  voice: string,
  text: string
): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return `${providerId}|${model}|${voice}|${text.length}|${hash}`;
}

export interface SynthesizeParams {
  provider: TTSProvider;
  model: string;
  voice: string;
  apiKey: string;
  text: string;
  // Pick up a previously failed run instead of starting over.
  resume?: ResumeState;
}

export interface SynthesizeOptions {
  signal: AbortSignal;
  onProgress: (progress: Progress) => void;
  // Called when a run fails with at least one part already done, handing back
  // the work so far so the caller can offer to resume.
  onPartial?: (state: ResumeState) => void;
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

// How many times to retry a single request after a transient failure (network
// drop, rate limit, provider 5xx) before giving up on the run. Four retries
// with a backing-off wait (2s, 4s, 8s, 15s, so about 29 seconds of patience on
// top of the attempts themselves) rides out a phone that loses signal for the
// better part of a minute. Two retries proved too few in the field.
const MAX_TRANSIENT_RETRIES = 4;

// Wait before attempt N+1, doubling but capped so the last wait stays sane.
function backoffMs(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 15_000);
}

// Synthesize one unit of text, returning one or more audio chunks. A too-long
// unit is split near its middle and each half synthesized (recursion bounded by
// `splitDepth`); a transient failure is retried with a short backoff (bounded by
// MAX_TRANSIENT_RETRIES), independent of split depth. `onRetry` fires when a
// retry is about to be waited out, so the caller can reflect it in the UI.
async function synthesizeUnit(
  provider: TTSProvider,
  base: { model: string; voice: string; apiKey: string; preferCompact?: boolean },
  unit: string,
  previousText: string | undefined,
  nextText: string | undefined,
  signal: AbortSignal,
  rec: DebugRecord,
  splitDepth: number,
  onRetry?: (attempt: number) => void
): Promise<ChunkAudio[]> {
  if (signal.aborted) throw abortError();

  const startedAt = Date.now();
  let attempt = 0; // retries of THIS request, not split children

  for (;;) {
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
        attempts: attempt + 1,
        status: attempt > 0 || splitDepth > 0 ? "retried" : "ok",
      });
      return [audio];
    } catch (err) {
      if (isAbortError(err)) throw err;

      // Too long for the model: split near the middle and synthesize each half.
      if (err instanceof TtsError && err.tooLong && splitDepth < 2 && unit.length > 60) {
        log.warn(`part too long (${unit.length} chars); splitting and retrying`);
        const [a, b] = splitInHalf(unit);
        const left = await synthesizeUnit(provider, base, a, previousText, b, signal, rec, splitDepth + 1, onRetry);
        const right = await synthesizeUnit(provider, base, b, a, nextText, signal, rec, splitDepth + 1, onRetry);
        return [...left, ...right];
      }

      // Transient failure (network drop, rate limit, provider 5xx): back off and
      // retry the same request a bounded number of times. This is what saves a
      // long run from a single dropped request on a flaky mobile network.
      if (err instanceof TtsError && err.retryable && attempt < MAX_TRANSIENT_RETRIES) {
        attempt++;
        const wait = backoffMs(attempt);
        log.warn(
          `transient failure (attempt ${attempt} of ${MAX_TRANSIENT_RETRIES}); retrying in ${wait}ms: ${err.message}`
        );
        onRetry?.(attempt + 1); // the attempt number we are about to make
        await delay(wait, signal);
        continue;
      }

      rec.chunks.push({
        index: rec.chunks.length,
        chars: unit.length,
        ms: Date.now() - startedAt,
        bytes: 0,
        attempts: attempt + 1,
        status: "failed",
      });
      throw err;
    }
  }
}

// Returns everything but retriedParts, which the orchestrator fills in from the
// run record after all chunks are done.
async function assemble(
  chunks: ChunkAudio[],
  rec: DebugRecord
): Promise<Omit<SynthesisOutput, "retriedParts">> {
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
  const { signal, onProgress, onPartial } = opts;

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

    const signature = runSignature(provider.id, model, voice, text);
    // Only honour resume state that still matches the current inputs.
    const resume =
      params.resume && params.resume.signature === signature ? params.resume : undefined;

    const limit = charLimitFor(provider.id, model);
    const chunks = resume ? resume.chunks : chunkText(text, limit);
    rec.chunkPlan = chunks.length;

    // Multi-part output is decoded and stitched into WAV regardless, so those
    // runs can take a compact transport format and a much smaller download.
    // Proven against the first part actually received (see below) before the
    // rest of the run commits to it.
    let preferCompact = chunks.length > 1 && canDecodeOggOpus();
    let compactProven = false;

    const startIndex = resume ? resume.failedIndex : 0;
    const audioChunks: ChunkAudio[] = resume ? [...resume.completed] : [];
    log.info(
      `run ${rec.runId}: ${provider.id}/${model}/${voice}, ${text.length} chars -> ${chunks.length} part(s) at limit ${limit}` +
        (resume ? `, resuming from part ${startIndex + 1}` : "") +
        (preferCompact ? ", compact transport" : "")
    );

    for (let i = startIndex; i < chunks.length; i++) {
      if (signal.aborted) throw abortError();
      onProgress({ current: i + 1, total: chunks.length });
      try {
        const units = await synthesizeUnit(
          provider,
          { model, voice, apiKey, preferCompact },
          chunks[i],
          chunks[i - 1],
          chunks[i + 1],
          signal,
          rec,
          0,
          (attempt) => onProgress({ current: i + 1, total: chunks.length, attempt })
        );
        // Prove the compact format decodes here, on the first part, while one
        // cheap re-request is the whole cost of being wrong. If it does not,
        // drop back to MP3 and redo just this part.
        if (preferCompact && !compactProven) {
          compactProven = true;
          if (!(await canDecodeChunk(units[0]))) {
            log.warn("compact transport did not decode; falling back to mp3");
            preferCompact = false;
            i--; // redo this part as mp3
            continue;
          }
        }
        audioChunks.push(...units);
      } catch (err) {
        // Hand back the parts already done so the caller can offer to resume
        // rather than discard minutes of generated (and billed) audio.
        if (!isAbortError(err) && audioChunks.length > 0) {
          log.warn(
            `part ${i + 1} of ${chunks.length} failed with ${audioChunks.length} part(s) done; resume available`
          );
          onPartial?.({ chunks, completed: audioChunks, failedIndex: i, signature });
        }
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
    const retriedParts = rec.chunks.filter((c) => (c.attempts ?? 1) > 1).length;
    finishDebugRecord(rec, "success", output.durationSec);
    return { ...output, retriedParts };
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
