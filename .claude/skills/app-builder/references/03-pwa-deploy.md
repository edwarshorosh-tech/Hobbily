# 03 — PWA, versioning & deployment

Three things make a site an installable, offline PWA: **HTTPS (or localhost), a manifest, a
service worker.** Plus this user's two conventions: a **version system** and a **version badge**.

## manifest.json

See `templates/manifest.json`. Key fields: `name`, `short_name`, `start_url: "/"`,
`display: "standalone"`, `background_color`, `theme_color` (match your `<meta name="theme-color">`),
and `icons` (192 + 512; the 512 should include `"purpose": "any maskable"`). Link it:
`<link rel="manifest" href="manifest.json">`.

## Service worker (sw.js)

See `templates/sw.js`. Strategy that works for these apps:
- **Network-first for the HTML shell** (`/`, `/index.html`) so a fresh deploy reaches users,
  falling back to cache offline.
- **Cache-first for static assets** with a background refresh.
- **Never cache cross-origin/Firebase/realtime requests** — let them hit the network.
- Use `Promise.allSettled` when pre-caching so one missing file doesn't fail the whole install.
- **Do NOT auto-`skipWaiting()`** on its own unless you've chosen auto-update; gate updates so
  the app controls them (see below).

Register it:
```js
function registerServiceWorker(){
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
}
```
Note: service workers do **not** run from `file://`. You need `https://` or `http://localhost`.

## Versioning + the version badge

Every app carries:
```js
const APP_VERSION = '1.0.0';
```
and a hosted `version.json` (see `templates/version.json`): `{ "version": "1.0.0" }`.

**The badge.** Render `APP_VERSION` in Settings if a settings screen exists, else in a screen
corner. Color it *just off* the background — e.g. text color ≈ background with ~8–12% contrast —
so it's invisible in normal use but legible when sought. This is the Talent-Pool testing aid:
you can glance at it to confirm which build is live.

**Auto-update (default — best for fast iteration/testing):**
```js
async function maybeAutoUpdate(){
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    const { version } = await res.json();
    if (versionIsNewer(version, APP_VERSION)) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
      reg?.waiting?.postMessage('skipWaiting');   // sw calls skipWaiting on this message
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    }
  } catch {/* offline: fine, run cached */}
}
```
On reload the badge ticks to the new version — visible confirmation the update landed.

**Manual update (alternative):** the same machinery behind two Settings buttons —
"Check for Updates" (fetches `version.json`, reveals an Install button if newer) and
"Install Update" (posts `skipWaiting`, reloads). Nothing happens without the user. Pick this
for apps that shouldn't change under the user silently.

`versionIsNewer(a, b)` is a simple semver compare (split on `.`, compare numerically).

## THE DEPLOY RITUAL (do this every single deploy)

1. Bump `APP_VERSION` in the app.
2. Bump the `CACHE` constant name in `sw.js` (e.g. `app-v3` → `app-v4`) — this is what evicts
   the old cache. Forgetting it serves stale files forever.
3. Bump `version` in `version.json`.
4. Deploy. Confirm via the badge.

## Deploy target A — GitHub → Cloudflare Pages (recommended)

Installable, auto-updating, shareable URL. The build happens in this sandbox; the **push and
deploy run where the user's credentials live** (Claude Code or their machine) — this sandbox
can't reach Cloudflare. Hand them:

```bash
# one-time: create the repo on github.com, then
git init && git add . && git commit -m "app v1.0.0"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main

# Cloudflare Pages: connect the repo in the dashboard (Pages → Create → connect to Git),
# or one-off with Wrangler:
npx wrangler pages deploy . --project-name <chosen-subdomain>
```
The `<chosen-subdomain>` becomes `https://<subdomain>.pages.dev`. After connecting Git,
every push auto-deploys; the version badge confirms the new build.

## Deploy target B — local over terminal (fully offline, no account)

What the driving app actually ran on. Serve the folder, install the PWA once from localhost,
then it lives in the browser's app storage — offline forever, no server needed afterward.

```bash
# desktop
python3 -m http.server 8080        # or: npx serve .
# Android (Termux)
pkg install python && python3 -m http.server 8080
```
Open `http://localhost:8080`, install via the browser's Add-to-Home-Screen / Install prompt.
To push an update later: replace the files, serve again, open once so the SW refreshes (or use
the manual Check/Install button). Data in localStorage/IndexedDB is untouched by file updates.

## Going further (only if asked)

IndexedDB for scale, Web Notifications (`Notification.requestPermission()`), Web Share
(`navigator.share`), camera (`getUserMedia`). Keep these opt-in — the default app needs none.
