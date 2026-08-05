# Text to Speech

A small, private, browser-only text-to-speech tool. Paste text or drop a file, pick a provider and voice, and listen or download the audio. Handles English and Hebrew. Live at [t2s.joeleilat.com](https://t2s.joeleilat.com).

Bring your own API key. Your key is stored only in your browser and is sent only to the provider you choose. There is no backend, no account, no tracking, and nothing is stored anywhere.

## Features

- **Three providers:** OpenAI, ElevenLabs, and Google Gemini, each with a choice of models and voices.
- **Paste or drop a file:** `.txt`, `.md`, or `.docx`. Markdown and Word formatting are cleaned so the voice never reads "hashtag hashtag title" or spells out a URL.
- **English and Hebrew:** all three providers voice Hebrew (on ElevenLabs, use the Eleven v3 model). The editor is right-to-left aware.
- **Long text just works:** it is split at sentence boundaries, synthesized part by part with progress, and stitched into one file.
- **Player:** play/pause, seek, skip back/forward 15 and 30 seconds, and change speed from 0.75x to 2x.
- **Download:** one click. Short OpenAI/ElevenLabs clips download as MP3; Gemini and long stitched audio download as WAV.
- **Session only:** the audio lives in memory for the session and is gone when you regenerate or close the tab.

## Getting a key

- OpenAI: https://platform.openai.com/api-keys
- ElevenLabs: https://elevenlabs.io/app/settings/api-keys (Hebrew needs the Eleven v3 model)
- Google Gemini: https://aistudio.google.com/apikey (an AI Studio key; no Google Cloud setup needed)

Paste the key for the provider you want, click Save, and it stays in your browser.

## How it works

```
your browser  ->  the provider you pick (OpenAI / ElevenLabs / Gemini)
     |                         |
   your key                 audio back
 (localStorage)         (played + downloadable, in memory only)
```

The whole app is static files served from Cloudflare Pages. The browser calls the provider's API directly; there is no server in between and no key ever leaves your machine except in the request to that provider.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # static build to dist/
```

Stack: Vite, React, TypeScript, Tailwind CSS. The only runtime dependency beyond React is [mammoth](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause) for reading `.docx` files; Markdown cleaning, WAV encoding, and the audio player are all hand-written.

## Privacy

No cookies. No analytics. No accounts. No server-side storage. API keys are kept in `localStorage` and used only for direct requests to the provider you select.
