# Text to Speech: Product Requirements

Status: V1 built 2026-08-05. Owner: Joel Eilat.

## Problem

Joel writes a lot (LinkedIn posts, docs, client material) in English and Hebrew and wants to **listen** to drafts and documents rather than only read them, and to compare how different TTS providers and voices render the same text. Existing consumer TTS tools lock you into one engine, mishandle Hebrew, and read Markdown formatting aloud ("hashtag hashtag title"). He already has API keys for the major providers and wants a single, private, no-friction tool that uses them directly.

## User

A single primary user (Joel). No accounts, no multi-tenant concerns. Technical enough to paste an API key. Uses English and Hebrew.

## Use cases

1. Paste a draft (or Markdown) and hear it read back to catch awkward phrasing.
2. Drop a `.docx` or `.md` document and listen to it like a podcast while doing something else.
3. Compare the same text across providers/models/voices to pick the best sound for a piece.
4. Generate an MP3 to keep (for a specific voice-over), then discard it; no file clutter.
5. Hear Hebrew text in a natural voice (works on all three providers; ElevenLabs requires the v3 model).

## Functional requirements

- **Input:** paste into a textarea (RTL-aware) or drag-drop / browse a `.txt`, `.md`, or `.docx` file.
- **Cleanup:** Markdown and docx are converted to speech-friendly text (headings become sentences with pauses, lists and tables linearize, code blocks drop, links become their anchor text, bare URLs become the hostname). Never voices formatting characters. Safe for Hebrew and plain text.
- **Providers/models/voices:** choose provider, then a model within it, then a voice. Models are labeled with capability hints (Hebrew support, speed/quality, preview status). ElevenLabs voices come from the user's own account.
- **Long text:** automatically chunked at sentence/paragraph boundaries under each model's limit and synthesized sequentially with a visible "part N of M" progress and a Cancel button.
- **Player:** play/pause, seek, skip back/forward 15 and 30 seconds, playback speed (0.75x to 2x), and a caption showing provider/model/voice. Autoplays when generation finishes.
- **Download:** one-click download. Single-part OpenAI/ElevenLabs output is a native MP3; Gemini output and multi-part stitched audio download as WAV. Filename `t2s-YYYYMMDD-HHMMSS`.
- **Session-only audio:** the audio exists only as an in-memory blob for the session and is discarded on regenerate or when the tab closes. Nothing is written to disk or a server.
- **Keys:** entered per provider, stored only in browser localStorage, shown/hidden, saved explicitly. No cookies.
- **Errors:** clear, actionable, per-provider messages, plus a "Copy details" diagnostic report for bug reports.

## Non-goals (V1)

- No accounts, login, or server-side storage of any kind.
- No server-held API keys; the user brings their own.
- No Hebrew (RTL) UI chrome; the interface is in English (it voices Hebrew content fine).
- No streaming playback while synthesizing (audio plays after the full result is assembled).
- No voice cloning, SSML authoring, or per-word timing.
- No analytics, tracking, or cookies.

## Success criteria

- Markdown and docx input produce clean speech with zero formatting artifacts.
- Hebrew text is voiced correctly on all three providers (ElevenLabs on v3).
- A short English text on OpenAI/ElevenLabs downloads as a valid MP3; Gemini and long stitched text download as valid WAV that plays in QuickTime.
- Wrong keys and out-of-credit states produce distinct, correct messages per provider.
- Zero data persisted anywhere; keys never leave the browser except to the chosen provider.
- Deployed and reachable at t2s.joeleilat.com over HTTPS.
