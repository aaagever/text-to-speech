# Backlog

Prioritized enhancements beyond V1. None are required for the tool to work.

## High value

- **Gemini 3.1 Interactions response shape.** The 3.1 preview uses the newer Interactions API; the response parsing in `src/lib/providers/gemini.ts` (`synthesizeInteractions`) is best-effort (`output_audio.data` with a fallback). Confirm against a live key and lock it in. The 2.5 models are the default and use the well-understood `generateContent` shape.
- **OpenAI style instructions.** `gpt-4o-mini-tts` accepts an `instructions` field controlling tone, accent, pace, emotion. Add an optional "delivery" text field (only shown for that model). Plumbed nowhere in V1.
- **MP3 output for multi-part / Gemini without a heavy dependency.** V1 downloads stitched or PCM audio as WAV (bigger files) to avoid an LGPL MP3 encoder. Options to revisit: (a) concatenate multiple MP3 parts from OpenAI/ElevenLabs at the container level (no re-encode) so long text from those providers stays MP3; (b) reconsider an MP3 encoder if WAV size becomes annoying.

## Medium

- **ElevenLabs voice settings + language pinning.** Expose `voice_settings` (stability, similarity, speed 0.7-1.2) and optionally `language_code` for cases where short text is mis-detected. `apply_text_normalization` is already left at the default `auto`.
- **Cost estimate.** Show an approximate cost per generation from the character/token count and each provider's published rate.
- **Voice previews.** A short pre-rendered or on-demand sample per voice so the user can audition before generating the whole text.
- **Chunk-seam silence trim.** Trim leading/trailing silence at chunk boundaries in the WAV merge to avoid audible gaps in long text (seams already fall on sentence/paragraph breaks, so this is polish).

## Low

- **Per-provider default voice memory across sessions** is already handled by prefs; consider remembering the last few inputs too.
- **Keyboard shortcuts** for play/pause and skip in the player.
- **Drag-drop multiple files** concatenated into one script.
- **Light/dark** parity (V1 is light only, matching the sibling).
