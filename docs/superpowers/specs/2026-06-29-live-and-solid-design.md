# Live & Solid — Real-time Sync, Write Safety, Offline Queue, Performance

**Date:** 2026-06-29
**Scope:** Root `index.html` (the le grande tour app) + Supabase project `bsbuhkzdebqobkpxtivb` (enable Realtime on shared tables). le-grande-tour only — the Voyage app is a separate repo. The desktop/mobile layout fixes from the same review are deliberately **out of scope** here (a later pass).

---

## 1. Purpose

A runtime audit (2026-06-29) found the app is single-user-smooth but not "top standard" for two travellers sharing a trip:

- **No real-time sync.** There are zero Supabase Realtime subscriptions; shared data only refetches on `visibilitychange` (app focus) — not even a poll. If one traveller logs a meal while the other is in the app, the second won't see it until they switch away and back. *(This is the original foundation spec's deferred §3.5 — the war sheet's "non-negotiable engineering bar.")*
- **Optimistic writes don't all self-heal.** `place_status` updates apply locally and fire-and-forget; on failure they don't revert, so the screen can diverge from the server.
- **No offline write queue.** An edit made offline fails silently and is lost.
- **Perf churn.** `mergedPlaces(state)` is unmemoized and runs 3× on Today / ~19× on Days per render; the full shared dataset is `JSON.stringify`'d to `localStorage` on every focus.

Goal: two signed-in travellers see each other's edits within ~1s; optimistic writes revert on real failure; offline edits are preserved and retried; the app stops the per-render/per-focus waste. No data loss, no jank.

### Approved design decisions (brainstorming)
- **Realtime apply:** subscribe to the shared tables; on any change event, **debounce ~300ms then re-run the existing `refresh()`** (reuse the proven load path; always consistent).
- **Offline:** **queue the simple writes** (place status, place add/edit/delete, inbox add/delete, journal add[text+ratings]/edit/delete, private notes) to `localStorage`, flush on reconnect, show a "N changes pending" indicator. **Photos require a connection** (an offline entry keeps text/ratings; photos attach when back online).
- **Conflict model:** keep **last-write-wins** (no field-level merge); realtime refetch reconciles.
- **Viewer too:** the logged-out public-link viewer also gets realtime updates (low cost).
- **Where the logic lives:** a single thin **mutation wrapper**, not scattered try/revert/enqueue.

---

## 2. Current State (baseline, file = `index.html`)

- `App()` holds `state` (emptyState shape), `refresh()` (calls `loadAll()` + `loadPrivateNotes()`), a `visibilitychange` effect that calls `refresh()` on focus, and a mount effect that refreshes after auth.
- `db` object wraps Supabase reads/writes: `addPlace`/`upsertPlace`/`deletePlace`, `upsertStatus`, `addJournal`/`(edit)`/`deleteJournal`/`uploadPhoto`, `addInbox`/`deleteInbox`, private-note writes.
- `useSetStatus(ctx)` applies `exploreStatus` optimistically then `db.upsertStatus(...).catch(flash)` with **no revert**.
- `mergedPlaces(state)` (top-level) merges seed + added places with status; called directly in Today/Days/Journal/Explore.
- Supabase single client (anon key + auth session when signed in). RLS: shared tables public-read; private_notes auth-only. Realtime **not** enabled on any table.

---

## 3. The Work

### 3.1 Real-time sync

- **Supabase (infra):** add `journal_entries`, `places`, `place_status`, `inbox`, `private_notes` to the `supabase_realtime` publication (via Supabase MCP). Confirm RLS allows the receiving role to SELECT (anon for the public-read tables so a viewer gets events; authenticated for private_notes). Realtime delivers only rows the subscriber may read.
- **Client:** a `useEffect` (deps `[session, viewerMode]`) that, when `session || viewerMode`, opens one channel:
  ```
  supabase.channel("trip")
    .on("postgres_changes", { event: "*", schema: "public", table: <each> }, onChange)
    .subscribe()
  ```
  `onChange` calls a **debounced `refresh()`** (~300ms; trailing). Channel removed on cleanup/sign-out (`supabase.removeChannel`).
- Keep the existing `visibilitychange` refresh as a fallback (e.g. when realtime drops). Guard against overlapping refreshes (an `isFetching` ref so a realtime burst + focus don't fire two concurrent `loadAll()`s).
- **Acceptance:** with two browser profiles signed into the same trip, an edit on A appears on B within ~1–2s without B refocusing; a public-link viewer also updates live.

### 3.2 Mutation wrapper (optimistic + revert + enqueue)

- A helper `mutate({ apply, revert, op })` where `apply()` does the optimistic `setState`, `op` is a serializable `{kind, args}` descriptor, and `revert()` undoes the optimistic change:
  - Always run `apply()`.
  - If **offline** (`!navigator.onLine`): enqueue `op` (§3.3), keep the optimistic state, flash "Saved offline — will sync".
  - If **online**: run the op's `dbCall`; on success, done; on a network-type failure, enqueue `op` (keep optimistic); on a non-retryable error, `revert()` + flash.
- Refactor the existing write sites to go through `mutate` — most importantly `useSetStatus` (gains revert), plus place add/edit/delete, inbox, journal add/edit/delete, private notes. Journal photo uploads stay outside the queue (online-only).
- **Acceptance:** toggling a place "been" then killing the network mid-write reverts (online error) OR is queued (offline) — never a silent divergence.

### 3.3 Offline write queue

- A module-level queue persisted at `localStorage["lgt:queue"]` = array of `{ id, kind, args, ts }`. `kind` ∈ a fixed set mapping to `db` methods (the simple mutations above). A `replay(op)` dispatcher calls the matching `db` method.
- `flushQueue()` runs: on the `online` event, on app load (if non-empty and online), and after each successful direct write. It replays in FIFO order; a failed op stays at the head (stop, retry later). Replays are **idempotent** (all writes are upserts-by-id or deletes), so a double-flush is harmless.
- **Pending indicator:** the header sync note shows "N change(s) pending" when the queue is non-empty; clears as it drains.
- **Photos:** when a journal entry is created offline, it queues with its text/ratings only; flash "Photos will need adding when you're back online." (No blobs in the queue.)
- **Acceptance:** go offline, make several edits (status, a place, a text journal entry), see "N pending"; go online → queue drains, both devices converge; nothing lost.

### 3.4 Performance

- **Memoize places:** in `App()`, `const places = useMemo(() => mergedPlaces(state), [state.exploreAdded, state.exploreStatus]);` expose as `ctx.places`. Refactor Today/Days/Journal/Explore to read `ctx.places` (filter locally) instead of calling `mergedPlaces(state)` directly. Removes the 3–19×/render recompute.
- **Cache-write guard:** only `JSON.stringify` + write `euro26:shared` when the shared payload actually changed since the last write (cheap signature: counts + latest timestamps), so the realtime-driven refreshes don't thrash localStorage.
- **Acceptance:** the Days screen no longer recomputes merged places per day; `euro26:shared` is written only on real data change.

---

## 4. Architecture & boundaries

- New units, each small and testable: `realtimeChannel` effect; `debounce(fn, ms)` util; `mutate(...)` wrapper; `queue` module (`enqueue`/`flushQueue`/`replay`) over `localStorage`; `useMemo` places selector; cache-write guard. All live in `index.html` (single-file constraint) but as discrete functions with clear interfaces.
- No new runtime dependencies; no build step. Single Supabase client reused.

## 5. Error handling

- Realtime drop → fallback to `visibilitychange` refresh + stale banner (existing).
- `refresh()` overlap → `isFetching` guard.
- Write failure → `mutate` reverts (online error) or enqueues (offline/network); user always sees an honest state.
- Queue replay failure → op stays queued, retried on next trigger; idempotent so safe.
- Photo upload failure (online) → unchanged from today (flash; entry keeps text).

## 6. Testing & verification

No automated harness; manual + console.
- **Real-time:** two browser profiles (or two devices) signed into the same trip — edit on one, see it on the other within ~1–2s; repeat for a public-link viewer.
- **Write safety:** DevTools → offline; toggle a status/add a place → "pending"; back online → drains. Online + simulated failure → revert.
- **Pure logic (console asserts):** `debounce` timing; queue `enqueue`→`flushQueue` FIFO + idempotent replay; `mutate` revert path; the places memo deps.
- **Perf:** confirm (via a temporary counter/log during dev) `mergedPlaces` runs once per render and `euro26:shared` writes only on change.

## 7. Build sequence (likely 2–3 plans; each independently shippable)

1. **Realtime sync** (§3.1) — enable Realtime + subscribe + debounced refetch + `isFetching` guard. Delivers the headline win.
2. **Write safety + offline queue** (§3.2, §3.3) — `mutate` wrapper, revert, `lgt:queue`, flush-on-reconnect, pending indicator.
3. **Performance** (§3.4) — memoized `ctx.places` + cache-write guard.

## 8. Out of scope

- Desktop/mobile layout fixes (tab-bar discontinuity, tap targets, photo-grid density, image dimensions) — separate pass.
- Field-level conflict resolution / CRDTs (last-write-wins retained).
- Photo-blob offline queue (photos remain online-only).
- Moving off the single shared-login model (per-traveller identities) — that's a bigger product change.

## 9. Open questions for planning

- Channel granularity: one channel with five table filters vs five channels (one per table) — decide at plan time; functionally equivalent, pick the simpler Supabase API shape.
- Where exactly the "N pending" indicator sits in the header (reuse `.syncnote`).
- Whether private_notes realtime should be gated to `session` only (yes — viewers never load them).
