// Namespaced console logging so any run can be traced from the browser console,
// and so a bug report reads clearly. Namespaces: app, synth, openai, elevenlabs,
// gemini, audio, file. API keys are NEVER passed to these functions.

// Keep in sync with package.json "version" and the <meta name="version"> tag.
export const APP_VERSION = "1.0.0";

export type LogNamespace =
  | "app"
  | "synth"
  | "openai"
  | "elevenlabs"
  | "gemini"
  | "audio"
  | "file";

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(ns: LogNamespace): Logger {
  const prefix = `[t2s:${ns}]`;
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

let bootLogged = false;

// Logged once at app start so every console session is stamped with the build.
export function logBoot(): void {
  if (bootLogged) return;
  bootLogged = true;
  createLogger("app").info(
    `Text to Speech v${APP_VERSION} ready. Keys stay in this browser; nothing is sent to any server but the provider you pick.`
  );
}
