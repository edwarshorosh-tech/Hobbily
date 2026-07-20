# 02 — Storage, data model, export/import

## Choosing the store

**localStorage (default for light apps).** ~5 MB per origin, synchronous, dead simple. What
the driving and crochet apps use. Good for JSON: lists of entries, settings, small state.

**IndexedDB (use for media-heavy or large apps).** Megabytes-to-gigabytes, async, structured.
Reach for it when the app stores images, many hundreds of entries, or anything that could
approach the localStorage ceiling. The crochet app stored hard-compressed photos in
localStorage and lived near the edge — for a new photo-heavy app, prefer IndexedDB.
Use the `idb` library (or a tiny promise wrapper) to keep it readable.

**Always offer JSON backup regardless of store** — it's the real safety net (below).

Decision rule for the agent: if the app stores user images or unbounded lists → IndexedDB;
otherwise localStorage. When unsure, localStorage + a visible "export backup" reminder.

## The persistence pattern (localStorage)

One key holding the whole state object, JSON-serialized. **Always try/catch reads** — corrupt
data throws and otherwise crashes the whole app on boot.

```js
const STORAGE_KEY = 'myapp-v1';   // versioned key; keep it STABLE (per-origin data is tied to it)

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    projects   = Array.isArray(data.projects) ? data.projects : [];
    settings   = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  } catch (e) {
    console.error('load failed, starting fresh', e);
    projects = []; settings = { ...DEFAULT_SETTINGS };
  }
}

function save(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, settings }));
  } catch (e) {
    // QuotaExceeded → tell the user to export + prune (likely images; move to IndexedDB)
    toast('Storage full — export a backup and remove some images.');
  }
}
```

Never change `STORAGE_KEY` or the app's URL casually — localStorage is per-origin, so both
silently orphan the user's data.

## Schema design

Keep it flat and denormalized; these apps don't need joins. Example (crochet-style nesting):

```jsonc
{
  "projects": [{
    "id": "p_1700000000",
    "name": "Winter Blanket",
    "icon": "🧶",
    "color": "#c97d3a",          // per-item accent → drives a CSS var (04)
    "notes": "",
    "links": [{ "url": "", "label": "" }],
    "photos": [{ "dataUrl": "data:image/jpeg;base64,…", "caption": "", "date": "" }],
    "counters": [{
      "id": "c_1700000001",
      "name": "Double Crochet",   // counter name == "stitch type" for cross-project stats
      "count": 0,
      "color": "#e8a055"
    }]
  }],
  "settings": { "theme": "auto", "fontScale": 1, "use24h": true, "lang": "en" },
  "stats": { /* daily buckets — see heatmap in 05 */ }
}
```

Give every record a stable unique `id` (`prefix_ + Date.now()` is enough at this scale).
Defensive reads: treat unexpected shapes as empty (`Array.isArray(x) ? x : []`) so legacy data
never throws.

## Migration (so updates never lose data)

Run a migration both on **import** and on **version change**, mapping old records up to the
current schema. Pattern from the driving app:

```js
function migrateRecord(r){
  const m = { ...SCHEMA_BASELINE, ...r };     // fill any missing fields with defaults
  if (m.status === undefined) m.status = isPast(m.date) ? 'done' : 'planned';
  if (m.dismissed === undefined) m.dismissed = false;
  return m;
}
// on import:
const incoming = JSON.parse(file).map(migrateRecord);
```

`SCHEMA_BASELINE` is a constant object with every field at its default. New fields added in
future versions get backfilled automatically — no field-by-field upgrade code.

## Export / import

Two exports: a **full JSON backup** (everything, re-importable, nothing lost) and an optional
**human-readable** `.txt`/`.csv`. Keep CSV headers and data columns in lockstep (a mismatch
shipped a Status header with no Status data once).

Triggering a download reliably on Android needs the blob-anchor trick (the "Android download
trick"):

```js
function downloadFile(filename, text, mime='application/json'){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

A ready implementation of full export + import (with migration) lives in
`templates/export-import.js` — wire it to two buttons and adjust the state keys.

**Remind the user to export every few weeks** — Android can evict localStorage under storage
pressure or long disuse. The backup is the only true recovery path.
