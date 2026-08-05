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

## Milestone 2: Live provider verification (NEXT)

Confirm end-to-end with real keys; small fixes likely.

- Verify each provider produces correct audio (OpenAI MP3 passthrough, ElevenLabs v3 Hebrew, Gemini 2.5 PCM pitch/rate correct).
- Confirm the Gemini 3.1 Interactions response shape and adjust `gemini.ts` if needed.
- Confirm the too-long auto-split triggers correctly for long Hebrew on gpt-4o-mini-tts.
- Confirm error messages for wrong key / out-of-credits per provider.
- Confirm a real `.docx` (including Hebrew) linearizes cleanly.

## Milestone 3: Deploy (NEXT)

- Cloudflare Pages project + `wrangler pages deploy`.
- Custom domain t2s.joeleilat.com (API attempt, dashboard fallback documented in runbook).

## Later

See `backlog.md`. Candidate themes: richer delivery control (OpenAI `instructions`, ElevenLabs voice settings), MP3 output for multi-part without a heavy dependency, cost estimation, and voice previews.
