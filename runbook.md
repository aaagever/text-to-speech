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

**Current state (2026-08-05):** **live and active at https://t2s.joeleilat.com.** The custom domain was registered on the Pages project via the API, and the CNAME (`t2s -> t2s-41f.pages.dev`, proxied) was added manually in the Cloudflare dashboard because neither the wrangler OAuth token nor the sibling project's `CLOUDFLARE_API_TOKEN` has DNS-write scope (both are zone-read only). If the domain ever needs re-attaching, the steps below are the procedure.

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

## Known transient: unstyled page right after a deploy

For roughly a minute after `npm run deploy`, there is a small window where Cloudflare's edge serves the new `index.html` (which references new hashed asset filenames) before the new CSS/JS assets have propagated to every edge node. A request for the not-yet-propagated asset falls back to `index.html` (`text/html`), so a browser that loads in that window can render unstyled and then cache that bad response for the hashed asset URL.

It self-heals: within about a minute the asset propagates (`curl -sI https://t2s.joeleilat.com/assets/index-<hash>.css` returns `content-type: text/css`). A browser stuck on the cached bad response is fixed with a hard reload (Cmd+Shift+R). This does not affect a normal reload on a fresh visit, because each deploy's assets have new content-hashed filenames the browser has never cached. Nothing to fix in the app; just wait a minute (or hard-reload) after deploying before judging the live site.

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
