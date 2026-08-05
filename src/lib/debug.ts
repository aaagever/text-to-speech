// Per-run diagnostic records, kept in memory (last 5). Powers the error
// banner's "Copy details" report so a bug can be diagnosed without a repro, and
// is exposed as window.__t2sDebug for live inspection. Contains NO API keys.

import type { ProviderId } from "./types";
import { APP_VERSION } from "./log";

export interface ChunkTiming {
  index: number;
  chars: number;
  ms: number;
  bytes: number;
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

const MAX_RECORDS = 5;
const records: DebugRecord[] = [];
let counter = 0;

interface DebugGlobal {
  version: string;
  records: DebugRecord[];
  report: (index?: number) => string;
}

function syncGlobal(): void {
  (window as unknown as { __t2sDebug?: DebugGlobal }).__t2sDebug = {
    version: APP_VERSION,
    records,
    report: (index = 0) => formatDebugReport(records[index]),
  };
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
export function formatDebugReport(rec?: DebugRecord): string {
  const r = rec ?? records[0];
  if (!r) return "Text to Speech: no runs recorded yet.";

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
      lines.push(`  #${c.index}: ${c.chars} chars, ${c.ms}ms, ${c.bytes} bytes, ${c.status}`);
    }
  }

  if (r.error) {
    lines.push(`error: ${r.error.message}`);
    if (r.error.status !== undefined) lines.push(`  http status: ${r.error.status}`);
    if (r.error.providerCode) lines.push(`  provider code: ${r.error.providerCode}`);
    if (r.error.bodySnippet) lines.push(`  provider body: ${r.error.bodySnippet}`);
  }

  lines.push("(API keys are never included in this report.)");
  return lines.join("\n");
}
