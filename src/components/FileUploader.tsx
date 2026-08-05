import { useRef, useState } from "react";
import { extractText, ACCEPTED_EXTENSIONS } from "../lib/extract-text";

interface Props {
  onText: (text: string, filename: string) => void;
  onError: (message: string) => void;
  loadedName: string | null;
}

export function FileUploader({ onText, onError, loadedName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const { text, filename } = await extractText(file);
      if (!text.trim()) {
        onError(`"${file.name}" didn't contain any readable text.`);
        return;
      }
      onText(text, filename);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
          className="hidden"
        />
        <p className="text-gray-600 text-sm">
          {busy
            ? "Reading file..."
            : dragOver
              ? "Drop to load the file"
              : "Drop a .txt, .md, or .docx file, or click to browse"}
        </p>
      </div>
      {loadedName && !busy && (
        <p className="text-sm text-gray-600 mt-2">
          Loaded: <span className="font-medium">{loadedName}</span>
        </p>
      )}
    </div>
  );
}
