import { useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  parts: number;
  // Approximate cost of synthesizing the current text, e.g. "~ $0.55".
  costEstimate?: string | null;
  // Empty the field (and any loaded-file name). Shown only when there is text.
  onClear: () => void;
}

export function TextInput({ value, onChange, parts, costEstimate, onClear }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleClear() {
    onClear();
    // Put the cursor back in the now-empty field so the user can type on.
    textareaRef.current?.focus();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-gray-700">Text</label>
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Clear
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        dir="auto"
        rows={9}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste text here, or drop a file below."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-gray-400">
          Markdown is cleaned automatically.
        </span>
        <span className="text-xs text-gray-400">
          {value.length.toLocaleString()} characters
          {parts > 1 ? ` · ~${parts} parts` : ""}
          {costEstimate ? ` · ${costEstimate}` : ""}
        </span>
      </div>
    </div>
  );
}
