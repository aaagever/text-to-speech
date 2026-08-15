# Decisions

Dated architecture decisions and their rationale. Newest first.

## 2026-08-15: A failed part no longer discards the whole run (resume, longer retries, wake lock, compact transport)

A field failure on Android: a 5-part Hebrew article where parts 1 to 3 succeeded (73 seconds of generation, 7.4 MB downloaded, already billed) and part 4 failed its retries, throwing all of it away. Four changes, in order of how much they matter.

**Resume from the failed part.** `synthesizeText` now hands the completed audio back through an `onPartial` callback and accepts a `ResumeState` to pick up from. The UI offers "2 of 3 parts are already done. Continue from part 3?" and re-requests only the missing parts, so a bad moment on the network costs one part instead of the article. Resume state is held in memory for the session and is bound to a `runSignature` (provider, model, voice, text length and hash); editing the text or switching voice retires it silently, with no effect needed (see the ApiKeyInput precedent for why effects are avoided here).

**More retry headroom.** `MAX_TRANSIENT_RETRIES` went from 2 to 4, with backoff capped at 15s (2s, 4s, 8s, 15s). The field report showed the old budget giving up after roughly 6 seconds of patience; the new one rides out about 29 seconds of dropout, which matches how long a phone actually loses signal.

**Screen wake lock while generating.** The failed run had been going about 90 seconds, right where a phone screen sleeps, and a backgrounded tab gets its network throttled. `src/lib/wake-lock.ts` holds a screen wake lock for the duration and re-acquires it when the page becomes visible again (the browser drops the lock on hide). Entirely best-effort: every failure is swallowed, since losing the lock must never fail a run.

**Compact transport for multi-part runs.** `gpt-4o-mini-tts` returns roughly 2.6 MB of 128kbps MP3 per part, so a 5-part article pulled about 11 MB over cellular, and every one of those seconds is a chance to drop. Multi-part output is decoded and re-encoded to WAV regardless, so those runs now request opus instead, which is roughly a sixth the size, at no cost to the output. Single-part runs keep MP3 so the passthrough fast path is preserved.

That last one is guarded twice, because being wrong about it would mean paying for every part and failing at assembly: `canDecodeOggOpus()` gates on `canPlayType` before asking, and then `canDecodeChunk()` proves the first part actually decodes before the rest of the run commits. If it does not, the run drops back to MP3 and redoes that one part, so the worst case is a single cheap re-request rather than a lost run.

## 2026-08-15: A link goes in the main text box, not a dedicated field

The first cut shipped a separate URL input with its own Fetch button. That is one more field to look at, and it makes the user classify their own input before the app will help. Since a link is trivially distinguishable from prose, the field was removed and the main text box now accepts either: paste a link and the article is fetched and spoken; paste text and nothing changes. The "Text" label went too, since the placeholder already says what the box is for (it survives as an `aria-label`).

**Detection** is `looksLikeUrl` in `src/lib/fetch-article.ts`: the entire trimmed value must be one token with no whitespace, a real top-level domain, and no trailing dot. An article is never a single bare token, so prose cannot be mistaken for a link; `e.g.`, `3.5`, and any text containing spaces or newlines are all rejected.

**The trigger is the subtle part, and it is deliberately not `onChange`.** A URL typed by hand is briefly a valid URL partway through: typing `stratechery.com/an-article` passes through `stratechery.com`, and a keystroke trigger would fetch the homepage and throw away the rest. So detection runs on **paste** (how links actually arrive; the handler reads the settled value off the element rather than trusting React state) and on **blur**, with a third safety net inside `handleGenerate`: pressing Generate while the box holds only a link fetches the article instead of reading the address out loud. That last one makes the feature correct regardless of how the link got there. `lastUrlAttemptRef` prevents blur from re-fetching the same failing link every time focus leaves.

A failed fetch leaves the link in the box so it can be corrected and retried.

## 2026-08-15: Article-from-URL via Jina Reader (keyless), with auto-generate

Paste a link, get audio. The app is fully static and cannot fetch arbitrary pages itself (almost no site sends permissive CORS headers), and raw HTML is full of ads, nav, and related-links, so the fetch needs something that both allows browser calls and extracts clean article text.

**Chosen: Jina Reader** (`GET https://r.jina.ai/{encoded url}`, `Accept: application/json`). Verified by preflight from this app's origin on 2026-08-15: it echoes `access-control-allow-origin: https://t2s.joeleilat.com`, so the browser can call it directly and the fully-static architecture survives. It is free with no API key (roughly 20 requests a minute), returns article Markdown with boilerplate already stripped, renders JavaScript-heavy pages headlessly, and reads PDF links. Its Markdown needs no new cleanup because `stripMarkdown` already runs on all text.

**Rejected: Exa.** Preflighting `api.exa.ai/contents` from this origin returns no `access-control-allow-origin`, so browsers block it. Using it would mean building a proxy, which is exactly the cost we are avoiding. (Joel already has an Exa key, so this was worth testing rather than assuming.)

**Rejected for now: our own Cloudflare Pages Function proxy + Readability/Defuddle in the browser.** Best privacy and no third-party rate limit, but it breaks "no backend", cannot render JavaScript-heavy pages, and news sites routinely 403 datacenter IPs. Kept as the documented fallback if Jina degrades.

**Known limits:** paywalled and login-walled pages cannot be read (nothing legitimate fixes that; the error says so and pasting text manually still works), and the pasted page URL is sent to Jina. That is the one exception to "the browser only talks to the provider you pick", and it is called out in the README.

**Auto-generate, with three guards.** Joel chose link-in/audio-out with no intermediate click. `handleUrlText` still stops short of generating when: the text exceeds `WARN_INPUT_CHARS` (60,000, so a huge page is reviewed and started manually, and the existing amber warning explains why), a run is already in flight, or no key/voice is set yet. Extraction shorter than `MIN_ARTICLE_CHARS` (200) is treated as a failed fetch, so a cookie wall never becomes 12 seconds of nonsense audio.

**Implementation notes.** `handleGenerate` takes an optional `overrideText` because `setText` plus an immediate generate would otherwise read the previous render's memoized `cleaned` and `costEstimate`; the override path recomputes both. A pending-state effect was rejected: this repo enforces eslint's `set-state-in-effect` (see the 2026-08-05 ApiKeyInput entry). The fetch layer throws plain `Error`s rather than `TtsError` because `TtsErrorContext` is keyed by `ProviderId`, which also keys the debug records and prefs; widening it for one input-side call would ripple for no benefit. A 45s client timeout composes with the user's cancel via `AbortSignal.any`, and Jina is separately asked to cap its own render at 30s.

**Fetch attempts are recorded for bug reports.** Every attempt (success, failure, cancel) is stored via `recordFetchAttempt` and printed in the "Copy details" report under `url fetches:` with URL, outcome, timing, HTTP status, char count, and a short response-body snippet. Fetch errors therefore set `errorHasReport = true` (unlike file errors, which have no diagnostics behind them), and the report now renders even when no synthesis has run yet, since a fetch can fail before the first generation.

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
