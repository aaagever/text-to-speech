// Provider catalog / registry. Adding or removing a model is a one-line change
// in the relevant provider file's `models` array; the UI and orchestrator read
// everything through here.

import type { ModelOption, ProviderId, TTSProvider } from "../types";
import { openai } from "./openai";
import { elevenlabs } from "./elevenlabs";
import { gemini } from "./gemini";

export const PROVIDERS: Record<ProviderId, TTSProvider> = {
  openai,
  elevenlabs,
  gemini,
};

// Display order for the provider selector.
export const PROVIDER_LIST: TTSProvider[] = [openai, elevenlabs, gemini];

export function getProvider(id: ProviderId): TTSProvider {
  return PROVIDERS[id];
}

export function getModelOption(
  providerId: ProviderId,
  modelId: string
): ModelOption | undefined {
  return PROVIDERS[providerId].models.find((m) => m.id === modelId);
}

// The char limit for the selected model (falls back to a safe small value).
export function charLimitFor(providerId: ProviderId, modelId: string): number {
  return getModelOption(providerId, modelId)?.charLimit ?? 1800;
}
