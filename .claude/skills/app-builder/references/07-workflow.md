# 07 — Build workflow

How to actually run a build so it's reliable and doesn't blow the context budget.

## Where files go

- Scratch and iterate in `/home/claude/<app>/`.
- Copy finished files to `/mnt/user-data/outputs/`.
- `present_files` the deliverables. For a single-file app, present `index.html` (+ `manifest.json`,
  `sw.js`, `version.json`, icons if separate).

## Read the design skill first

Before any UI: `view /mnt/skills/public/frontend-design/SKILL.md`. Both reference apps opened
with this. It's what separates a templated-looking result from a considered one.

## Multi-part builds (for anything substantial)

A full app can exceed a single response's useful size. Split it and **pause for the user's
go-ahead between parts** — this is how the crochet build ran:

- **Step 0 — recon:** gather context (read prior app files / past chats), restate the plan, list
  the data model and screens. Confirm.
- **Part 1 — core:** data model, storage, navigation, primary screens. Tell the user when done.
- **Part 2 — features:** stats, themes, settings, polish. Tell the user when done.
- **Verify:** syntax check, click-through of the behaviors, confirm against the plan.

State up front that you'll work in parts to conserve tokens, and that you'll stop after each
for review. Don't try to do everything in one giant turn.

## Editing: surgical and guarded

Prefer `str_replace` with unique anchors over rewriting whole files. When doing programmatic
multi-edits, guard each one so a missed match fails loudly instead of silently corrupting:

```python
# python find/replace with assertions — the pattern both apps used
with open(path) as f: c = f.read()
for old, new in replacements:
    assert old in c, f"NOT FOUND: {old[:60]}"   # fail loud, don't half-apply
    c = c.replace(old, new, 1)
with open(path,'w') as f: f.write(c)
```
If an anchor isn't found, stop and re-read the file — don't guess.

## Syntax precheck (catch the silent-killer bug)

Because one syntax error nukes every function (`06` #2), parse the JS before deploy. Extract the
script and run it through Node with a stubbed DOM so a parse error surfaces:

```bash
python3 - <<'PY'
import re,subprocess,sys
html=open('/home/claude/app/index.html').read()
m=re.search(r'<script>(.*)</script>', html, re.S)
js=m.group(1)
stub="var window={},localStorage={getItem:()=>null,setItem:()=>{}},history={replaceState:()=>{},pushState:()=>{},state:{}};"
stub+="var document={documentElement:{classList:{add:()=>{}},style:{},lang:'',dir:''},addEventListener:()=>{},getElementById:()=>({classList:{add:()=>{},remove:()=>{}},style:{},focus:()=>{},select:()=>{},addEventListener:()=>{}}),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>({classList:{add:()=>{}},style:{},appendChild:()=>{}}),body:{appendChild:()=>{},removeChild:()=>{}}};"
stub+="var navigator={serviceWorker:{register:()=>{},getRegistration:async()=>null,addEventListener:()=>{}}},matchMedia=()=>({matches:false}),fetch=async()=>({json:async()=>({}),});"
open('/tmp/_check.js','w').write(stub+js)
r=subprocess.run(['node','--check','/tmp/_check.js'],capture_output=True,text=True)
print('OK' if r.returncode==0 else r.stderr); sys.exit(r.returncode)
PY
```
A clean `OK` means it at least parses. (It doesn't prove logic — still click through behaviors.)

## Verify before claiming done

After the final edit, **read the file back** and confirm the change is actually present. The
"I built it but the file was unchanged" failure (`06` #16) comes from skipping this. Then run
the deploy ritual (`03`): bump `APP_VERSION`, the SW `CACHE` name, and `version.json` together.

## Hand-off

Give the user the deploy commands matching their chosen target (`03`: Cloudflare-Pages or
local-terminal). Don't collect their secrets here — build, then hand them the commands to run
where their credentials live.
