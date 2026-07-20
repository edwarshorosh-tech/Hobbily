# 08 — Continue mode (extend / fix an existing app)

This is a first-class path, not an afterthought. These apps grew across sessions — the back
button, stats heatmap, and themes were all added to a working build. Treat "continue" with the
same care as "build new". The cardinal rule: **understand what exists before you touch it.**

## When this mode applies

The user says "keep working on…", "add X to my app", "fix the Y", uploads an existing file, or
the app was built earlier in this project. If a past chat in this project built it, you can
retrieve that context with `conversation_search` / `recent_chats`.

## The flow

1. **Locate the current file(s).**
   - Uploaded this session → `/mnt/user-data/uploads/`.
   - Built earlier in this project → search past chats; the latest version is whatever was last
     written to outputs. If only a chat copy exists, reconstruct from it but say so.
   - Always work from the **newest** known version. If unsure which is newest, ask or compare.

2. **Read it fully before editing.** Load the file. Map the data model, the screens, the naming
   conventions, the `APP_VERSION`, the storage key. Match the existing style — don't impose new
   patterns mid-app.

3. **Confirm the change with the user if there's any ambiguity**, then state your plan in terms
   of the actual code ("I'll add a `renderStats()` screen fed by the existing `stats.daily`
   bucket and a nav button next to Settings").

4. **Edit surgically with guards.** `str_replace` on unique anchors, or guarded python
   find/replace with `assert old in c` so a missed match fails loudly (`07`). Never blanket-rewrite
   a working file — you'll lose user-specific tweaks and risk regressions.

5. **Preserve data compatibility.** If the change touches the schema, add fields with defaults via
   the migration baseline (`02`) so existing saved data still loads. Never rename or repurpose an
   existing storage key — that orphans the user's data.

6. **Syntax-check** (`07`) — doubly important when splicing into a large existing script.

7. **Verify the edit landed** by reading the file back (`06` #16), then click through the affected
   behavior mentally/with the checks.

8. **Bump the version + cache** (`03`). The version badge ticking up is how the user confirms the
   new build replaced the old one. Mention what changed.

## Flipping on a dormant feature

If the app was scaffolded with a deferred hook (RTL attrs, a theme-token slot, a `stats.daily`
field accruing silently), "adding" the feature is mostly wiring UI to data that already exists —
fast and low-risk. Check for these hooks before building anything from scratch; the earlier build
may have left you a head start on purpose.

## What NOT to do

- Don't start a fresh app when asked to extend one.
- Don't rewrite the whole file to make one change.
- Don't change the storage key or URL.
- Don't claim it's done without reading the file back to confirm.
