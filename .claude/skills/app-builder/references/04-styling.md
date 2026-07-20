# 04 — Styling

Read `/mnt/skills/public/frontend-design/SKILL.md` first — it sets the quality bar. This file
covers the structural conventions specific to these apps.

## Design tokens as CSS variables

Define everything on `:root`. This is what makes theming, per-item color, and dark mode trivial
later. Token block from the crochet app, generalized:

```css
:root{
  /* surfaces */
  --bg:#fdf6ee; --bg-card:#fff; --bg-glass:rgba(255,255,255,.7);
  --surface:#f5e6d3; --surface-2:#ecdcc8; --border:#e0cdb8;
  /* text tiers */
  --text:#2d1f0f; --text-2:#7a5c3a; --text-3:#b0937a;
  /* accent (per-item color overrides --accent at runtime) */
  --accent:#c97d3a; --accent-2:#e8a055;
  --accent-soft:rgba(201,125,58,.12); --accent-glow:rgba(201,125,58,.25);
  /* semantic */
  --danger:#c0392b; --success:#2d7a4f;
  /* radii + shadows + fonts */
  --r-sm:8px; --r-md:14px; --r-lg:20px; --r-xl:28px;
  --shadow-sm:0 1px 4px rgba(0,0,0,.06); --shadow-md:0 4px 16px rgba(0,0,0,.09);
  --font-display:'Fraunces',Georgia,serif; --font-body:'DM Sans',sans-serif;
  /* dormant theme slots — wire on demand, no retrofit */
  --theme-pattern:none; --theme-texture:none;
}
```

Always have **three text tiers** (primary/secondary/tertiary), an **accent + accent-soft +
accent-glow** trio (soft for fills/backgrounds, glow for focus rings/shadows), and named radii
and shadows. Reference tokens everywhere; never hardcode a hex in a component.

## Per-item accent color

Store a `color` on each project/entry; apply it by setting `--accent` on that element's scope:
```js
el.style.setProperty('--accent', project.color);
```
Children styled with `var(--accent)` recolor automatically. This is how the crochet app gives
each project its own hue without per-project CSS.

## Light / dark, with pre-paint (no flash)

Override the tokens under a body class:
```css
body.dark{ --bg:#1a1410; --bg-card:#241c16; --text:#fdf6ee; --text-2:#c9b59a; /* … */ }
```
To avoid a flash of the wrong theme on load, set the class **before** first paint with a tiny
inline script in `<head>` that reads the saved choice:
```html
<script>
  try{
    var s = JSON.parse(localStorage.getItem('myapp-v1')||'{}').settings||{};
    if (s.theme==='dark' || (s.theme==='auto' && matchMedia('(prefers-color-scheme:dark)').matches))
      document.documentElement.classList.add('dark-pre'); // mirror onto <body> after load
    if (s.fontScale) document.documentElement.style.fontSize = (16*s.fontScale)+'px';
  }catch(e){}
</script>
```
Do the same for **font scaling** (an accessibility win the driving app shipped) — scale the
root `font-size` and size everything in `rem`/`em`.

## Theme engine (opt-in / "add later")

The `--theme-pattern` / `--theme-texture` slots let a theme add a background pattern or texture
without touching component CSS. If themes are deferred, leave the slots defined and unused; when
the user wants them, a theme is just a class that overrides tokens + fills the slots. No retrofit.

## RTL / Hebrew (dormant by default)

Ship RTL support but inert. Keep the document `lang`/`dir` driven by a setting:
```js
document.documentElement.lang = settings.lang;             // 'en' | 'he'
document.documentElement.dir  = settings.lang==='he' ? 'rtl' : 'ltr';
```
Author layouts with logical properties (`margin-inline-start`, `padding-inline`, `inset-inline`)
so they mirror automatically. Only a few `flex-direction` rows need a manual `[dir=rtl]` flip.
For an English-only app, `dir` stays `ltr` and none of this is visible — it costs nothing to
carry and saves a rewrite if Hebrew is added later.

## Mobile-first essentials

In `<head>`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#f5e6d3">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
```
Use a display/body font pairing via Google Fonts `preconnect` + one stylesheet link. Big tap
targets, bottom-sheet modals, and a full-screen primary action (the crochet counter is a giant
tap target) read well on phones.
