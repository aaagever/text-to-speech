interface Props {
  value: string;
  onChange: (v: string) => void;
  parts: number;
}

export function TextInput({ value, onChange, parts }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Text
      </label>
      <textarea
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
        </span>
      </div>
    </div>
  );
}
