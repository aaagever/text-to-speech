import { useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  parts: number;
  // Approximate cost of synthesizing the current text, e.g. "~ $0.55".
  costEstimate?: string | null;
  // Empty the field (and any loaded-file name). Shown only when there is text.
  onClear: () => void;
  // Called with the settled field value when the content may have become a
  // link: after a paste, and when focus leaves. Deliberately NOT on every
  // keystroke, because a URL typed by hand is briefly valid partway through
  // ("stratechery.com" on the way to "stratechery.com/an-article"), and that
  // would fetch the wrong page.
  onMaybeUrl: (value: string) => void;
}

export function TextInput({
  value,
  onChange,
  parts,
  costEstimate,
  onClear,
  onMaybeUrl,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleClear() {
    onClear();
    // Put the cursor back in the now-empty field so the user can type on.
    textareaRef.current?.focus();
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex items-center justify-end mb-1.5">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Clear
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        dir="auto"
        rows={9}
        value={value}
        aria-label="Text or article link to speak"
        onChange={(e) => onChange(e.target.value)}
        // Read the value after the paste has been applied, straight from the
        // element, so it is never a render behind.
        onPaste={() => {
          setTimeout(() => {
            if (textareaRef.current) onMaybeUrl(textareaRef.current.value);
          }, 0);
        }}
        onBlur={(e) => onMaybeUrl(e.target.value)}
        placeholder="Paste text or an article link here, or drop a file below."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
      />
      <div className="flex items-center justify-end mt-1.5">
        <span className="text-xs text-gray-400">
          {value.length.toLocaleString()} characters
          {parts > 1 ? ` · ~${parts} parts` : ""}
          {costEstimate ? ` · ${costEstimate}` : ""}
        </span>
      </div>
    </div>
  );
}
