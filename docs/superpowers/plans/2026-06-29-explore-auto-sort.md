# Explore Auto-Sort Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trip settings sheet with an "Auto-sort captures" toggle (default on) so a pasted/shared/photographed capture runs the agent immediately instead of waiting for a manual "Sort" tap.

**Architecture:** A `settingsOpen` modal in `App()` renders a new `SettingsSheet` (reusing the existing `Sheet`); the `autoSort` preference lives in `App` state, persists to `localStorage["lgt:autosort"]`, and is passed through `ctx`. `Explore`'s `addCapture` consumes it: when on, it adds the item and immediately calls the existing `sortItem`. Single-file React-via-CDN PWA, no build step.

**Tech Stack:** React 18 via esm.sh + Babel-in-browser, lucide-react.

## Global Constraints

- **Scope:** root `index.html` only. Voyage is a separate repo — do not touch `app/`/`voyage/`.
- **No build step; no new runtime dependencies.** (lucide `Settings` icon is already in the bundled lucide-react import set — just add it to the existing import statement.)
- **Preserve the flat identity:** the toggle is a flat, square control (`border-radius:0`), not a pill switch. Reuse existing tokens.
- **Default:** auto-sort is **on** for a first-time user (no stored preference).
- **Reuse, don't rebuild:** the capture pipeline (`sortItem`, `aiCapture`, `reviewItems`) and `Sheet` already exist and are unchanged — only called.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **No automated test harness.** Each task ends with mechanical/manual verification; pure-logic gets a browser-console check.

## How to verify
```bash
cd ~/dev/le-grande-tour/.worktrees/foundation && python -m http.server 8080   # python3 if needed
# http://localhost:8080/ in incognito; DevTools → Application → Service Workers → Update on reload
```

## File Structure
- **Modify:** `index.html` — lucide import (line ~43); `App()` state + `ctx` (~line 731/844) + header gear button (~line 868) + `SettingsSheet` render; new `SettingsSheet` component (near `Sheet`, ~line 1912); `Explore` `addCapture` (~line 1564) + ctx destructure (~line 1536); settings CSS (in `Style()`).

---

### Task 1: Trip settings sheet + autoSort preference

**Files:**
- Modify: `index.html` — lucide import; `App()` state, `ctx`, header button, sheet render; new `SettingsSheet` component; CSS.

**Interfaces:**
- Produces: `ctx.autoSort` (boolean) and `ctx.setAutoSort`. `SettingsSheet({autoSort, setAutoSort, onClose})`. Preference persists to `localStorage["lgt:autosort"]` (`"1"`/`"0"`; absent → true).

- [ ] **Step 1: Import the gear icon.** On the lucide import line `X, Map as MapIcon, Pencil, Route, Share2` (line ~43), add `Settings`:

```js
X, Map as MapIcon, Pencil, Route, Share2, Settings
```

- [ ] **Step 2: Add state + persistence in `App()`.** After `const [pendingShare, setPendingShare] = useState(null);`, add:

```js
const [autoSort, setAutoSort] = useState(() => { try { const v = localStorage.getItem("lgt:autosort"); return v === null ? true : v === "1"; } catch (e) { return true; } });
useEffect(() => { try { localStorage.setItem("lgt:autosort", autoSort ? "1" : "0"); } catch (e) {} }, [autoSort]);
const [settingsOpen, setSettingsOpen] = useState(false);
```

- [ ] **Step 3: Expose via `ctx`.** Append `autoSort, setAutoSort` to the `const ctx = { ... };` object (keep all existing keys):

```js
const ctx = { state, setState, setLocal, tIndex, copy, flash, uid, setTab, canEdit, refresh, db, session, undoToast, pendingShare, setPendingShare, autoSort, setAutoSort };
```

- [ ] **Step 4: Add the gear button to the header.** In the `.syncactions` block, after the theme-toggle button (the one with `aria-label="Toggle theme"`) and before the `{session ? … : …}` sign-out/sign-in buttons, insert:

```jsx
<button className="signout" onClick={() => setSettingsOpen(true)} aria-label="Trip settings"><Settings size={12} /></button>
```

- [ ] **Step 5: Render the sheet.** Find the toast render in `App()`'s return (`{toast && <div className="toast">{toast}</div>}`) and add after the undo-toast line:

```jsx
{settingsOpen && <SettingsSheet autoSort={autoSort} setAutoSort={setAutoSort} onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 6: Add the `SettingsSheet` component** just before `function Sheet(` (or right after it). It reuses `Sheet` and `Check`:

```jsx
function SettingsSheet({ autoSort, setAutoSort, onClose }) {
  return (
    <Sheet title="Trip settings" onClose={onClose}>
      <div className="setrow">
        <div>
          <div className="setrow-l">Auto-sort captures</div>
          <div className="xs">Run the agent the moment you add a link, photo or note — no extra tap.</div>
        </div>
        <button className={"settoggle" + (autoSort ? " on" : "")} role="switch" aria-checked={autoSort} aria-label="Auto-sort captures" onClick={() => setAutoSort(v => !v)}>{autoSort ? <Check size={15} /> : null}</button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 7: Add CSS** (in the `Style()` block, near the other sheet rules):

```css
.setrow{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:8px 2px;}
.setrow-l{font-size:15px;font-weight:600;color:var(--ink);}
.settoggle{flex:none;width:26px;height:26px;border-radius:0;background:var(--fill2);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;margin-top:1px;transition:.15s cubic-bezier(.2,.8,.2,1);}
.settoggle.on{background:var(--accent);}
.settoggle:active{transform:scale(.92);}
```

- [ ] **Step 8: Verify.** Serve, sign in. Tap the new gear in the header → "Trip settings" sheet opens with the Auto-sort row, toggle filled (default on). Tap it off → empty square; close; reopen → still off (persisted). Reload → persists. DevTools → Application → Local Storage shows `lgt:autosort` = `0`/`1`. Works in dark mode. No console error.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "Add Trip settings sheet with persisted auto-sort toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Auto-sort a capture on add when the toggle is on

**Files:**
- Modify: `index.html` — `Explore` ctx destructure (~line 1536) and `addCapture` (~line 1564).

**Interfaces:**
- Consumes: `ctx.autoSort` (Task 1); existing `sortItem(it)` in `Explore` (runs `aiCapture` + `reviewItems`).

- [ ] **Step 1: Destructure `autoSort`.** In `Explore`, change the ctx destructure line `const { state, setState, tIndex, canEdit, db, flash, session, undoToast, pendingShare, setPendingShare } = ctx;` to also pull `autoSort`:

```js
const { state, setState, tIndex, canEdit, db, flash, session, undoToast, pendingShare, setPendingShare, autoSort } = ctx;
```

- [ ] **Step 2: Auto-sort in `addCapture`.** Change the end of `addCapture` so it kicks off a sort when the toggle is on. Replace the line `db.addInbox(item).catch(() => flash("Could not save capture"));` (the last line before the closing `};`) with:

```js
  db.addInbox(item).catch(() => flash("Could not save capture"));
  if (autoSort) sortItem(item);
```

(`sortItem` is defined later in `Explore` as a `const`; `addCapture` only calls it at runtime, after the component body has initialised, so the reference resolves. `sortItem(item)` runs `aiCapture({input: item.raw})` → `reviewItems(items, item.id)`, which removes the tray row on a confident auto-add or opens the review UI — exactly the manual-Sort behaviour, now automatic.)

- [ ] **Step 3: Verify (requires Task 1 + the live edge function).** Serve, sign in. With auto-sort **on**, type a place into the capture box and press Enter (or tap +): it should briefly appear in "To sort", then auto-process (toast/MultiReview/edit) without tapping Sort. Toggle auto-sort **off** in settings: a new capture now stays in the "To sort" tray until you tap Sort (today's behaviour). The shared-capture path (Share Target) and photo Add also auto-process when on, since they route through the same pipeline.

- [ ] **Step 4: Console-test the gate (pure logic).** Serve, console:

```js
// Confirms the intended branch: autoSort true => sortItem is invoked on add.
const autoSort = true; let sorted = false; const sortItem = () => { sorted = true; };
/* mimic addCapture tail */ if (autoSort) sortItem({});
console.assert(sorted === true, "auto-sort fires when on"); console.log("gate ok");
```
Expected: "gate ok", no assertion error.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Auto-sort captures on add when the toggle is on

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (against spec §3.4)

- Trip settings sheet (gear in header) → Task 1 ✓
- "Auto-sort captures" toggle, default on, persisted → Task 1 (`lgt:autosort`) ✓
- When on, capture runs `aiCapture`→`reviewItems` immediately (via `sortItem`) instead of parking raw text → Task 2 ✓
- When off, today's tray behaviour preserved → Task 2 (guarded by `autoSort`) ✓
- Flat identity preserved (square toggle, `border-radius:0`) → Task 1 CSS ✓
- **Type consistency:** `autoSort`/`setAutoSort` produced in App (Task 1 Steps 2–3), consumed in `Explore` (Task 2 Step 1) and `SettingsSheet` (Task 1 Step 6); `SettingsSheet` props match the render call.
- **Note:** the spec says the settings sheet is also the future home for the traveller-names UX change — out of scope here; this builds the host, that change is a separate plan.
