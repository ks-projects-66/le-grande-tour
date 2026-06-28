# Voyage - plan to memory, together

A self-serve, group-first trip companion: sign up, set up a trip, invite travellers, use it day by day, capture memories quickly, then publish a zero-install recap.

**App:** https://ks-projects-66.github.io/le-grande-tour/app/
**Website / landing:** https://ks-projects-66.github.io/le-grande-tour/voyage/ (marketing front door, source in [`../voyage/`](../voyage/))

## What it does

- **Setup wizard** — name the trip, add travellers, set a home base, add destinations
  (each geocoded for coordinates + time zone), pick dates.
- **Today / Days / Journal / Explore / Recap** - a derived day-by-day itinerary with live weather,
  home-time-zone offsets, per-traveller star ratings, photos, places to explore, private logistics,
  and a shareable recap.
- **True group trips** - invite travellers by email so they can write to the same trip after signing
  in with that address.
- **Quick capture** - a fast photo/name/stars sheet for saving memories while travelling.
- **Visible sync** - saves show progress, failures, and retry prompts instead of silently failing.

## How it's built

- Single self-contained `index.html` - React 18 + lucide + supabase-js loaded via an esm.sh
  importmap and transpiled in the browser with Babel standalone. No build step.
- **Supabase** for auth, data and photo storage. Apply
  `../supabase/migrations/20260623000000_voyage_collaboration_and_recaps.sql` to enable
  trip members, member-based RLS, and public recap snapshots.
- Weather and geocoding use the keyless **Open-Meteo** APIs.

## Notes

- "Voyage" is the app name (the `PRODUCT` constant near the top of `index.html`); inside a trip,
  that trip's own name becomes the header brand.
- This app is independent of the personal trip that lives at the repository root and shares
  none of its data.
