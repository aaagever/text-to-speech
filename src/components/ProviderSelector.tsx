import type { ProviderId } from "../lib/types";
import { PROVIDER_LIST } from "../lib/providers";

interface Props {
  value: ProviderId;
  onChange: (id: ProviderId) => void;
}

export function ProviderSelector({ value, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Provider
      </label>
      <div className="flex gap-1 p-1 border border-gray-300 rounded-lg">
        {PROVIDER_LIST.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value === p.id
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
