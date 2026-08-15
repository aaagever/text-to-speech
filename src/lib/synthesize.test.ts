// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeText, type ResumeState } from "./synthesize";
import { TtsError } from "./errors";
import type { ChunkAudio, SynthesisRequest, TTSProvider } from "./types";

// Three paragraphs that each fit the 1800-char limit but cannot be combined,
// so the chunker always plans exactly three parts.
const THREE_PART_TEXT = [0, 1, 2].map(() => "x".repeat(1700)).join("\n\n");

// Minimal Web Audio stand-in so the multi-part merge path can run headless.
class FakeAudioContext {
  decodeAudioData() {
    return Promise.resolve({
      sampleRate: 24000,
      getChannelData: () => new Float32Array(8),
    } as unknown as AudioBuffer);
  }
  close() {
    return Promise.resolve();
  }
}

function mp3Chunk(): ChunkAudio {
  return { data: new Uint8Array([0x49, 0x44, 0x33]).buffer, format: "mp3" };
}

function providerWith(
  synth: (req: SynthesisRequest, signal: AbortSignal) => Promise<ChunkAudio>
): TTSProvider {
  return {
    id: "openai",
    label: "OpenAI",
    keyStorageKey: "k",
    keyLabel: "k",
    keyUrl: "u",
    models: [{ id: "gpt-4o-mini-tts", label: "m", charLimit: 1800, hebrew: true, cost: "~$0" }],
    defaultModel: "gpt-4o-mini-tts",
    staticVoices: [{ id: "v", label: "v" }],
    defaultVoice: "v",
    synthesize: synth,
  };
}

const opts = () => ({ signal: new AbortController().signal, onProgress: () => {} });
// Short text -> a single chunk -> the mp3 passthrough path (no Web Audio).
const params = (
  provider: TTSProvider,
  text = "Hello there, this is a short line.",
  resume?: ResumeState
) => ({
  provider,
  model: "gpt-4o-mini-tts",
  voice: "v",
  apiKey: "k",
  text,
  resume,
});

interface DebugChunk {
  attempts?: number;
  status: string;
}
function latestChunks(): DebugChunk[] {
  const dbg = (window as unknown as {
    __t2sDebug: { records: Array<{ chunks: DebugChunk[] }> };
  }).__t2sDebug;
  return dbg.records[0].chunks;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("synthesizeText transient retries", () => {
  it("retries a retryable failure, then succeeds, and records the attempts", async () => {
    vi.useFakeTimers();
    const synth = vi
      .fn()
      .mockRejectedValueOnce(new TtsError("network blip", { retryable: true }))
      .mockResolvedValue(mp3Chunk());

    const p = synthesizeText(params(providerWith(synth)), opts());
    await vi.advanceTimersByTimeAsync(2000); // clear the 2s backoff
    const out = await p;

    expect(synth).toHaveBeenCalledTimes(2);
    expect(out.extension).toBe("mp3");
    const chunk = latestChunks()[0];
    expect(chunk.attempts).toBe(2);
    expect(chunk.status).toBe("retried");
  });

  it("gives up after the retry budget and marks the chunk failed", async () => {
    vi.useFakeTimers();
    const synth = vi.fn().mockRejectedValue(new TtsError("still down", { retryable: true }));

    const p = synthesizeText(params(providerWith(synth)), opts());
    const settled = expect(p).rejects.toBeInstanceOf(TtsError);
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000 + 15000); // capped backoffs
    await settled;

    expect(synth).toHaveBeenCalledTimes(5); // initial + 4 retries
    const chunk = latestChunks()[0];
    expect(chunk.status).toBe("failed");
    expect(chunk.attempts).toBe(5);
  });

  it("survives a dropout longer than the old two-retry budget", async () => {
    vi.useFakeTimers();
    // Fails the first four times, succeeds on the fifth: previously fatal.
    const synth = vi
      .fn()
      .mockRejectedValueOnce(new TtsError("drop", { retryable: true }))
      .mockRejectedValueOnce(new TtsError("drop", { retryable: true }))
      .mockRejectedValueOnce(new TtsError("drop", { retryable: true }))
      .mockRejectedValueOnce(new TtsError("drop", { retryable: true }))
      .mockResolvedValue(mp3Chunk());

    const p = synthesizeText(params(providerWith(synth)), opts());
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000 + 15000);
    const out = await p;

    expect(synth).toHaveBeenCalledTimes(5);
    expect(out.extension).toBe("mp3");
  });

  it("does not retry a non-retryable failure", async () => {
    const synth = vi.fn().mockRejectedValue(new TtsError("bad key"));
    await expect(synthesizeText(params(providerWith(synth)), opts())).rejects.toThrow(/bad key/);
    expect(synth).toHaveBeenCalledTimes(1);
  });
});

describe("compact transport for multi-part runs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks(); // the createElement spy must not leak into later tests
  });

  it("falls back to mp3 and redoes one part when the compact format won't decode", async () => {
    // Browser claims opus support...
    vi.stubGlobal("Audio", class {});
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "audio") {
        return { canPlayType: () => "probably" } as unknown as HTMLElement;
      }
      return origCreate(tag);
    });
    // ...but decoding always fails.
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData() {
          return Promise.reject(new Error("cannot decode"));
        }
        close() {
          return Promise.resolve();
        }
      }
    );

    const synth = vi.fn().mockResolvedValue(mp3Chunk());
    await synthesizeText(params(providerWith(synth), THREE_PART_TEXT), opts()).catch(() => {});

    // Part 1 requested twice (compact, then mp3), so the run never commits to a
    // format it cannot decode.
    expect(synth.mock.calls[0][0].preferCompact).toBe(true);
    expect(synth.mock.calls[1][0].preferCompact).toBe(false);
  });
});

describe("resuming a failed run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Fail on the third part after two succeed, capturing the resume state.
  async function failOnLastPart(): Promise<{ state: ResumeState; calls: number }> {
    const synth = vi
      .fn()
      .mockResolvedValueOnce(mp3Chunk())
      .mockResolvedValueOnce(mp3Chunk())
      .mockRejectedValue(new TtsError("gave up"));

    let state: ResumeState | null = null;
    await expect(
      synthesizeText(params(providerWith(synth), THREE_PART_TEXT), {
        ...opts(),
        onPartial: (s) => {
          state = s;
        },
      })
    ).rejects.toThrow();

    if (!state) throw new Error("expected resume state to be handed back");
    return { state, calls: synth.mock.calls.length };
  }

  it("hands back the parts that succeeded", async () => {
    const { state } = await failOnLastPart();
    expect(state.chunks).toHaveLength(3);
    expect(state.completed).toHaveLength(2);
    expect(state.failedIndex).toBe(2);
    expect(state.signature).toBeTruthy();
  });

  it("re-requests only the remaining part and assembles the whole thing", async () => {
    const { state } = await failOnLastPart();
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const synth = vi.fn().mockResolvedValue(mp3Chunk());
    const out = await synthesizeText(
      params(providerWith(synth), THREE_PART_TEXT, state),
      opts()
    );

    // Only the failed part is paid for again; parts 1 and 2 are reused.
    expect(synth).toHaveBeenCalledTimes(1);
    expect(out.chunkCount).toBe(3);
    expect(out.extension).toBe("wav");
  });

  it("ignores resume state that no longer matches the inputs", async () => {
    const { state } = await failOnLastPart();
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const synth = vi.fn().mockResolvedValue(mp3Chunk());
    // Same text, different voice: the stale state must not be used.
    await synthesizeText(
      { ...params(providerWith(synth), THREE_PART_TEXT, state), voice: "other" },
      opts()
    );

    expect(synth).toHaveBeenCalledTimes(3); // started over
  });
});
