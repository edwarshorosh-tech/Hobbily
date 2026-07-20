# 05 — Behaviors & interaction patterns

The reusable interaction code. Each pattern here solved a real problem in a shipped app.

## Android back button / gesture (must-have for PWAs)

Without this, the system back swipe/button *leaves the app* instead of going back a screen.
Fix: push a dummy history entry whenever you navigate deeper or open a modal; handle `popstate`
yourself to go back in-app, then immediately push again so the next back press also works.

```js
function pushNav(){ history.pushState({ app:true, depth:(history.state?.depth||0)+1 }, ''); }

function initBackButton(){
  history.replaceState({ app:true, depth:0 }, '');   // baseline
  window.addEventListener('popstate', () => {
    // close the top-most open modal/sheet first
    const sheet = document.querySelector('.overlay.active');
    if (sheet){ sheet.classList.remove('active'); pushNav(); return; }
    // else navigate one screen up
    if (currentScreen === 'counter'){ showScreen('project'); pushNav(); return; }
    if (currentScreen === 'project'){ showScreen('home');    pushNav(); return; }
    // on home: re-push so the app doesn't exit (standard installed-PWA behavior)
    pushNav();
  });
}
```
Call `pushNav()` inside every "open deeper screen" and "open sheet" function. Tune the screen
ladder to the app. The single `popstate` handler that closes the top-of-z-order modal is the
same approach the Firebase app used — it generalizes.

## Bottom-sheet modals

Overlay + sheet; tapping the backdrop closes, tapping the sheet doesn't:

```html
<div class="overlay" id="edit-overlay" onclick="closeSheet('edit-overlay')">
  <div class="sheet" onclick="event.stopPropagation()"> … </div>
</div>
```
```js
function openSheet(id){ document.getElementById(id).classList.add('active'); pushNav(); }
function closeSheet(id){ document.getElementById(id).classList.remove('active'); }
```

## In-app dialogs, never native `confirm/alert/prompt`

Native dialogs show the origin ("site.pages.dev says…") and look untrustworthy; they also can't
be styled. Use Promise-based modals:

```js
function customConfirm(msg){
  return new Promise(res=>{
    const m=document.getElementById('confirm-modal');
    document.getElementById('confirm-msg').textContent=msg;
    m.classList.add('active');
    const ok=document.getElementById('confirm-ok'), no=document.getElementById('confirm-cancel');
    const done=v=>{ m.classList.remove('active'); ok.onclick=no.onclick=null; res(v); };
    ok.onclick=()=>done(true); no.onclick=()=>done(false);
  });
}
// const yes = await customConfirm('Delete this project?');
```
Mirror with `customPrompt(label, def)` returning a string or `null`.

## Default names (create-without-typing, but don't fight the typist)

Let the user hit "New" and get a usable record immediately, while still allowing a typed name.
Pre-fill a default and **select-all on focus** so the first keystroke cleanly replaces it:

```js
function defaultName(kind, list){
  let n=1; const base=kind+' '; const names=new Set(list.map(x=>x.name));
  while(names.has(base+n)) n++; return base+n;       // "Project 1", "Project 2", …
}
function openNew(){
  const inp=document.getElementById('name-input');
  inp.value = defaultName('Project', projects);
  openSheet('edit-overlay');
  setTimeout(()=>{ inp.focus(); inp.select(); }, 300);   // select() = typing overwrites
}
```
On save, fall back to the default if the field was cleared (`if(!name) name=defaultName(...)`)
so an empty name is impossible without a hard "name required" wall.

## Toasts

A single reused element beats per-action alerts:
```js
let toastT;
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2200);
}
```

## Activity heatmap (GitHub-style) — opt-in

For "how much did I do over time" stats. Storage-efficient logging rule from the crochet app:
**log a daily snapshot only when there was real activity, and don't log idle time.**

- Keep `lastActivityTs`, updated on every meaningful action (e.g. a stitch increment).
- Every minute, if activity occurred in the last 5 minutes, add that minute's delta into
  **today's bucket**; if idle >5 min, log nothing until activity resumes.
- Storage shape: `stats.daily = { "2026-05-30": 412, … }` — one integer per day (total actions).
  Optionally also bucket per "type" (e.g. counter name) for cross-project aggregation.

```js
let lastActivityTs = 0, pendingDelta = 0;
function noteActivity(delta){ lastActivityTs = Date.now(); pendingDelta += delta; }
setInterval(()=>{
  if (Date.now() - lastActivityTs > 5*60*1000) return;   // idle: skip
  if (pendingDelta === 0) return;
  const day = new Date().toISOString().slice(0,10);
  stats.daily[day] = (stats.daily[day]||0) + pendingDelta;
  pendingDelta = 0; save();
}, 60*1000);
```
Render as a grid of day-cells colored by intensity buckets; a tooltip shows the date + count.
Compute the color thresholds from the max daily value so the scale adapts.

If stats are deferred ("add later"), still write the `stats.daily` field on activity — the data
accrues silently and the UI can be added in Continue mode with full history already present.
