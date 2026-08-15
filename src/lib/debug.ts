// Per-run diagnostic records, kept in memory (last 5). Powers the error
// banner's "Copy details" report so a bug can be diagnosed without a repro, and
// is exposed as window.__t2sDebug for live inspection. Contains NO API keys.
// Article-fetch attempts (URL -> Jina Reader) are recorded alongside synthesis
// runs so a failed fetch can be copied into a bug report the same way. Those
// records carry the page URL the user pasted, never a key.

import type { ProviderId } from "./types";
import { APP_VERSION } from "./log";

export interface ChunkTiming {
  index: number;
  chars: number;
  ms: number;
  bytes: number;
  // Total attempts made for this chunk (1 = succeeded first try). Surfaced in
  // the report so retried/flaky chunks are visible when diagnosing a run.
  attempts?: number;
  status: "ok" | "retried" | "failed";
}

export type Outcome = "running" | "success" | "error" | "cancelled";

export interface DebugRecord {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  provider: ProviderId;
  model: string;
  voice: string;
  inputChars: number;
  chunkPlan: number;
  chunks: ChunkTiming[];
  assembly?: "passthrough-mp3" | "merged-wav";
  outcome: Outcome;
  error?: { message: string; status?: number; providerCode?: string; bodySnippet?: string };
  durationSec?: number | null;
}

// One attempt to fetch an article by URL. Recorded for success and failure
// alike so the "Copy details" report shows what happened.
export interface FetchAttempt {
  url: string;
  startedAt: string;
  ms: number;
  outcome: "ok" | "failed" | "cancelled";
  httpStatus?: number;
  contentChars?: number;
  error?: string;
  bodySnippet?: string;
}

const MAX_RECORDS = 5;
const records: DebugRecord[] = [];
const fetches: FetchAttempt[] = [];
let counter = 0;

interface DebugGlobal {
  version: string;
  records: DebugRecord[];
  fetches: FetchAttempt[];
  report: (index?: number) => string;
}

function syncGlobal(): void {
  (window as unknown as { __t2sDebug?: DebugGlobal }).__t2sDebug = {
    version: APP_VERSION,
    records,
    fetches,
    report: (index = 0) => formatDebugReport(records[index]),
  };
}

export function recordFetchAttempt(attempt: FetchAttempt): void {
  fetches.unshift(attempt);
  while (fetches.length > MAX_RECORDS) fetches.pop();
  syncGlobal();
}

export function getFetchAttempts(): FetchAttempt[] {
  return fetches;
}

export function startDebugRecord(init: {
  provider: ProviderId;
  model: string;
  voice: string;
  inputChars: number;
}): DebugRecord {
  const rec: DebugRecord = {
    runId: `run-${Date.now()}-${++counter}`,
    startedAt: new Date().toISOString(),
    outcome: "running",
    chunkPlan: 0,
    chunks: [],
    ...init,
  };
  records.unshift(rec);
  while (records.length > MAX_RECORDS) records.pop();
  syncGlobal();
  return rec;
}

export function finishDebugRecord(
  rec: DebugRecord,
  outcome: Outcome,
  durationSec?: number | null
): void {
  rec.outcome = outcome;
  rec.finishedAt = new Date().toISOString();
  if (durationSec !== undefined) rec.durationSec = durationSec;
  syncGlobal();
}

export function getDebugRecords(): DebugRecord[] {
  return records;
}

// Plain-text report the user copies from the error banner. Redaction note: the
// record itself never stores keys, so this is safe to paste anywhere.
function fetchLines(): string[] {
  if (!fetches.length) return [];
  const lines = ["url fetches:"];
  for (const f of fetches) {
    const bits = [`${f.outcome}`, `${f.ms}ms`];
    if (f.httpStatus !== undefined) bits.push(`status ${f.httpStatus}`);
    if (f.contentChars !== undefined) bits.push(`${f.contentChars} chars`);
    lines.push(`  ${f.url}: ${bits.join(", ")}`);
    if (f.error) lines.push(`    error: ${f.error}`);
    if (f.bodySnippet) lines.push(`    body: ${f.bodySnippet}`);
  }
  return lines;
}

export function formatDebugReport(rec?: DebugRecord): string {
  const r = rec ?? records[0];

  // A URL fetch can fail before any synthesis has run, so the report still has
  // something useful to say with no runs recorded.
  if (!r) {
    const head = [
      "Text to Speech -- debug report",
      `app version: ${APP_VERSION}`,
      `user agent: ${navigator.userAgent}`,
      "runs: none recorded yet",
    ];
    const fetchSection = fetchLines();
    if (!fetchSection.length) return "Text to Speech: no runs recorded yet.";
    return [...head, ...fetchSection, "(API keys are never included in this report.)"].join("\n");
  }

  const lines = [
    "Text to Speech -- debug report",
    `app version: ${APP_VERSION}`,
    `user agent: ${navigator.userAgent}`,
    `run: ${r.runId}`,
    `provider / model / voice: ${r.provider} / ${r.model} / ${r.voice}`,
    `input chars: ${r.inputChars}`,
    `chunk plan: ${r.chunkPlan}`,
    `assembly: ${r.assembly ?? "-"}`,
    `outcome: ${r.outcome}`,
    `started: ${r.startedAt}`,
    `finished: ${r.finishedAt ?? "-"}`,
  ];

  if (r.chunks.length) {
    lines.push("chunks:");
    for (const c of r.chunks) {
      const tries = c.attempts && c.attempts > 1 ? `, ${c.attempts} attempts` : "";
      lines.push(
        `  #${c.index}: ${c.chars} chars, ${c.ms}ms, ${c.bytes} bytes, ${c.status}${tries}`
      );
    }
  }

  if (r.error) {
    lines.push(`error: ${r.error.message}`);
    if (r.error.status !== undefined) lines.push(`  http status: ${r.error.status}`);
    if (r.error.providerCode) lines.push(`  provider code: ${r.error.providerCode}`);
    if (r.error.bodySnippet) lines.push(`  provider body: ${r.error.bodySnippet}`);
  }

  lines.push(...fetchLines());
  lines.push("(API keys are never included in this report.)");
  return lines.join("\n");
}
