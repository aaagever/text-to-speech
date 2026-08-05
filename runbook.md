# Runbook

Operational playbooks. This project is a static site; there is no server to operate.

## Prerequisites

```bash
export PATH="/Users/yoeleilat/.nvm/versions/node/v20.20.0/bin:$PATH"
```

Wrangler is authenticated via OAuth as `yoeleilat@gmail.com`; `gh` is authenticated as `aaagever`.

## Local development

```bash
cd projects/text-to-speech
npm install
npm run dev        # http://localhost:5173  (plain Vite; no backend)
npm test           # unit tests
npm run build      # tsc -b && vite build -> dist/
```

## Deploy

```bash
cd projects/text-to-speech
npm run deploy     # runs the build, then: wrangler pages deploy dist
```

This uploads `dist/` to the Cloudflare Pages project `t2s`. There is no CI; deploys are manual from the laptop. First-time project creation:

```bash
npx wrangler pages project create t2s --production-branch main
```

If the `t2s` pages.dev subdomain is taken, use `t2s-joeleilat` and update `name` in `wrangler.toml` to match.

## Custom domain (t2s.joeleilat.com)

The Pages project serves at `t2s-41f.pages.dev` (Cloudflare appended `-41f`; the project name is still `t2s`).

**Current state (2026-08-05):** the custom domain `t2s.joeleilat.com` is already **registered on the Pages project** via the API (status `pending`), but it will not resolve until a DNS record exists. Neither the wrangler OAuth token nor the sibling project's `CLOUDFLARE_API_TOKEN` has DNS-write scope (both are zone-read only), so the CNAME could not be created from the CLI. This is the one manual step.

**To finish (about 60 seconds in the Cloudflare dashboard), either path works:**

- Easiest: **Workers and Pages -> t2s -> Custom domains**. The pending `t2s.joeleilat.com` is already listed; click it and accept the DNS record Cloudflare offers to create. Because `joeleilat.com` is a zone on the same account, it creates the proxied CNAME and provisions TLS automatically.
- Or add the DNS record directly: **DNS -> Records -> Add record**: type `CNAME`, name `t2s`, target `t2s-41f.pages.dev`, proxy status **Proxied** (orange cloud). The pending Pages domain validates within a minute or two once this exists.

Verify:

```bash
dig +short t2s.joeleilat.com
curl -sI https://t2s.joeleilat.com | head -3
```

(This is the same dashboard step the sibling s2t project used but never documented.)

Verify:

```bash
dig +short t2s.joeleilat.com
curl -sI https://t2s.joeleilat.com | head -3
```

## Rollback

```bash
npx wrangler pages deployment list --project-name t2s
```

Then promote a previous deployment from the Cloudflare dashboard (Pages -> t2s -> Deployments -> the good one -> Rollback), or simply re-deploy from a known-good local checkout with `npm run deploy`.

## Reading a bug report / debug details

When something fails, the error banner offers **Copy details**. That produces a plain-text report (no API keys) with: app version, user agent, run id, provider/model/voice, input size, per-chunk timings and byte counts, assembly path, and the provider's HTTP status + error code + a truncated body snippet. To pull it from the console instead: `window.__t2sDebug.report()` (latest run) or inspect `window.__t2sDebug.records`.

Console logs are namespaced `[t2s:app|synth|openai|elevenlabs|gemini|audio|file]`. Keys are never logged.

## Interpreting provider errors

| Symptom | Meaning |
|---|---|
| OpenAI 401 | Bad key |
| OpenAI 429 + `insufficient_quota` | Out of credits (not rate limit) |
| ElevenLabs 401 with `detail.status = quota_exceeded` | Out of credits |
| ElevenLabs 401 otherwise | Bad key |
| ElevenLabs 422 (array detail) | Validation error (often bad voice id or too-long text) |
| Gemini 400 "API key not valid" | Bad key (Gemini uses 400, not 401) |
| Gemini 429 | Rate limit or the small free-tier daily TTS quota |
| Any provider 5xx | Provider-side outage; retry later |

The tool maps all of these to plain-English messages in `src/lib/errors.ts` and distinguishes out-of-credits from bad-key from rate-limit.
