# Explore — Gemini Capture Uplift Design

**Date:** 2026-06-29
**Scope:** Root `index.html` (the le grande tour app) + the shared `supabase/functions/assistant/` edge function + PWA manifest/service-worker. The Voyage app is no longer in this repo (isolated 2026-06-29); this work is le-grande-tour-only.

---

## 1. Purpose

The Explore tab's AI capture is the app's "honest curation" wedge — it structures what the traveller feeds it without hallucinating. Today it is capable but underpowered and high-friction: text/link only, one place per input, a manual paste → "Sort" → confirm loop, and it leaves fields blank when the source doesn't contain them.

This uplift extracts the full capability of the existing Gemini integration while preserving the no-hallucination posture that differentiates the product. It makes capture effortless (share or photograph anything, from anywhere), richer (multiple places at once, blanks filled from cited web sources), and smarter (auto-sort, day-fit, dedupe).

### Agreed decisions (from brainstorming)
- **Scope:** the full roadmap (items 1–5) as one spec, built in sequence.
- **Capture entry points:** BOTH — Web Share Target on Android *and* an always-available in-app "Add photo/link" path that works on iOS and everywhere.
- **Review posture:** confidence-based. High-confidence results auto-add with a toast + Undo/Edit; low-confidence open the edit sheet.
- **Enrichment:** conservative + cited. Fill only empty structural fields (neighbourhood/area + one short factual descriptor) from Google Search grounding, with stored source links. Never invent hours, prices, or claims.

---

## 2. Current State (baseline)

Single edge function `assistant` (`gemini-2.5-flash`, `thinkingBudget: 0`), three modes:
- **place** — raw note OR pasted link → ONE structured place `{name, city, cat, tag, area, note}`. Links read via the `url_context` tool with a schema-only fallback. Strong anti-hallucination system prompt; server-side enum validation (`CATS`, `TAGS`, `CITIES`); key server-side; auth required.
- **story** — grounded trip recap from journal entries.
- **doc** — PDF/photo of a ticket → structured logistics (already multimodal via `inline_data`).

Client (`index.html`):
- `aiSortPlace(input, accessToken)` → POSTs `{input}` → returns one `place`.
- Explore flow: type/paste into the capture box → saved to the `inbox` table ("To sort" tray) → tap **Sort** → `aiSortPlace` → `EditPlace` sheet pre-filled → confirm → place added.
- Manifest is a **data-URI** in `index.html` (cannot support `share_target`). Service worker `sw.js` is network-first for navigations, stale-while-revalidate otherwise.

### Key API constraint
Gemini cannot combine a strict `responseSchema` with tools (`url_context`, `google_search`) in one call. Therefore capture is internally **two-phase**: *extract* (schema'd for text/image; `url_context` for links) → *enrich* (optional `google_search`, parsed loosely, validated server-side). The client still issues **one** request.

---

## 3. The Work

Architecture: **evolve the single `assistant` function** (chosen over splitting into multiple functions or client-side orchestration — one deploy surface, one client request, maximal reuse).

### 3.1 Edge function — `place` mode evolved into a capture pipeline

- **Input** (additive, backward-compatible): `{ mode:"place", input?: string, images?: [{mimeType, data}], enrich?: boolean }`. `input` may be free text or a URL (detected as today). `images` are base64 (no `data:` prefix), reusing the `doc` mode encoding path.
- **Output:** `{ items: [ {name, city, cat, tag, area, note, confidence, sources} ] }` — an **array** (1..N). `confidence` is a number 0–1. `sources` is `[{title, url}]` (empty unless enriched).
- **Phase 1 — extract:**
  - text and/or image(s): one multimodal `generateContent` call with `responseMimeType: "application/json"` + a `responseSchema` whose root is `{ items: [PLACE_ITEM] }` (no tools). `PLACE_ITEM` = current `PLACE_SCHEMA` fields + `confidence`.
  - URL input: `url_context` call (no schema, as today), parsed via `parseLooseJson`, coerced into `items[]`.
  - System prompt updated to: extract *every* distinct place present (a list/article/screenshot may contain many); set `confidence` per item (how sure the structured fields are); keep the existing no-invention rules.
  - Server-side per item: validate `cat`/`tag` against enums (drop if invalid), blank `city` if not in `CITIES`, clamp string lengths, default `confidence` to a mid value if absent. Cap at **15 items**.
- **Phase 2 — enrich (only when `enrich:true`):**
  - For items missing `area` OR `note`, issue a `google_search`-grounded call (no schema) asking ONLY for: a neighbourhood/area string and one short factual descriptor, plus the grounding sources. Parse loosely; attach `area`/`note`/`sources`. Explicitly forbid hours/prices/ratings/claims.
  - Cap enrichment to the **top 5** items by confidence to bound latency/cost. Items beyond the cap keep their phase-1 (possibly blank) fields.
  - Any failure here is swallowed — the item simply keeps its phase-1 state.
- Backward compatibility: a caller sending `{input}` with no `images`/`enrich` still works; if a single item is produced, the client handles the array of length 1 identically.

### 3.2 Client — capture entry points

- **In-app Add (universal):** extend the Explore capture area with a photo/file picker beside the existing paste box. Selecting image(s) routes through a new `aiCapture({input?, files?, enrich})` client function (supersedes `aiSortPlace`, which becomes a thin wrapper or is folded in). Images are compressed via the existing `compressImage` before base64.
- **Share Target (Android):** see §3.5.

### 3.3 Client — review, confidence, dedupe, day-fit

- **Multi-item review:** when `aiCapture` returns `items[]`:
  - Each item with `confidence ≥ THRESHOLD` (e.g. 0.7) and a non-empty `name` is **auto-added** to Explore, surfaced as a single toast: "Added N places · Undo". Undo removes them; tapping a chip opens `EditPlace`.
  - Items below threshold, or missing a name, are queued into the existing "To sort" tray / opened in `EditPlace` for confirmation. Multi-place shows a pick-list ("Add which?").
- **Dedupe:** before adding any item, normalise (`lowercase`, strip punctuation/accents) `name`+`city` and compare to existing merged places. On a match, do not create a duplicate — offer "Enrich the existing place" (fill its blank `area`/`note`/`sources`) instead.
- **Day-fit (client-side, no model):** when an item/place has a `city`, suggest the itinerary day(s) whose city matches, as quick "Plan for {day}" chips in `EditPlace` / the place card. Pure lookup over the existing `ITINERARY`.
- **Enrichment display:** where `sources` exist, show a small source link beside the area/note so provenance is visible.

### 3.4 Client — auto-sort toggle

- A setting (in the Trip settings sheet, see note) "Auto-sort captures": when ON, a capture runs `aiCapture` immediately on add (no manual "Sort" tap); when OFF, today's behaviour (capture lands in the tray, user taps Sort). Default ON.
- Note: this spec assumes a small **Trip settings sheet** exists or is added (a gear in the header). If not yet present, adding it is in scope as the host for this toggle (and it is also the natural home for the traveller-names UX change tracked separately).

### 3.5 PWA plumbing — Share Target

- Replace the data-URI manifest with a real **`manifest.webmanifest`** file, including:
  - existing identity (name, theme/background colour now `#F2F2F7`, icons — reuse the SVG icon or add PNGs), and
  - `share_target`: `{ action: "./?share-target", method: "POST", enctype: "multipart/form-data", params: { title, text, url, files: [{ name: "media", accept: ["image/*"] }] } }`.
- **Service worker** handles the share POST to `./?share-target`: intercept in the `fetch` handler, read the `FormData`, stash the shared text/url/image into a Cache (or IndexedDB), then `Response.redirect("./?shared=1")`. On load, the app checks for `?shared=1`, pulls the stashed payload, drops it into the capture flow (auto-sort if enabled), and clears it.
- iOS receives no Share Target (unsupported) but has the in-app Add path, so capability parity holds.

### 3.6 Data / schema

- Add an optional **`sources jsonb`** column to the `places` table (persists citations). Migration applied via Supabase (this repo has no migrations dir post-isolation; apply via the dashboard/MCP and record the SQL in the plan).
- `confidence` is **transient** — used for the auto-add decision, not stored.
- `inbox` rows may carry an optional image reference for shared/photographed captures awaiting sort (decide in planning: store the image in the photo bucket vs. process immediately). Default: process immediately when auto-sort is ON; otherwise store a thumbnail reference.

---

## 4. Error handling

- Extract failure (network/parse) → fall back to the manual `EditPlace` sheet pre-filled with the raw input, exactly as today's `catch` path ("Agent unavailable, fill it in").
- Enrich failure → silent; item keeps phase-1 fields.
- Share Target failure → the app still opens; payload simply absent.
- All server caps (15 items, 5 enrichments, length clamps, enum validation) enforced regardless of model output.

---

## 5. Testing & verification

No automated harness (vanilla single-file app); verification is manual per acceptance criteria. Pure-logic units are browser-console testable and should be exercised:
- dedupe normalisation (accent/punctuation/case folding; true/false matches),
- day-fit city→day matching (including multi-day cities and travel days),
- confidence thresholding (auto-add vs review routing).
Manual paths: in-app photo capture → review → add; multi-place article → pick-list; URL share on Android → tray; enrichment fills a blank area with a visible source; dedupe blocks a known duplicate.

---

## 6. Build sequence (one spec, sequenced)

1. **Multimodal + multi-item capture** — edge `place` mode returns `items[]` with confidence; client `aiCapture` + in-app photo/file Add; multi-item review with confidence-based auto-add + Undo. (Core; everything else builds on it.)
2. **Share Target plumbing** — real manifest + service-worker share handler (Android entry point).
3. **Auto-sort toggle** — Trip settings sheet (added if absent) + immediate-sort behaviour.
4. **Search-grounded enrichment** — phase-2 `google_search`, `sources` column + migration, citation display.
5. **Day-fit + dedupe** — client-side itinerary match and duplicate guard.

Each step is independently shippable.

---

## 7. Out of scope

- The Voyage app (now a separate repo).
- Generalising the hardcoded itinerary/cities (le grande tour is one real trip).
- AI generation of itineraries (commodity; not the wedge).
- The traveller-names display change, sub-10s journal capture, Tastes view, and shareable recap — tracked in their own specs/plans (Foundation Plan 2/3 and the UX-polish list). The Trip settings sheet added here (§3.4) is shared infrastructure they can reuse.

---

## 8. Open questions for planning

- `inbox` image handling: process-immediately vs store-thumbnail when auto-sort is OFF (§3.6).
- Confidence threshold value and whether it should be user-tunable (default 0.7, not tunable to start).
- Whether to persist enrichment `sources` on the place card UI permanently or only at review time (default: persist + show subtly).
- Exact `sources jsonb` shape and RLS (anon read of `sources` alongside the existing public-read place fields).
