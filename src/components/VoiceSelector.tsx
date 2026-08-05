import type { VoiceOption } from "../lib/types";

interface Props {
  voices: VoiceOption[] | null;
  value: string;
  onChange: (id: string) => void;
  loading: boolean;
  disabledReason?: string;
}

export function VoiceSelector({
  voices,
  value,
  onChange,
  loading,
  disabledReason,
}: Props) {
  const disabled = loading || !!disabledReason || !voices || voices.length === 0;

  let placeholder: string | null = null;
  if (loading) placeholder = "Loading voices...";
  else if (disabledReason) placeholder = disabledReason;
  else if (!voices || voices.length === 0) placeholder = "No voices available";

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Voice
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400"
      >
        {placeholder ? (
          <option value="">{placeholder}</option>
        ) : (
          voices!.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
