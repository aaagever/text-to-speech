// Rough cost estimation for a synthesis run, computed purely from input length.
//
// This is an ESTIMATE, never the actual bill: no TTS provider returns a price in
// its response, and they bill in different units (OpenAI per token, Gemini per
// audio+text token, ElevenLabs per subscription credit). We reuse the same
// "approximate USD per 1,000 characters" rate already shown in the model
// dropdown (the `cost` string on each ModelOption) and scale it by the input
// length. Retries that re-send a chunk, and the exact output length, can push
// the real bill a little higher; the UI labels the figure as approximate.

// Parse the numeric per-1,000-character USD rate out of a model's display cost
// string (e.g. "~$0.015" -> 0.015). Returns null if there is no number.
export function parseRatePer1k(cost: string): number | null {
  const m = cost.match(/[0-9]*\.?[0-9]+/);
  return m ? parseFloat(m[0]) : null;
}

// Estimated USD to synthesize `chars` characters at a model's rate, or null when
// the rate can't be read or there is nothing to synthesize.
export function estimateCostUsd(chars: number, cost: string): number | null {
  const rate = parseRatePer1k(cost);
  if (rate == null || chars <= 0) return null;
  return (chars / 1000) * rate;
}

// Human-friendly USD: "$0.55", or "< $0.01" for a nonzero amount that rounds to
// zero cents (so a tiny run never misleadingly reads as free).
export function formatCostUsd(usd: number): string {
  if (usd > 0 && usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

// The ready-to-display estimate label, e.g. "~ $0.55", or null when unavailable.
export function costEstimateLabel(chars: number, cost: string): string | null {
  const usd = estimateCostUsd(chars, cost);
  return usd == null ? null : `~ ${formatCostUsd(usd)}`;
}
