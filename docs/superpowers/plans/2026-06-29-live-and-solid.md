# Live & Solid (+ Traveller Names) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the le-grande-tour PWA "live & solid" for two travellers — real-time two-user sync, optimistic writes that revert or queue on failure, an offline write queue, and removal of per-render/per-focus waste — and fold in editable traveller names (replacing hardcoded "You"/"Harriet") stored server-side so both travellers and the public viewer see them and renames sync live.

**Architecture:** Single-file React-via-CDN app (`index.html`, no build step, Babel-in-browser). All new units are discrete functions/effects inside `index.html`. Supabase project `coszvvrrnosudrskbypl` (Realtime already enabled on all six shared tables; this plan adds a seventh, `trip_settings`). Realtime fires a **debounced `refresh()`** (reuse the proven load path). A thin **`mutate()`** wrapper centralises optimistic-apply → revert-on-error / enqueue-on-offline. An **`lgt:queue`** localStorage queue replays idempotently on reconnect. Last-write-wins; no field-level merge.

**Tech Stack:** React 18 (CDN/esm.sh), `@supabase/supabase-js` v2 (CDN), lucide-react icons, Supabase Postgres + Realtime + Storage. No new runtime dependencies. No bundler.

## Global Constraints

- **Single file:** all client code lives in `index.html`. No new files except the spec/plan docs and a throwaway, git-ignored `scratch/` selftest. No build step, no new npm deps.
- **Supabase project:** `coszvvrrnosudrskbypl` (URL `https://coszvvrrnosudrskbypl.supabase.co`). Apply DDL via the Supabase MCP `apply_migration`; never hand-edit production rows except the documented seed.
- **RLS pattern (mirror exactly for any new shared table):** `<table>_read` = `SELECT` to `{anon, authenticated}` `using (true)`; `<table>_write` = `ALL` to `{authenticated}` `using (true) with check (true)`.
- **Realtime delivers only readable rows** — public-read tables reach anon viewers; `private_notes` reaches authenticated only. Keep it that way.
- **Conflict model:** last-write-wins. No CRDT, no field-merge. Realtime refetch reconciles.
- **Photos are online-only.** Never put image blobs in the offline queue. An offline journal entry keeps text + ratings; photos attach when back online.
- **Branch/deploy:** work in worktree `.worktrees/foundation` on a feature branch `uplift/live-and-solid`. Commit frequently. **Do NOT push to `main`** — publishing to `main` requires explicit per-action user authorization (it deploys to GitHub Pages).
- **No test harness exists.** See "Testing approach" below — pure-logic units get a node selftest; realtime/UI get scripted manual verification. This adapts the TDD discipline to a single-file CDN app with no runner (codebase constraint).

## Testing approach (read once before starting)

The app is a single `<script type="text/babel">` block — there is no import system or test runner. Two verification modes are used throughout:

1. **Pure-logic units** (`debounce`, the queue module, `mutate`) — verified with a throwaway node script. Create `scratch/selftest.mjs` (the `scratch/` dir is git-ignored — see Task 0), **paste the function-under-test verbatim** into it plus minimal `localStorage`/`navigator` shims, write asserts, run `node scratch/selftest.mjs`. This gives a real red→green cycle. The copy is acknowledged duplication forced by the no-module constraint; keep it in sync while iterating, do not commit it.
2. **Realtime + UI + integration** — scripted manual checks with two browser profiles / DevTools offline, exactly as the spec §6 dictates. Each such task lists the precise steps and expected observation.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `index.html` | The entire app. All new utils/effects/components land here as discrete functions. | Modify (every code task) |
| `scratch/selftest.mjs` | Throwaway node selftest for pure-logic units. Never committed. | Create (Task 0), delete at end |
| `.gitignore` | Ignore `scratch/`. | Modify (Task 0) |
| Supabase `trip_settings` | New shared single-row table for traveller names. | Create via migration (Task 10) |

New logical units inside `index.html` (all small, clear interfaces):
- `debounce(fn, ms)` — module-level util (Task 1)
- `REALTIME_TABLES` — module-level constant; the realtime channel effect (Task 2)
- hardened `db.*` write methods that throw with `error.code` (Task 3)
- queue module: `QUEUE_KEY`, `readQueue`, `writeQueue`, `enqueue`, `queueLength`, `replay`, `flushQueue` (Task 4)
- `mutate(ctx, { apply, revert, op, dbCall })` (Task 5)
- memoized `ctx.places` selector + cache-write guard (Tasks 8–9)
- `db.getTripSettings` / `db.setTripSettings`, `state.names`, `ctx.names`, SettingsSheet name editor (Tasks 11–12)

---

## Task 0: Branch + scratch scaffold

**Files:**
- Modify: `.gitignore`
- Create: `scratch/` (git-ignored; for node selftests)

- [ ] **Step 1: Create the feature branch in the foundation worktree**

Run:
```bash
cd ~/dev/le-grande-tour/.worktrees/foundation
git checkout main && git pull --ff-only
git checkout -b uplift/live-and-solid
```
Expected: `Switched to a new branch 'uplift/live-and-solid'`.

- [ ] **Step 2: Git-ignore the scratch dir**

Append to `.gitignore` (keep existing contents):
```
scratch/
```

- [ ] **Step 3: Create the scratch dir placeholder**

Run:
```bash
mkdir -p scratch && echo "node selftests; not committed" > scratch/README
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: branch + git-ignore scratch selftests for live-and-solid"
```

---

## Task 1: `debounce(fn, ms)` util

**Files:**
- Modify: `index.html` (add util near the other top-level helpers, e.g. just above `function mergedPlaces(state)` ~line 179)
- Test: `scratch/selftest.mjs`

**Interfaces:**
- Produces: `debounce(fn, ms) -> wrapped` where `wrapped(...args)` calls `fn` once after `ms` of quiet; repeated calls reset the timer (trailing edge). `wrapped.cancel()` clears any pending call. Used by Task 2's realtime effect.

- [ ] **Step 1: Write the failing test**

Create `scratch/selftest.mjs`:
```js
// --- paste of debounce() from index.html ---
function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}
// --- test ---
let calls = 0; let lastArg = null;
const d = debounce((x) => { calls++; lastArg = x; }, 50);
d(1); d(2); d(3);
setTimeout(() => {
  console.assert(calls === 1, `expected 1 call, got ${calls}`);
  console.assert(lastArg === 3, `expected last arg 3, got ${lastArg}`);
  // cancel path
  let c = 0; const d2 = debounce(() => { c++; }, 30); d2(); d2.cancel();
  setTimeout(() => {
    console.assert(c === 0, `expected 0 calls after cancel, got ${c}`);
    console.log("debounce: PASS");
  }, 60);
}, 120);
```

- [ ] **Step 2: Run it to verify it fails**

First temporarily break the pasted impl (e.g. remove the `clearTimeout(t)` so every call fires).
Run: `node scratch/selftest.mjs`
Expected: assertion failure (`expected 1 call, got 3`).

- [ ] **Step 3: Add the real implementation to `index.html`**

Insert above `function mergedPlaces(state) {` (~line 179):
```js
// Trailing-edge debounce. wrapped.cancel() drops any pending call.
function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}
```
Then restore the correct impl in `scratch/selftest.mjs` (match it verbatim).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scratch/selftest.mjs`
Expected: `debounce: PASS` with no assertion output.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add trailing-edge debounce util"
```

---

## Task 2: Realtime channel + concurrent-refresh guard

**Files:**
- Modify: `index.html` — `refresh` (~lines 801–813), add `isFetching` ref in `App()` (~line 739 area), add `REALTIME_TABLES` const (module level), add a new realtime `useEffect` in `App()` (place right after the existing `visibilitychange` effect, ~line 821).

**Interfaces:**
- Consumes: `debounce` (Task 1), existing `refresh`, `supabase`, `session`, `viewerMode`.
- Produces: live updates; `isFetching` ref guarding overlapping `loadAll()` runs. `REALTIME_TABLES` constant (Task 11 appends `trip_settings`).

- [ ] **Step 1: Add the module-level table list**

Insert near the top, just after the `const supabase = createClient(...)` line (~line 53):
```js
// Tables whose changes should trigger a live refetch. (Realtime is enabled on
// these in the Supabase publication.) Task adds trip_settings later.
const REALTIME_TABLES = ["places", "place_status", "journal_entries", "journal_photos", "inbox", "private_notes"];
```

- [ ] **Step 2: Add the `isFetching` guard ref and guard `refresh`**

In `App()`, near the other refs (after `const localPrefs = useRef(...)`, ~line 763) add:
```js
const isFetching = useRef(false);
```
Then change `refresh` (~line 801) from:
```js
const refresh = async () => {
try {
const shared = await loadAll();
```
to:
```js
const refresh = async () => {
if (isFetching.current) return;
isFetching.current = true;
try {
const shared = await loadAll();
```
and change its `catch` tail (~line 812) from:
```js
} catch (e) { setStale(true); setLoaded(true); }
};
```
to:
```js
} catch (e) { setStale(true); setLoaded(true); }
finally { isFetching.current = false; }
};
```

- [ ] **Step 3: Add the realtime subscription effect**

Insert immediately after the existing `visibilitychange` effect (the one returning `removeEventListener("visibilitychange", onVis)`, ~line 821):
```js
// Live sync: subscribe to shared-table changes and debounce a refetch.
// Reuses refresh() so the result is always consistent with the load path.
// The visibilitychange effect above remains as a fallback if realtime drops.
useEffect(() => {
if (!session && !viewerMode) return;
const bumped = debounce(() => { refresh(); }, 300);
const ch = supabase.channel("trip");
REALTIME_TABLES.forEach(t =>
ch.on("postgres_changes", { event: "*", schema: "public", table: t }, bumped)
);
ch.subscribe();
return () => { bumped.cancel(); supabase.removeChannel(ch); };
}, [session, viewerMode]);
```

- [ ] **Step 4: Verify (two-profile manual test)**

1. `python -m http.server 8000` (or any static server) from the worktree root; open `http://localhost:8000/` in two separate browser profiles.
2. Profile A: sign in (trip login). Profile B: sign in too (or click "View the trip" for viewer).
3. In A, toggle a place "been" / add a place / add a text journal entry.
4. Observe B updates within ~1–2s **without** refocusing the tab.
Expected: B reflects A's change live. Confirm in B's console there are no repeated `loadAll` storms (the debounce coalesces a burst into one refetch).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: live realtime sync via debounced refetch + concurrent-refresh guard"
```

---

## Task 3: Harden `db` write methods to throw with `error.code`

**Files:**
- Modify: `index.html` — `db` object methods (~lines 420–491). The methods that currently ignore the Supabase `{ error }` result (`addPlace`, `upsertPlace`, `deletePlace`, `upsertStatus`, `addJournal`, `addInbox`, `deleteInbox`, `addPrivateNote`, `deletePrivateNote`) must throw on error, preserving `error.code` (so the queue can treat a `23505` unique-violation as already-applied). `updateJournal`/`deleteJournal`/`uploadPhoto`/`deletePhoto` already check errors — leave their behaviour, just confirm they throw.

**Interfaces:**
- Produces: every `db.*` write either resolves on success or **throws** the Supabase error object (with `.code`). Consumed by `mutate` (Task 5) and `replay` (Task 4).

- [ ] **Step 1: Add error checks to the silent writers**

Rewrite these methods in `db` (replace the existing bodies):
```js
async addPlace(p) {
const { error } = await supabase.from("places").insert({ id: p.id, city: p.city, cat: p.cat, tag: p.tag, name: p.name, area: p.area || null, note: p.note || null });
if (error) throw error;
},
async upsertPlace(p) {
const { error } = await supabase.from("places").upsert({ id: p.id, city: p.city, cat: p.cat, tag: p.tag, name: p.name, area: p.area || null, note: p.note || null }, { onConflict: "id" });
if (error) throw error;
},
async deletePlace(id) {
const r1 = await supabase.from("place_status").delete().eq("place_id", id);
if (r1.error) throw r1.error;
const r2 = await supabase.from("places").delete().eq("id", id);
if (r2.error) throw r2.error;
},
async upsertStatus(placeId, patch) {
const row = { place_id: placeId, updated_at: new Date().toISOString() };
if ("plannedDay" in patch) row.planned_day = patch.plannedDay;
if ("been" in patch) row.been = patch.been;
if ("rated" in patch) row.rated = patch.rated;
const { error } = await supabase.from("place_status").upsert(row, { onConflict: "place_id" });
if (error) throw error;
},
async addJournal(j) {
const { error } = await supabase.from("journal_entries").insert({
id: j.id, type: j.type, title: j.title, note: j.note || null, you: j.you || 0, her: j.her || 0,
region: j.region || null, vintage: j.vintage || null, city: j.city || null, day: j.day, ts: j.ts, place_id: j.place_id || null,
});
if (error) throw error;
},
```
and the inbox/private-note writers:
```js
async addInbox(item) {
const { error } = await supabase.from("inbox").insert({ id: item.id, raw: item.raw, kind: item.kind || null, city: item.city || null, sorted: false });
if (error) throw error;
},
async deleteInbox(id) {
const { error } = await supabase.from("inbox").delete().eq("id", id);
if (error) throw error;
},
async addPrivateNote(n) {
const { error } = await supabase.from("private_notes").insert({
id: n.id, day: n.day, type: n.type, title: n.title,
body: n.body || null, ref: n.ref || null, url: n.url || null, sort_order: n.sort_order || 0,
});
if (error) throw error;
},
async deletePrivateNote(id) {
const { error } = await supabase.from("private_notes").delete().eq("id", id);
if (error) throw error;
},
```

- [ ] **Step 2: Verify nothing regressed (smoke test)**

Reload the app signed in. Add a place, toggle "been", add a text journal entry, delete it. Each should still succeed (no console errors). This confirms the happy path still resolves.
Expected: all writes succeed; realtime (Task 2) reflects them.

- [ ] **Step 3: Verify the throw path**

In DevTools console (signed in): `await db.addInbox({ id: "x", raw: "t" }); await db.addInbox({ id: "x", raw: "t" });`
Expected: the **second** call rejects with an error whose `.code === "23505"` (duplicate key). This proves errors now surface with codes.
Then clean up: `await db.deleteInbox("x")`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix: db write methods throw supabase errors (preserve error.code)"
```

---

## Task 4: Offline write queue module

**Files:**
- Modify: `index.html` — add the queue module at module level, just after the `db` object (~after line 491).
- Test: `scratch/selftest.mjs`

**Interfaces:**
- Consumes: `db` (Task 3, throwing), `uid()`, `localStorage`, `navigator.onLine`.
- Produces:
  - `enqueue(op)` — `op = { kind, args }`; stamps `{ id, ts }` and appends to `localStorage["lgt:queue"]`.
  - `queueLength() -> number`.
  - `replay(op) -> Promise` — dispatches `op.kind` to the matching `db` method.
  - `flushQueue(onChange, replayFn = replay) -> Promise` — FIFO drain; stops at the first hard failure (op stays at head); treats `error.code === "23505"` as already-applied (drops it); calls `onChange(remaining)` as it drains.
- `op.kind` ∈ `upsertStatus | addPlace | upsertPlace | deletePlace | addJournal | updateJournal | deleteJournal | addInbox | deleteInbox | addPrivateNote | deletePrivateNote | setTripSettings`. (`setTripSettings` lands in Task 11; include the case now — harmless until `db.setTripSettings` exists.)

- [ ] **Step 1: Write the failing test**

Replace `scratch/selftest.mjs` contents with (shims + paste of the queue impl + asserts):
```js
// shims
const store = {};
globalThis.localStorage = { getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v)}, removeItem:k=>{delete store[k]} };
globalThis.navigator = { onLine: true };
let _n = 0; const uid = () => "id" + (++_n);
// --- paste of queue module from index.html (replace db.* dispatch with injected replayFn in tests) ---
const QUEUE_KEY = "lgt:queue";
function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; } }
function writeQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} }
function enqueue(op) { const q = readQueue(); q.push({ id: uid(), ts: 0, ...op }); writeQueue(q); }
function queueLength() { return readQueue().length; }
async function flushQueue(onChange, replayFn) {
  if (!navigator.onLine) return;
  let q = readQueue();
  while (q.length) {
    const op = q[0];
    try { await replayFn(op); }
    catch (e) { if (!(e && e.code === "23505")) { return; } }
    q = readQueue(); q.shift(); writeQueue(q); if (onChange) onChange(queueLength());
  }
  if (onChange) onChange(0);
}
// --- tests ---
(async () => {
  // FIFO + drains fully
  const seen = [];
  enqueue({ kind: "a", args: 1 }); enqueue({ kind: "b", args: 2 });
  console.assert(queueLength() === 2, `len 2, got ${queueLength()}`);
  await flushQueue(null, async (op) => { seen.push(op.kind); });
  console.assert(JSON.stringify(seen) === '["a","b"]', `FIFO, got ${JSON.stringify(seen)}`);
  console.assert(queueLength() === 0, `drained, got ${queueLength()}`);
  // hard failure leaves the op at head
  enqueue({ kind: "x", args: 0 });
  await flushQueue(null, async () => { throw { code: "500" }; });
  console.assert(queueLength() === 1, `stuck head, got ${queueLength()}`);
  // 23505 is treated as already-applied (dropped)
  await flushQueue(null, async () => { throw { code: "23505" }; });
  console.assert(queueLength() === 0, `dup dropped, got ${queueLength()}`);
  // offline: no-op
  navigator.onLine = false; enqueue({ kind: "y", args: 0 });
  await flushQueue(null, async () => { throw new Error("should not run"); });
  console.assert(queueLength() === 1, `offline no-op, got ${queueLength()}`);
  navigator.onLine = true; await flushQueue(null, async () => {});
  console.log("queue: PASS");
})();
```

- [ ] **Step 2: Run it to verify it fails first**

Before pasting the real impl into `index.html`, run the test against a deliberately broken `flushQueue` (e.g. comment out the `q.shift()` line in the scratch copy).
Run: `node scratch/selftest.mjs`
Expected: `drained, got 2` assertion failure. Then restore the correct scratch copy.

- [ ] **Step 3: Add the queue module to `index.html`**

Insert after the `db` object closes (`};` ~line 491):
```js
/* ============================== OFFLINE WRITE QUEUE ============================== */
// Simple serialisable mutations are queued here when offline (or on a network
// failure) and replayed FIFO on reconnect. Photos are NEVER queued (online-only).
// Replays are idempotent: writes are upserts-by-id or deletes, and a 23505
// unique-violation (insert already applied) is treated as success.
const QUEUE_KEY = "lgt:queue";
function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; } }
function writeQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} }
function enqueue(op) { const q = readQueue(); q.push({ id: uid(), ts: Date.now(), ...op }); writeQueue(q); }
function queueLength() { return readQueue().length; }
async function replay(op) {
switch (op.kind) {
case "upsertStatus": return db.upsertStatus(op.args.placeId, op.args.patch);
case "addPlace": return db.addPlace(op.args.place);
case "upsertPlace": return db.upsertPlace(op.args.place);
case "deletePlace": return db.deletePlace(op.args.id);
case "addJournal": return db.addJournal(op.args.entry);
case "updateJournal": return db.updateJournal(op.args.entry);
case "deleteJournal": return db.deleteJournal(op.args.id);
case "addInbox": return db.addInbox(op.args.item);
case "deleteInbox": return db.deleteInbox(op.args.id);
case "addPrivateNote": return db.addPrivateNote(op.args.note);
case "deletePrivateNote": return db.deletePrivateNote(op.args.id);
case "setTripSettings": return db.setTripSettings(op.args.settings);
default: return;
}
}
async function flushQueue(onChange, replayFn = replay) {
if (!navigator.onLine) return;
let q = readQueue();
while (q.length) {
const op = q[0];
try { await replayFn(op); }
catch (e) { if (!(e && e.code === "23505")) { return; } } // hard failure: stop, retry later
q = readQueue(); q.shift(); writeQueue(q); if (onChange) onChange(queueLength());
}
if (onChange) onChange(0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scratch/selftest.mjs`
Expected: `queue: PASS`, no assertion output.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: offline write queue (lgt:queue) with idempotent FIFO replay"
```

---

## Task 5: `mutate()` wrapper

**Files:**
- Modify: `index.html` — add `mutate` at module level just after the queue module (Task 4).
- Test: `scratch/selftest.mjs`

**Interfaces:**
- Consumes: `enqueue`, `flushQueue` (Task 4), `navigator.onLine`.
- Produces: `mutate(ctx, { apply, revert, op, dbCall }) -> Promise<void>`:
  - Always runs `apply()` (optimistic `setState`).
  - If `!navigator.onLine`: `enqueue(op)`, keep optimistic state, `ctx.flash("Saved offline — will sync")`, then `ctx.setPending(queueLength())`.
  - Else: `await dbCall()`. On success → `flushQueue(...)` (drains anything previously queued). On failure: if it looks like a network/offline error (`err.message` matches `/fetch|network/i` **or** `navigator.onLine === false`) → `enqueue(op)` + flash "Saved offline — will sync" + update pending; otherwise (a real server rejection) → `revert()` + `ctx.flash("Couldn't save — reverted")`.
- `ctx.setPending(n)` is added in Task 7; guard with `ctx.setPending && ctx.setPending(...)` so this task is shippable before Task 7.

- [ ] **Step 1: Write the failing test**

Append to `scratch/selftest.mjs` a `mutate` block (paste impl + asserts). Add at the end of the file:
```js
// --- paste of mutate() (test copy) ---
async function mutate(ctx, { apply, revert, op, dbCall }) {
  apply();
  if (!navigator.onLine) {
    enqueue(op); ctx.flash("Saved offline — will sync"); if (ctx.setPending) ctx.setPending(queueLength()); return;
  }
  try { await dbCall(); await flushQueue(ctx.setPending); }
  catch (err) {
    const networky = (err && /fetch|network/i.test(err.message || "")) || navigator.onLine === false;
    if (networky) { enqueue(op); ctx.flash("Saved offline — will sync"); if (ctx.setPending) ctx.setPending(queueLength()); }
    else { revert(); ctx.flash("Couldn't save — reverted"); }
  }
}
// --- tests ---
(async () => {
  navigator.onLine = true; writeQueue([]);
  let applied = 0, reverted = 0, flashed = "";
  const ctx = { flash: m => { flashed = m; }, setPending: () => {} };
  // success: apply, no revert, queue empty
  await mutate(ctx, { apply:()=>{applied++}, revert:()=>{reverted++}, op:{kind:"addInbox",args:{}}, dbCall: async()=>{} });
  console.assert(applied===1 && reverted===0 && queueLength()===0, "success path");
  // server error: apply then revert
  await mutate(ctx, { apply:()=>{applied++}, revert:()=>{reverted++}, op:{kind:"addInbox",args:{}}, dbCall: async()=>{ throw { code:"42501", message:"permission denied" }; } });
  console.assert(reverted===1 && queueLength()===0, `server error reverts, got rev=${reverted} q=${queueLength()}`);
  // network error: apply, enqueue, no revert
  await mutate(ctx, { apply:()=>{applied++}, revert:()=>{reverted++}, op:{kind:"addInbox",args:{}}, dbCall: async()=>{ throw new Error("Failed to fetch"); } });
  console.assert(reverted===1 && queueLength()===1, `network enqueues, got rev=${reverted} q=${queueLength()}`);
  console.assert(flashed === "Saved offline — will sync", `flash, got "${flashed}"`);
  writeQueue([]);
  console.log("mutate: PASS");
})();
```

- [ ] **Step 2: Run it to verify it fails first**

Temporarily break the scratch `mutate` (e.g. always `revert()` in the catch regardless of `networky`).
Run: `node scratch/selftest.mjs`
Expected: `network enqueues` assertion fails. Restore the correct copy.

- [ ] **Step 3: Add `mutate` to `index.html`**

Insert just after `flushQueue` (Task 4):
```js
// Central optimistic-write wrapper: apply now, then persist. On a server
// rejection, revert; on offline/network failure, enqueue and keep the optimistic
// state. One place for all write safety so call sites stay thin.
async function mutate(ctx, { apply, revert, op, dbCall }) {
apply();
if (!navigator.onLine) {
enqueue(op); ctx.flash("Saved offline — will sync"); if (ctx.setPending) ctx.setPending(queueLength()); return;
}
try { await dbCall(); await flushQueue(ctx.setPending); }
catch (err) {
const networky = (err && /fetch|network/i.test(err.message || "")) || navigator.onLine === false;
if (networky) { enqueue(op); ctx.flash("Saved offline — will sync"); if (ctx.setPending) ctx.setPending(queueLength()); }
else { revert(); ctx.flash("Couldn't save — reverted"); }
}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scratch/selftest.mjs`
Expected: `debounce: PASS`, `queue: PASS`, `mutate: PASS` (all three units green).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: mutate() wrapper — optimistic apply, revert-on-error, enqueue-on-offline"
```

---

## Task 6: Route write sites through `mutate`

**Files:**
- Modify: `index.html` — `useSetStatus` (~933–939); place add via `AddPlace`/Explore (`db.addPlace` calls ~1594, 1679, 1790); place edit (`db.upsertPlace` ~1503); place delete (`db.deletePlace` ~1521, 1684); inbox add/delete (`db.addInbox` ~1610, `db.deleteInbox` ~1505, 1627); journal add (`db.addJournal` ~1247, 1833); journal edit (`db.updateJournal`, in EditEntry ~1459 area); journal delete (`db.deleteJournal` ~1263). Private notes (`db.addPrivateNote`/`deletePrivateNote` in `PrivateNotes`).

**Interfaces:**
- Consumes: `mutate` (Task 5), `ctx` (must expose `flash`, `setState`, and — after Task 7 — `setPending`). Each site builds the `{ apply, revert, op, dbCall }` shape. Photo uploads stay OUTSIDE `mutate` (online-only, unchanged).

> This task is large; do it in committable sub-steps (status → places → inbox → journal → private notes). Each sub-step is independently verifiable in the running app. The pattern is identical everywhere: move the existing optimistic `setState` into `apply`, snapshot prior state for `revert`, name the `op`, and pass the existing db call as `dbCall`.

- [ ] **Step 1: Convert `useSetStatus` (gains revert)**

Replace `useSetStatus` (~933–939) with:
```js
function useSetStatus(ctx) {
return (id, patch) => {
if (!ctx.canEdit) { ctx.flash("Sign in to make changes"); return; }
const prev = ctx.state.exploreStatus[id];
mutate(ctx, {
apply: () => ctx.setState(s => ({ ...s, exploreStatus: { ...s.exploreStatus, [id]: { ...(s.exploreStatus[id] || {}), ...patch } } })),
revert: () => ctx.setState(s => { const next = { ...s.exploreStatus }; if (prev === undefined) delete next[id]; else next[id] = prev; return { ...s, exploreStatus: next }; }),
op: { kind: "upsertStatus", args: { placeId: id, patch } },
dbCall: () => ctx.db.upsertStatus(id, patch),
});
};
}
```
Verify: signed in, toggle a place "been" — still works; with DevTools throttled to Offline, toggle → flash "Saved offline — will sync" and the toggle stays. Commit: `git commit -am "refactor: place status writes go through mutate (revert + queue)"`.

- [ ] **Step 2: Convert place add / edit / delete**

For each `db.addPlace(p).catch(...)` / `await db.addPlace(p)` site (AddPlace `onAdd` ~1594; Explore auto-add ~1679; multi-review add ~1790), wrap via `mutate`. Example for the AddPlace path (`addPlace` in `Explore`/`PlaceList`, ~1590):
```js
const addPlace = async (place) => {
setState(s => ({ ...s, exploreAdded: [...(s.exploreAdded || []), place] }));
mutate(ctx, {
apply: () => {},
revert: () => setState(s => ({ ...s, exploreAdded: (s.exploreAdded || []).filter(p => p.id !== place.id) })),
op: { kind: "addPlace", args: { place } },
dbCall: () => db.addPlace(place),
});
};
```
(Where the optimistic `setState` already exists separately from the db call — as in the auto-add at ~1679/1790 — keep that `setState` as the `apply` body and remove the bare `db.addPlace(...).catch(...)`.) For edit (`db.upsertPlace(saved)` ~1503) use `op.kind: "upsertPlace"`, `args:{ place: saved }`, snapshot the prior place row for `revert`. For delete (`db.deletePlace(place.id)` ~1521; bulk ~1684) use `op.kind:"deletePlace"`, `args:{ id }`, and `revert` by re-inserting the removed place into `exploreAdded`/restoring status.
Verify each in-app (add/edit/delete a place online; one offline). Commit: `git commit -am "refactor: place add/edit/delete go through mutate"`.

- [ ] **Step 3: Convert inbox add / delete**

Inbox add (`db.addInbox(item).catch(...)` ~1610): keep the optimistic `setState` as `apply`, `op.kind:"addInbox"`, `args:{ item }`, `revert` removes the item from `state.inbox`. Inbox delete (`db.deleteInbox(id)` ~1505, 1627): `op.kind:"deleteInbox"`, `args:{ id }`, `revert` re-adds the removed inbox row (snapshot it before removal).
Verify: capture a note offline → queued; online → drains. Commit: `git commit -am "refactor: inbox add/delete go through mutate"`.

- [ ] **Step 4: Convert journal add / edit / delete (text + ratings only; photos stay online-only)**

Journal add (AddEntry ~1247 and capture-add ~1833): split the existing flow — the **text/ratings entry** goes through `mutate` (`op.kind:"addJournal"`, `args:{ entry }`, `apply` does the optimistic `setState` adding `entry` to `state.journal`, `revert` removes it by id). The **photo uploads remain exactly as today** (the `for (const f of files) { ... db.uploadPhoto ... }` loop), guarded so they only run when online; if offline, flash the existing-style message: `ctx.flash("Saved offline — photos will need adding when you're back online.")`. Journal edit (EditEntry, `db.updateJournal` ~1459 region): `op.kind:"updateJournal"`, `args:{ entry }`, snapshot prior entry for `revert`. Journal delete (`db.deleteJournal(id)` ~1263): it already snapshots `prev` and reverts on catch — convert to `mutate` with `op.kind:"deleteJournal"`, `args:{ id }`, `apply` removes from `state.journal`, `revert` restores `prev`.
Verify: add a text-only journal entry offline → queued + flashed; online → drains and appears on the second device. Add an entry with a photo offline → entry saved, photo-deferred message shown. Commit: `git commit -am "refactor: journal text/ratings writes go through mutate (photos stay online-only)"`.

- [ ] **Step 5: Convert private notes add / delete**

In `PrivateNotes` (~945+), wrap `db.addPrivateNote` (`op.kind:"addPrivateNote"`, `args:{ note }`) and `db.deletePrivateNote` (`op.kind:"deletePrivateNote"`, `args:{ id }`) through `mutate`, with optimistic add/remove on `state.privateNotes` and matching `revert`. (Private notes are auth-only, so these never run in viewer mode — `canEdit` already gates the component.)
Verify signed in: add/delete a private note online and one offline. Commit: `git commit -am "refactor: private-note add/delete go through mutate"`.

---

## Task 7: Pending indicator + flush triggers

**Files:**
- Modify: `index.html` — `App()`: add `pending` state + `setPending`, expose in `ctx` (~856); flush on `online` event (extend the existing online/offline effect ~789–793) and on app load (the auth/refresh effect ~823–832); render the count in the header `.syncnote` area (~877–879).

**Interfaces:**
- Consumes: `flushQueue`, `queueLength` (Task 4).
- Produces: `ctx.setPending(n)` (used by `mutate`), a visible "N change(s) pending" indicator that clears as the queue drains.

- [ ] **Step 1: Add pending state and seed it from the queue**

In `App()`, near the other `useState`s (~739):
```js
const [pending, setPending] = useState(typeof localStorage === "undefined" ? 0 : queueLength());
```

- [ ] **Step 2: Flush on reconnect and on load**

Change the online/offline effect (~789) to also flush on reconnect:
```js
useEffect(() => {
const onUp = () => { setOnline(true); flushQueue(setPending); };
const onDown = () => setOnline(false);
window.addEventListener("online", onUp); window.addEventListener("offline", onDown);
return () => { window.removeEventListener("online", onUp); window.removeEventListener("offline", onDown); };
}, []);
```
And add a one-shot flush on mount (new effect, right after the above):
```js
useEffect(() => { if (queueLength()) flushQueue(setPending); }, []);
```

- [ ] **Step 3: Expose `setPending` in `ctx`**

Update the `ctx` object (~856) to include it:
```js
const ctx = { state, setState, setLocal, tIndex, copy, flash, uid, setTab, canEdit, refresh, db, session, undoToast, pendingShare, setPendingShare, autoSort, setAutoSort, setPending };
```

- [ ] **Step 4: Render the indicator in the header**

Replace the `syncnote` span (~877–879) with a version that prefers the pending count:
```js
<span className={"syncnote" + (!online ? " warn" : "") + (pending ? " warn" : "")}>
{pending ? `${pending} change${pending === 1 ? "" : "s"} pending` : (!online ? "offline — showing saved trip" : session ? "Signed in · shared trip sync on" : "Viewer mode · sign in to edit")}
</span>
```

- [ ] **Step 5: Verify (offline → online drain)**

DevTools → Network → Offline. Make 3 edits (toggle a status, add a place, add a text journal entry). Header shows "3 changes pending". Go back Online. Expected: indicator counts down to 0 within a couple seconds; both devices converge; nothing lost. Reload while still offline with pending items → count persists (seeded from `lgt:queue`).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: 'N changes pending' indicator + flush queue on reconnect/load"
```

---

## Task 8: Memoize `ctx.places`

**Files:**
- Modify: `index.html` — `App()`: add `useMemo` places selector + expose `ctx.places` (~856). Refactor consumers that call `mergedPlaces(state)` directly: Today (~1064, 1065, 1068), Days (~1168), Journal (~1266), Explore/PlaceList (~1495, 1583, 1659, 1782).

**Interfaces:**
- Consumes: `mergedPlaces` (unchanged), `state.exploreAdded`, `state.exploreStatus`.
- Produces: `ctx.places` — the memoized merged-places array. Consumers filter locally off it.

- [ ] **Step 1: Add the memo in `App()`**

After `const canEdit = !!session;` (~850):
```js
const places = useMemo(() => mergedPlaces(state), [state.exploreAdded, state.exploreStatus]);
```
Add `places` to `ctx` (~856):
```js
const ctx = { state, setState, setLocal, tIndex, copy, flash, uid, setTab, canEdit, refresh, db, session, undoToast, pendingShare, setPendingShare, autoSort, setAutoSort, setPending, places };
```

- [ ] **Step 2: Refactor consumers to read `ctx.places`**

In each component that destructures `ctx` and calls `mergedPlaces(state)`, destructure `places` from `ctx` instead and replace `mergedPlaces(state)` with `places`. Examples:
- Today (~1064–1068): `const toRate = places.filter(p => p.been && !p.rated).length;` etc. (add `places` to that component's `ctx` destructure).
- Days (~1168): `const exploreDay = places.filter(p => p.plannedDay === i);`
- Journal (~1266): `const toRate = places.filter(p => p.been && !p.rated);`
- Explore/PlaceList (~1495 `findDup(places, ...)`, ~1583 `places.filter(p => p.city === city)`, ~1659/~1782 `const existing = places;`).
Each component already receives `ctx` (it's spread as `{...ctx}` or passed as `ctx`); pull `places` from there. **Do not** call `mergedPlaces(state)` anywhere in render anymore.

- [ ] **Step 3: Verify no behavioral change + recompute count**

Temporarily add `console.count("mergedPlaces")` inside `mergedPlaces`. Reload, navigate Today → Days → Journal → Explore.
Expected: `mergedPlaces` is called once per data change (memo deps), **not** 3×/Today or ~19×/Days. Remove the `console.count` after confirming. Visually confirm Today/Days/Journal/Explore render identical place lists/counts as before.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "perf: memoize merged places into ctx.places; consumers filter locally"
```

---

## Task 9: Cache-write guard for `euro26:shared`

**Files:**
- Modify: `index.html` — `refresh` (~809): only `JSON.stringify` + write `euro26:shared` when the shared payload actually changed since the last write. Add a `lastSharedSig` ref in `App()`.

**Interfaces:**
- Consumes: `refresh`, the `shared` payload (`{ journal, exploreAdded, exploreStatus }`).
- Produces: a `lastSharedSig` ref holding a cheap signature; the cache write is skipped when the signature is unchanged.

- [ ] **Step 1: Add the signature ref**

In `App()` near the other refs (~763):
```js
const lastSharedSig = useRef(null);
```

- [ ] **Step 2: Add a cheap signature helper (module level)**

Insert near the other top-level helpers (e.g. just after `function mergedPlaces`):
```js
// Cheap change signature for the cached shared payload: counts + newest journal
// timestamp + a status fingerprint. Avoids re-stringifying the whole dataset to
// localStorage on every realtime-driven refresh when nothing actually changed.
function sharedSig(shared) {
const js = shared.journal || []; const adds = shared.exploreAdded || []; const st = shared.exploreStatus || {};
let newest = 0; for (const j of js) { if ((j.ts || 0) > newest) newest = j.ts || 0; }
const stKeys = Object.keys(st);
let stSum = 0; for (const k of stKeys) { const s = st[k] || {}; stSum += (s.been ? 1 : 0) + (s.rated ? 2 : 0) + ((s.plannedDay == null ? 0 : s.plannedDay + 1) * 4); }
return `${js.length}:${adds.length}:${stKeys.length}:${newest}:${stSum}`;
}
```

- [ ] **Step 3: Guard the cache write in `refresh`**

Replace the cache-write line (~809) inside `refresh`:
```js
try { localStorage.setItem("euro26:shared", JSON.stringify({ journal: shared.journal, exploreAdded: shared.exploreAdded, exploreStatus: shared.exploreStatus })); } catch (e) {}
```
with:
```js
const sig = sharedSig(shared);
if (sig !== lastSharedSig.current) {
lastSharedSig.current = sig;
try { localStorage.setItem("euro26:shared", JSON.stringify({ journal: shared.journal, exploreAdded: shared.exploreAdded, exploreStatus: shared.exploreStatus })); } catch (e) {}
}
```

- [ ] **Step 4: Verify**

Add a temporary `console.log("cache write", sig)` inside the guard. Reload; trigger several `refresh()`es with no data change (e.g. switch tab away/back several times). Expected: the cache write logs **once** (first load), not on every refresh. Make a real edit → it logs again. Remove the temp log.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "perf: only rewrite euro26:shared cache when the shared payload changed"
```

---

## Task 10: `trip_settings` migration (schema + RLS + realtime + seed)

**Files:**
- Supabase project `coszvvrrnosudrskbypl` — apply via MCP `apply_migration` (name `add_trip_settings`).

**Interfaces:**
- Produces: `public.trip_settings` single-row table `{ id text pk default 'trip', name_one text default 'You', name_two text default 'Harriet', updated_at timestamptz }`, public-read / authenticated-write RLS, added to `supabase_realtime`, seeded with the `'trip'` row. Consumed by Task 11.

- [ ] **Step 1: Apply the migration**

Use Supabase MCP `apply_migration` on project `coszvvrrnosudrskbypl`, name `add_trip_settings`, with:
```sql
create table if not exists public.trip_settings (
  id text primary key default 'trip',
  name_one text not null default 'You',
  name_two text not null default 'Harriet',
  updated_at timestamptz not null default now()
);
alter table public.trip_settings enable row level security;
create policy trip_settings_read on public.trip_settings for select to anon, authenticated using (true);
create policy trip_settings_write on public.trip_settings for all to authenticated using (true) with check (true);
insert into public.trip_settings (id) values ('trip') on conflict (id) do nothing;
alter publication supabase_realtime add table public.trip_settings;
```

- [ ] **Step 2: Verify schema, RLS, realtime, and seed**

Run via MCP `execute_sql` on `coszvvrrnosudrskbypl`:
```sql
select * from public.trip_settings;
select policyname, cmd, roles from pg_policies where tablename='trip_settings';
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='trip_settings';
```
Expected: one row `('trip','You','Harriet',...)`; two policies (`trip_settings_read` SELECT `{anon,authenticated}`, `trip_settings_write` ALL `{authenticated}`); and `trip_settings` present in the publication.

- [ ] **Step 3: Commit (doc note)**

No code change in this task. Record the migration in the plan/spec history if needed; otherwise proceed (the migration is tracked server-side by Supabase).

---

## Task 11: Load trip settings + expose `ctx.names` + add to realtime

**Files:**
- Modify: `index.html` — `db` (add `getTripSettings`/`setTripSettings`); `loadAll` (~376) fetch + return `names`; `emptyState` (~687) add `names`; `refresh` cache (optionally include names); `App()` `ctx` (~856) expose `names`; `REALTIME_TABLES` (Task 2) append `trip_settings`.

**Interfaces:**
- Consumes: `trip_settings` table (Task 10).
- Produces: `db.getTripSettings() -> {one,two}|null`, `db.setTripSettings({one,two})`, `state.names = { one, two }`, `ctx.names`. Default `{ one: "You", two: "Harriet" }`. Consumed by Tasks 12–13. `op.kind:"setTripSettings"` (already in `replay`, Task 4) now resolves to a real method.

- [ ] **Step 1: Add db methods**

Add to the `db` object (near the other writers):
```js
async getTripSettings() {
const { data, error } = await supabase.from("trip_settings").select("*").eq("id", "trip").maybeSingle();
if (error) throw error;
return data ? { one: data.name_one || "You", two: data.name_two || "Harriet" } : null;
},
async setTripSettings(s) {
const { error } = await supabase.from("trip_settings").upsert({ id: "trip", name_one: s.one, name_two: s.two, updated_at: new Date().toISOString() }, { onConflict: "id" });
if (error) throw error;
},
```

- [ ] **Step 2: Fetch names in `loadAll` and return them**

In `loadAll` (~377), add `trip_settings` to the `Promise.all`:
```js
const [placesRes, statusRes, journalRes, photosRes, settingsRes] = await Promise.all([
supabase.from("places").select("*"),
supabase.from("place_status").select("*"),
supabase.from("journal_entries").select("*").order("ts", { ascending: false }),
supabase.from("journal_photos").select("*"),
supabase.from("trip_settings").select("*").eq("id", "trip").maybeSingle(),
]);
```
Before the `return` (~400), build names and include them:
```js
const names = settingsRes && settingsRes.data
? { one: settingsRes.data.name_one || "You", two: settingsRes.data.name_two || "Harriet" }
: { one: "You", two: "Harriet" };
return { exploreAdded, exploreStatus, journal, names };
```

- [ ] **Step 3: Default names in `emptyState` and cache**

In `emptyState` (~687) add `names: { one: "You", two: "Harriet" }`. In `refresh`'s cache write (Task 9) include names so they show offline:
```js
try { localStorage.setItem("euro26:shared", JSON.stringify({ journal: shared.journal, exploreAdded: shared.exploreAdded, exploreStatus: shared.exploreStatus, names: shared.names })); } catch (e) {}
```
and in the launch hydrate effect (~778–781) restore them:
```js
if (c && Array.isArray(c.journal)) setState(s => ({ ...s, journal: c.journal, exploreAdded: c.exploreAdded || s.exploreAdded, exploreStatus: c.exploreStatus || s.exploreStatus, names: c.names || s.names }));
```
(`refresh` already does `setState(s => ({ ...s, ...shared, ... }))`, so the fetched `names` lands in state automatically. Update `sharedSig` in Task 9 only if you want name changes to force a cache write — append `:${(shared.names&&shared.names.one)||""}:${(shared.names&&shared.names.two)||""}` to the signature so renames re-cache.)

- [ ] **Step 4: Expose `names` in `ctx` and subscribe to the table**

Add `names: state.names || { one: "You", two: "Harriet" }` to `ctx` (~856). Append `"trip_settings"` to `REALTIME_TABLES` (Task 2) so renames sync live to both devices and the viewer.

- [ ] **Step 5: Verify**

Reload signed in. In console: `ctx`-equivalent — confirm `state.names` is `{one:"You",two:"Harriet"}` from the seed. Manually run `await db.setTripSettings({one:"Kim",two:"Harriet"})` in console → a second profile/viewer should refetch within ~1–2s (realtime) and `state.names.one` becomes "Kim". Reset with `await db.setTripSettings({one:"You",two:"Harriet"})`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: load/store traveller names in trip_settings; expose ctx.names + live-sync"
```

---

## Task 12: SettingsSheet name editor

**Files:**
- Modify: `index.html` — `SettingsSheet` (~1979) gains two name inputs; it must receive `ctx` (currently it only gets `autoSort/setAutoSort/onClose` — update the call site ~910 to pass `ctx`). Saving goes through `mutate` (`op.kind:"setTripSettings"`).

**Interfaces:**
- Consumes: `ctx.names`, `ctx.canEdit`, `mutate`, `db.setTripSettings` (Task 11).
- Produces: edited names persisted via `mutate` (optimistic `state.names`, revert on failure, queue on offline) — visible everywhere `ctx.names` is read (Task 13).

- [ ] **Step 1: Pass `ctx` to `SettingsSheet`**

At the render site (~910):
```js
{settingsOpen && <SettingsSheet ctx={ctx} autoSort={autoSort} setAutoSort={setAutoSort} onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 2: Add the name editor to `SettingsSheet`**

Replace `SettingsSheet` (~1979) with:
```js
function SettingsSheet({ ctx, autoSort, setAutoSort, onClose }) {
const names = (ctx && ctx.names) || { one: "You", two: "Harriet" };
const [one, setOne] = useState(names.one);
const [two, setTwo] = useState(names.two);
const dirty = one.trim() !== names.one || two.trim() !== names.two;
const save = () => {
const next = { one: one.trim() || "You", two: two.trim() || "Harriet" };
const prev = names;
mutate(ctx, {
apply: () => ctx.setState(s => ({ ...s, names: next })),
revert: () => ctx.setState(s => ({ ...s, names: prev })),
op: { kind: "setTripSettings", args: { settings: next } },
dbCall: () => ctx.db.setTripSettings(next),
});
ctx.flash("Names saved");
onClose();
};
return (
<Sheet title="Trip settings" onClose={onClose}>
{ctx && ctx.canEdit && (
<div className="setblock">
<div className="setrow-l">Traveller names</div>
<div className="xs">Used across the journal, ratings and recap.</div>
<input className="authinput" value={one} onChange={e => setOne(e.target.value)} placeholder="First traveller (e.g. Kim)" aria-label="First traveller name" />
<input className="authinput" value={two} onChange={e => setTwo(e.target.value)} placeholder="Second traveller (e.g. Harriet)" aria-label="Second traveller name" />
<button className="primary" disabled={!dirty} onClick={save}>Save names</button>
</div>
)}
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

- [ ] **Step 3: Add minimal styles**

Add near the `.setrow` styles (search for `.setrow{` in the `<style>`/`Style` block) a `.setblock` rule:
```css
.setblock{display:flex;flex-direction:column;gap:8px;padding:14px 0;border-bottom:1px solid var(--hair,rgba(0,0,0,.08));}
.setblock .authinput{margin:0;}
```
(Match the existing CSS-variable naming; if `--hair` isn't defined, reuse whatever border token `.setrow` uses.)

- [ ] **Step 4: Verify**

Signed in: open Trip settings (gear), set names to "Kim"/"Harriet", Save. Expected: flash "Names saved"; the sheet closes; the journal/recap labels update (after Task 13). A second profile/viewer updates live within ~1–2s. Offline: edit names → "Saved offline — will sync"; online → drains.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: edit traveller names in Trip settings (synced via mutate + realtime)"
```

---

## Task 13: Replace hardcoded "You"/"Harriet"/"H" labels with `ctx.names`

**Files:**
- Modify: `index.html` — every hardcoded traveller label: Journal mini-stars (~1293–1294, ~1927), Journal stat labels (~1310–1311), RateRow labels in EditEntry/AddEntry/capture (~1344–1345, ~1459–1460, ~1847). Each site must read `names` from `ctx` (already in scope where `ctx` is destructured, or pass through).

**Interfaces:**
- Consumes: `ctx.names = { one, two }` (Task 11).
- Produces: all traveller-facing labels reflect the configured names (and update live).

- [ ] **Step 1: Replace the RateRow labels**

At ~1344–1345, ~1459–1460, ~1847 replace `label="You"` → `label={ctx.names.one}` and `label="Harriet"` → `label={ctx.names.two}`. Ensure `ctx` (and thus `names`) is in scope in those components; if a component only destructured specific ctx fields, add `names` to its destructure (e.g. `const { ..., names } = ctx;` then `label={names.one}`).

- [ ] **Step 2: Replace the Journal stat labels**

At ~1310–1311 replace `<Stat label="You" .../>` → `<Stat label={names.one} .../>` and `<Stat label="Harriet" .../>` → `<Stat label={names.two} .../>`.

- [ ] **Step 3: Replace the mini-stars labels**

At ~1293–1294 and ~1927 replace `<MiniStars label="You" v={j.you} />` → `<MiniStars label={names.one} v={j.you} />` and `<MiniStars label="H" v={j.her} />` → `<MiniStars label={names.two} v={j.her} />`. (If `MiniStars` truncates long labels, leave as-is — names are short; do not add new truncation logic, YAGNI.)

- [ ] **Step 4: Grep to confirm nothing was missed**

Run:
```bash
cd ~/dev/le-grande-tour/.worktrees/foundation
grep -n 'label="You"\|label="Harriet"\|label="H"\|label="You\b' index.html
```
Expected: no matches for traveller-rating labels (the only remaining `You` strings should be unrelated copy like the AuthScreen lede and `questionFor` — leave those; they're narrative, not name labels).

- [ ] **Step 5: Verify end-to-end**

Signed in: set names to "Kim"/"Harriet" in settings. Navigate Journal (cards + stats), open an entry to edit, add a new entry, use Explore capture rating. Expected: every rating label shows "Kim"/"Harriet" (not "You"/"H"). On a second profile/viewer the labels update live after a rename.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: traveller-name labels across journal, stats and rating rows"
```

---

## Final: cleanup + verification pass

- [ ] **Remove the scratch selftest**: `rm -rf scratch` (it's git-ignored; nothing to commit).
- [ ] **Full manual regression** (spec §6): two browser profiles signed into the same trip —
  - Realtime: edit on A appears on B within ~1–2s without refocus; public viewer also updates.
  - Write safety: DevTools offline → toggle status / add place / add text journal entry → "N changes pending"; back online → drains, both converge, nothing lost. Online + a forced server error (e.g. revoke a row via RLS) → revert + "Couldn't save — reverted".
  - Perf: `mergedPlaces` runs once per data change (not per render); `euro26:shared` writes only on real change.
  - Names: rename in settings → journal/stats/rating labels update on both devices + viewer.
- [ ] **Do NOT push to `main`.** Report completion and ask the user for explicit authorization to publish (GitHub Pages deploy from `main`). Until then the branch `uplift/live-and-solid` holds the work.

---

## Self-Review (author's check against the spec)

- **§3.1 Realtime sync** → Tasks 1 (debounce), 2 (channel + `isFetching` guard), infra already enabled (verified) + `trip_settings` added in 10/11. ✓
- **§3.2 Mutation wrapper** → Tasks 3 (db throws), 5 (`mutate`), 6 (route all write sites). ✓
- **§3.3 Offline queue** → Tasks 4 (queue/replay/flush, idempotent), 6 (sites enqueue), 7 (flush on reconnect/load + indicator). Photos online-only respected in Task 6 step 4. ✓
- **§3.4 Performance** → Tasks 8 (`ctx.places` memo), 9 (cache-write guard). ✓
- **Traveller names (#2)** → Tasks 10 (schema/RLS/realtime/seed), 11 (load/store/expose + subscribe), 12 (settings editor via mutate), 13 (label replacement). Shared-server storage so viewer + both devices see names and renames sync live. ✓
- **Spec open questions resolved:** one channel with N table filters (Task 2); indicator reuses `.syncnote` (Task 7); `private_notes` realtime reaches authenticated only (kept; viewers never load them). ✓
- **Out of scope (untouched):** desktop/mobile layout fixes, CRDT/field-merge, photo-blob offline queue, per-traveller identities. ✓
- **Type consistency:** `mutate(ctx, {apply,revert,op,dbCall})`, `op={kind,args}`, `flushQueue(onChange, replayFn=replay)`, `ctx.setPending`, `ctx.places`, `ctx.names={one,two}`, `db.getTripSettings/setTripSettings`, `REALTIME_TABLES` — names consistent across all tasks. ✓
