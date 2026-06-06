# BRAND.md — Le Grand Tour

**Status:** Living document. This is the source of truth for the app's intent and design.
**Version:** 0.3
**Owner:** Karim
**Scope:** Current instance is the Euro 2026 trip. The brand and architecture are written to generalise to any future trip.

---

## 1. App intent

### 1.1 North star
A **living, personal travel companion** that is useful from the first hour of the trip and gets better in your hands as the trip unfolds. Not a brochure, not a generic itinerary template. A tool grounded in this trip's real flights, dates, bookings, places and decisions.

### 1.2 Jobs to be done
The app exists to answer, fast and correctly:

1. **What is happening right now / today?**
2. **What is the full shape of the trip?**
3. **Where should I go, and why this one?**
4. **What did we do, and what is worth remembering?**
5. **What is time-sensitive and about to catch us out?**

### 1.3 What success looks like
You open it without thinking, trust what it tells you, and never get caught out by a closure, clash or missed window. By the end, it has become the record of the trip.

---

## 2. Design principles

1. **Grounded over generic.** Every element ties back to the real trip.
2. **Useful from hour one.** The app must be useful during the trip, not only before it.
3. **Truth-surfacing.** Proactively flag closures, windows, conflicts and practical constraints.
4. **Lean, earns its place.** Cut anything that does not pull its weight. Removing a tab is a valid product improvement.
5. **Scannable on the move.** Mobile-first, card-based, glanceable.
6. **Calm and confident.** One clear recommendation with a reason, not a wall of options.

---

## 3. Experience model

### 3.1 Modules (current, four live tabs)

| **Module** | **Job** | **Behaviour** |
|---|---|---|
| Today | What's happening now | Date-aware. Leads with today's weather, hotel, moves, plan checklist, planned places, places done and rating nudges. |
| Days | The full plan | Collapsible day-by-day itinerary across the whole trip, with timezone context, legs, accommodation and assigned places. |
| Journal | Capture the trip | Rate meals, wines, sights and moments with dual You / Harriet stars. Supports local photo capture for memory collection. |
| Explore | Decide where to go | Curated and user-added place cards per city, grouped by category and filtered by tag. Plan a place onto a day or mark it as done. |

**Removed:** Spend. Cost logging was removed in v0.3 because it created friction and did not reflect the actual usage pattern for this trip.

### 3.2 The criterion for a new module
A new tab earns its place only if it serves a **real, recurring in-trip job** that the existing modules cannot. "It would be cool" is not the bar. "I keep needing X and have nowhere to put it" is.

### 3.3 Place card anatomy
Every Explore card carries:

- Done checkbox
- Name
- Tag chip
- Area
- Insider note
- Plan action

### 3.4 Taxonomy

**Category:** `Eat & Drink` · `See & Do` · `Shop`

**Tag / vibe:** `Fancy dinner` · `Long lunch` · `Quick bite` · `Coffee & cake` · `Wine bar` · `Cheap & cheerful` · `Sweet treat` · `Must-see` · `Hidden gem` · `Golden hour` · `Browse & buy`

### 3.5 Journal entry types
Journal classifies entries as `Meal` · `Wine` · `Sight` · `Moment`, each with its own icon and prompt wording.

Journal entries may also carry local photos. These are currently stored on-device until a shared backend, preferably Supabase, is connected.

---

## 4. Voice and content

1. **Insider and specific.** Use details that help a traveller decide.
2. **Decisive.** One recommendation per card, with the why.
3. **Flag risk up front.** Windows, closures and queues go in the note, not in fine print.
4. **Australian English, concise.** No filler, no em dashes.
5. **No invented facts.** If a detail is not known, leave it out.

---

## 5. Visual system

The app is an iOS-flavoured, mobile-first web app: a single phone-width column, system typography, frosted-glass chrome, light shadows, no borders, and one blue accent.

### 5.1 Colour

| **Token** | **Value** | **Use** |
|---|---|---|
| `--bg` | `#F2F2F7` | App background |
| `--surface` | `#FFFFFF` | Cards and feature surfaces |
| `--fill` | `#EDEDF2` | Inputs, chips, segmented tracks |
| `--fill2` | `#E5E5EA` | Progress/bar tracks, unchecked checkbox |
| `--ink` | `#1D1D1F` | Primary text |
| `--ink2` | `#6E6E73` | Secondary text |
| `--muted` | `#8E8E93` | Muted labels and captions |
| `--line2` | `#C7C7CC` | Unselected star and hairline stroke |
| `--accent` | `#1F4DE6` | Buttons, active tab, links, checked states |
| `--accent-d` | `#163BBD` | Pressed / active state |
| `--powder` | `#EAF0FF` | Tinted selected surfaces and nudges |
| `--powder2` | `#C9D8FF` | Secondary tint |

### 5.2 Typography

- Display and headings use the system display stack.
- Body uses the system text stack.
- Mono is reserved for codes, references, times and tabular numbers.

### 5.3 Components

Core components are cards, place cards, tag chips, circular checkboxes, ref/code chips, day cards, segmented controls, primary buttons, nudge banners, photo grids and the frosted tab bar.

### 5.4 Open design gap
There is still no dedicated semantic component for `window / closure / conflict`. This remains the highest-priority design gap because it directly supports the truth-surfacing principle.

---

## 6. Data and sync

### 6.1 Current storage
The app currently saves to browser localStorage. This means added places, journal entries and photos save on the current device.

### 6.2 Shared sync
Shared sync is not active until a backend is connected. Supabase is the recommended path because it can support:

- shared Explore additions
- shared place status
- shared Journal entries
- photo storage
- future multi-trip architecture

JSONBin may be used as a temporary sync bridge for text data, but it is not the right long-term answer for photos.

---

## 7. Conformance loop

Before every change ships:

1. Which job does this serve?
2. Does it hold the six principles?
3. Does it fit the existing modules, card anatomy and taxonomy?
4. Does it add more value than complexity?
5. Does it use defined tokens and components?
6. Does it keep app, brand and content model aligned?
7. Ship and log the change.

---

## 8. Changelog and backlog

### 8.1 Changelog

| **Date** | **Version** | **Change** |
|---|---|---|
| 2026-06-06 | 0.1 | Brand file created. Intent, principles, experience model, voice, growth rules and conformance loop set. |
| 2026-06-06 | 0.2 | Visual system calibrated from live app. Experience model corrected to include Spend and Journal. |
| 2026-06-06 | 0.3 | Spend removed. App refocused around Today, Days, Journal and Explore. Journal photo capture added as local memory collection. Shared sync clarified as device-only until backend connection. |

### 8.2 Backlog

- Connect Supabase for shared Explore additions, Journal entries and photo storage.
- Define a window / closure / conflict treatment as a reusable component.
- Add Copenhagen and London Explore content.
- Rename `--serif` token to `--display` when convenient.
