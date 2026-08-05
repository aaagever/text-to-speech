// Last-used selections, persisted to localStorage and validated against the
// catalog on load so a removed model/voice can't wedge the UI.

import type { ProviderId } from "./types";
import { PROVIDERS } from "./providers";

const KEY = "t2s-prefs";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface Prefs {
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  voices: Partial<Record<ProviderId, string>>;
  speed: number;
}

function defaults(): Prefs {
  return { provider: "openai", models: {}, voices: {}, speed: 1 };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<Prefs>;

    const provider: ProviderId =
      p.provider && p.provider in PROVIDERS ? p.provider : "openai";
    const speed = (SPEEDS as readonly number[]).includes(p.speed as number)
      ? (p.speed as number)
      : 1;

    const models: Partial<Record<ProviderId, string>> = {};
    const voices: Partial<Record<ProviderId, string>> = {};
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      const prov = PROVIDERS[id];
      const m = p.models?.[id];
      if (m && prov.models.some((x) => x.id === m)) models[id] = m;
      const v = p.voices?.[id];
      // Static voices are validated; ElevenLabs voices are account-specific and
      // validated later against the fetched list.
      if (v) {
        if (prov.staticVoices) {
          if (prov.staticVoices.some((x) => x.id === v)) voices[id] = v;
        } else {
          voices[id] = v;
        }
      }
    }
    return { provider, models, voices, speed };
  } catch {
    return defaults();
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Ignore quota / privacy-mode failures; prefs are a convenience.
  }
}
