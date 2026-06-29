# Explore Gemini Capture — Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Explore AI capture from one-place text/link into a multimodal, multi-place pipeline: paste/share/photograph anything and get one or more structured places, with high-confidence results auto-added and an Undo.

**Architecture:** Evolve the single `assistant` edge function so `place` mode returns `{ items: [...] }` (1..N) with a per-item `confidence`, accepting text, a URL, and/or images. The client gets an `aiCapture()` call and a `reviewItems()` router that auto-adds confident items (with Undo) and opens a review UI for the rest. Single-file React-via-CDN PWA, no build step.

**Tech Stack:** Deno edge function (`gemini-2.5-flash`), React 18 via esm.sh + Babel-in-browser, Supabase JS, lucide-react.

## Global Constraints

- **Scope:** root `index.html` + `supabase/functions/assistant/index.ts` only. Voyage is a separate repo — do not reference it.
- **No build step.** React-via-CDN + `<script type="text/babel">`. No bundler/npm/framework.
- **No-hallucination posture is non-negotiable.** Never invent hours, prices, dates, ratings, or claims not present in the input/linked page/image. Unknown field → empty string.
- **Backward compatibility:** the edge function must keep returning a legacy `place` (= `items[0]`) alongside `items`, so a not-yet-updated client never breaks during deploy.
- **Allowed enums (verbatim, server-validated):** `CATS = ["Eat & Drink", "See & Do", "Shop"]`; `CITIES = ["Paris", "Bordeaux", "Copenhagen", "London"]`; `TAGS` = the existing 16-tag list in `index.ts` (unchanged).
- **Caps:** ≤15 items returned; ≤4 images per request.
- **Confidence threshold for auto-add:** `0.7` (constant `AUTOADD_MIN`).
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **No automated test harness** (vanilla single-file app). Each task ends with a concrete manual/mechanical verification; pure-logic steps include a browser-console assertion.

## How to run / verify

```bash
cd ~/dev/le-grande-tour/.worktrees/foundation && python -m http.server 8080   # (python3 if needed)
# open http://localhost:8080/ in an incognito window; DevTools → Application → Service Workers → "Update on reload"
```

**Edge-function deploy + live test require Supabase access to project `bsbuhkzdebqobkpxtivb`.** If the implementer lacks credentials, the deploy and the authenticated live call are an **operator (user) step** — flag it, do not fake it. Deploy command:
```bash
supabase functions deploy assistant --project-ref bsbuhkzdebqobkpxtivb
```
(Alternatively the Supabase MCP `deploy_edge_function`.) A signed-in user JWT (from the running app's session) is needed to call the function directly.

## File Structure

- **Modify:** `supabase/functions/assistant/index.ts` — `place` mode → `items[]` + confidence + multimodal (Task 1).
- **Modify:** `index.html` — client `aiCapture()` (Task 2, near `aiSortPlace` ~line 486); `reviewItems()` + `MultiReview` component + undoable toast (Task 3); wire the Sort button and a new photo/file Add input in `Explore` (Task 4, component at line 1482).

---

### Task 1: Edge function — `place` mode returns `items[]` (text, URL, images)

**Files:**
- Modify: `supabase/functions/assistant/index.ts` — `PLACE_SCHEMA` (~lines 60–64), `SYS_PLACE` (~line 31), and the place-mode handler (~lines 158–191).

**Interfaces:**
- Produces: POST `{ mode:"place", input?:string, images?:[{mimeType,data}], enrich?:boolean }` → `{ items: [{name, city, cat, tag, area, note, confidence, sources}], place }` where `place = items[0] || {}`. `sources` is always `[]` in this task (enrichment is Plan step 4).

- [ ] **Step 1: Replace `SYS_PLACE`** (the `const SYS_PLACE = ...` line) with:

```ts
const SYS_PLACE = `You convert a traveller's raw note, a pasted link, or a photo into structured places for a trip app covering Paris, Bordeaux, Copenhagen, London. The input may describe ONE place or MANY (a list, an article, a screenshot of several places) — return every distinct place you find. Rules: choose category strictly from the allowed list; choose tag strictly from the allowed list; set city only if clearly implied, else leave empty; if the input is a URL, use the linked page's actual content to fill the fields; if the input is an image, read the place name and any visible details from it; NEVER invent facts (hours, prices, founding dates, ratings, claims) that are not present in the input, the linked page, or the image; the note field should only restate what the source actually says, concise, Australian English, no em dashes; if a field is unknown leave it empty; set confidence from 0 to 1 for how certain the structured fields are. Respond with a single JSON object only, shaped {"items":[ ... ]}, no markdown.`;
```

- [ ] **Step 2: Replace `PLACE_SCHEMA`** with a per-item schema and an items wrapper:

```ts
const PLACE_ITEM = {
  type: "object",
  properties: { name: { type: "string" }, city: { type: "string" }, cat: { type: "string", enum: CATS }, tag: { type: "string", enum: TAGS }, area: { type: "string" }, note: { type: "string" }, confidence: { type: "number" } },
  required: ["name", "cat", "tag"],
};
const PLACES_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: PLACE_ITEM } },
  required: ["items"],
};
```

- [ ] **Step 3: Replace the place-mode handler** (from `// ---- PLACE MODE:` through `return json({ place });`) with:

```ts
    // ---- PLACE MODE: note / link / photo(s) -> one or more structured places ----
    const input = (bodyIn?.input || "").toString().trim();
    const images = Array.isArray(bodyIn?.images) ? bodyIn.images : [];
    if (!input && !images.length) return json({ error: "empty input" }, 400);
    const isUrl = !images.length && /^https?:\/\//i.test(input);

    const baseText = `Allowed categories: ${CATS.join(", ")}. Allowed tags: ${TAGS.join(", ")}. Allowed cities: ${CITIES.join(", ")}.`
      + (input ? `\n\nRaw input: ${input}` : `\n\nExtract the place(s) shown in the attached image(s).`);
    const parts: any[] = [{ text: baseText }];
    for (const im of images.slice(0, 4)) {
      if (im?.data && im?.mimeType) parts.push({ inline_data: { mime_type: im.mimeType, data: im.data } });
    }
    const contents = [{ parts }];

    const buildPayload = (withTools: boolean) => {
      const p: any = {
        system_instruction: { parts: [{ text: SYS_PLACE }] },
        contents,
        // responseSchema cannot combine with tools, so the URL path relies on the
        // prompt + server-side validation below instead of a hard schema.
        generationConfig: withTools
          ? { responseMimeType: "application/json", maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } }
          : { responseMimeType: "application/json", responseSchema: PLACES_SCHEMA, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } },
      };
      if (withTools) p.tools = [{ url_context: {} }];
      return p;
    };

    // Links: read the page via url_context (no schema). Text/images: schema'd call.
    let txt = "";
    if (isUrl) { try { txt = extractText(await callGemini(K, buildPayload(true))); } catch (_) { txt = ""; } }
    if (!txt) { const g = await callGemini(K, buildPayload(false)); txt = extractText(g); if (!txt) return json({ error: "no result", detail: g?.error?.message || null }, 502); }

    let parsed: any;
    try { parsed = parseLooseJson(txt); } catch { return json({ error: "unparseable model output" }, 502); }
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : (parsed && parsed.name ? [parsed] : []);
    const items = rawItems.slice(0, 15).map((it: any) => ({
      name: (it?.name || "").toString().slice(0, 120),
      city: CITIES.includes(it?.city) ? it.city : "",
      cat: CATS.includes(it?.cat) ? it.cat : "",
      tag: TAGS.includes(it?.tag) ? it.tag : "",
      area: (it?.area || "").toString().slice(0, 120),
      note: (it?.note || "").toString().slice(0, 600),
      confidence: typeof it?.confidence === "number" ? Math.max(0, Math.min(1, it.confidence)) : 0.6,
      sources: [] as Array<{ title: string; url: string }>,
    })).filter((it: any) => it.name);

    return json({ items, place: items[0] || {} });
```

- [ ] **Step 4: Type-check the function locally** (no deploy yet):

Run: `cd ~/dev/le-grande-tour/.worktrees/foundation && deno check supabase/functions/assistant/index.ts`
Expected: no errors. (If `deno` is unavailable, read the file back and confirm: `SYS_PLACE`/`PLACE_ITEM`/`PLACES_SCHEMA` present; the old single-`place` return is gone; the handler returns `{ items, place }`.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/assistant/index.ts
git commit -m "Edge place mode: return items[] with confidence; accept images

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Deploy + live verify (operator step if no Supabase creds)**

Deploy: `supabase functions deploy assistant --project-ref bsbuhkzdebqobkpxtivb`
Verify (with a signed-in user JWT `$JWT` from the running app):
```bash
curl -s -X POST "https://bsbuhkzdebqobkpxtivb.supabase.co/functions/v1/assistant" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" \
  -d '{"mode":"place","input":"Bambino wine bar, a cosy natural-wine spot in Paris"}' | head -c 400
```
Expected: JSON with `"items":[{...,"name":"Bambino",...,"confidence":<number>}]` and a matching `"place"`. If deploy creds are unavailable, mark this step as handed to the operator and proceed — Tasks 2–4 can be built against the contract and verified together after deploy.

---

### Task 2: Client `aiCapture()`

**Files:**
- Modify: `index.html` — add `aiCapture` next to `aiSortPlace` (~line 486). Leave `aiSortPlace` in place (unused after Task 4, removed then).

**Interfaces:**
- Consumes: Task 1's `{ items, place }` response; existing `compressImage` (line 349) and `fileToBase64` (~line 513).
- Produces: `aiCapture({ input?, files?, enrich? }, accessToken) -> Promise<Array<{name,city,cat,tag,area,note,confidence,sources}>>`.

- [ ] **Step 1: Add the function** immediately after the `aiSortPlace` function:

```js
// Calls the assistant (place mode). Accepts free text or a URL (`input`) and/or
// image File objects (`files`); returns an array of structured place items.
// Throws on failure so callers can fall back to manual entry.
async function aiCapture({ input = "", files = [], enrich = false }, accessToken) {
  const images = [];
  for (const f of (files || []).slice(0, 4)) {
    let g = f;
    if (f.type && f.type.startsWith("image/")) { try { g = await compressImage(f); } catch (e) {} }
    images.push({ mimeType: g.type || f.type || "image/jpeg", data: await fileToBase64(g) });
  }
  const r = await fetch(`${SUPABASE_URL}/functions/v1/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${accessToken}` },
    body: JSON.stringify({ mode: "place", input, images, enrich }),
  });
  if (!r.ok) throw new Error("assistant request failed");
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return Array.isArray(j.items) ? j.items : (j.place && j.place.name ? [j.place] : []);
}
```

- [ ] **Step 2: Verify** by reading back: `aiCapture` defined once; references `compressImage` and `fileToBase64` (confirm both exist above it). Confirm the app still loads (serve, open, no console error on load).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add aiCapture() client: text/url/images -> place items[]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `reviewItems()` router + `MultiReview` sheet + undoable toast

**Files:**
- Modify: `index.html` — add an undoable-toast mechanism in `App()` (toast state ~line 705 region and the `{toast && ...}` render ~line 850); add a `MultiReview` component near `EditPlace` (line 1423); add `reviewItems` inside `Explore` (line 1482). Add CSS for the review list.

**Interfaces:**
- Consumes: `aiCapture` (Task 2); existing `ctx` (`addPlace` via `setState`+`db.addPlace`), `EXPLORE_CITIES`, `CATS`, `VIBES`, `flash`.
- Produces: `reviewItems(items, sourceInboxId?)` — auto-adds items with `confidence >= AUTOADD_MIN` and a non-empty `name` (toast "Added N · Undo"); for a single low-confidence item opens `EditPlace`; for multiple, opens `<MultiReview>`. Defines `const AUTOADD_MIN = 0.7;` at module top (near other consts).

- [ ] **Step 1: Add an undoable toast.** In `App()`, replace the toast state and render. Find `const [toast, setToast] = useState("");` and add below it:

```js
const [undo, setUndo] = useState(null); // { msg, fn } | null
const undoToast = (msg, fn) => { setUndo({ msg, fn }); setTimeout(() => setUndo(u => (u && u.fn === fn ? null : u)), 6000); };
```

Pass `undoToast` through `ctx` (find the `const ctx = {...}` object and add `undoToast`). Then find the toast render `{toast && <div className="toast">{toast}</div>}` and replace with:

```jsx
{toast && <div className="toast">{toast}</div>}
{undo && <div className="toast undo" onClick={() => { undo.fn(); setUndo(null); }}>{undo.msg} · <strong>Undo</strong></div>}
```

- [ ] **Step 2: Add the module-level constant.** Near the other top-level consts (e.g. after `const TYPE_META = {...}` or by `EXPLORE_CITIES`), add:

```js
const AUTOADD_MIN = 0.7;
```

- [ ] **Step 3: Add `reviewItems` inside `Explore`** (after `sortItem`, before `return (`):

```js
// Normalise a raw model item into a full place draft for this app.
const toDraft = (it) => ({
  id: uid(),
  city: EXPLORE_CITIES.includes(it.city) ? it.city : (EXPLORE_CITIES.includes(city) ? city : "Paris"),
  cat: CATS.includes(it.cat) ? it.cat : "Eat & Drink",
  tag: VIBES.includes(it.tag) ? it.tag : VIBES[0],
  name: it.name || "",
  area: it.area || "",
  note: it.note || "",
  sources: Array.isArray(it.sources) ? it.sources : [],
  confidence: typeof it.confidence === "number" ? it.confidence : 0.6,
});
const [review, setReview] = useState(null); // drafts[] for MultiReview, or null
// Route model items: auto-add the confident ones, review the rest.
const reviewItems = (items, sourceInboxId) => {
  const drafts = (items || []).map(toDraft).filter(d => d.name);
  if (!drafts.length) { flash("Nothing to add — fill it in"); if (sourceInboxId) { setInboxId(sourceInboxId); setEditing(toDraft({ name: "" })); } return; }
  const confident = drafts.filter(d => d.confidence >= AUTOADD_MIN);
  const rest = drafts.filter(d => d.confidence < AUTOADD_MIN);
  if (drafts.length === 1 && !confident.length) { setInboxId(sourceInboxId || null); setEditing(drafts[0]); return; }
  if (confident.length) {
    setState(s => ({ ...s, exploreAdded: [ ...(s.exploreAdded || []), ...confident ] }));
    confident.forEach(p => db.addPlace(p).catch(() => {}));
    if (sourceInboxId) removeCapture(sourceInboxId);
    const ids = new Set(confident.map(p => p.id));
    undoToast(`Added ${confident.length} place${confident.length > 1 ? "s" : ""}`, () => {
      setState(s => ({ ...s, exploreAdded: (s.exploreAdded || []).filter(p => !ids.has(p.id)) }));
      confident.forEach(p => db.deletePlace && db.deletePlace(p.id).catch(() => {}));
    });
  }
  if (rest.length) setReview(rest);
};
```

(Use `ctx.undoToast` — destructure `undoToast` from `ctx` at the top of `Explore` where `flash` etc. are destructured. If `db.deletePlace` does not exist, the undo still removes from local state; confirm `db.deletePlace` exists — it is used by the Explore delete flow — and keep the guard.)

- [ ] **Step 4: Add the `MultiReview` component** near `EditPlace` (before `function Explore`):

```jsx
function MultiReview({ drafts, onAdd, onEdit, onClose }) {
  const [picked, setPicked] = useState(() => new Set(drafts.map(d => d.id)));
  const toggle = (id) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Sheet title={`Add places · ${drafts.length} found`} onClose={onClose}>
      {drafts.map(d => (
        <div key={d.id} className={"reviewrow" + (picked.has(d.id) ? " on" : "")}>
          <button className="reviewcheck" onClick={() => toggle(d.id)} aria-label="Toggle"><Check size={15} /></button>
          <div className="reviewbody" onClick={() => onEdit(d)}>
            <div className="reviewname">{d.name}</div>
            <div className="xs">{[d.city, d.tag].filter(Boolean).join(" · ")}{d.confidence < AUTOADD_MIN ? " · check this one" : ""}</div>
          </div>
        </div>
      ))}
      <button className="primary" onClick={() => onAdd(drafts.filter(d => picked.has(d.id)))}>Add {picked.size} place{picked.size === 1 ? "" : "s"}</button>
    </Sheet>
  );
}
```

- [ ] **Step 5: Render `MultiReview`** in `Explore`'s return (next to where `EditPlace` is rendered, `{editing && <EditPlace .../>}`):

```jsx
{review && <MultiReview drafts={review}
  onEdit={(d) => { setReview(null); setEditing(d); }}
  onAdd={(chosen) => { setReview(null); if (chosen.length) { setState(s => ({ ...s, exploreAdded: [ ...(s.exploreAdded || []), ...chosen ] })); chosen.forEach(p => db.addPlace(p).catch(() => {})); flash(`Added ${chosen.length} place${chosen.length === 1 ? "" : "s"}`); } }}
  onClose={() => setReview(null)} />}
```

- [ ] **Step 6: Add CSS** (in the `Style()` block, near the `.capture`/`.tray` rules):

```css
.toast.undo{cursor:pointer;}
.reviewrow{display:flex;gap:11px;align-items:center;padding:11px 2px;border-top:1px solid var(--line);}
.reviewrow:first-of-type{border-top:none;}
.reviewcheck{width:24px;height:24px;flex:none;border-radius:0;background:var(--fill2);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;}
.reviewrow.on .reviewcheck{background:var(--accent);}
.reviewbody{flex:1;min-width:0;cursor:pointer;}
.reviewname{font-size:15.5px;font-weight:600;letter-spacing:-.01em;}
```

- [ ] **Step 7: Console-test the routing logic.** Serve, open console, paste:

```js
// Mirror of reviewItems' partition rule.
const AM = 0.7; const part = its => ({auto: its.filter(d=>d.confidence>=AM&&d.name), rest: its.filter(d=>d.confidence<AM&&d.name)});
const r = part([{name:"A",confidence:0.9},{name:"B",confidence:0.4},{name:"",confidence:0.95}]);
console.assert(r.auto.length===1 && r.auto[0].name==="A", "auto"); console.assert(r.rest.length===1 && r.rest[0].name==="B", "rest");
console.log("routing ok");
```
Expected: "routing ok", no assertion errors.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "Add confidence-based reviewItems + MultiReview sheet + undo toast

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire entry points — Sort (multi) + in-app photo/file Add

**Files:**
- Modify: `index.html` — rewrite `sortItem` to use `aiCapture` + `reviewItems`; add a photo/file input to the `.capture` UI; remove the now-unused `aiSortPlace`.

**Interfaces:**
- Consumes: `aiCapture` (Task 2), `reviewItems` (Task 3).

- [ ] **Step 1: Rewrite `sortItem`** to route through the new pipeline:

```js
const sortItem = async (it) => {
  setSorting(it.id);
  try {
    const items = await aiCapture({ input: it.raw }, session && session.access_token);
    reviewItems(items, it.id);
  } catch (e) {
    flash("Agent unavailable, fill it in");
    setInboxId(it.id);
    setEditing(toDraft({ name: "", note: it.raw }));
  }
  setSorting(null);
};
```

- [ ] **Step 2: Add a photo/file capture handler** in `Explore` (near `addCapture`):

```js
const [capturing, setCapturing] = useState(false);
const captureFiles = async (fileList) => {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (!canEdit) { flash("Sign in to capture"); return; }
  setCapturing(true);
  try {
    const items = await aiCapture({ files }, session && session.access_token);
    reviewItems(items);
  } catch (e) { flash("Couldn't read that — try again"); }
  setCapturing(false);
};
```

- [ ] **Step 3: Add the photo button** to the `.capture-row` (after the existing `capture-add` button):

```jsx
<label className="capture-photo" aria-label="Add a photo">
  <ImagePlus size={16} />
  <input type="file" accept="image/*" multiple capture="environment" onChange={e => { captureFiles(e.target.files); e.target.value = ""; }} />
</label>
```

(`ImagePlus` is already imported in the lucide import list.)

- [ ] **Step 4: Add CSS** for the photo button (near `.capture-add`):

```css
.capture-photo{width:42px;flex:none;background:var(--fill);color:var(--ink2);border-radius:0;display:flex;align-items:center;justify-content:center;cursor:pointer;}
.capture-photo input{display:none;}
.capture-photo:active{background:var(--fill2);}
```

- [ ] **Step 5: Remove the now-unused `aiSortPlace`** (the whole `async function aiSortPlace(...) {...}` block). Confirm no other reference remains:

Run: `grep -n "aiSortPlace" index.html`
Expected: no matches.

- [ ] **Step 6: Manual verification** (requires Task 1 deployed). Serve, sign in:
  1. Paste a single-place note → tap Sort → high confidence auto-adds with an "Added 1 place · Undo" toast; tap Undo → it's removed.
  2. Paste a link to an article listing several places → tap Sort → `MultiReview` sheet lists them, confident ones pre-checked → "Add N".
  3. Tap the photo button, pick a photo of a storefront/menu → places extracted and routed the same way.
  Expected: all three add places into the current city's Explore list; low-confidence items open the edit sheet.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Wire Sort + photo Add through aiCapture/reviewItems; drop aiSortPlace

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (against spec §3.1–§3.3, step 1 of the sequence)

- Edge `place` → `items[]` + confidence + multimodal → Task 1 ✓
- Backward-compatible `place` return → Task 1 Step 3 ✓
- Client `aiCapture` (text/url/images) → Task 2 ✓
- Confidence-based auto-add + Undo → Task 3 ✓
- Multi-item pick-list → Task 3 (`MultiReview`) ✓
- In-app photo/file Add → Task 4 ✓
- Sort routes through new pipeline → Task 4 ✓
- **Deferred to later plans (not gaps):** Share Target (step 2), auto-sort toggle (step 3), search-grounded enrichment + `sources` column (step 4), day-fit + dedupe (step 5).
- **Type consistency:** `aiCapture` returns the item shape Task 1 produces; `reviewItems`/`MultiReview`/`toDraft` all use `{name,city,cat,tag,area,note,confidence,sources}`; `AUTOADD_MIN` defined once and used in Task 3 + Task 4. `undoToast` added to `ctx` in Task 3 Step 1 and consumed in `reviewItems`.

---

## Steps 2–5 (to be detailed as their own plans after the core lands)

Each builds on this plan's `aiCapture`/`reviewItems`/`items[]` contract.

**Step 2 — Share Target plumbing.** Replace the data-URI manifest with a real `manifest.webmanifest` (identity + `share_target` POST multipart: title/text/url + image files); service-worker `fetch` handler intercepts `./?share-target`, stashes the payload (Cache/IDB), redirects to `./?shared=1`; app reads the payload on load and calls `aiCapture` → `reviewItems`. iOS unaffected (uses the in-app Add path).

**Step 3 — Auto-sort toggle.** Add a Trip settings sheet (gear in the header) with an "Auto-sort captures" toggle (default on) persisted in prefs; when on, `addCapture` runs `aiCapture` → `reviewItems` immediately instead of parking raw text in the tray.

**Step 4 — Search-grounded enrichment.** Edge: phase-2 `google_search` call for items missing `area`/`note`, returning a neighbourhood + one cited factual descriptor (≤ top 5 by confidence), attached as `sources`. Add `sources jsonb` to the `places` table (migration recorded in this plan, applied via dashboard/MCP) and persist/show citations. Client passes `enrich:true`; render a small source link.

**Step 5 — Day-fit + dedupe.** Client-side: `dayFit(place)` suggests itinerary day(s) whose city matches (quick "Plan for {day}" chips in `EditPlace`/`MultiReview`); `dedupe(name,city)` normalises and blocks duplicates against existing places, offering "enrich the existing one" instead.
