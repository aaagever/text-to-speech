# Backlog

Prioritized enhancements beyond V1. None are required for the tool to work.

## High value

- **Optional Jina API key field.** URL fetching uses the keyless tier (about 20 requests a minute). If 429s become annoying, add an optional key field (free keys come with a token allowance) and send it as a bearer token in `src/lib/fetch-article.ts`.
- **PWA share target.** On mobile, share a page from the browser's share sheet straight into the URL field instead of copying the link and switching apps. Needs a web app manifest with `share_target` and a service worker.
- **Gemini 3.1 Interactions response shape.** The 3.1 preview uses the newer Interactions API; the response parsing in `src/lib/providers/gemini.ts` (`synthesizeInteractions`) is best-effort (`output_audio.data` with a fallback). Confirm against a live key and lock it in. The 2.5 models are the default and use the well-understood `generateContent` shape.
- **OpenAI style instructions.** `gpt-4o-mini-tts` accepts an `instructions` field controlling tone, accent, pace, emotion. Add an optional "delivery" text field (only shown for that model). Plumbed nowhere in V1.
- **MP3 output for multi-part / Gemini without a heavy dependency.** V1 downloads stitched or PCM audio as WAV (bigger files) to avoid an LGPL MP3 encoder. Options to revisit: (a) concatenate multiple MP3 parts from OpenAI/ElevenLabs at the container level (no re-encode) so long text from those providers stays MP3; (b) reconsider an MP3 encoder if WAV size becomes annoying.

## Medium

- **Per-request timeout / long-request fragility.** There is deliberately no explicit fetch timeout (see decisions 2026-08-12): a genuinely hung socket now relies on the browser/OS to error it before the retries kick in. A size-scaled per-provider timeout would bound that wait, but needs real per-provider generation timing first, and must not false-timeout ElevenLabs `flash_v2_5`, which accepts up to 30,000 chars in one call. Related: that 30,000-char limit is itself one very long, mobile-fragile request; consider lowering it the way Gemini's was if it fails in the field.
- **ElevenLabs voice settings + language pinning.** Expose `voice_settings` (stability, similarity, speed 0.7-1.2) and optionally `language_code` for cases where short text is mis-detected. `apply_text_normalization` is already left at the default `auto`.
- **Voice previews.** A short pre-rendered or on-demand sample per voice so the user can audition before generating the whole text.
- **Chunk-seam silence trim.** Trim leading/trailing silence at chunk boundaries in the WAV merge to avoid audible gaps in long text (seams already fall on sentence/paragraph breaks, so this is polish).

## Low

- **Per-provider default voice memory across sessions** is already handled by prefs; consider remembering the last few inputs too.
- **Keyboard shortcuts** for play/pause and skip in the player.
- **Drag-drop multiple files** concatenated into one script.
- **Light/dark** parity (V1 is light only, matching the sibling).

## Done

### 2026-08-15

- **One input for text and links.** The dedicated URL field and its Fetch button are gone: paste a link into the main text box and it is recognized, fetched, and spoken. Detection fires on paste and blur, plus a fallback when Generate is pressed on a bare link, but never on keystrokes (a hand-typed URL is briefly valid partway through). The "Text" label was dropped as redundant with the placeholder, surviving as an `aria-label`. `src/components/UrlFetcher.tsx` deleted; `looksLikeUrl` added to `src/lib/fetch-article.ts` with 4 more tests. See decisions.md.
- **Article from a URL, spoken automatically.** Paste a link (a bare domain works too) and the page is fetched through Jina Reader, stripped of ads and navigation, titled, and sent straight to synthesis with no second click. Guards stop the auto-start for very long pages (over 60,000 chars), when a run is already going, and before a key/voice is set; a page that yields under 200 chars of text is reported as a failed read rather than spoken. Every attempt is recorded for the "Copy details" report (`url fetches:` section with URL, outcome, timing, status, chars, body snippet), so a failure can be copied into a bug report. New `src/lib/fetch-article.ts` + `src/components/UrlFetcher.tsx`; 24 new unit tests; verified live against a normal essay, a Hebrew site, and a page with no article text. See decisions.md.

### 2026-08-12

- **Clear the text field.** A "Clear" link appears in the Text label row only when the field has content; clicking it empties the text (and any loaded-file name) and returns focus to the field. `src/components/TextInput.tsx` + `handleClearText` in `App.tsx`.
- **Live cost estimate + retry visibility.** The text footer now shows an estimated cost for the current text ("~ $0.55"), updating live with the text and selected model, and the finished player repeats it next to the model label. It is an estimate from input length x the per-1,000-char rate (`src/lib/cost.ts`), clearly prefixed "~", never the actual provider bill. Retries are now visible too: the live status reads "Retrying part X of Y..." while a retry is in flight, and if any part was retried the result shows a note that it can slightly increase provider cost. 9 new unit tests (`cost.test.ts`); live estimate verified in-browser. Completes the "Live cost estimate per generation" backlog item.
- **Mobile network resilience.** Long multi-chunk runs no longer die on a single transient failure. Body reads are guarded (a connection dropped mid-download is now a retryable, part-tagged error, not a raw "Failed to fetch"); network failures are retryable; `synthesizeUnit` retries transient errors (network/429/5xx) twice with 2s/4s backoff; the debug report shows per-chunk attempts. Gemini's chunk size dropped 8000 -> 2500 so each request is short enough to survive a mobile connection. Fixes two field errors on Android Chrome. See decisions.md; 9 new unit tests (`errors.test.ts`, `synthesize.test.ts`).

### 2026-08-05

- **Static per-model cost labels.** Each model in the dropdown shows an approximate cost per 1,000 characters (OpenAI ~$0.015-0.03, Gemini ~$0.02-0.03, ElevenLabs ~$0.05-0.10) with a "varies by plan" caption. Costs are a `cost` field on `ModelOption`. Partial delivery of "Cost estimate"; the live per-generation version stays in the backlog.
- **API key collapse.** Once a key is saved the input collapses to a "Saved / Change" row, replacing the Save button that reverted from "Saved" to "Save". `src/components/ApiKeyInput.tsx`.
- **Auto-scroll to the player** when a result is generated. `src/App.tsx` (playerRef + effect on result).
- **Alphabetical voice lists** for all three providers, sorted by label at the source (static OpenAI/Gemini catalogs and the ElevenLabs fetched list).
