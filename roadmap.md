# Roadmap

## Milestone 1: V1 (DONE, 2026-08-05)

The full working tool.

- Static Vite + React + TypeScript + Tailwind app mirroring the sibling s2t UI.
- Three providers (OpenAI, ElevenLabs, Google Gemini) with per-provider model and voice selection.
- Direct browser-to-provider calls (CORS verified); keys in localStorage; no backend.
- Markdown stripper and docx linearizer so formatting is never voiced; English + Hebrew.
- Boundary-aware chunking with sequential synthesis, progress, cancel, too-long auto-split, and a 429 retry.
- Audio assembly: MP3 passthrough for single-part OpenAI/ElevenLabs, merged WAV otherwise.
- Player with play/pause, seek, skip +/-15/30s, speed 0.75x-2x, autoplay, download.
- Namespaced logging + per-run debug records + "Copy details" report.
- Unit tests for the pure modules (46 passing).

## Milestone 3: Deploy (DONE, 2026-08-05)

- Cloudflare Pages project `t2s` + `wrangler pages deploy` (serves at `t2s-41f.pages.dev`).
- **Live at t2s.joeleilat.com**: domain registered on the Pages project via API; the CNAME was added by Joel in the dashboard (the deploy token lacks DNS-write scope). Procedure and the known post-deploy asset-propagation transient are in `runbook.md`.

## Milestone 4: UX polish (DONE, 2026-08-05)

Shipped after Joel's first live use.

- API key area collapses to a "Saved / Change" row once a key exists (no more Save/Saved flicker).
- Model dropdown shows an approximate cost per 1,000 characters per model, with a "varies by plan" caption.
- The player scrolls into view when a result is generated.
- Voice lists sorted alphabetically for all three providers.
- Confirmed selections persist across reloads (provider/model/voice/speed); this was already in the prefs system since V1, verified live including the ElevenLabs async-fetch case.

## Milestone 2: Live provider verification (DONE, 2026-08-05)

Confirmed end-to-end with real keys.

- All three providers produce correct audio on the live site: OpenAI and ElevenLabs (Joel: "works perfectly"), and Google Gemini (Joel confirmed it works; default path is 2.5 Flash). ElevenLabs key scoped to Text to Speech + Voices (Read).
- Real `.docx` linearizes cleanly (integration smoke test against a real file passed).
- Voice selection persists per provider across reloads, verified live including the ElevenLabs async-fetch case.
- Residual optional checks, non-blocking (edge paths only): the too-long auto-split on very long Hebrew for gpt-4o-mini-tts, the Gemini 3.1 preview model's Interactions response shape, and exact wrong-key / out-of-credits message wording per provider. Confirm if any ever surfaces in real use.

## Later

See `backlog.md`. Candidate themes: richer delivery control (OpenAI `instructions`, ElevenLabs voice settings), MP3 output for multi-part without a heavy dependency, cost estimation, and voice previews.
