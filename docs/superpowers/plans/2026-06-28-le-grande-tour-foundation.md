# Le Grande Tour — Foundation (Design-System Evolution) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve le grande tour's visual craft (per-type colour, dark mode, type hierarchy, skeleton loaders, photo-forward heroes) without reskinning it — the same app, sharper.

**Architecture:** All changes live in the single root `index.html` (React-via-CDN, Babel-in-browser, no build step). Colour/shape are already fully tokenized in the `:root` block inside the `Style()` component, so most work is editing tokens plus a small number of component touch-points. No new dependencies.

**Tech Stack:** React 18 via esm.sh, Babel standalone (in-browser), lucide-react, Supabase JS, Leaflet, Manrope (Google Fonts). Plain CSS custom properties.

## Global Constraints

- **Scope: root `index.html` ONLY.** Do not touch `app/` (Voyage white-label, worked on in another session), `voyage/`, or `supabase/`.
- **No build step.** Stay with React-via-CDN + `<script type="text/babel">`. Do not add a bundler, npm, or framework.
- **Typeface: Manrope only. NO serif.** `--serif` may remain an alias of Manrope but no new font is loaded.
- **Preserve the deliberately flat identity.** `border-radius:0` is intentional across the app (see the explicit comment near the `@media (min-width:1000px)` block). Do NOT round elements. The only pre-existing soft corners are the recap keepsake surfaces (`.recaphero` 22px, `.tripmap`/`.storycard` 18px, `.storybtn` 14px) — leave those as the keepsake exception.
- **Keep the base palette:** `--bg:#F2F2F7`, `--surface:#FFFFFF`, `--ink:#1D1D1F`, `--accent:#1F4DE6` (light mode).
- **No automated test harness exists** (vanilla single-file app). Each task ends with a concrete **manual verification checkpoint** — exact steps + expected observation. Where a task adds pure logic, a browser-console assertion is included.
- **Commit message trailer** (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Branch:** work on a dedicated branch off the current one; never stage `app/index.html`.

## How to run / verify

The app is a static PWA. Serve it locally (do not open via `file://` — the import map + service worker need http):

```bash
cd ~/dev/le-grande-tour && python -m http.server 8080
# open http://localhost:8080/  (use an incognito window to avoid stale service-worker/localStorage)
```

To force-refresh after edits: DevTools → Application → Service Workers → "Update on reload" + "Bypass for network", then hard-reload.

## File Structure

- **Modify only:** `C:\Users\CS2608\dev\le-grande-tour\index.html`
  - `:root` token block — currently lines ~1876–1890 (inside `function Style()`).
  - Dark-mode additions — appended inside the same `<style>` template string.
  - `TYPE_META` — lines ~652–656 (no change needed; consumes the `--c-*` tokens already).
  - Header/topbar JSX — the `.syncactions`/`.topbar` area around lines ~798–820 (theme toggle).
  - `<meta name="theme-color">` — line 7 (updated dynamically by the toggle).
  - `App()` loading state — around lines ~697–800 (skeletons).
  - `Today()` hero — around lines ~984–1076 (photo-forward).
  - A new `Skeleton` helper component near the other small components (`Card`, `Stat`, ~lines 1787–1810).

---

### Task 1: Token foundation + warm per-type palette

**Files:**
- Modify: `index.html` `:root` block (~lines 1876–1890)

**Interfaces:**
- Produces: CSS custom properties `--space-1`…`--space-8`, `--radius` (=0, flat default), `--radius-soft` (keepsake only), `--elev-1`, `--elev-2`, and the warm `--c-meal/-bg`, `--c-wine/-bg`, `--c-sight/-bg`, `--c-moment/-bg` values. `TYPE_META` (line 653) already references `var(--c-meal)` etc., so the palette change propagates with no JSX edits.

- [ ] **Step 1: Edit the `:root` block** — replace the per-type lines and add scales. Find (lines 1881–1886):

```css
--c-meal:var(--accent); --c-meal-bg:var(--powder);
--c-wine:var(--accent); --c-wine-bg:var(--powder);
--c-sight:var(--accent); --c-sight-bg:var(--powder);
--c-moment:var(--accent); --c-moment-bg:var(--powder);
--shadow:0 1px 2px rgba(0,0,0,.04),0 0 1px rgba(0,0,0,.04);
--shadow-float:0 6px 24px rgba(0,0,0,.10);
```

Replace with:

```css
--c-meal:#C2410C; --c-meal-bg:#FBEAE0;
--c-wine:#9A1B3D; --c-wine-bg:#F7E3EA;
--c-sight:#0E7C7B; --c-sight-bg:#DCF0EF;
--c-moment:#6D28D9; --c-moment-bg:#ECE4FB;
--shadow:0 1px 2px rgba(0,0,0,.04),0 0 1px rgba(0,0,0,.04);
--shadow-float:0 6px 24px rgba(0,0,0,.10);
--elev-1:var(--shadow); --elev-2:var(--shadow-float);
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px; --space-8:32px;
--radius:0px; --radius-soft:18px;
color-scheme:light;
```

- [ ] **Step 2: Verify per-type colour** — serve the app, sign in / view the trip, open the **Journal** tab (diary view). 
Expected: Meal entries show a **burnt-orange** icon on pale-orange; Wine **maroon**; Sight **teal**; Moment **purple**. The type tabs in the add-entry form show the matching colour when selected. No layout shift.

- [ ] **Step 3: Verify nothing else regressed** — click through Today, Days, Explore, Tour. 
Expected: identical to before except journal-type colour. Everything still flat (radius 0); shadows unchanged.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Switch on warm per-type journal palette; add spacing/elevation tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dark mode

**Files:**
- Modify: `index.html` — append a dark-theme block to the `<style>` string; add a theme toggle button in the header; add a small theme controller in `App()`; update `<meta name="theme-color">` (line 7).

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: a `[data-theme="dark"]` attribute on `document.documentElement`, persisted in `localStorage` under `lgt:theme` (values `"light"|"dark"`); a header toggle button.

- [ ] **Step 1: Add dark token overrides.** Inside the `Style()` template string, immediately AFTER the closing `}` of the `:root{…}` rule (after line 1890), insert:

```css
:root[data-theme="dark"]{
--bg:#0B0B0D; --surface:#16161A; --fill:#202026; --fill2:#2A2A31;
--ink:#F2F2F5; --ink2:#A8A8B0; --muted:#7C7C85;
--accent:#5B7DFF; --accent-d:#7A95FF; --powder:#1C2440; --powder2:#26315C;
--paper:#0B0B0D; --paper2:#16161A; --card:#16161A; --line:#26262E; --line2:#33333C;
--c-meal:#F2935C; --c-meal-bg:#3A241A;
--c-wine:#E891A8; --c-wine-bg:#3A1F28;
--c-sight:#5FBDBB; --c-sight-bg:#13302F;
--c-moment:#B79AF0; --c-moment-bg:#241C3A;
--shadow:0 1px 2px rgba(0,0,0,.5),0 0 1px rgba(0,0,0,.6);
--shadow-float:0 8px 30px rgba(0,0,0,.6);
color-scheme:dark;
}
:root[data-theme="dark"] .topbar{background:rgba(11,11,13,.82);}
:root[data-theme="dark"] .tabbar{background:rgba(22,22,26,.82);box-shadow:0 -1px 0 rgba(255,255,255,.05);}
:root[data-theme="dark"] .toast{background:rgba(240,240,245,.14);}
:root[data-theme="dark"] body{background:#0B0B0D;}
@media (min-width:1000px){
:root[data-theme="dark"] body{background:linear-gradient(180deg,#08080A 0%,#101014 100%);}
:root[data-theme="dark"] .app{box-shadow:0 0 0 1px rgba(255,255,255,.05),0 30px 90px rgba(0,0,0,.6);}
}
```

Note: `.recaphero` keeps its blue gradient in both themes (it is the keepsake accent — intentional). White button text (`#fff` on `--accent`) stays legible because dark `--accent` is `#5B7DFF`.

- [ ] **Step 2: Add the theme controller in `App()`.** Near the top of `App()` (after the existing `useState` declarations, ~line 715), add:

```jsx
const [theme, setTheme] = useState(() => {
  try { return localStorage.getItem("lgt:theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch(e){ return "light"; }
});
useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0B0B0D" : "#F2F2F7");
  try { localStorage.setItem("lgt:theme", theme); } catch(e){}
}, [theme]);
```

- [ ] **Step 3: Add the toggle button.** In the header actions row (the `.syncactions` / share area around line 817, where `<button className="signout"...>Share</button>` lives), add a toggle button next to Share. Import the icons first: add `Moon, Sun as SunIcon` to the lucide import on line 40–44 (use `Moon` and reuse existing `Sun`). Then add:

```jsx
<button className="signout" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} aria-label="Toggle theme">
  {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
</button>
```

(`Sun` is already imported on line 40; add only `Moon` to the import list.)

- [ ] **Step 4: Verify the toggle.** Serve, hard-reload, click the toggle in the header.
Expected: the entire app flips to a dark theme (ground near-black, surfaces dark gray, text light); per-type colours remain distinct and legible; the blue accent brightens; the recap hero keeps its blue gradient; the OS status-bar/theme-color updates. Reload — the choice persists.

- [ ] **Step 5: Verify legibility across screens** in dark mode: Today hero, Days accordion, Journal diary + gallery, Explore place cards, Tour recap (map tiles, story card, stats). 
Expected: no invisible text, no white-on-white, photo viewer still dark. Note any low-contrast spot and fix the offending token override before committing.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Add dark mode with persisted theme toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Typography intent pass

**Files:**
- Modify: `index.html` `<style>` — targeted weight/tracking on stat numbers and section headers.

**Interfaces:**
- Consumes: nothing new. Pure CSS polish on existing classes.

- [ ] **Step 1: Tighten the big numbers.** Find `.stat-v` (line 1975) and `.dc-num` (line 1984) and `.daychip-num` (line 1900). Confirm they already carry `font-variant-numeric:tabular-nums` (via `.mono,.stat-v,.daychip-num,.dc-num` on line 1894 — yes). Update `.stat-v` to:

```css
.stat-v{font-size:21px;font-weight:800;line-height:1;letter-spacing:-.03em;}
```

- [ ] **Step 2: Strengthen section labels** for clearer hierarchy. Find `.section-label` (line 1912) and update to:

```css
.section-label{font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin:24px 6px 8px;}
```

- [ ] **Step 3: Verify.** Serve, view Today (mini stats), Journal (journal-stats), and any screen with section labels.
Expected: stat numbers read slightly bolder/tighter; section labels read as deliberate uppercase eyebrows. No overflow or wrapping regressions on mobile width (≤520px). Toggle dark mode — still good.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Type hierarchy: bolder/tighter stats, eyebrow section labels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Skeleton loaders

**Files:**
- Modify: `index.html` — add a `Skeleton` component, a skeleton CSS rule, and render it in `App()` during the initial data fetch.

**Interfaces:**
- Consumes: existing `loading`/data-ready state in `App()`. (Confirm the variable name by reading `App()` ~lines 697–800; the app gates the first render on a load flag and/or `shared` being null. Use whichever flag is already true before first data arrives.)
- Produces: `<Skeleton variant="today" />` rendered in place of the active page while initial data is loading.

- [ ] **Step 1: Add the skeleton CSS.** Append inside the `<style>` string (e.g. after the `.toast` rule, line 2031):

```css
.skel{background:linear-gradient(100deg,var(--fill) 30%,var(--fill2) 50%,var(--fill) 70%);background-size:200% 100%;animation:shimmer 1.25s linear infinite;border-radius:var(--radius);}
@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.skel-hero{height:150px;margin-bottom:12px;}
.skel-line{height:14px;margin-bottom:10px;}
.skel-line.short{width:55%;} .skel-line.mid{width:75%;}
.skel-card{height:84px;margin-bottom:10px;}
@media (prefers-reduced-motion:reduce){.skel{animation:none;}}
```

- [ ] **Step 2: Add the `Skeleton` component.** Near `Card`/`Stat` (~line 1787), add:

```jsx
function Skeleton() {
  return (
    <div className="page" aria-hidden="true">
      <div className="skel skel-hero" />
      <div className="skel skel-line mid" />
      <div className="skel skel-line short" />
      <div className="skel skel-card" />
      <div className="skel skel-card" />
      <div className="skel skel-card" />
    </div>
  );
}
```

- [ ] **Step 3: Render it during load.** In `App()`, where the active page/tab is rendered inside `.scroll`, gate the first paint: when the initial-load flag is still true AND there is no cached `euro26:shared` data yet, render `<Skeleton />` instead of the page component. (Read the render section ~lines 795–840 to wire it to the existing flag; do not introduce a second source of truth.)

- [ ] **Step 4: Verify.** DevTools → Network → throttle to "Slow 3G", clear `euro26:shared` (Application → Local Storage), hard-reload.
Expected: a shimmering skeleton (hero + lines + cards) appears before content, then content replaces it. With "Reduce motion" on, the skeleton shows but does not shimmer. Toggle dark mode — skeleton uses dark fills.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Add skeleton loaders for initial data fetch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Photo-forward Today hero

**Files:**
- Modify: `index.html` `Today()` (~lines 984–1076) — prefer a real trip photo for the hero image; fall back to the existing city hero.

**Interfaces:**
- Consumes: `state.journal` (entries carry `photos:[{src,...}]`, `city`, `day`), the current day index, and the existing city-hero lookup (`CITY_HERO`/the `.hero-img` already rendered in Today).
- Produces: a `heroPhoto(state, dayIndex, city)` helper returning a photo `src` or `null`.

- [ ] **Step 1: Add the selector** near the other helpers (top-level, e.g. after `mergedPlaces`, ~line 187):

```js
function heroPhoto(state, dayIndex, city) {
  const j = (state.journal || []);
  // Prefer a photo logged on this exact day, else any photo from this city.
  const sameDay = j.find(e => e.day === dayIndex && e.photos && e.photos.length);
  if (sameDay) return sameDay.photos[0].src;
  const sameCity = j.find(e => e.city === city && e.photos && e.photos.length);
  return sameCity ? sameCity.photos[0].src : null;
}
```

- [ ] **Step 2: Use it in the hero.** In `Today()`, where the hero image (`.hero-img`) is rendered, compute `const hp = heroPhoto(ctx.state, dayIndex, day.city);` and use `hp` as the `src` when present, otherwise the existing city-hero image. Keep `loading="lazy"` and the existing alt text. Do not change the markup/classes otherwise.

- [ ] **Step 3: Verify with a real photo.** Sign in, log a journal entry **with a photo** on today's day (or a city you can set as current). Return to Today.
Expected: the Today hero shows *your* photo, not the stock city image. On a day/city with no photos, the stock city hero still shows (fallback). Lazy-load and flat crop unchanged. Works in dark mode.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Today hero prefers a real trip photo, falls back to city stock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (against the spec §3.1)

- Per-type warm palette → Task 1 ✓
- Dark mode (derived from tokens) → Task 2 ✓
- Type hierarchy intent (no serif) → Task 3 ✓
- Skeleton loaders → Task 4 ✓
- Photo-forward heroes → Task 5 ✓ (Today hero; day-card heroes deferred to a follow-up — see note)
- Spacing scale tokens → Task 1 introduces them; **applying** `--space-*` across existing rules is deliberately NOT done here (it is invisible churn and risks regressions). The tokens exist for new components (Plans 2–3) to consume. Flagged as a conscious YAGNI deferral.
- Radius consistency → resolved as "preserve flat identity"; no rounding. Documented in Global Constraints.

**Deferred to follow-up (not gaps, conscious scope cuts):** day-card photo heroes (Task 5 covers Today only — extend after confirming the Today treatment lands well); retrofitting `--space-*` onto existing CSS.

---

## Plans 2 & 3 (to be detailed after Foundation merges)

These are outlined, not yet step-detailed, because their exact edits depend on the tokens, `Skeleton`, and `heroPhoto` helper this plan introduces. Each is independently shippable.

**Plan 2 — Capture + Tastes + Sync hardening**
- *Sub-10s capture:* a persistent floating `+` (new `.fab` component, rendered in `App()` outside `.scroll`); on tap opens the photo picker immediately; on pick renders a minimal capture card (type auto-guess via time-of-day, autofocus name, you/her star rows, Save) reusing the existing journal-entry create + photo-compression + Supabase upload path; "rate later" routes to the existing "still to rate" queue. Pure-logic unit (browser-console testable): `guessType(date)` and the <10s/<4-tap path.
- *Tastes view:* new tab (decision: tab vs Journal sub-view — resolve at plan time) with a reusable `bestOf(journal, {type, city})` selector returning entries ranked by combined `you+her`, a dual-rating display, city/type filters, and a "you vs her" agreement/divergence view. Pure-logic unit testable: `bestOf(...)` ordering and tie-breaks.
- *Sync hardening:* add Supabase realtime subscriptions on `journal_entries`, `places`, `place_status`, `inbox`; per-row `updated_at` merge instead of blind overwrite; keep offline cache + stale banner. Acceptance: edit on device A appears on device B within seconds; concurrent edits lose nothing.

**Plan 3 — Shareable zero-install recap**
- A public, no-login recap view of the SPA keyed by a share token, reading already-public data (mirror the `euro26:shared` public-read pattern; confirm RLS allows anon read). Scroll-driven, photo-forward, Manrope display weights (no serif): header/route, Leaflet map (reuse), stats, Tastes best-of (consumes Plan 2's `bestOf`), photo highlights, grounded `aiStory`. Add Open Graph/Twitter meta for rich link previews. Extend the existing Share button to copy the share URL. **Never expose private notes.** Acceptance: logged-out incognito browser opens the link and sees the full styled recap; link previews richly.
