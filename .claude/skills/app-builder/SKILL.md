---
name: app-builder
description: >-
  Build and extend small, self-contained personal apps the proven way — single-file
  offline PWAs (vanilla HTML/CSS/JS + localStorage/IndexedDB, installable, versioned,
  Cloudflare-or-local hosted) and, when shared data or accounts are genuinely needed,
  Firebase multi-user apps. Use this skill WHENEVER the user wants to build, scaffold,
  prototype, or ship an app, web app, tracker, counter, logger, dashboard, directory,
  or "tool for X" — and ALSO whenever they want to CONTINUE, extend, fix, or add a
  feature to an app they built earlier (e.g. "keep working on my crochet app", "add a
  stats page", "the back button leaves the app"). Triggers even if they don't say the
  word "PWA" or "skill". Covers the full path: choosing the architecture, scaffolding
  from battle-tested templates, the recurring bug catalog, styling, versioning/auto-update,
  deployment, and surgical edits to an existing build.
---

# App Builder

A blueprint for building the family of small personal apps this user makes — each one
historically used as the base for the next (driving-lessons tracker → crochet stitch
counter → and onward), plus the cloud tier (a Firebase staff directory). The point of
this skill is **maximum working app, minimum agent effort**: pick the right tier, copy
the pre-wired templates when they fit, and only hand-write the parts that are genuinely
app-specific.

**Before writing any UI code, read `/mnt/skills/public/frontend-design/SKILL.md`.** Both
reference apps did this first; it governs the visual quality of the result.

---

## Step 0 — Pick the MODE

**Continue mode** — the user is extending/fixing an app that already exists (theirs or one
built earlier in the project). Signals: "keep working on…", "add … to my app", "the X is
broken", they upload an existing `index.html`, or a past chat in this project built it.
→ **Read `references/08-continue-mode.md` and follow it. Do not start over.** This is a
first-class path and the main reason this skill exists.

**New-build mode** — a fresh app. Continue below.

---

## Step 1 — Pick the TIER

Choose by *data ownership*, not by how fancy the app sounds.

**Tier 1 — local-first single-file PWA** (the default; ~90% of cases).
Pick when the data belongs to one person on their device(s): trackers, counters, loggers,
planners, directories-for-one, dashboards over local data. No accounts, no server, works
fully offline. This is the driving-tracker / crochet-counter stack.
→ Core references: `01-architecture`, `02-storage`, `03-pwa-deploy`, `04-styling`,
`05-behaviors`, `06-gotchas`, `07-workflow`. Templates in `templates/`.

**Tier 2 — Firebase multi-user.**
Pick **only** when the app's purpose requires *shared data across different people*,
*accounts/roles*, or *live sync between users*. Examples: a team directory everyone edits,
anything with admins approving members, a shared leaderboard.
→ Read `references/09-firebase-tier.md`. It carries the hard-won Firestore-rules bugs.

If you're unsure, default to Tier 1 — it's cheaper, simpler, and offline. You can describe
the upgrade path to the user rather than committing to Tier 2 prematurely.

---

## Step 2 — Kickoff questions (light touch)

Most scope arrives in the first prompt; **don't re-ask what the user already told you.**
Only fill genuine gaps, and use the `ask_user_input_v0` tool (tappable options) rather than
prose questions. **Every question includes a "Decide later / add later" option** — when
chosen, scaffold the dormant hook (see below) and move on; don't block the build.

Typical gaps worth a tap:
- **Tier**, only if genuinely ambiguous (single-user vs shared data).
- **Deploy target:** GitHub → Cloudflare Pages (installable, auto-updating, shareable URL)
  *vs* local-over-terminal (Termux / `python3 -m http.server` / `npx serve`, fully offline,
  no account). Build is identical; only the final step differs. See `03-pwa-deploy`.
- **Hebrew / RTL:** on, off, or add later. Off by default. The shell ships RTL dormant.
- **Stats / activity heatmap:** yes / no / later.
- **Themes & per-item color customization:** yes / no / later.
- **Update style:** auto-update (best for fast iteration/testing) or manual Check/Install.
  Default auto. Both ship a version badge (see below).

**"Add later" = scaffold the hook, leave it dormant.** RTL attributes present but unset;
a theme-token slot defined but unused; a stats data field written but no UI. This matches
how these apps actually grew, and Continue mode flips features on later with no retrofit.

Don't ask about secrets (GitHub PAT, Cloudflare/Firebase keys) via the questions tool — it's
multiple-choice, and this sandbox can't reach Cloudflare/Firebase anyway. Build here, then
hand the user the exact `git` / `wrangler` / `firebase deploy` commands to run where their
credentials live. GitHub is reachable from here if a push is genuinely wanted; treat any
token as sensitive and tell them to revoke it after.

---

## Step 3 — Should you reuse the templates? (fit-check)

The `templates/` shell is the literal proven architecture. Reuse it (copy + rename) **only
if all of these hold** — otherwise scaffold fresh or go Tier 2:
- Single user, data stays on-device.
- Data fits the local-storage model (light JSON; images only if hard-compressed, or move to
  IndexedDB per `02-storage`).
- The shape is screens + lists + detail/edit sheets (CRUD-ish). Most of these apps are.

If it fits, you save almost all the boilerplate: SPA nav, service worker, manifest,
versioning + badge, back-button handling, export/import, design tokens, dialogs, toasts are
already wired. You then only write the **data model + the app-specific screens**.

If it doesn't fit (big media, real-time collaboration, server logic) → don't force it.

---

## Step 4 — Build order (Tier 1)

Mirror the workflow that worked; see `references/07-workflow.md` for the detail.

1. `mkdir` a workspace in `/home/claude`; read `frontend-design/SKILL.md`.
2. Copy templates; rename app, set `APP_VERSION`, manifest fields, theme-color, icons.
3. Define the **data model** (`02-storage`) — schema, defaults, `load()`/`save()` with
   try/catch, migration-on-import.
4. Build screens as show/hide divs; module-level state + explicit `render*()` (`01`, `05`).
5. Wire app-specific behaviors: sheets, default-names, back/history, toasts (`05`).
6. Add opted-in features (stats heatmap, themes, RTL) or leave dormant hooks (`04`, `05`).
7. Run the **stubbed-DOM syntax check** before declaring done (`07`) — one syntax error
   silently kills every function in a single-script app.
8. Copy to `/mnt/user-data/outputs`, `present_files`, and give the matching deploy commands.
9. Establish the **version + cache bump ritual** for every future change (`03`).

For big builds, split into parts (Step 0 recon → Part 1 → Part 2 → verify) and pause for
the user's go-ahead between parts to conserve context — exactly how the crochet build ran.

---

## Versioning & the version badge (every generated app)

Every app ships an `APP_VERSION` constant, a hosted `version.json`, and a **low-contrast
version badge** — placed in Settings if a settings screen exists, otherwise tucked in a
screen corner — colored just slightly off the background so it's invisible in normal use but
readable when you look for it (the Talent-Pool pattern). Default behavior is **auto-update**:
on load the app compares to `version.json`, refreshes the SW cache, and the badge ticks up so
you can confirm the new build actually landed. A manual Check/Install mode is the alternative
for apps that shouldn't update silently. **Bump `APP_VERSION` and the SW `CACHE` name together
on every deploy** or users get stale files. Details: `03-pwa-deploy`.

---

## Reference map

- `references/01-architecture.md` — SPA nav, module state, file layout.
- `references/02-storage.md` — localStorage vs IndexedDB, schema, migration, export/import.
- `references/03-pwa-deploy.md` — manifest, sw.js, version.json, badge, auto vs manual,
  Cloudflare-Pages and local-terminal deploy, the cache ritual.
- `references/04-styling.md` — design tokens, theming, light/dark pre-paint, RTL, fonts, metas.
- `references/05-behaviors.md` — back/history, sheets, dialogs, default-names, toasts, heatmap.
- `references/06-gotchas.md` — the symptom → cause → fix catalog. Read it; each one already bit.
- `references/07-workflow.md` — multi-part builds, scratch→outputs, verify, syntax precheck.
- `references/08-continue-mode.md` — extend/fix an existing app safely.
- `references/09-firebase-tier.md` — Tier 2: auth, Firestore rules, realtime, its own gotchas.
- `templates/` — `index.html`, `manifest.json`, `sw.js`, `version.json`, `export-import.js`,
  `icon.svg`. Copy and rename when the fit-check passes.
