import { useState, useEffect } from "react";
import type { TTSProvider } from "../lib/types";

interface Props {
  provider: TTSProvider;
  onKeyChange: (key: string) => void;
}

// Remounted per provider via a `key` prop in the parent, so the stored key is
// read once in a lazy initializer (no state-sync effect) and reported to the
// parent once on mount.
export function ApiKeyInput({ provider, onKeyChange }: Props) {
  const [key, setKey] = useState(
    () => localStorage.getItem(provider.keyStorageKey) ?? ""
  );
  const [saved, setSaved] = useState(
    () => !!localStorage.getItem(provider.keyStorageKey)
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    onKeyChange(key);
    // Report the initial key once; parent callback is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    const trimmed = key.trim();
    localStorage.setItem(provider.keyStorageKey, trimmed);
    onKeyChange(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleChange(value: string) {
    setKey(value);
    setSaved(false);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {provider.keyLabel}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={key}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="Paste your API key"
            className="w-full px-3 py-2 pr-14 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!key.trim()}
          className="px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-800 text-white hover:bg-gray-900"
        >
          {saved ? "Saved!" : "Save"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Stored only in this browser.{" "}
        <a
          href={provider.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Get a key
        </a>
      </p>
    </div>
  );
}
