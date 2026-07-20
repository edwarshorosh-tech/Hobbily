# 09 — Firebase tier (Tier 2: multi-user)

Use only when the app's purpose needs **shared data across people, accounts/roles, or live
sync**. This is a bigger commitment than Tier 1 — auth, server-enforced security rules, realtime
listeners. Reference shape: a single-org staff "skill directory" (Talent Pool). Keep Tier 1's
good habits (no build step, version badge, in-app dialogs, history/back) and add the cloud parts
below.

## Stack & defining decisions

- **No build step**, same as Tier 1: plain `index.html` + `app.js` (classic script) + `app.css`
  + `sw.js`. Firebase via the **compat CDN SDK** (`firebase.auth()`, `db.collection(...)`).
- **Single tenant** unless truly required: one org, one `org/config` doc, members join via a
  code. Multi-tenant (`organizations/{orgId}/…`) is a much larger design — don't bolt it on.
- **Realtime everywhere:** all reads are `onSnapshot` listeners so every client updates live.
- **Free Spark plan:** Auth + Firestore only. **No Cloud Storage** (store hard-compressed images
  as base64 in the doc; watch the 1 MB/doc limit). **No Cloud Functions** (all logic client-side,
  enforced by rules).

## Data model (flat, denormalized)

- `employees/{uid}` (doc id == auth uid): profile fields + `status` (active/pending/suspended/
  removed) + role data. A record appears in the directory only when it has its required fields
  **and** `status==active` (enforced client-side as a filter).
- `org/config` (single doc): `admins[]`, `superAdmins[]`, `joinCode`, dropdown options, and
  admin-managed taxonomy. Built-in constants live in `app.js`; admins *add* via `extra*` arrays
  and *hide* built-ins via `hidden*` arrays (you can't delete a constant, so you hide it).

## Security rules are the whole backend — and the main source of bugs

All access control is in `firestore.rules`. The bugs that already happened, encoded as rules:

- **`get(...).exists` throws.** Use the top-level **`exists(path)`** function to test existence;
  use `get(path).data` only to read a doc you know exists.
- **CEL error-masking.** `error || true == true`, but `error || false == error` → deny. The
  classic signature "works for admins, 403 for everyone else" means an erroring sub-expression is
  being rescued only when `isAdmin()` is true. Hunt the erroring operand.
- **List vs get.** Queries can't depend on per-document data. Gate `list`/`read` on a
  *requester-only* condition (e.g. "requester is active or admin"); a condition that reads each
  doc's fields will deny the whole query.
- **Test with a real non-admin token.** The Admin SDK bypasses rules entirely, so admin-side
  testing proves nothing. Sign in as a non-admin active user and hit `:runQuery` over REST;
  expect 200, not 403.

Lock `status`/privileged fields on self-writes except for a valid, code-gated activation; admins
bypass. Any authed user may read `org/config` (needed to show the join UI) — treat `joinCode` as
low-secrecy, since activation also requires being authed.

## Auth & onboarding state machine

`register → pending → (enter join code) → active`. Admins can also flip pending→active.

- On register, create the own doc with `status:'pending'`.
- Join-code activation must **mirror the rule exactly**: normalize the typed code for comparison,
  but **persist the canonical stored value** (with dashes) into `joinCodeUsed`, or the rule's
  `joinCodeUsed == joinCode` check fails and the user stays pending despite a correct code.
- After activating, **re-subscribe the directory** — while pending it was permission-denied
  (empty roster); the own-doc listener's prev===next guard won't restart it for you.
- Join-code input UX: auto-format `XXXX-XXXX`; **no tight `maxlength`** (it truncates pastes with
  a leading space before the formatter runs); `autocapitalize="characters"`; brute-force lockout
  after N tries.

## Realtime listeners

`subscribeOrgConfig` (re-render on any config change; keep open admin panels live),
`subscribeDir` (the roster), `subscribeMyStatus` (so an admin flipping your status updates you
live, and re-subscribes the roster on activation). Tear down (`unsub()`) before re-subscribing.

## First-run bootstrap (chicken-and-egg)

With no `org/config`, nobody is admin. Provide a one-time bootstrap: the first authed user creates
`org/config` making themselves superAdmin, guarded so it only works while the admin lists are
empty (or do it once via the Admin SDK out-of-band). Then normal rules apply.

## Cascades & limits

Removing a category/skill must strip it from every employee doc via a **batched write** — and
batches cap at **500 ops**, so chunk (commit every ~450 and start a new batch).

## Deploy

`firebase deploy --only hosting` (client), `--only firestore:rules` (rules), or both. Force-
revalidate the shell files (`index.html`, `sw.js`, `app.js`, `app.css`) with no-cache headers in
`firebase.json` so the SW/version bump actually reaches users. **Verify rules with a non-admin
token before declaring done.**

## When to upgrade further

If you genuinely need multi-tenant, Cloud Storage, or server logic, that's a different blueprint:
upgrade the plan, nest under `organizations/{orgId}/…`, and move trust-sensitive logic into Cloud
Functions. Don't half-implement it inside the single-tenant shape.

---

The user has the full long-form version of this blueprint (the original Talent Pool `.md`) with
verbatim rules and code. If they provide it, prefer copying its exact `firestore.rules` and
adapting collection names over reconstructing from this summary.
