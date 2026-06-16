# Voyage — plan any trip

A self-serve trip companion that anyone can pick up cold: sign up, set up a trip for **any
destinations, dates and number of travellers**, then use it day by day.

**Live:** https://ks-projects-66.github.io/le-grande-tour/app/

## What it does

- **Setup wizard** — name the trip, add travellers, set a home base, add destinations
  (each geocoded for coordinates + time zone), pick dates.
- **Today / Days / Journal / Explore** — a derived day-by-day itinerary with live weather and
  home-time-zone offsets, per-traveller star ratings, photos, places to explore, and private
  logistics (bookings, references) per day.
- **Accounts** — email + password sign-in; every trip is private to its owner and syncs across
  any device they sign in on.

## How it's built

- Single self-contained `index.html` — React 18 + lucide + supabase-js loaded via an esm.sh
  importmap and transpiled in the browser with Babel standalone. No build step.
- **Supabase** for auth, data and photo storage. All app data lives in owner-scoped `wl_*`
  tables and a `wl-photos` bucket, with row-level security restricting every row to
  `owner = auth.uid()`.
- Weather and geocoding use the keyless **Open-Meteo** APIs.

## Notes

- "Voyage" is the app name (the `PRODUCT` constant near the top of `index.html`); inside a trip,
  that trip's own name becomes the header brand.
- This app is independent of the personal trip that lives at the repository root and shares
  none of its data.
