# Kidbuster

ESL teacher parent-feedback generator — MA Protocol (regular lessons) and OF Protocol (trial-lesson narratives), built on a shared Judgment Engine.

## Architecture

```
Browser (index.html)  →  /api/generate  (Vercel serverless function)  →  Anthropic API
     all UI, protocols,        the ONLY place the real API key
     validators, KidbusterCore  exists — never sent to the browser
```

- **`index.html`** — the entire app: UI, MA/OF protocol text, validators, ProtocolManager. Runs entirely in the browser. Contains zero secrets.
- **`api/generate.js`** — a single serverless function. Receives an already-built system prompt + user message, attaches the real Anthropic API key server-side, calls Anthropic, returns the result. Has no knowledge of protocols, MA, OF, or validation — that's deliberate. It is a thin, dumb proxy on purpose, so all the actual product logic stays in one place (the frontend), the same way it always has.

## What changed from the old single-file version, and why

1. **The API key moved server-side.** The old version called Anthropic directly from the browser with no key at all — it only worked inside Claude's own artifact environment, which transparently proxies those calls. Opened anywhere else (a real deployed site), that call would simply fail, and even if a key were added, browsers can't call Anthropic's API directly (CORS blocks it) — exposing a key in browser code would also be a real security problem the moment this is shared with anyone else.
2. **A shared access-key gate was added.** Hiding the key alone isn't enough — a public URL with no protection at all could be found and used by strangers to spend your API budget. `APP_ACCESS_KEY` is a simple shared password, not real per-user authentication. The frontend asks for it once and remembers it in the browser's local storage. This is intentionally lightweight — real accounts/auth are a separate, later concern once this becomes a genuine multi-tenant product, not something to build prematurely for a two-person test.
3. **Teacher identity is now a field in the app, not hardcoded text.** Both protocols previously hardcoded "Teacher Layne" in the sign-off. There's now a **Teacher** field in the UI (defaults to "Layne", so nothing changes for your own use unless you type something else). It's substituted into the prompt before sending, and the validator checks the sign-off against whatever name was actually used — tested to confirm it's fully backward-compatible with existing behavior when left as "Layne".
4. **Nothing else changed.** MA Protocol, OF Protocol, the ProtocolManager registry, both validators, the rating tracks, the UI, the whole generation flow — byte-for-byte the same logic, just reading from a different endpoint for the actual API call.

## Deploying it

### 1. Push this to GitHub (if not already done)
```bash
git add .
git commit -m "Add secure backend, ready for deployment"
git push
```

### 2. Connect to Vercel
1. Go to [vercel.com](https://vercel.com), sign in (GitHub login is easiest).
2. **Add New → Project**, select your Kidbuster repository.
3. Vercel will auto-detect this as a static project with a serverless function — no build settings need to be changed. Don't set a build command or output directory; leave them blank/default.

### 3. Set environment variables
Before deploying (or right after, then redeploy), go to **Project Settings → Environment Variables** and add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your real Anthropic API key |
| `APP_ACCESS_KEY` | A shared password you choose (tell Nina what it is) |

### 4. Deploy
Click **Deploy**. Vercel gives you a URL like `https://kidbuster-yourname.vercel.app` — this is the real, live, shareable app.

## How Nina uses it

1. Open the URL you send her (`https://kidbuster-yourname.vercel.app`) in any browser, on her own computer. No Claude, no API key, no development environment, no GitHub account needed.
2. The first time she generates a report, the app will ask for the **access key** — she enters the shared password you gave her, once. The browser remembers it after that.
3. She sets the **Teacher** field to her own name (once — it's remembered afterward).
4. Everything else is identical to how you use it: pick a protocol, pick a rating, paste notes, click Generate.

That's the entire experience for her — open a link, enter a password once, use the app exactly as you do.

## Your workflow after every future update

1. Make changes to `index.html` (or `api/generate.js`) locally, same as always.
2. `git add . && git commit -m "describe the change" && git push`
3. That's it. Vercel is watching your GitHub repo — every push to the main branch automatically triggers a new deployment, live within about a minute, at the same URL.
4. Nina doesn't do anything. She just refreshes the page next time she opens it and gets the newest version automatically. There's no separate "send Nina the update" step.

## Local testing before deploying (optional)

If you want to test changes before pushing, install the Vercel CLI:
```bash
npm install -g vercel
vercel dev
```
This runs both the static frontend and the serverless function locally, using a `.env` file (copy `.env.example` to `.env` and fill in real values — `.env` is already gitignored, so it will never be committed).

## Known limitations, on purpose

- **`APP_ACCESS_KEY` is a shared password, not real authentication.** Fine for a small private team; if this grows toward the SaaS phase described in the project's own roadmap, this gets replaced by real per-teacher accounts, which is a separate, larger effort deliberately not built prematurely here.
- **Model, max_tokens, and API version are fixed server-side** in `api/generate.js` rather than sent from the browser — this is a deliberate security choice, not an oversight, so a request from the browser can't override which model gets called or its parameters.
