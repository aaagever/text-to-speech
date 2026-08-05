import { useState, useEffect } from "react";
import type { TTSProvider } from "../lib/types";

interface Props {
  provider: TTSProvider;
  onKeyChange: (key: string) => void;
}

// Remounted per provider via a `key` prop in the parent. Once a key is saved
// the input collapses to a compact "Saved / Change" row, since the key only
// needs to be entered once and does not need to be shown again.
export function ApiKeyInput({ provider, onKeyChange }: Props) {
  const readStored = () => localStorage.getItem(provider.keyStorageKey) ?? "";

  const [key, setKey] = useState(readStored);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(() => !readStored());

  useEffect(() => {
    onKeyChange(key);
    // Report the initial key once; parent callback is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasStoredKey = !!readStored();

  function handleSave() {
    const trimmed = key.trim();
    if (!trimmed) return;
    localStorage.setItem(provider.keyStorageKey, trimmed);
    setKey(trimmed);
    onKeyChange(trimmed);
    setVisible(false);
    setEditing(false);
  }

  function handleCancel() {
    setKey(readStored());
    setVisible(false);
    setEditing(false);
  }

  // Collapsed state: a key is saved and we are not editing it.
  if (!editing && hasStoredKey) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {provider.keyLabel}
        </label>
        <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
            Saved
          </span>
          <button
            type="button"
            onClick={() => {
              setKey("");
              setVisible(false);
              setEditing(true);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // Editing state: no key yet, or the user chose to change it.
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
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="Paste your API key"
            autoFocus
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
          Save
        </button>
        {hasStoredKey && (
          <button
            type="button"
            onClick={handleCancel}
            className="px-2 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
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
