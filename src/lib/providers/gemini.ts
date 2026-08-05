import type { ChunkAudio, SynthesisRequest, TTSProvider, VoiceOption } from "../types";
import { ttsFetch, TtsError } from "../errors";
import { createLogger } from "../log";

const log = createLogger("gemini");
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// The 2.5 TTS models use the classic generateContent endpoint. The newer 3.1
// preview uses the GA Interactions API. We route per model and, if a response
// shape is unexpected, log it so live verification can adjust quickly.
const GENERATE_CONTENT_MODELS = new Set([
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
]);

// 30 prebuilt voices, shared across the TTS models.
const VOICE_IDS = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];

const VOICES: VoiceOption[] = VOICE_IDS.map((id) => ({ id, label: id }));

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// classic generateContent: base64 PCM lives in candidates[0].content.parts[].inlineData.data
async function synthesizeGenerateContent(
  req: SynthesisRequest,
  signal: AbortSignal
): Promise<ChunkAudio> {
  const res = await ttsFetch(
    `${BASE}/models/${req.model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice } },
          },
        },
      }),
    },
    { provider: "gemini", step: "synthesize" },
    signal
  );
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    ?.inlineData?.data;
  if (!data) {
    log.error("no audio in generateContent response:", JSON.stringify(json).slice(0, 500));
    throw new TtsError(
      "Google Gemini returned no audio for this request. Try a different voice or model."
    );
  }
  return { data: base64ToArrayBuffer(data), format: "pcm16-24k" };
}

// GA Interactions API (gemini-3.1-flash-tts-preview). Audio is documented at
// output_audio.data; we check a couple of plausible locations defensively.
async function synthesizeInteractions(
  req: SynthesisRequest,
  signal: AbortSignal
): Promise<ChunkAudio> {
  const res = await ttsFetch(
    `${BASE}/interactions`,
    {
      method: "POST",
      headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        input: req.text,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: req.voice }] },
      }),
    },
    { provider: "gemini", step: "synthesize" },
    signal
  );
  const json = (await res.json()) as {
    output_audio?: { data?: string };
    audio?: { data?: string };
  };
  const data = json.output_audio?.data ?? json.audio?.data;
  if (!data) {
    log.error("no audio in interactions response:", JSON.stringify(json).slice(0, 500));
    throw new TtsError(
      "Google Gemini (preview) returned an unexpected response. Try the 2.5 model instead."
    );
  }
  return { data: base64ToArrayBuffer(data), format: "pcm16-24k" };
}

async function synthesize(
  req: SynthesisRequest,
  signal: AbortSignal
): Promise<ChunkAudio> {
  return GENERATE_CONTENT_MODELS.has(req.model)
    ? synthesizeGenerateContent(req, signal)
    : synthesizeInteractions(req, signal);
}

export const gemini: TTSProvider = {
  id: "gemini",
  label: "Google Gemini",
  keyStorageKey: "t2s-gemini-api-key",
  keyLabel: "Gemini API key",
  keyUrl: "https://aistudio.google.com/apikey",
  models: [
    {
      id: "gemini-2.5-flash-preview-tts",
      label: "2.5 Flash TTS (recommended)",
      charLimit: 8000,
      hebrew: true,
    },
    {
      id: "gemini-2.5-pro-preview-tts",
      label: "2.5 Pro TTS (higher quality)",
      charLimit: 8000,
      hebrew: true,
    },
    {
      id: "gemini-3.1-flash-tts-preview",
      label: "3.1 Flash TTS (preview, new API)",
      charLimit: 8000,
      hebrew: true,
    },
  ],
  defaultModel: "gemini-2.5-flash-preview-tts",
  staticVoices: VOICES,
  defaultVoice: "Kore",
  synthesize,
};
