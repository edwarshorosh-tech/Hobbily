# 06 — Gotchas catalog

Every entry already cost real debugging time on one of these apps. Read before building and
again before declaring done. Format: **Symptom → Cause → Fix.**

## Tier-1 (local PWA) gotchas

1. **App updated but users still see the old version.**
   Cause: the service worker serves stale cached files.
   Fix: bump the `CACHE` name in `sw.js` on *every* deploy (the deploy ritual, `03`). Changing
   `APP_VERSION` alone does nothing if the cache name is unchanged.

2. **Buttons appear but do nothing; whole app feels dead.**
   Cause: a single syntax error anywhere in the one big `<script>` means *no* function gets
   defined. Inline `onclick`s then reference undefined functions.
   Fix: run the stubbed-DOM syntax check before deploy (`07`); keep DevTools console open while
   developing; never ship without a clean parse.

3. **Users lose their data after you changed the URL/domain.**
   Cause: `localStorage` is per-origin. New URL = new, empty store.
   Fix: keep the URL stable. If a move is unavoidable, ship an export-then-import path first.

4. **App crashes on launch with a blank screen.**
   Cause: `JSON.parse` threw on corrupted/partial localStorage and nothing caught it.
   Fix: wrap every storage read in try/catch with safe defaults (`02`).

5. **Service worker caches files but offline still breaks / wrong file served.**
   Cause: Cloudflare (and similar) strip `.html`, so `/page.html` is requested as `/page`;
   a SW that cached `/page.html` misses.
   Fix: name the entry `index.html` and cache `/`. Don't rely on `.html` URLs.

6. **Script runs but `getElementById` returns null.**
   Cause: the `<script>` executes before the HTML below it exists.
   Fix: put the script at the bottom of `<body>`, or wrap setup in `DOMContentLoaded`.

7. **"This app is already installed" with no way to update.**
   Cause: Chrome recognizes the installed PWA and won't re-prompt; the SW didn't pick up new files.
   Fix: use the `version.json` auto/manual update flow (`03`). As a one-off, clear cached files
   for the origin and reload. Data is untouched by clearing cache.

8. **Data silently disappeared after weeks of not opening the app.**
   Cause: Android can evict `localStorage` under storage pressure or long disuse.
   Fix: there's no prevention from inside the page — make JSON backup prominent and remind the
   user to export periodically. Consider IndexedDB + persistent-storage request for critical data.

9. **One missing file makes the whole SW install fail (nothing caches, no offline).**
   Cause: `cache.addAll([...])` rejects entirely if any URL 404s.
   Fix: pre-cache with `Promise.allSettled` over individual `cache.add` calls (`templates/sw.js`).

10. **Android back gesture exits the app instead of going back a screen.**
    Cause: no history management; the browser treats back as "leave".
    Fix: the `pushState`/`popstate` pattern in `05`.

11. **A stat/total shows 0 (or stale) even though data exists.**
    Cause: two screens share an element with the same `id`, so `getElementById` updates the wrong
    one; or `render()` reads state before it's loaded (a race).
    Fix: unique ids per screen and update each; re-render after load completes, not before (`01`).

12. **Hidden/demo items leak into filter chips even though they're hidden in the list.**
    Cause: chips built from the raw array, list built from a filtered array — two sources.
    Fix: derive chips and list from the *same* filtered array (`01`).

13. **A setting (e.g. a goal number) is right in Settings but wrong on the dashboard.**
    Cause: the value was hardcoded in one place instead of read from state.
    Fix: single source of truth; read the setting everywhere it's shown.

14. **CSV export has a column header with no data under it (or vice-versa).**
    Cause: header list and row-builder drifted out of sync.
    Fix: build header and rows from the same field list.

15. **A typed name gets wiped when the user starts typing over a default.**
    Cause: default pre-filled but not selected, so typing appends/conflicts.
    Fix: `input.select()` on focus so the first keystroke replaces it (`05`).

16. **"I built it" but the file on disk is unchanged / empty.**
    Cause: claimed work that wasn't actually written (or a failed edit that wasn't verified).
    Fix: after writing/editing, read the file back and confirm the change is present before
    telling the user it's done (`07`, `08`).

## Tier-2 (Firebase) gotchas

These live with full context in `09-firebase-tier.md`; summarized here so they're findable:

17. **Admins can read data but every normal user gets 403.**
    Cause: a Firestore rule used `get(...).exists` (which throws) inside an `||` chain; the error
    was masked only when `isAdmin()` happened to be true.
    Fix: use the top-level `exists(path)` function; understand CEL error-masking (`error||true==true`,
    `error||false==error`). Always test rules with a real **non-admin** token, not the Admin SDK
    (which bypasses rules).

18. **List/query denied even though single-doc reads work.**
    Cause: the read rule depends on per-document data, which queries can't satisfy.
    Fix: gate `list` on a requester-only condition (e.g. "is the requester active/admin").

19. **User enters the correct join code but stays pending.**
    Cause: client stripped dashes; the rule compares against the raw stored code.
    Fix: persist the canonical stored value, not the normalized input; mirror client & rule exactly.

20. **Empty roster right after self-join.**
    Cause: the directory query was permission-denied while pending and isn't re-subscribed after
    activation.
    Fix: tear down and re-subscribe the listener once status flips to active.

21. **Spark plan: no Cloud Storage / Functions.**
    Fix: store compressed images as base64 in the doc (watch the 1 MB/doc limit), keep logic
    client-side enforced by rules. Batched writes cap at 500 ops — chunk cascades.
