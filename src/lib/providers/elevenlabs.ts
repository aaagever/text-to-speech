import type { ChunkAudio, SynthesisRequest, TTSProvider, VoiceOption } from "../types";
import { ttsFetch } from "../errors";

const BASE = "https://api.elevenlabs.io/v1";

interface ElevenVoicesResponse {
  voices?: Array<{ voice_id: string; name: string }>;
}

// ElevenLabs voices are account-specific, so the dropdown is populated from the
// user's own library once their key is saved.
async function listVoices(
  apiKey: string,
  signal: AbortSignal
): Promise<VoiceOption[]> {
  const res = await ttsFetch(
    `${BASE}/voices`,
    { headers: { "xi-api-key": apiKey } },
    { provider: "elevenlabs", step: "voices" },
    signal
  );
  const json = (await res.json()) as ElevenVoicesResponse;
  return (json.voices ?? [])
    .map((v) => ({ id: v.voice_id, label: v.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function synthesize(
  req: SynthesisRequest,
  signal: AbortSignal
): Promise<ChunkAudio> {
  const res = await ttsFetch(
    `${BASE}/text-to-speech/${encodeURIComponent(req.voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": req.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: req.text,
        model_id: req.model,
        // Prosody continuity across chunks; undefined keys are dropped by
        // JSON.stringify, so single-chunk requests send neither.
        previous_text: req.previousText,
        next_text: req.nextText,
      }),
    },
    { provider: "elevenlabs", step: "synthesize" },
    signal
  );
  return { data: await res.arrayBuffer(), format: "mp3" };
}

export const elevenlabs: TTSProvider = {
  id: "elevenlabs",
  label: "ElevenLabs",
  keyStorageKey: "t2s-elevenlabs-api-key",
  keyLabel: "ElevenLabs API key",
  keyUrl: "https://elevenlabs.io/app/settings/api-keys",
  models: [
    {
      id: "eleven_v3",
      label: "Eleven v3 (Hebrew, best quality)",
      charLimit: 4000,
      hebrew: true,
      cost: "~$0.10",
    },
    {
      id: "eleven_multilingual_v2",
      label: "Multilingual v2 (no Hebrew)",
      charLimit: 8000,
      hebrew: false,
      cost: "~$0.10",
    },
    {
      id: "eleven_flash_v2_5",
      label: "Flash v2.5 (long texts, cheap, no Hebrew)",
      charLimit: 30000,
      hebrew: false,
      cost: "~$0.05",
    },
  ],
  defaultModel: "eleven_v3",
  listVoices,
  synthesize,
};
