import { useRef, useState } from "react";
import { fetchArticle } from "../lib/fetch-article";
import { isAbortError } from "../lib/synthesize";

interface Props {
  onText: (text: string, sourceName: string) => void;
  onError: (message: string) => void;
  // Lets App block Generate while a fetch is in flight.
  onBusyChange: (busy: boolean) => void;
  // True while synthesis is running, so a fetch can't start mid-generation.
  disabled: boolean;
}

export function UrlFetcher({ onText, onError, onBusyChange, disabled }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || disabled || !url.trim()) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    onBusyChange(true);
    try {
      const { text, sourceName } = await fetchArticle(url, controller.signal);
      onText(text, sourceName);
    } catch (err) {
      // Cancelling is a silent reset, not an error.
      if (!isAbortError(err)) {
        onError(err instanceof Error ? err.message : "Couldn't read that page.");
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
      abortRef.current = null;
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="url"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy || disabled}
          placeholder="Or paste an article link, e.g. example.com/post"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 underline whitespace-nowrap"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Fetch
          </button>
        )}
      </div>
      {busy && (
        <p className="text-sm text-gray-600 mt-2">Fetching the article...</p>
      )}
    </form>
  );
}
