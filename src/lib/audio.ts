// Audio assembly. Two of these functions are pure and unit-tested (buildWav,
// pcm16ToFloat32); the rest use browser Web Audio APIs and are exercised
// manually in the browser.

import type { ChunkAudio } from "./types";

const GEMINI_PCM_SAMPLE_RATE = 24000;

// ---- Pure helpers (unit-tested) ---------------------------------------------

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

// Wrap mono Float32 samples in a 16-bit PCM WAV container (44-byte header).
export function buildWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk length
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

// Decode raw little-endian 16-bit PCM bytes to normalized Float32 samples.
export function pcm16ToFloat32(pcm: ArrayBuffer): Float32Array {
  const view = new DataView(pcm);
  const count = Math.floor(pcm.byteLength / 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

// ---- Browser Web Audio pipeline ---------------------------------------------

type DecodedChunk = { samples: Float32Array; sampleRate: number };

async function decodeChunk(
  chunk: ChunkAudio,
  ctx: AudioContext
): Promise<DecodedChunk> {
  if (chunk.format === "pcm16-24k") {
    return {
      samples: pcm16ToFloat32(chunk.data),
      sampleRate: GEMINI_PCM_SAMPLE_RATE,
    };
  }
  // decodeAudioData detaches the passed buffer; each chunk is used once.
  const decoded = await ctx.decodeAudioData(chunk.data.slice(0));
  // Downmix to mono by taking channel 0 (voice content is effectively mono).
  return { samples: decoded.getChannelData(0), sampleRate: decoded.sampleRate };
}

// Decode every chunk, concatenate, and encode a single WAV blob. Used whenever
// the fast path (one MP3 chunk) does not apply: Gemini PCM, or any multi-chunk
// result where the parts must be stitched into one downloadable/seekable file.
export async function mergeChunksToWav(chunks: ChunkAudio[]): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded: DecodedChunk[] = [];
    for (const chunk of chunks) decoded.push(await decodeChunk(chunk, ctx));

    const sampleRate = decoded[0]?.sampleRate ?? GEMINI_PCM_SAMPLE_RATE;
    const total = decoded.reduce((n, d) => n + d.samples.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const d of decoded) {
      // Chunks share a sample rate within a provider, so a straight copy is
      // correct; resampling is unnecessary and would add seams.
      merged.set(d.samples, offset);
      offset += d.samples.length;
    }
    return new Blob([buildWav(merged, sampleRate)], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}
