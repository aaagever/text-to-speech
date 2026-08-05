import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProviderSelector } from "./components/ProviderSelector";
import { ApiKeyInput } from "./components/ApiKeyInput";
import { ModelSelector } from "./components/ModelSelector";
import { VoiceSelector } from "./components/VoiceSelector";
import { TextInput } from "./components/TextInput";
import { FileUploader } from "./components/FileUploader";
import { AudioPlayer } from "./components/AudioPlayer";
import type { ProviderId, Progress, VoiceOption } from "./lib/types";
import { PROVIDERS, getProvider, getModelOption, charLimitFor } from "./lib/providers";
import { stripMarkdown } from "./lib/markdown-strip";
import { chunkText } from "./lib/chunker";
import { synthesizeText, isAbortError, WARN_INPUT_CHARS } from "./lib/synthesize";
import { formatDebugReport } from "./lib/debug";
import { loadPrefs, savePrefs } from "./lib/prefs";
import { logBoot } from "./lib/log";

const HEBREW_RE = new RegExp("[\\u0590-\\u05ff]");

function initialMap(pick: (id: ProviderId) => string): Record<ProviderId, string> {
  return { openai: pick("openai"), elevenlabs: pick("elevenlabs"), gemini: pick("gemini") };
}

// Descending error tone for run failures (autoplay of the audio is the success
// signal, so there is no success tone).
function playErrorTone() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.2;
    osc.frequency.value = 400;
    osc.start();
    osc.frequency.setValueAtTime(300, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.3);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio feedback is best-effort.
  }
}

interface Result {
  url: string;
  filename: string;
  label: string;
  durationSec: number | null;
}

function App() {
  const initial = useMemo(() => loadPrefs(), []);

  const [provider, setProvider] = useState<ProviderId>(initial.provider);
  const [modelByProvider, setModelByProvider] = useState(() =>
    initialMap((id) => initial.models[id] ?? PROVIDERS[id].defaultModel)
  );
  const [voiceByProvider, setVoiceByProvider] = useState(() =>
    initialMap((id) => initial.voices[id] ?? PROVIDERS[id].defaultVoice ?? "")
  );
  const [speed, setSpeed] = useState(initial.speed);

  const [apiKey, setApiKey] = useState("");
  const [text, setText] = useState("");
  const [loadedName, setLoadedName] = useState<string | null>(null);

  const [elevenVoices, setElevenVoices] = useState<VoiceOption[] | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorHasReport, setErrorHasReport] = useState(false);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const providerObj = getProvider(provider);
  const model = modelByProvider[provider];
  const voice = voiceByProvider[provider];

  const setModel = (m: string) =>
    setModelByProvider((prev) => ({ ...prev, [provider]: m }));
  const setVoice = (v: string) =>
    setVoiceByProvider((prev) => ({ ...prev, [provider]: v }));

  const handleKeyChange = useCallback((key: string) => setApiKey(key), []);

  useEffect(() => {
    logBoot();
  }, []);

  // Persist selections.
  useEffect(() => {
    savePrefs({ provider, speed, models: modelByProvider, voices: voiceByProvider });
  }, [provider, speed, modelByProvider, voiceByProvider]);

  // Revoke the object URL on unmount so nothing lingers.
  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  // ElevenLabs voices come from the user's account once a key is saved.
  useEffect(() => {
    if (provider !== "elevenlabs") return;
    const prov = PROVIDERS.elevenlabs;
    if (!apiKey || !prov.listVoices) {
      setElevenVoices(null);
      return;
    }
    const ctrl = new AbortController();
    setVoicesLoading(true);
    setVoicesError(null);
    prov
      .listVoices(apiKey, ctrl.signal)
      .then((list) => {
        setElevenVoices(list);
        setVoiceByProvider((prev) => {
          const cur = prev.elevenlabs;
          if (cur && list.some((v) => v.id === cur)) return prev;
          return { ...prev, elevenlabs: list[0]?.id ?? "" };
        });
      })
      .catch((err) => {
        if (!isAbortError(err))
          setVoicesError(err instanceof Error ? err.message : "Couldn't load voices.");
      })
      .finally(() => setVoicesLoading(false));
    return () => ctrl.abort();
  }, [provider, apiKey]);

  const voiceOptions = providerObj.staticVoices ?? elevenVoices;
  const voiceDisabledReason =
    !providerObj.staticVoices && !apiKey
      ? "Save your API key to load voices"
      : !providerObj.staticVoices && voicesError
        ? voicesError
        : undefined;

  const cleaned = useMemo(() => stripMarkdown(text), [text]);
  const parts = useMemo(
    () => chunkText(cleaned, charLimitFor(provider, model)).length,
    [cleaned, provider, model]
  );

  const modelOpt = getModelOption(provider, model);
  const hebrewWarning =
    HEBREW_RE.test(text) && modelOpt && !modelOpt.hebrew
      ? `This model doesn't support Hebrew. ${
          provider === "elevenlabs" ? "Switch to Eleven v3." : "Pick a Hebrew-capable model."
        }`
      : null;

  const overLimitWarning =
    text.length > WARN_INPUT_CHARS
      ? `That's a lot of text (${text.length.toLocaleString()} characters). Generation may take a while and use more of your API credits.`
      : null;

  function handleFileText(newText: string, filename: string) {
    setText(newText);
    setLoadedName(filename);
    setError(null);
  }

  function voiceLabelOf(id: string): string {
    return voiceOptions?.find((v) => v.id === id)?.label ?? id;
  }

  async function handleGenerate() {
    if (!apiKey || !text.trim() || !voice) return;

    setError(null);
    setErrorHasReport(false);
    setProgress(null);
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const label = `${providerObj.label} · ${model} · ${voiceLabelOf(voice)}`;

    try {
      const output = await synthesizeText(
        { provider: providerObj, model, voice, apiKey, text: cleaned },
        { signal: controller.signal, onProgress: setProgress }
      );

      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(output.blob);
      resultUrlRef.current = url;
      setResult({ url, filename: output.filename, label, durationSec: output.durationSec });
    } catch (err) {
      if (isAbortError(err)) {
        // Cancel is a silent reset, not an error.
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setErrorHasReport(true);
        playErrorTone();
      }
    } finally {
      setIsGenerating(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  async function handleCopyDetails() {
    try {
      await navigator.clipboard.writeText(formatDebugReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the report is also on window.__t2sDebug.
    }
  }

  const canGenerate = !!apiKey && !!text.trim() && !!voice && !isGenerating;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Text to Speech</h1>

        <div className="space-y-4 bg-white rounded-xl border border-gray-200 p-6">
          <ProviderSelector value={provider} onChange={setProvider} />

          <ApiKeyInput
            key={provider}
            provider={providerObj}
            onKeyChange={handleKeyChange}
          />

          <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModelSelector provider={providerObj} value={model} onChange={setModel} />
            <VoiceSelector
              voices={voiceOptions}
              value={voice}
              onChange={setVoice}
              loading={voicesLoading}
              disabledReason={voiceDisabledReason}
            />
          </div>
          {hebrewWarning && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {hebrewWarning}
            </p>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <TextInput value={text} onChange={setText} parts={parts} />
            <FileUploader
              onText={handleFileText}
              onError={(msg) => {
                setError(msg);
                setErrorHasReport(false);
              }}
              loadedName={loadedName}
            />
          </div>
          {overLimitWarning && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {overLimitWarning}
            </p>
          )}

          <div className="border-t border-gray-100 pt-4">
            {isGenerating ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {progress && progress.total > 1
                    ? `Generating part ${progress.current} of ${progress.total}...`
                    : "Generating..."}
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                title={
                  !apiKey
                    ? "Enter your API key first"
                    : !text.trim()
                      ? "Enter or drop in some text first"
                      : !voice
                        ? "Pick a voice first"
                        : undefined
                }
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Generate speech
              </button>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
              <span>{error}</span>
              {errorHasReport && (
                <button
                  type="button"
                  onClick={handleCopyDetails}
                  className="text-red-700 hover:text-red-900 underline whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy details"}
                </button>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
            <AudioPlayer
              src={result.url}
              filename={result.filename}
              label={result.label}
              speed={speed}
              onSpeedChange={setSpeed}
              durationHint={result.durationSec}
            />
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Your API keys stay in this browser. Audio is generated on demand and
          never stored.
        </p>
      </div>
    </div>
  );
}

export default App;
