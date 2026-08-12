// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeText } from "./synthesize";
import { TtsError } from "./errors";
import type { ChunkAudio, SynthesisRequest, TTSProvider } from "./types";

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
const params = (provider: TTSProvider) => ({
  provider,
  model: "gpt-4o-mini-tts",
  voice: "v",
  apiKey: "k",
  text: "Hello there, this is a short line.",
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
    await vi.advanceTimersByTimeAsync(2000 + 4000); // 2s then 4s backoffs
    await settled;

    expect(synth).toHaveBeenCalledTimes(3); // initial + 2 retries
    const chunk = latestChunks()[0];
    expect(chunk.status).toBe("failed");
    expect(chunk.attempts).toBe(3);
  });

  it("does not retry a non-retryable failure", async () => {
    const synth = vi.fn().mockRejectedValue(new TtsError("bad key"));
    await expect(synthesizeText(params(providerWith(synth)), opts())).rejects.toThrow(/bad key/);
    expect(synth).toHaveBeenCalledTimes(1);
  });
});
