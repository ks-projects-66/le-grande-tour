# Explore Share Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an installed Android PWA receive a shared link or photo from another app (Safari/Chrome/Maps/Instagram) straight into Explore's capture pipeline, with zero copy-paste.

**Architecture:** A real `manifest.webmanifest` declares a `share_target` POST action. The service worker intercepts that POST, stashes the shared text/url/file in a Cache, and redirects to `./?shared=1`. On load the app reads the stashed payload, switches to Explore, and routes it into the existing `aiCapture()` → `reviewItems()` pipeline. iOS (no Share Target support) is unaffected — it keeps the in-app photo/link Add already shipped.

**Tech Stack:** Web App Manifest + Web Share Target API (Android/Chromium), service worker (Cache API), React 18 via esm.sh + Babel-in-browser.

## Global Constraints

- **Scope:** `index.html`, `sw.js`, and two new static files (`manifest.webmanifest`, `icon.svg`) only. le-grande-tour only — Voyage is a separate repo.
- **No build step.** No bundler/npm/framework. No new runtime dependencies.
- **Builds on shipped code:** `aiCapture({input?, files?, enrich?}, accessToken)` and, inside `Explore`, `reviewItems(items, sourceInboxId?)`, `captureFiles(fileList)`, `addCapture()`, and `const [sorting, setSorting]`. Do not change their contracts; only call them.
- **Platform reality:** Web Share Target works only on an installed Chromium-Android PWA; iOS will not receive shares (it uses the existing in-app Add). Do not break iOS.
- **Keep the flat identity / existing palette.** Manifest colours: `theme_color`/`background_color` = `#F2F2F7` (matches the current data-URI manifest). Icon fill `#41599C` (current accent).
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **No automated test harness.** Each task ends with mechanical verification + a documented manual/device check. Full end-to-end requires an Android device with the PWA installed — flag that, don't fake it.

## How to verify
Serve locally and use Chrome DevTools:
```bash
cd ~/dev/le-grande-tour/.worktrees/foundation && python -m http.server 8080   # python3 if needed
# http://localhost:8080/  → DevTools → Application → Manifest (check share_target) and Service Workers
```
Note: a localhost origin can't fully exercise the OS share sheet; Task 3 includes a console harness that simulates the stashed payload so the client path is testable without a device.

## File Structure
- **Create:** `manifest.webmanifest` (root) — identity + icons + `share_target`.
- **Create:** `icon.svg` (root) — the app logo, referenced by the manifest.
- **Modify:** `index.html` — line 14 manifest `<link>` → real file; add the App-side shared-payload reader; thread `pendingShare` through `ctx`; consume it in `Explore`; refactor `addCapture` to accept optional text.
- **Modify:** `sw.js` — intercept the `share-target` POST; bump `VERSION`; preserve the share cache across activate cleanup.

---

### Task 1: Real manifest + icon + `share_target` declaration

**Files:**
- Create: `manifest.webmanifest`, `icon.svg`
- Modify: `index.html:14`

**Interfaces:**
- Produces: a manifest at `./manifest.webmanifest` declaring `share_target.action = "./share-target"` (POST, multipart; params `title`/`text`/`url` + files field `media`, accept `image/*`).

- [ ] **Step 1: Create `icon.svg`** with this exact content:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="42" fill="#41599C"/><path d="M50 130 L132 90 L50 50 L50 84 L104 90 L50 96 Z" fill="#ffffff"/></svg>
```

- [ ] **Step 2: Create `manifest.webmanifest`** with this exact content:

```json
{
  "name": "Le Grand Tour",
  "short_name": "Le Grand Tour",
  "description": "Our European trip — plan it, live it, relive it.",
  "display": "standalone",
  "background_color": "#F2F2F7",
  "theme_color": "#F2F2F7",
  "start_url": "./",
  "scope": "./",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ],
  "share_target": {
    "action": "./share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [{ "name": "media", "accept": ["image/*"] }]
    }
  }
}
```

- [ ] **Step 3: Point index.html at the real manifest.** Replace the entire line 14 (`<link rel="manifest" href="data:application/manifest+json,...">`) with:

```html
<link rel="manifest" href="manifest.webmanifest">
```

Leave the `<link rel="icon">` and `<link rel="apple-touch-icon">` data-URI SVGs (lines 12–13) unchanged — they remain the favicon/home-screen icon.

- [ ] **Step 4: Verify.** Serve; open DevTools → Application → Manifest.
Expected: manifest loads with name "Le Grand Tour", the icon renders, and a "Share target" entry shows `action: ./share-target`. No console manifest error. `curl -s localhost:8080/manifest.webmanifest | head` returns the JSON.

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest icon.svg index.html
git commit -m "Add real web manifest with share_target + svg icon

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Service worker handles the share-target POST

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: the `share-target` POST declared in Task 1.
- Produces: on that POST, stashes `__shared_meta` (JSON `{title,text,url,hasFile}`) and optionally `__shared_file` (the image Response) into the `lgt-share` cache (keyed by `new URL("__shared_*", self.location)`), then 303-redirects to `./?shared=1`.

- [ ] **Step 1: Bump the cache version.** Change `const VERSION = "lgt-v3";` to:

```js
const VERSION = "lgt-v4";
```

- [ ] **Step 2: Preserve the share cache across activate cleanup.** In the `activate` handler, change the filter line `await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));` to:

```js
    await Promise.all(keys.filter((k) => k !== VERSION && k !== "lgt-share").map((k) => caches.delete(k)));
```

- [ ] **Step 3: Intercept the share POST.** In the `fetch` handler, the current second line is `if (req.method !== "GET") return;`. Replace that line with the share-target handler followed by the original guard:

```js
  // Web Share Target: stash the shared payload, then redirect into the app.
  if (req.method === "POST") {
    let u;
    try { u = new URL(req.url); } catch (_) { return; }
    if (u.pathname.endsWith("/share-target")) {
      e.respondWith((async () => {
        try {
          const form = await req.formData();
          const meta = {
            title: (form.get("title") || "").toString(),
            text: (form.get("text") || "").toString(),
            url: (form.get("url") || "").toString(),
            hasFile: false,
          };
          const file = form.get("media");
          const cache = await caches.open("lgt-share");
          if (file && typeof file !== "string" && file.size) {
            await cache.put(new URL("__shared_file", self.location), new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream" } }));
            meta.hasFile = true;
          }
          await cache.put(new URL("__shared_meta", self.location), new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
        } catch (_) {}
        return Response.redirect("./?shared=1", 303);
      })());
      return;
    }
  }
  if (req.method !== "GET") return;
```

- [ ] **Step 4: Verify (mechanical).** Read `sw.js` back and confirm: `VERSION` is `lgt-v4`; the activate filter excludes `lgt-share`; the fetch handler has the POST `share-target` branch that writes `__shared_meta`/`__shared_file` to the `lgt-share` cache and `Response.redirect("./?shared=1", 303)`; the original `if (req.method !== "GET") return;` still follows. Serve, hard-reload, and in DevTools → Application → Service Workers confirm the new worker (`lgt-v4`) activates without error.

- [ ] **Step 5: Commit**

```bash
git add sw.js
git commit -m "Service worker: stash Web Share Target payload, redirect to ?shared=1

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: App reads the shared payload and routes it into capture

**Files:**
- Modify: `index.html` — `App()` (mount effect + `pendingShare` state + `ctx`); `Explore` (consume effect + `addCapture` refactor).

**Interfaces:**
- Consumes: the `lgt-share` cache entries from Task 2; shipped `aiCapture`, `reviewItems`, `captureFiles`, `addCapture`, `setSorting`, `db.addInbox`, `uid`, `flash`, `session`.
- Produces: `ctx.pendingShare` (`{input, file} | null`) and `ctx.setPendingShare`. `Explore` consumes and clears it.

- [ ] **Step 1: Add `pendingShare` state + reader effect in `App()`.** After the `const [state, setState] = useState(emptyState);` line, add:

```js
const [pendingShare, setPendingShare] = useState(null);
useEffect(() => {
  let sp; try { sp = new URLSearchParams(location.search); } catch (e) { return; }
  if (sp.get("shared") !== "1") return;
  (async () => {
    let meta = null, file = null;
    try {
      const cache = await caches.open("lgt-share");
      const metaRes = await cache.match(new URL("__shared_meta", location.href));
      if (metaRes) meta = await metaRes.json();
      const fileRes = await cache.match(new URL("__shared_file", location.href));
      if (fileRes) { const blob = await fileRes.blob(); file = new File([blob], "shared", { type: blob.type || "image/jpeg" }); }
      await cache.delete(new URL("__shared_meta", location.href));
      await cache.delete(new URL("__shared_file", location.href));
    } catch (e) {}
    const input = meta ? (meta.url || meta.text || meta.title || "") : "";
    if (file || input) { setPendingShare({ input, file }); setTab("explore"); }
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  })();
}, []);
```

- [ ] **Step 2: Pass it through `ctx`.** Find the `const ctx = { ... };` object in `App()` and add `pendingShare, setPendingShare` to it (e.g. `const ctx = { state, setState, setLocal, tIndex, copy, flash, uid, setTab, canEdit, refresh, db, session, undoToast, pendingShare, setPendingShare };` — keep all existing keys, just append the two).

- [ ] **Step 3: Refactor `addCapture` to accept optional text.** In `Explore`, change `const addCapture = () => { const text = cap.trim(); ... }` so it accepts an optional argument and only clears the box for manual entry:

```js
const addCapture = (text0) => {
  const text = (typeof text0 === "string" ? text0 : cap).trim();
  if (!text) return;
  if (!canEdit) { flash("Sign in to capture"); return; }
  const item = { id: uid(), raw: text, kind: text.toLowerCase().startsWith("http") ? "link" : "note", city: "", sorted: false, created_at: new Date().toISOString() };
  setState(s => ({ ...s, inbox: [item, ...(s.inbox || [])] }));
  if (typeof text0 !== "string") setCap("");
  db.addInbox(item).catch(() => flash("Could not save capture"));
};
```

(The existing inline `onClick={addCapture}` and `onKeyDown` Enter handler still work — React passes an event arg, which is not a string, so it falls back to `cap`.)

- [ ] **Step 4: Consume `pendingShare` in `Explore`.** Destructure `pendingShare, setPendingShare` from `ctx` (alongside `flash, session, undoToast`). Add this effect after `reviewItems` is defined (so it is in scope):

```js
useEffect(() => {
  if (!pendingShare) return;
  const { input, file } = pendingShare;
  setPendingShare(null);
  if (file) { captureFiles([file]); return; }
  if (!input) return;
  (async () => {
    setSorting("__shared");
    try {
      const items = await aiCapture({ input }, session && session.access_token);
      reviewItems(items);
    } catch (e) { addCapture(input); flash("Saved to sort — agent unavailable"); }
    setSorting(null);
  })();
}, [pendingShare]);
```

- [ ] **Step 5: Console harness verification** (simulates a share without a device). Serve, sign in, open console, run:

```js
// Simulate the SW having stashed a shared link, then re-trigger the reader.
const c = await caches.open("lgt-share");
await c.put(new URL("__shared_meta", location.href), new Response(JSON.stringify({url:"https://example.com/bambino-paris-wine-bar", text:"", title:"", hasFile:false}), {headers:{"Content-Type":"application/json"}}));
location.href = location.pathname + "?shared=1";
```
Expected: the app reloads, switches to the **Explore** tab, runs the agent on the shared URL, and shows the review result (auto-add toast or MultiReview/edit sheet); the `?shared=1` is stripped from the URL; the `lgt-share` cache entries are gone afterward (`(await (await caches.open("lgt-share")).keys()).length === 0`).

- [ ] **Step 6: Document the real device test** (cannot be done here). On an Android phone: open the deployed site in Chrome → install ("Add to Home screen") → from another app (e.g. Chrome/Maps) use Share → "Le Grand Tour" → confirm the link/photo lands in Explore and is processed. Record the result when run.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Route Web Share Target payload into Explore capture on load

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (against spec §3.5)

- Real `manifest.webmanifest` replacing the data-URI manifest, with `share_target` → Task 1 ✓
- SW intercepts the share POST, stashes payload, redirects `./?shared=1` → Task 2 ✓
- App reads payload on load, routes to `aiCapture`/`reviewItems` → Task 3 ✓
- iOS unaffected (no SW POST happens; in-app Add path untouched) → preserved ✓
- **Type consistency:** `pendingShare` shape `{input, file}` produced in App Step 1, consumed in Explore Step 4; cache keys `new URL("__shared_meta"/"__shared_file", …)` identical in SW (Task 2) and client (Task 3); `addCapture(text0?)` refactor keeps the existing no-arg/event call working.
- **Deferred (later plan):** the manifest icon is a single SVG (`sizes:"any"`); if Chrome Android refuses install without a raster icon, add a 192/512 PNG — noted as a follow-up, not done here (no image tooling, no-dep constraint).
- **Known limit:** full OS-share E2E needs an installed Android PWA (Task 3 Step 6); the console harness (Step 5) covers the client path meanwhile.
