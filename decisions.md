# Decisions

Dated architecture decisions and their rationale. Newest first.

## 2026-08-12: Per-conversion cost is an estimate from input length; retries are surfaced

Two related UI additions, both prompted by the mobile failures above.

- **Cost estimate.** The tool now shows a per-conversion cost (live in the text footer, and on the finished player), not just the static per-1,000-char rate in the model dropdown. It is deliberately an **estimate** = `input chars x the model's per-1,000-char rate` (`src/lib/cost.ts`), always prefixed "~", never the actual bill. Reason: no TTS provider returns a price in its response, and they bill in different units (OpenAI per token, Gemini per audio+text token, ElevenLabs per subscription credit), so a "real" number isn't available client-side and would differ per plan anyway. Gemini's `generateContent` does return `usageMetadata` token counts, which could make its estimate more precise later, but a consistent input-length estimate across all three providers was chosen over per-provider special-casing.
- **Retry visibility.** Because retries can cost money in one specific case (a connection dropped *after* the provider generated the audio, so the chunk is billed and then regenerated), the UI now shows retries rather than hiding them: the live status reads "Retrying part X of Y..." during a retry (via a new optional `attempt` on `Progress`), and the result carries `retriedParts` so it can warn that retried parts may slightly increase the bill. Retries from a pre-generation network drop, a 429, or a 5xx generally are not billed; the note is intentionally soft ("can slightly increase") rather than claiming a definite extra charge.

## 2026-08-12: Network resilience for flaky mobile connections (retries, guarded body reads, smaller Gemini chunks)

Two field errors on Android Chrome (Chrome 151 mobile) exposed that the app had no resilience to transient mobile-network failures during a long multi-chunk run:

1. **OpenAI, 19 chunks:** chunk 2's response body dropped mid-download. `res.arrayBuffer()` ran outside `ttsFetch`'s try/catch, so the raw "Failed to fetch" escaped unwrapped, non-retryable, and untagged, killing a run that had already produced 2 good chunks.
2. **Gemini, 4 chunks:** one 7,793-char request (at the old 8,000-char limit) ran for ~7 minutes before the mobile connection died. The network error was not retryable, so the whole run failed after 7 minutes of waiting.

Fixes:

- **Body reads happen inside the guarded request path.** `ttsFetch` (which returned a bare `Response` for callers to read) is replaced by `ttsFetchArrayBuffer` / `ttsFetchJson`, which read the body inside the same try as the `fetch`. A connection dropped mid-download now becomes a friendly, retryable `TtsError` instead of a raw TypeError, and it is part-tagged like any other chunk failure.
- **Network failures are retryable.** Both a failed `fetch()` and a failed body read are marked `retryable: true`. User aborts are still rethrown untouched, so "cancelled" stays distinct from "failed".
- **Bounded transient retries.** `synthesizeUnit` retries a retryable error (network drop, 429, 5xx) up to 2 times with a 2s/4s backoff, separate from the too-long split recursion. The old code retried only a 429, only once, only at split depth 0. Per-chunk attempts are recorded and shown in the debug report.
- **Smaller Gemini chunks (8000 -> 2500 chars).** A full 8,000-char Gemini `generateContent` request is minutes of audio in a single HTTP call, which a mobile radio can't reliably hold open. 2,500 chars keeps each request short-lived and mobile-resilient; Gemini already assembles to WAV regardless of chunk count, and seams fall on sentence/paragraph breaks. Tunable if it still proves flaky.

Deliberately NOT added: an explicit per-request timeout. A timeout tight enough to bound the wait risks false-timing-out a legitimately slow request (Gemini per-chunk generation time is unmeasured, and ElevenLabs `flash_v2_5` accepts up to 30,000 chars in one call). Smaller chunks plus retries address both field errors without that risk; a size-scaled per-provider timeout can be added later once we have real timing. See backlog.

## 2026-08-05: Model cost shown as approximate USD per 1,000 characters

Joel asked for per-model cost in the dropdown. The providers price in different units (OpenAI tts-1/hd per character but gpt-4o-mini-tts per token; Gemini per audio+text token; ElevenLabs per subscription credit), so no single native unit is comparable. Chosen unit: **approximate USD per 1,000 characters** (roughly one post), computed/estimated from each provider's published rate and shown with a leading "~" plus an "Approx. cost per 1,000 characters; varies by plan" caption. This keeps the relative picture honest and useful (ElevenLabs is 3-6x pricier than OpenAI/Gemini) without implying false precision. Costs live as a `cost` string on each `ModelOption`. A live per-generation estimate from the actual input length stays in the backlog.

## 2026-08-05: API key input collapses once a key is saved

The original ApiKeyInput showed a Save button that flashed "Saved!" then reverted to "Save", which read as unfinished and left a full input row taking space for a key that only needs to be entered once. Changed to collapse to a compact "Saved / Change" row whenever a key exists in localStorage (Change re-expands the input, with a Cancel to back out). The component is still remounted per provider via a `key` prop and reads the stored key in a lazy initializer, so no state-sync effect is needed (avoids the `react-hooks/set-state-in-effect` lint rule).

## 2026-08-05: Fully static, no backend (browser calls providers directly)

All three provider APIs return permissive CORS headers for the `t2s.joeleilat.com` origin (verified by preflight `OPTIONS` on 2026-08-05: OpenAI and Gemini echo the origin and allow the auth header; ElevenLabs allows `*`). So the browser can call each provider directly with the user's key and there is no reason to run a proxy. This is the opposite of the sibling s2t tool, which needs a Cloudflare Pages Functions proxy purely because AssemblyAI does not send CORS headers.

Consequences: no Functions, no server-held secrets, no stored files, and the "session-only audio / no clutter" requirement falls out for free (audio is an in-memory blob). The only server the browser talks to is the provider the user selects.

## 2026-08-05: WAV output instead of an MP3 encoder (lamejs declined)

Gemini returns raw PCM, and multi-part results must be stitched, so those cases need to be encoded to a downloadable file. The standard in-browser MP3 encoder is lamejs, which is LGPL and whose canonical package is stale. Joel declined the dependency. So: single-part OpenAI/ElevenLabs output (already MP3) passes through untouched as MP3; everything else is written to WAV with a ~25-line hand-rolled RIFF writer (`buildWav` in `src/lib/audio.ts`). Zero extra dependency. Tradeoff: WAV files are larger (~10 MB/min vs ~1 MB/min), acceptable for personal use. Revisiting MP3 for multi-part is in the backlog (container-level concatenation of MP3 parts, no re-encode).

## 2026-08-05: Hand-rolled Markdown stripper, not a remark/unified chain

The job is narrow (produce speech-friendly text, never render), and a remark/rehype pipeline is several dependencies and heavier than needed. `src/lib/markdown-strip.ts` is ~140 lines, targets ASCII Markdown markers only (so Hebrew and other scripts pass through untouched), and is safe on plain pasted text (the heading rule requires "# " so "#1 priority" survives). It is unit-tested against the tricky cases (frontmatter, nested emphasis, snake_case, tables, escapes, bare URLs, Hebrew). Same reasoning for the docx path: a small DOMParser walk rather than a converter dependency.

## 2026-08-05: docx via mammoth convertToHtml, not extractRawText

`mammoth.extractRawText` flattens a document into undifferentiated text, which jams headings into the following paragraph with no pause. Instead we use `convertToHtml` (keeps headings, lists, tables) and linearize the HTML ourselves (`src/lib/html-to-speech-text.ts`) so docx gets the same sentence-with-pause treatment as Markdown. Images are dropped. mammoth is BSD-2-Clause, ~7M weekly downloads, and dynamically imported so it only loads on first docx use.

## 2026-08-05: Conservative per-model char limits with a token-limit safety net

Some provider limits are token-based (OpenAI ~2000 tokens for gpt-4o-mini-tts; Gemini 2.5 ~8192 tokens) while the chunker works in characters. Hebrew is roughly 1-2 chars/token, so a char-safe chunk can still exceed a token cap. Rather than ship a client-side tokenizer, the chunk limits are set conservatively (gpt-4o-mini-tts 1800, tts-1/hd 3500, eleven_v3 4000, multilingual_v2 8000, flash_v2_5 30000, gemini 8000) and the orchestrator auto-halves a chunk at a sentence boundary and retries once on an input-too-long 400. Self-healing across all providers, no tokenizer dependency.

## 2026-08-05: Provider segmented control (deviation from the sibling)

The sibling built a `ProviderSelector` but never wired it (it hardcodes one provider). Here the provider switch is a first-class segmented control, since choosing among three providers is the point of the tool.

## 2026-08-05: API keys in localStorage (documented XSS tradeoff)

Keys are stored in `localStorage` (`t2s-{provider}-api-key`) so they persist without a backend. This is theoretically exposed to XSS, but the app loads no third-party scripts, renders no user-supplied HTML, and has no server, so the practical attack surface is minimal. Same tradeoff the sibling makes. No cookies are used.

## 2026-08-05: Dev-only dependency vulnerabilities accepted

`npm audit` reports advisories only in the wrangler CLI toolchain (esbuild, miniflare -> ws, sharp -> libvips). These are dev-only tools used for deploying; they are never part of the shipped static bundle. `npm audit --omit=dev` reports 0 vulnerabilities. Vite was bumped to 8.2.0 to clear the dev-server `ws` advisory. Wrangler is pinned to 4.82.2 (not the latest 4.119) because 4.119 requires Node 22 and the vault is pinned to Node 20; 4.82.2's remaining advisories are dev-only and unavoidable with any modern wrangler.
