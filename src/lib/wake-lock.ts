// Keeps the screen awake while a run is in flight.
//
// A long article is minutes of sequential requests. On a phone that is long
// enough for the screen to sleep, and a backgrounded tab gets its network
// throttled or suspended, which shows up as a chunk failing mid-download. A
// screen wake lock keeps the page in the foreground state for the duration.
//
// Entirely best-effort: the API is unsupported in some browsers and the request
// can be refused (a lock is only granted to a visible page). Every failure is
// swallowed, because losing the lock must never fail a run.

import { createLogger } from "./log";

const log = createLogger("app");

let sentinel: WakeLockSentinel | null = null;
let held = false;

async function request(): Promise<void> {
  if (!held || sentinel || !("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
    log.info("screen wake lock acquired");
  } catch (err) {
    // Refused (page not visible, battery saver, no permission). Not a problem.
    log.warn("screen wake lock unavailable:", err);
  }
}

// The browser drops the lock whenever the page is hidden, so take it again on
// the way back rather than leaving the rest of a long run unprotected.
function onVisibilityChange(): void {
  if (document.visibilityState === "visible") void request();
}

export function acquireWakeLock(): void {
  if (held) return;
  held = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  void request();
}

export function releaseWakeLock(): void {
  if (!held) return;
  held = false;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  const current = sentinel;
  sentinel = null;
  void current?.release().catch(() => {});
}
