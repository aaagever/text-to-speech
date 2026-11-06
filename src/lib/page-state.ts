// Tracks whether the page is in front and the device is online, so a run can
// tell a failure caused by the phone backgrounding the tab (Android Chrome cuts
// background downloads) from one caused by the request itself, and can wait
// for the page to come back instead of spending retries while it is hidden.

let lastHiddenAt = 0;
let hiddenCount = 0;
let hiddenMsTotal = 0;

function now(): number {
  return Date.now();
}

export function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

if (typeof document !== "undefined") {
  if (isHidden()) lastHiddenAt = now();
  document.addEventListener("visibilitychange", () => {
    if (isHidden()) {
      lastHiddenAt = now();
      hiddenCount++;
    } else if (lastHiddenAt) {
      hiddenMsTotal += now() - lastHiddenAt;
    }
  });
}

// True if the page was hidden at any moment since `since` (a Date.now() value),
// including right now.
export function wasHiddenSince(since: number): boolean {
  return isHidden() || lastHiddenAt >= since;
}

// Running totals, read at the start and end of a run to report how often and
// for how long the page was hidden during it.
export function hiddenStats(): { count: number; ms: number } {
  const ongoing = isHidden() && lastHiddenAt ? now() - lastHiddenAt : 0;
  return { count: hiddenCount, ms: hiddenMsTotal + ongoing };
}

// Resolve once the page is visible and the device is online (immediately if it
// already is). Rejects with an AbortError if `signal` aborts while waiting.
export function waitUntilUsable(signal: AbortSignal): Promise<void> {
  if (!isHidden() && !isOffline()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!isHidden() && !isOffline()) {
        cleanup();
        resolve();
      }
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      signal.removeEventListener("abort", onAbort);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
