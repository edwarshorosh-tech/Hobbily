# 01 — Architecture (Tier 1)

The proven shape of every local-first app here. Distilled from the driving-lessons tracker
and the crochet counter ("Loopy" / "Crochet Buddy").

## File layout

Two viable arrangements, both fine:

- **Single embedded file** (crochet): one `index.html` with `<style>` and `<script>` inline.
  Easiest to ship and reason about; the templates use this.
- **Named file + siblings** (driving): `app-name.html` + `manifest.json` + `sw.js` +
  `version.json`. Use when you want the main file named for the app.

Always also ship: `manifest.json`, `sw.js`, `version.json`, and icons. Name the entry file
`index.html` and cache `/` — hosts (Cloudflare) strip `.html`, so caching `/page.html`
misses requests for `/page`. See `06-gotchas`.

## Classic script, not a module

Use a plain `<script>` (NOT `type="module"`). Inline `onclick="fn()"` handlers resolve
against `window`; top-level `function foo(){}` is global automatically. ES modules break
every inline handler. Either keep it classic, or attach all handlers in JS — don't mix.

Put the `<script>` at the **bottom** of `<body>` (after the markup) so elements exist when
it runs, or wrap setup in `DOMContentLoaded`. A script above the HTML sees `null` elements.

## Navigation: show/hide divs, no router

Each "screen" is a `<div>`; navigation toggles which is visible. No history router, no
framework. One function owns it:

```js
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentScreen = id;
  // re-render the screen we just entered
  if (id === 'home')  renderHome();
  if (id === 'stats') renderStats();
}
```

Nested navigation (home → project → counter) keeps a small explicit stack or just tracks
`currentScreen` + the selected ids. The Android back button is layered on top of this via
`history.pushState`/`popstate` — see `05-behaviors`.

## State: module-level vars + explicit re-render

No reactive framework. Hold state in top-level `let`s and call `render*()` after every
mutation. This is predictable and debuggable.

```js
let projects = [];      // the data
let currentScreen = 'home';
let currentProjectId = null, editingId = null;

function adjust(id, delta){
  const c = getCounter(id);
  c.count = Math.max(0, c.count + delta);
  save();                 // persist
  renderCounter();        // re-render the affected view explicitly
}
```

Rules that prevent the bugs that actually happened:
- **Re-render explicitly** after every change; don't assume a listener will catch it.
- **One source of truth for a filtered view.** If you build filter chips AND a list from the
  same data, derive both from the *same* filtered array, or hidden items leak into chips
  (this bit the directory app). 
- **Unique element ids per screen.** Two screens with an element of the same id → `getElementById`
  updates the wrong one and a value shows stale/0 (this caused the stats-shows-0 bug). If a
  value appears on two screens, give them distinct ids and update both.

## Rendering

`innerHTML` with template strings is fine for these app sizes and keeps code compact. Build a
row/card helper that returns an HTML string, `.map().join('')` the list, assign once. Escape
user text if it could contain `<`/`&` (a tiny `esc()` helper) to avoid breaking markup.

## Putting it together

`onAuth`-free boot sequence for Tier 1:

```js
const APP_VERSION = '1.0.0';
document.addEventListener('DOMContentLoaded', () => {
  load();                 // read localStorage/IndexedDB into state (try/catch)
  registerServiceWorker();
  initBackButton();       // history/popstate (05)
  showScreen('home');     // first paint
  maybeAutoUpdate();      // version.json check (03)
});
```
