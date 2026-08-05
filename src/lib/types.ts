// Shared types across the provider layer, audio pipeline, and UI.

export type ProviderId = "openai" | "elevenlabs" | "gemini";

// Audio a provider returns for a single chunk. The discriminant tells the audio
// pipeline whether it can pass the bytes through as-is (mp3) or must decode raw
// PCM (Gemini returns 24kHz 16-bit mono PCM, base64-decoded to bytes).
export type ChunkFormat = "mp3" | "pcm16-24k";

export interface ChunkAudio {
  data: ArrayBuffer;
  format: ChunkFormat;
}

export interface ModelOption {
  id: string;
  label: string;
  // Conservative per-request input ceiling in characters. The chunker splits
  // input to stay under this; the orchestrator has a token-limit safety net on
  // top for scripts where chars-per-token is low (e.g. Hebrew).
  charLimit: number;
  // True when the model can voice Hebrew. Drives the non-blocking UI hint.
  hebrew: boolean;
}

export interface VoiceOption {
  id: string;
  label: string;
}

export interface SynthesisRequest {
  text: string;
  model: string;
  voice: string;
  apiKey: string;
  // Prosody context for continuity across chunks (ElevenLabs only).
  previousText?: string;
  nextText?: string;
}

export interface TTSProvider {
  id: ProviderId;
  label: string;
  keyStorageKey: string;
  keyLabel: string;
  // Where the user gets an API key (shown as a help link).
  keyUrl: string;
  models: ModelOption[];
  defaultModel: string;
  // Providers with a fixed voice set list them here; ElevenLabs fetches voices
  // from the account instead via listVoices.
  staticVoices?: VoiceOption[];
  defaultVoice?: string;
  listVoices?: (apiKey: string, signal: AbortSignal) => Promise<VoiceOption[]>;
  synthesize: (
    req: SynthesisRequest,
    signal: AbortSignal
  ) => Promise<ChunkAudio>;
}

// One synthesized result held in memory for the session (never persisted).
export interface SynthesisOutput {
  blob: Blob;
  mimeType: string;
  extension: "mp3" | "wav";
  filename: string;
  durationSec: number | null;
  chunkCount: number;
}

export interface Progress {
  current: number;
  total: number;
}
