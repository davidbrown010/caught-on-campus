# Caught on Campus

Fullscreen 32:9 photo cue display for ISU Chi Alpha Prayer Night. SvelteKit 5 app that deploys to Vercel and uses Upstash Redis for state.

A moderator presses a **Select Photo** button on a row in the Notion `Weekly Recap Photos` database. A Notion automation POSTs a webhook, and that row's photo and caption appear on a fullscreen 32:9 display page. A **Clear** button fades to black. The display is designed to run fullscreen in Chrome on the presenting machine and be captured by ProPresenter via NDI screen capture.

- No Notion API token.
- No images downloaded, proxied, or stored anywhere. Only the current photo URL and caption live in Redis.
- Public URL: `https://caughtoncampus.isuchialpha.com`

## Tech

- SvelteKit 5 (Svelte 5 runes) with the Vercel adapter (Node.js 20 serverless).
- Upstash Redis via REST (one JSON key for state, one for the display heartbeat).
- Zero third-party runtime dependencies beyond SvelteKit itself.

## File layout

```
caught-on-campus/
  package.json
  svelte.config.js
  vite.config.js
  jsconfig.json
  src/
    app.html
    hooks.server.js         # sets Content-Security-Policy per route
    lib/
      server/
        redis.js            # Upstash REST helpers (timeout + 1 retry)
        secret.js           # timing-safe webhook secret compare
        webhook.js          # pull photoUrl + caption from Notion payload
      components/
        Display.svelte      # the 32:9 display UI
        Control.svelte      # read-only status panel for Notion embed
    routes/
      +page.svelte          # /          -> Display
      display/+page.svelte  # /display   -> Display
      control/+page.svelte  # /control   -> Control (embeddable in Notion)
      api/state/+server.js  # GET /api/state (polling endpoint)
      hook/[secret]/+server.js        # POST /hook/<SECRET>        (cue)
      hook/[secret]/clear/+server.js  # POST /hook/<SECRET>/clear  (clear)
      health/+server.js     # GET /health -> "ok"
```

## Install and run locally

Requires Node 20+ and pnpm.

```bash
pnpm install

SECRET=dev-secret \
UPSTASH_REDIS_REST_URL=https://your-upstash.upstash.io \
UPSTASH_REDIS_REST_TOKEN=your-token \
pnpm dev
```

Then open http://localhost:5173.

For local testing, create a free Upstash Redis database and paste its REST URL and token.

### Fire a test cue

Save this as `sample-cue.json`:

```json
{
  "source": {
    "type": "automation",
    "automation_id": "...",
    "action_id": "...",
    "event_id": "test-1",
    "attempt": 1
  },
  "data": {
    "object": "page",
    "id": "test-page",
    "in_trash": false,
    "properties": {
      "Upload Photo": {
        "type": "files",
        "files": [
          {
            "name": "test.jpg",
            "type": "file",
            "file": {
              "url": "https://picsum.photos/1920/1080",
              "expiry_time": "2099-01-01T00:00:00.000Z"
            }
          }
        ]
      },
      "Description": {
        "type": "title",
        "title": [{ "type": "text", "plain_text": "Test caption" }]
      }
    }
  }
}
```

```bash
curl -X POST http://localhost:5173/hook/dev-secret \
  -H 'content-type: application/json' \
  --data @sample-cue.json

curl -X POST http://localhost:5173/hook/dev-secret/clear
```

## URL options on the display

- `?aspect=32/9` (default), `?aspect=16/9`, `?aspect=none` (fill viewport).
- `?blur=40` (default blur radius in px). `?blur=0` disables the blur fill.
- `?status=auto` (default, hidden when healthy, press H or move the mouse to peek), `?status=always`, `?status=off`.

Keyboard: `F` or double-click toggles fullscreen. `H` peeks the status row.

## Deploy to Vercel

1. Push these files to a Git repo and import it on Vercel. The framework is auto-detected as SvelteKit.
2. In the project settings, add the **Upstash Redis** marketplace integration. It injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. (If you use Vercel KV instead, `KV_REST_API_URL` and `KV_REST_API_TOKEN` are also accepted.)
3. Add an env var `SECRET` = a long random string. Treat it like a password. Keep it only in Vercel and in the Notion automation URLs.
4. Add the custom domain `caughtoncampus.isuchialpha.com` to the project. Vercel will show the CNAME to point at from DNS. Wait for the TLS certificate to turn green.
5. Confirm `https://caughtoncampus.isuchialpha.com/health` returns `ok`.

All state is in Redis, so multi-region or concurrent serverless invocations are fine.

## Notion setup

In the database **Weekly Recap Photos** (`3f200f1c-8e59-80f4-898a-d54737c97213`):

1. Keep `Upload Photo` (Files & media) and `Description` (title, used as the caption). Make both required on the submission form.
2. On the `Select Photo` button, add a database automation: **Send webhook** to `https://caughtoncampus.isuchialpha.com/hook/<SECRET>` with page properties included.
3. On the `Clear` button, add a database automation: **Send webhook** to `https://caughtoncampus.isuchialpha.com/hook/<SECRET>/clear`.
4. Paste `https://caughtoncampus.isuchialpha.com/control` into an **Embed** block on your Notion control page. It shows a small live status panel with a mini preview and four status rows (Server, Display, Last cue, Photo).

## Night of (checklist)

1. Open `https://caughtoncampus.isuchialpha.com/` fullscreen in Chrome on the presenting machine (press `F`).
2. Capture that screen into ProPresenter via NDI screen capture.
3. In your Notion control page, confirm the embedded Control panel shows **Server: Reachable** and **Display: seen just now**.
4. Press **Select Photo** on a test row, then **Clear**. Both should take about 1 second to appear on the display.
5. During the service, press **Select Photo** on each chosen row. Press **Clear** when done.
6. If anything looks wrong, fall back to a plain ProPresenter slide prepared beforehand.

## Reliability rules the code follows

- Every outbound fetch has an AbortController timeout (3s Redis, 4s client polls).
- Webhook writes retry once; a persistent failure returns 500 and the Notion automation can be retried from the UI.
- A failed Redis read makes `/api/state` return 503. Clients ignore it and keep whatever is on screen.
- The display changes **only** on a new cue or an explicit clear. Network blips, server restarts, or Redis outages leave the current photo on screen.
- No in-memory state. Any serverless instance can serve any request.
- No history, no PIN, no login, no auth beyond the webhook secret.

## Notes and limits

- Notion photo URLs expire about 1 hour after the webhook arrives. Pressing **Select Photo** again re-cues with a fresh URL.
- iPhone HEIC uploads may not display in Chrome. Test an iPhone upload before the service. The display's status row goes red if an image fails to load after 3 retries (1s, 2s, 4s backoff).
- No deploys on service day. Rehearse end-to-end by the day before on the presenting machine (wired network, Chrome with only this tab open, screen saver and sleep off, Chrome auto-update paused for the week).

## Out of scope

- No history, no slideshow, no user accounts, no control buttons on the web (the Notion database is the control surface).
- No Notion API usage. Everything comes from the webhook payload.
