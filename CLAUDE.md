# CLAUDE.md

Guidance for Claude Code when working in this project.

## What this is

A static, browser-only **text-to-speech** web app. Paste text or drop a `.txt` / `.md` / `.docx` file, pick a provider (OpenAI / ElevenLabs / Google Gemini), model, and voice, and get spoken audio with an in-app player (skip back/forward 15 and 30 seconds, speed 0.75x to 2x) plus a download. Handles English and Hebrew. Deployed to **t2s.joeleilat.com** on Cloudflare Pages. Sibling of the speech-to-text tool at `../call-transcription` (s2t.joeleilat.com); the UI deliberately mirrors it.

## Shell environment

Always prepend the nvm path before node/npm commands:

```bash
export PATH="/Users/yoeleilat/.nvm/versions/node/v20.20.0/bin:$PATH"
```

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173). Plain vite: there is NO backend.
npm test         # Vitest unit tests (stripper, linearizer, chunker, WAV writer)
npm run build    # tsc -b && vite build -> dist/
npm run lint     # ESLint
npm run deploy   # npm run build && wrangler pages deploy dist
```

## Architecture (the load-bearing decision)

**Fully static. No backend, no Pages Functions, no server-side key handling, no stored files.** All three provider APIs allow direct browser calls (CORS preflight verified from the `t2s.joeleilat.com` origin on 2026-08-05), so the browser calls each provider directly with a user-supplied key kept in `localStorage`. This is the key difference from the sibling s2t project, which needed a Functions proxy only because AssemblyAI lacks CORS.

Pipeline: input text -> cleanup -> chunk under the model's char limit -> synthesize each chunk sequentially (progress, cancel, retries) -> assemble one in-memory Blob -> player + download. Audio is a session-only object URL, revoked on regenerate/unmount. Nothing is ever persisted.

Assembly has a fast path: **a single MP3 chunk passes through untouched** (`audio/mpeg`, no re-encode). Otherwise (Gemini returns raw PCM, or any multi-chunk result) parts are decoded via Web Audio, merged, and written to **WAV** (hand-rolled RIFF writer, no MP3-encoder dependency; see decisions.md).

## Provider cheat-sheet

| Provider | Endpoint | Auth header | Models (default first) | Output | Bad-key signal |
|---|---|---|---|---|---|
| OpenAI | `POST api.openai.com/v1/audio/speech` | `Authorization: Bearer` | `gpt-4o-mini-tts`, `tts-1`, `tts-1-hd` | MP3 | 401 |
| ElevenLabs | `POST api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128` | `xi-api-key` | `eleven_v3` (only Hebrew model), `eleven_multilingual_v2`, `eleven_flash_v2_5` | MP3 | 401 (object body) |
| Gemini | 2.5: `POST .../models/{model}:generateContent`; 3.1: `POST .../interactions` | `x-goog-api-key` | `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`, `gemini-3.1-flash-tts-preview` | base64 PCM 24kHz mono | **400** "API key not valid" |

Voices: OpenAI 13 static (default Marin), Gemini 30 static (default Kore), ElevenLabs fetched per-account via `GET /v1/voices`. All providers auto-detect language, so there is no language selector; instead a non-blocking amber hint appears if the text contains Hebrew and the selected model can't voice it.

Error shapes differ and are all handled in `src/lib/errors.ts`: OpenAI `{error:{message,code}}` (429 + `insufficient_quota` = out of credits); ElevenLabs 401 `{detail:{status,message}}` (`quota_exceeded` = credits) and 422 `{detail:[...]}` (array); Gemini `{error:{message,status}}` with bad key as a 400.

## Code map

- `src/App.tsx` -- state owner, layout, generation orchestration, error/debug wiring
- `src/components/` -- ProviderSelector (segmented), ApiKeyInput, ModelSelector, VoiceSelector, TextInput, FileUploader, AudioPlayer
- `src/lib/markdown-strip.ts` -- Markdown -> speech text (pure, Hebrew-safe; also used on pasted text)
- `src/lib/html-to-speech-text.ts` -- docx HTML -> speech text (DOMParser walk)
- `src/lib/extract-text.ts` -- file dispatch (txt/md/docx; mammoth dynamically imported)
- `src/lib/chunker.ts` -- boundary-aware chunking (pure)
- `src/lib/audio.ts` -- PCM decode, Web Audio merge, WAV writer (buildWav + pcm16ToFloat32 are pure + tested)
- `src/lib/providers/` -- one client per provider + `index.ts` catalog/registry
- `src/lib/synthesize.ts` -- orchestrator: chunk, sequential synth, too-long auto-split, 429 retry, assemble
- `src/lib/errors.ts` -- `ttsFetch` + per-provider error mapping
- `src/lib/log.ts` / `src/lib/debug.ts` -- namespaced logging + per-run debug records (the "Copy details" report)
- `src/lib/prefs.ts` -- last provider/model/voice/speed in localStorage

## Debugging

- Every run logs to the console under `[t2s:*]` namespaces (app, synth, openai, elevenlabs, gemini, audio, file). API keys are never logged.
- The last 5 runs are on `window.__t2sDebug`; `window.__t2sDebug.report()` prints the latest run's report.
- An error banner offers **Copy details**, which copies that same plain-text report (keys redacted) for pasting into a bug report.

## Gotchas

- **Chunk limits are chars, provider limits are sometimes tokens.** Hebrew is roughly 1-2 chars/token, so a char-based chunk can still exceed a token cap. The orchestrator auto-halves a chunk and retries once on an input-too-long 400.
- **Gemini has two API generations.** 2.5 models use `generateContent`; the 3.1 preview uses the newer Interactions API. `src/lib/providers/gemini.ts` routes per model. The 3.1 response shape is best-effort and should be confirmed with a live key (see backlog).
- **Keys live in localStorage** (`t2s-openai-api-key`, `t2s-elevenlabs-api-key`, `t2s-gemini-api-key`). Documented XSS tradeoff: no third-party scripts, no user-rendered HTML. See decisions.md.
- **The dev script is plain `vite`**, not `wrangler pages dev` like the sibling, because there are no Functions.
- **mammoth** is imported from `mammoth/mammoth.browser` and dynamically `import()`ed so it only loads on first docx use (its own ~490KB chunk).

## Doc index

- `PRD.md` -- product requirements, use cases, non-goals, success criteria
- `roadmap.md` -- milestones and status
- `backlog.md` -- prioritized enhancements
- `decisions.md` -- dated architecture decisions and their rationale
- `runbook.md` -- deploy, custom-domain, rollback, reading debug reports
- `README.md` -- public-facing overview and setup

## Conventions

- Git identity for this repo: `aaagever` / `aaagever@users.noreply.github.com` (public repo `aaagever/text-to-speech`).
- Writing style: no em dashes, no emojis.
- Exact-pinned dependencies (no `^`/`~`). Runtime deps: react, react-dom, mammoth (BSD-2-Clause). Everything else (Markdown stripping, WAV writing, the player) is hand-rolled.
