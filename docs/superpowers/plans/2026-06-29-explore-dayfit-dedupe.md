# Explore Day-Fit + Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate places from piling up (same name+city) and let a place be planned to a matching-city day right from the add/edit sheet.

**Architecture:** Two pure-client additions, no backend. A `findDup` helper (name+city normalised) gates the three add paths (`reviewItems` auto-add, `MultiReview` add, `EditPlace` save). Day-fit adds matching-city day chips to `EditPlace` that set `plannedDay` via the existing `useSetStatus` on save. Single-file React-via-CDN PWA, no build step.

**Tech Stack:** React 18 via esm.sh + Babel-in-browser.

## Global Constraints

- **Scope:** root `index.html` only. No `app/`, `voyage/`, `sw.js`, edge function. **No backend/deploy** — this is client-only.
- **No build step; no new runtime dependencies.**
- **Reuse existing pieces:** `mergedPlaces(state)`, `useSetStatus`, `ITINERARY`, `setStatus`, the `.daypicker`/`.dpbtn` CSS, `db.addPlace`/`db.upsertPlace`.
- **Dedupe key:** case/punctuation/accent-insensitive `name` + lowercased `city`. A duplicate = an existing place (different id) with the same key.
- **Preserve behaviour:** dedupe only *prevents adding a second copy* + messages the user; it never deletes existing places. Day-fit is additive (a place with no matching-city day simply shows no chips).
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **No automated test harness.** Each task ends with mechanical/manual verification; pure-logic gets a browser-console check.

## File Structure
- **Modify:** `index.html` — add `placeKey`/`findDup` helpers (top-level, near `mergedPlaces` ~line 178); gate `reviewItems` (~1627) and the `MultiReview` `onAdd` render (~1736) and `EditPlace.save` (~1473); add day-fit chips + `plannedDay`-on-save to `EditPlace` (~1462).

---

### Task 1: Dedupe guard on the three add paths

**Files:**
- Modify: `index.html` — new helpers; `reviewItems`; `MultiReview` render `onAdd`; `EditPlace.save`.

**Interfaces:**
- Produces: `placeKey(name, city) -> string` and `findDup(places, name, city, exceptId?) -> place|null` (top-level). Consumed by all three add paths.

- [ ] **Step 1: Add the helpers** at top level, immediately after the `mergedPlaces` function (it ends ~line 188):

```js
// Normalised key for duplicate detection: name (letters/digits only, accent-folded)
// + lowercased city. Two places with the same key are considered the same place.
function placeKey(name, city) {
  return (name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "") + "|" + (city || "").toLowerCase().trim();
}
function findDup(places, name, city, exceptId) {
  const k = placeKey(name, city);
  return (places || []).find(p => p.id !== exceptId && placeKey(p.name, p.city) === k) || null;
}
```

- [ ] **Step 2: Gate `reviewItems`.** Replace the body from `const drafts = (items || [])...` down through the `if (drafts.length === 1 && !confident.length)` line (the first 4 statements of `reviewItems`) with a version that drops dups first:

```js
const drafts0 = (items || []).map(toDraft).filter(d => d.name);
// Drop anything already saved (same name+city) or repeated within this batch.
const existing = mergedPlaces(state);
const seen = new Set();
const drafts = drafts0.filter(d => {
  const k = placeKey(d.name, d.city);
  if (seen.has(k) || findDup(existing, d.name, d.city)) return false;
  seen.add(k); return true;
});
const skipped = drafts0.length - drafts.length;
if (skipped) flash(`Skipped ${skipped} already saved`);
if (!drafts.length) {
  if (skipped) { if (sourceInboxId) removeCapture(sourceInboxId); return; }
  flash("Nothing to add — fill it in");
  if (sourceInboxId) { setInboxId(sourceInboxId); setEditing(toDraft({ name: "" })); }
  return;
}
const confident = drafts.filter(d => d.confidence >= AUTOADD_MIN);
const rest = drafts.filter(d => d.confidence < AUTOADD_MIN);
if (drafts.length === 1 && !confident.length) { setInboxId(sourceInboxId || null); setEditing(drafts[0]); return; }
```

(The rest of `reviewItems` — the `if (confident.length) { … }` and `if (rest.length) setReview(rest);` — stays unchanged.)

- [ ] **Step 3: Gate the `MultiReview` `onAdd` render.** Replace the `onAdd={(chosen) => { … }}` prop on the `<MultiReview …/>` element (~line 1736) with:

```jsx
onAdd={(chosen) => {
  setReview(null);
  const existing = mergedPlaces(state);
  const seen = new Set();
  const add = (chosen || []).filter(d => {
    const k = placeKey(d.name, d.city);
    if (seen.has(k) || findDup(existing, d.name, d.city)) return false;
    seen.add(k); return true;
  });
  const skipped = (chosen || []).length - add.length;
  if (add.length) { setState(s => ({ ...s, exploreAdded: [ ...(s.exploreAdded || []), ...add ] })); add.forEach(p => db.addPlace(p).catch(() => {})); }
  flash(add.length ? `Added ${add.length} place${add.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}` : "Already saved");
}}
```

- [ ] **Step 4: Gate `EditPlace.save`.** In `EditPlace`, add `state` to the ctx destructure (`const { setState, flash, db, canEdit, state } = ctx;`). Then in `save`, immediately after `const saved = { ... };` and before the `setState(s => {…})`, add a duplicate guard:

```js
const dup = findDup(mergedPlaces(state), saved.name, saved.city, saved.id);
if (dup) { flash(`Already saved — ${dup.name}`); setBusy(false); return; }
```

- [ ] **Step 5: Console-test the key + finder (pure logic).** Serve, console:

```js
const placeKey = (name, city) => (name||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"") + "|" + (city||"").toLowerCase().trim();
console.assert(placeKey("L'As du Fallafel","Paris") === placeKey("las du fallafel ","paris"), "fold");
console.assert(placeKey("Bambino","Paris") !== placeKey("Bambino","London"), "city matters");
console.log("dedupe key ok");
```
Expected: "dedupe key ok", no assertion error.

- [ ] **Step 6: Manual check** (needs the live edge function for the AI paths). Serve, sign in. Add a place (e.g. via capture). Capture the *same* place again → it is not added a second time; a "Skipped … already saved" / "Already saved" message shows. In Edit place, renaming a place to exactly match another's name+city is blocked with "Already saved — …".

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Dedupe: block same name+city across capture, multi-review and edit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Day-fit chips in the add/edit sheet

**Files:**
- Modify: `index.html` — `EditPlace` (~line 1462).

**Interfaces:**
- Consumes: `useSetStatus(ctx)`, `ITINERARY`, the chosen `city` state. Sets `plannedDay` on save.

- [ ] **Step 1: Add planning state + setStatus in `EditPlace`.** After `const [note, setNote] = useState(place.note || "");` add:

```js
const setStatus = useSetStatus(ctx);
const [plan, setPlan] = useState(place.plannedDay != null ? place.plannedDay : null);
const fitDays = ITINERARY.map((d, i) => ({ i, d })).filter(x => x.d.city === city);
```

(`city` is the existing EditPlace state; `fitDays` recomputes on re-render when the user changes the city select.)

- [ ] **Step 2: Persist `plannedDay` on save.** In `save`, after `await db.upsertPlace(saved);` (inside the try, before the `inboxId` cleanup line), add:

```js
if (plan != null && plan !== place.plannedDay) setStatus(saved.id, { plannedDay: plan });
```

- [ ] **Step 3: Render the chips.** In the returned `<Sheet>`, after the `note` input line and before the `<button className="primary" …>` line, insert:

```jsx
{fitDays.length > 0 && (
  <div className="dayfit">
    <div className="section-label" style={{ margin: "6px 4px 8px" }}>Plan for a day in {city}</div>
    <div className="daypicker">
      {fitDays.map(({ i, d }) => <button key={i} className={"dpbtn" + (plan === i ? " on" : "")} onClick={() => setPlan(plan === i ? null : i)}>{d.dow} {fmtDate(d.date)}</button>)}
      {plan != null && <button className="dpbtn clear" onClick={() => setPlan(null)}>Clear</button>}
    </div>
  </div>
)}
```

(Reuses the existing `.daypicker`/`.dpbtn`/`.dpbtn.on`/`.dpbtn.clear` styles and `fmtDate`. No new CSS needed.)

- [ ] **Step 4: Verify (mechanical + manual).** Read back: `EditPlace` has `useSetStatus`, `plan` state, `fitDays`; `save` calls `setStatus(saved.id, { plannedDay: plan })` when set; the chips render only when `fitDays.length`. Serve, sign in, sort/add a Paris place → the edit sheet shows "Plan for a day in Paris" with the Paris itinerary days as chips; pick one → save → the place shows planned on that day in Explore/Today. Changing the city select updates the chips. A city with no trip days shows no chips. Flat `.dpbtn` styling, dark-mode OK.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Day-fit: suggest matching-city days in the add/edit sheet

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (against spec §3.3 day-fit + dedupe)

- Dedupe by normalised name+city, blocking second copies across all add paths → Task 1 (`reviewItems`, `MultiReview`, `EditPlace`) ✓
- User is told when something was skipped → Task 1 (flash messages) ✓
- Day-fit suggestions (matching-city days) in the add/edit flow, setting `plannedDay` → Task 2 ✓
- Client-only, no backend/deploy → both tasks ✓
- **Type consistency:** `placeKey`/`findDup` defined once (Task 1 Step 1), used in all three sites + the console test; `findDup` always called with `mergedPlaces(state)`; `EditPlace` gains `state` from ctx (Task 1 Step 4) and `setStatus`/`plan`/`fitDays` (Task 2).
- **Scope note:** the spec's "offer to enrich the existing place" on a dup depends on Step 4 (search enrichment), which was deferred — so dedupe here blocks + messages rather than offering enrichment. Enrich-on-dup can be added when Step 4 lands.
- **Reuse:** day-fit reuses the existing `.daypicker` controls already used on place cards; no new CSS.
