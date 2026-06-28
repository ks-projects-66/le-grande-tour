# Le Grande Tour — Elite Uplift Design

**Date:** 2026-06-28
**Scope:** Root `index.html` only (the personal "le grande tour" holiday PWA). The white-label Voyage app under `app/` is explicitly **out of scope** and must not be touched (it is worked on in a separate session).

---

## 1. Purpose

Le grande tour already sits in the market position the Voyage competitive war sheet identifies as unoccupied: it spans the whole arc — **plan → live → relive** — with the group (a couple) at the centre, it is free and zero-install (PWA), and its AI is *curation-assist* rather than a hallucinating generator. It already has the one signature feature nobody else has: the **per-traveller taste-and-memory diary** (you/her star ratings on meals and wines).

This is therefore an **elevation** project, not a repositioning. The objective is to make le grande tour *elite* on design, functionality, and features — concentrating effort exactly where the war sheet says incumbents are structurally weakest: **the group, the memory, and the honesty of the model**, plus the beautiful **zero-install shareable keepsake** that Polarsteps users ask for and cannot get.

### Design philosophy: evolve, do not reskin

The user likes the current fonts (Manrope), the colour palette, the icons, and the deliberately **non-noise / minimalist** approach. The design work is **refinement, not replacement**. Target: someone who knows the app today says *"that's my app, sharper,"* not *"what happened to it."* ~80% stays; the ~20% of change concentrates on the keepsake surfaces. **No display serif** — Manrope remains the only typeface.

---

## 2. Current State (baseline)

Single-file React-via-CDN PWA (Babel-in-browser, no build step). Supabase backend (public-read data cached to `localStorage` as `euro26:shared`; authenticated private notes; photo storage). Open-Meteo weather, open.er-api.com FX, Leaflet recap map, Google Maps deep-links, Gemini via a Supabase edge function (`assistant`).

**Screens:** Today, Days, Journal, Explore, Tour (recap).

**Design tokens today** (in the `<style>` block, ~line 1876):
- `--bg:#F2F2F7`, `--surface:#FFFFFF`, `--ink:#1D1D1F`, `--ink2:#6E6E73`, `--muted:#8E8E93`
- `--accent:#1F4DE6`, `--accent-d:#163BBD`, `--powder:#EAF0FF`, `--powder2:#C9D8FF`
- Journal-type colours currently **collapsed to blue**: `--c-meal:var(--accent); --c-meal-bg:var(--powder)`
- Shadows: `--shadow` (subtle), `--shadow-float` (modals). Radius mixed (0 / 18 / 22). Spacing ad hoc (2,4,6,8,11,12,13,14,15…).
- Font: Manrope (Google Fonts) + system fallbacks. No dark mode. No skeleton loaders.

**Known weaknesses (the elite gap):**
1. **Design reads "competent utility," not "beautiful keepsake."** Generic iOS-gray + one SaaS blue, mostly flat radius-0, the richer per-type colour palette switched off, generic stock city heroes, no dark mode, no loading states.
2. **Functionality short of the war-sheet engineering bar.** Sync is last-write-wins, polling on tab-focus. Capture is a full form (friction).
3. **The keepsake never leaves the app.** The Tour recap is in-app only; there is no shareable, zero-install web keepsake (the war sheet's #3 priority and the viral loop).

---

## 3. The Work

Five workstreams. Sequence: **Foundation → Capture + Tastes → Recap.** The foundation goes first because every later feature inherits its tokens.

### 3.1 Design system foundation (evolution)

Each move is independent and reversible. Tags: `[keep]` unchanged, `[enhance]` refine existing, `[add]` new.

**Typography**
- `[keep]` Manrope as the sole working face, everywhere it is now. **No serif.**
- `[enhance]` Use Manrope's weight range with intent: heavier weights + tighter tracking on the big stat numbers and section headers that already exist, so hierarchy reads deliberate rather than default.

**Colour**
- `[keep]` Base palette untouched: `#F2F2F7` ground, white surfaces, `#1D1D1F` ink, the blue accent and powder tints.
- `[enhance]` Switch on the **warm per-type journal palette** that already exists in the product family, replacing the current blue collapse:
  - Meal: ink `#C2410C`, bg `#FBEAE0`
  - Wine: ink `#9A1B3D`, bg `#F7E3EA`
  - Sight: ink `#0E7C7B`, bg `#DCF0EF`
  - Moment: ink `#6D28D9`, bg `#ECE4FB`
  - These render distinctly across Journal, Tastes, Explore, and Recap. Still the product's own palette — just the warm half turned on.
- `[add]` **Dark mode** derived from the existing token set as a parallel theme (a second `:root`/`@media (prefers-color-scheme: dark)` block + a manual toggle). Because colour is already fully tokenized, this is additive, not a redesign.

**Shape, depth, rhythm (non-noise preserved)**
- `[enhance]` Settle on **one card radius** + the two existing shadow levels (`--shadow`, `--shadow-float`) applied consistently, replacing the 0/18/22 mix.
- `[enhance]` Replace ad-hoc spacing with a **4-based scale** (`--s1:4 … --s2:8 … --s3:12 … --s4:16 … --s6:24 … --s8:32`). Per-element invisible; collectively snaps the layout into rhythm.

**Loading & motion**
- `[add]` **Skeleton loaders** for the initial data fetch and tab transitions (nothing pops in cold), reusing the existing `cubic-bezier(.2,.8,.2,1)` curve. Respect `prefers-reduced-motion` (already supported).

**Photography**
- `[enhance]` The user's **real holiday photos** become the heroes (Today hero, day cards, recap) where generic Wikimedia city stock is now. Stock drops to fallback-only when no trip photo exists for that city/day.

**Acceptance:** the app is recognizably the same; type hierarchy, per-type colour, consistent radius/shadow, a working dark mode, skeletons on load, and photo-forward heroes are all present. No serif anywhere.

### 3.2 Sub-10-second capture (the retention mechanic)

War sheet #2: *"photo, name, stars, done."* Capture friction is the difference between an app used at dinner and one abandoned by day three.

- A **persistent floating + (capture) button** on every screen.
- Tap → photo picker opens **immediately**.
- On pick → a **minimal inline capture card** appears:
  - Type auto-guessed (default to last-used / Meal at dinner hours), one-tap to change.
  - Name field **autofocused**.
  - The two star rows (you / her).
  - Save.
- **Smart defaults:** city + day auto-filled from the current day; if the user is near a planned place, the entry auto-links to that `place_id`.
- **"Rate later" path:** save with just the photo → entry lands in the existing *"still to rate"* queue (already present in Journal).
- **Reuse**, do not rebuild: the existing journal-entry creation, client-side photo compression, and Supabase storage upload pipeline. This collapses the current full form into a fast path; the full editor remains available for richer edits.

**Acceptance:** from any screen, photo → name → two ratings → saved in well under 10 seconds and under ~4 taps; "rate later" produces a queued entry.

### 3.3 Tastes — the signature, elevated

The per-traveller ratings are the one thing no competitor has. Today they are buried inside Journal. Elevate them to a first-class memory layer.

- A dedicated **Tastes view** (its own tab or a prominent Journal sub-view — decide during planning).
- **Ranked best meals** and **best wines**, by combined rating, each showing both travellers' stars side by side, the photo, the place, and the city.
- **Filters:** by city and by type.
- **You vs her:** surface agreement and disagreement (where you both rated high; where you diverged most). This is the delightful, shareable hook.
- Pure presentation/aggregation over journal data already stored — **no new data model.**
- Becomes the **source of the recap's best-of section** (§3.4), so build it to expose a reusable "best-of" selector.

**Acceptance:** ranked best-of with dual ratings, city/type filters, and a you-vs-her view, computed entirely from existing journal entries.

### 3.4 Shareable recap (the keepsake + viral loop)

War sheet #3 and the single highest-leverage missing feature. The keepsake users ask Polarsteps for and cannot get.

- A **public, read-only, no-login web page** at a **share URL** (keyed by a share token), opening in any browser with **zero install**.
- **Scroll-driven, photography-forward, editorial** (Manrope at display weights — no serif). Sections:
  - Trip header (title, dates, route).
  - Route map (reuse the existing Leaflet recap map).
  - Trip stats (days, cities, countries, meals, wines, photos).
  - **Tastes best-of** with both travellers' ratings (consumes §3.3).
  - Photo highlights.
  - The AI trip story (existing `aiStory`, grounded — honest model).
- **Open Graph / Twitter meta tags** so the shared link previews beautifully — the preview *is* the viral loop.
- **Technically:** a public view of the same SPA that, given a share token, renders the recap from already-public/cached trip data **without auth**. Mirrors the existing `euro26:shared` public-read pattern. The app generates/copies the share link (extend the existing Share button).

**Acceptance:** a logged-out person opens the share link in a fresh browser and sees the full styled recap (no app install, no login); the link produces a rich social preview.

### 3.5 Sync reliability hardening (the non-negotiable bar)

War sheet #5: the one thing the wedge cannot get wrong. Current model is last-write-wins with visibility-triggered refetch.

- Move toward **near-real-time multi-contributor sync** for the two travellers: adopt Supabase realtime subscriptions on the shared tables (journal, places, place_status, inbox) so a change on one phone appears on the other without a manual reopen.
- Add **basic conflict-safety**: per-row `updated_at` checks / merge rather than blind overwrite; never silently drop a co-traveller's write.
- Keep the offline-tolerant behaviour already in place (localStorage cache, stale banner, service worker).
- Scope note: this is hardening of the existing two-person shared-login model, **not** a rebuild into the white-label multi-account collaboration system (that lives in Voyage). Exact depth to be set during planning; the bar is "no lost writes, updates appear live."

**Acceptance:** an edit on one device appears on the second device within seconds without a manual refresh, and concurrent edits do not lose data.

---

## 4. Sequencing & rationale

1. **Foundation (§3.1)** — tokens, per-type colour, dark mode, radius/shadow consistency, spacing scale, skeletons, photo-forward. Everything else inherits these.
2. **Capture (§3.2) + Tastes (§3.3)** — together; they share the journal/ratings layer. Capture is the daily-use win; Tastes elevates the data capture produces.
3. **Recap (§3.4)** — the showcase; consumes Tastes' best-of selector.
4. **Sync hardening (§3.5)** — woven through, raised to the explicit bar before completion.

Each workstream is independently shippable.

---

## 5. Architecture notes & constraints

- **Single-file, no-build constraint preserved.** Stay with React-via-CDN + Babel-in-browser in `index.html`. Do not introduce a bundler/build step unless explicitly agreed — it would change the deployment model.
- **File size risk.** `index.html` is already ~2,180 lines. These features add meaningfully more. During planning, decide whether to keep one file or split the `<script type="text/babel">` into a small number of additional `text/babel` includes for maintainability, without adding a build step.
- **Reuse existing pipelines:** journal entry + photo compression + Supabase storage (for capture); Leaflet recap map and `aiStory` (for recap); journal data (for Tastes). Minimize net-new data model — Tastes and Recap are presentation layers over existing data.
- **Supabase:** Tastes/Recap need no schema change. The shareable recap needs a public-read path keyed by a share token (mirror the existing `euro26:shared` public pattern; confirm RLS allows anon read of the shared row). Sync hardening adds realtime subscriptions and `updated_at` merge logic.
- **Out of scope:** anything under `app/` (Voyage white-label), the marketing site under `voyage/`, AI generation as a headline feature, logistics parity (Gmail import, route optimisation, expense splitting), and a paid/subscription model.

---

## 6. Testing & verification

No automated test harness exists today (vanilla single-file app). Verification is primarily manual against the per-section acceptance criteria above. During planning, consider:
- A lightweight smoke path: load, switch tabs, capture an entry, view Tastes, open the share link logged-out, toggle dark mode.
- Real-device check (mobile, the primary surface) for capture speed, safe-area insets, and the recap on a fresh browser/incognito (the true zero-install test).
- Sync test across two devices/sessions for §3.5.

---

## 7. Open questions for planning

- Tastes: dedicated tab vs Journal sub-view?
- Recap share token: per-trip static token vs revocable token; does it expose private notes? (No — private logistics must never appear in the public recap.)
- Sync depth in §3.5: realtime subscriptions only, or also a migration off single-shared-login toward per-traveller identities (likely out of scope for the personal app).
- Whether to split `index.html` into multiple `text/babel` script files for maintainability.
