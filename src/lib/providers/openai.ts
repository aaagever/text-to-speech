import type { ChunkAudio, SynthesisRequest, TTSProvider, VoiceOption } from "../types";
import { ttsFetch } from "../errors";

// OpenAI's built-in voices (gpt-4o-mini-tts / tts-1 / tts-1-hd share the set).
const VOICE_IDS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
];

const VOICES: VoiceOption[] = VOICE_IDS.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

async function synthesize(
  req: SynthesisRequest,
  signal: AbortSignal
): Promise<ChunkAudio> {
  const res = await ttsFetch(
    "https://api.openai.com/v1/audio/speech",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        voice: req.voice,
        input: req.text,
        response_format: "mp3",
      }),
    },
    { provider: "openai", step: "synthesize" },
    signal
  );
  return { data: await res.arrayBuffer(), format: "mp3" };
}

export const openai: TTSProvider = {
  id: "openai",
  label: "OpenAI",
  keyStorageKey: "t2s-openai-api-key",
  keyLabel: "OpenAI API key",
  keyUrl: "https://platform.openai.com/api-keys",
  models: [
    {
      id: "gpt-4o-mini-tts",
      label: "gpt-4o-mini-tts (recommended)",
      charLimit: 1800,
      hebrew: true,
    },
    { id: "tts-1", label: "tts-1 (fast)", charLimit: 3500, hebrew: true },
    {
      id: "tts-1-hd",
      label: "tts-1-hd (higher quality)",
      charLimit: 3500,
      hebrew: true,
    },
  ],
  defaultModel: "gpt-4o-mini-tts",
  staticVoices: VOICES,
  defaultVoice: "marin",
  synthesize,
};
