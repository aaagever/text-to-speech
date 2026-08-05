# Backlog

Prioritized enhancements beyond V1. None are required for the tool to work.

## High value

- **Gemini 3.1 Interactions response shape.** The 3.1 preview uses the newer Interactions API; the response parsing in `src/lib/providers/gemini.ts` (`synthesizeInteractions`) is best-effort (`output_audio.data` with a fallback). Confirm against a live key and lock it in. The 2.5 models are the default and use the well-understood `generateContent` shape.
- **OpenAI style instructions.** `gpt-4o-mini-tts` accepts an `instructions` field controlling tone, accent, pace, emotion. Add an optional "delivery" text field (only shown for that model). Plumbed nowhere in V1.
- **MP3 output for multi-part / Gemini without a heavy dependency.** V1 downloads stitched or PCM audio as WAV (bigger files) to avoid an LGPL MP3 encoder. Options to revisit: (a) concatenate multiple MP3 parts from OpenAI/ElevenLabs at the container level (no re-encode) so long text from those providers stays MP3; (b) reconsider an MP3 encoder if WAV size becomes annoying.

## Medium

- **ElevenLabs voice settings + language pinning.** Expose `voice_settings` (stability, similarity, speed 0.7-1.2) and optionally `language_code` for cases where short text is mis-detected. `apply_text_normalization` is already left at the default `auto`.
- **Live cost estimate per generation.** V1 now shows a static approximate cost per 1,000 characters in the model dropdown (see Done). The richer version: compute the actual cost for the current input length and show it before generating.
- **Voice previews.** A short pre-rendered or on-demand sample per voice so the user can audition before generating the whole text.
- **Chunk-seam silence trim.** Trim leading/trailing silence at chunk boundaries in the WAV merge to avoid audible gaps in long text (seams already fall on sentence/paragraph breaks, so this is polish).

## Low

- **Per-provider default voice memory across sessions** is already handled by prefs; consider remembering the last few inputs too.
- **Keyboard shortcuts** for play/pause and skip in the player.
- **Drag-drop multiple files** concatenated into one script.
- **Light/dark** parity (V1 is light only, matching the sibling).

## Done

### 2026-08-05

- **Static per-model cost labels.** Each model in the dropdown shows an approximate cost per 1,000 characters (OpenAI ~$0.015-0.03, Gemini ~$0.02-0.03, ElevenLabs ~$0.05-0.10) with a "varies by plan" caption. Costs are a `cost` field on `ModelOption`. Partial delivery of "Cost estimate"; the live per-generation version stays in the backlog.
- **API key collapse.** Once a key is saved the input collapses to a "Saved / Change" row, replacing the Save button that reverted from "Saved" to "Save". `src/components/ApiKeyInput.tsx`.
- **Auto-scroll to the player** when a result is generated. `src/App.tsx` (playerRef + effect on result).
