import type { TTSProvider } from "../lib/types";

interface Props {
  provider: TTSProvider;
  value: string;
  onChange: (id: string) => void;
}

export function ModelSelector({ provider, value, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Model
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
      >
        {provider.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} · {m.cost}/1K chars
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">
        Approx. cost per 1,000 characters; varies by plan.
      </p>
    </div>
  );
}
