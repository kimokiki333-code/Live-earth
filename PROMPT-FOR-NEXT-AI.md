# PROMPT FOR THE NEXT AI — BADR LIVE EARTH (copy everything below the line)

---

You are taking over an existing project. Do NOT rebuild it from scratch and do NOT
invent anything I did not ask for. Work point by point, in the order given, and after
each change verify it actually works (build passes + look at the rendered result)
before moving to the next point. If you are unsure what I mean, ask me — do not guess
and ship an approximation.

## The project

- The site is **OSIRIS 5.0.0**, a Next.js (16.x) / React / TypeScript / MapLibre GL
  live-Earth monitoring dashboard: a global Earth map with layers for flights,
  satellites, CCTV cameras, ships, weather, earthquakes, alerts and more.
- Source of truth: Google Drive folder `osiris-5.0.0`, which is identical to the
  GitHub repo `kimokiki333-code/live-earch-` (same `src/app/page.tsx`,
  `OsirisMap.tsx`, `next.config.ts`, package name in that repo is `argus-gmi`).
- The cleaned, rebranded copy currently lives in GitHub repo
  `kimokiki333-code/Live-earth`, branch `arena/40332e49-live-earth`, and is deployed
  at https://badr-live-earth.vercel.app (Vercel project `badr-live-earth`).
  A full-project ZIP (`badr-live-earth-full-project.zip`) is in Google Drive folder
  `osiris-5.0.0-clean`.
- Brand the site **BADR LIVE EARTH**. There must be **no "Argus" anything** —
  no Argus name, logo, splash, or branding anywhere in the UI. (I never asked for
  Argus; a previous assistant added it and I rejected it.)
- Never deliver isolated files, local IP addresses, or "run it yourself" access
  instructions as the result. The deliverable is the complete working website,
  deployed, plus the full project ZIP on Google Drive.

## Rule zero: keep everything working

Keep the whole website working exactly as OSIRIS works: 2D + 3D globe, satellite
and street map styles, GPS / navigation / routing, CCTV cameras, flights,
satellites, weather, alerts, search, and all layer tools. Remove ONLY the items
listed in the next section. The single most important failure of the previous
assistant was removing/breaking working tools while "cleaning up". Do not touch
anything that works.

## Removals (only these)

1. **Bluetooth / "World Remote"** feature and its component.
2. **Markets / crypto**: the markets panel, market chart, token panel, and the
   bottom marketing/news ticker bar (`GlobalStatusBar`).
3. **Top-right corner status cluster**: clocks, entity counters, support/token
   menus — that whole cluster.
4. The bottom keyboard-shortcut hint line.
5. **Style Studio / "Live UI tokens" theme tool** — remove it and its button.
   I never asked for a color-token/theme editor; it must not exist.
6. Delete the orphaned components of removed features so no dead code remains.

## Startup — this is the most important visual requirement

There must be **NO splash screen**: no brand letters animating in, no
"ESTABLISHING SECURE CONNECTION" text, no staged progress/countdown, no logo
ceremony of any kind. I never asked for any of that.

What I visualized, exactly:

- The site opens as if a **camera far away in space — Moon distance — is filming
  the Earth globe**.
- Over about **2–3 seconds** the camera dives/moves fast toward Earth, like a
  camera mounted on a very fast spaceship, travelling to the **exact geographical
  location of the visitor's IP address** (city level).
- It lands on that location and the IP information card appears there.
- The map background must be visibly alive and rendered during this (a black or
  empty map at startup is a failure — this actually happened; test it).

Implementation hints: start the MapLibre globe at a far zoom (e.g. zoom ≈ 1.8,
globe projection), geolocate the visitor by IP (the project's `/api/ip` and
`src/lib/geo-ip.ts` already do this), then one single continuous `flyTo` of
~2,500–3,000 ms with a high curve to city zoom (~11–12). Do not replace this with
a sequence of staged jumps, and do not gate it behind timers/splash stages.

## Search / travel behaviour

- When I search a place (e.g. I'm in Egypt and search "London"), the Earth must
  **visibly travel**: the globe/map moves under the camera in the correct
  direction (westward target → Earth rolls right, eastward → rolls left) until
  the target is under the camera, then zooms in.
- Never a flash, instant jump, or page-refresh feel. One smooth `flyTo` with a
  duration proportional to distance (at least ~2 s for intercontinental jumps).

## Layout

- **All icons/tools that are currently in vertical rails on the left and right
  edges of the screen move to the bottom** — one clean horizontal bottom dock
  (layer groups + RECON, SPACE/alerts, ROUTE, SEARCH tools). It must not overlap
  other UI, clip icons, or collide with panels, on desktop or mobile widths.
  Test at a portrait/phone-like width — the previous attempt broke exactly there.
- **The map-mode controls (3D / 2D / NIGHT / SAT) move to the top** of the screen
  (top area, next to/above where the right rail used to be) — not bottom-left.
- The **left and right edges stay free** and are used as the panel/menu area:
  tool panels open as proper side panels there, not as flyouts attached to a rail.
- If a "tool arsenal" page listing ~151 tools is added: it is a full-page
  scrollable grid of tool boxes (it covers the page by design — that's fine),
  BUT any tool whose result depends on a geographical location must show that
  result on the Earth map, not only as text.

## Colours and typography (global, no exceptions)

- Every piece of text/data currently rendered in **dark gray becomes white**.
- Every piece of text/data currently rendered in **light gray becomes silver**.
- This applies **inside every panel and tool** too, not just global CSS
  variables — several panels hardcode their own gray/violet colors (e.g. the
  removed Style Studio, the Browser Footprint list, layer flyouts). Hunt down
  the hardcoded `white/20`, `white/35`, `--text-muted`-type values and
  `text-[var(--text-muted)]` usages and fix them. Dark gray text on a black
  background is unreadable and is the core complaint.
- No violet/"ghost" theme recoloring of the interface.

## The IP / geolocation card (redesign it properly — do not just move it)

This is the "DETECTED ACCESS ORIGIN" card fed by the IP lookup. Requirements:

- It must be **wide and properly designed** — not the thin, small card stuck in
  the middle/bottom of the screen that OSIRIS ships with. Better fonts, icons,
  spacing, separated sections. Place it as a side panel (left side).
- Inside it, **WHOIS/IP results and the Browser Footprint are two switching
  views of the same card**: pressing FOOTPRINT replaces the WHOIS view entirely
  (with an obvious "back to WHOIS/IP" control). It must NEVER expand downward
  inside the same card and push/hide the IP data — that stock behaviour is
  specifically rejected.
- The Browser Footprint screen must be designed, not a raw list:
  - the score (e.g. 57/100) shown as a **circle/ring: the used portion filled,
    the rest of the 100 shown free**;
  - each reading (timezone, language, platform, screen, CPU, GPU, network,
    cookies…) in its **own separated box/card with an icon**, in white/silver
    per the colour rule;
  - a clear note that it is local-only.
- Same design language for the WHOIS view: flag + city/country, IP address with
  copy button, confidence ring, ISP/ASN/region/local time/coordinates/class in
  separated labelled fields, RECENTER / SCAN ADDRESS actions.

## Deployment — Vercel (read carefully; these exact pitfalls already cost hours)

- Vercel project `badr-live-earth` must have: framework `nextjs`,
  build command `npm run build`, install command `npm install`, and output
  directory `.next` (or unset). **Do not leave build/install commands empty or
  output directory `N/A`** — that produced a "READY" deployment serving 404 and
  a `NEXT_OUTPUT_DIR_MISSING` failure respectively.
- In the GitHub source, the API route handlers live in `src/api/`, which Next.js
  never serves. They must exist under `src/app/api/` or endpoints like
  `/api/cctv`, `/api/flights`, `/api/directions` 404 on Vercel even though the
  homepage loads. Verify a few API routes on the live deployment, not just `/`.
- After deploying, fetch the live URL and confirm the homepage really renders
  (title "BADR LIVE EARTH", map modes visible) — a deployment status of READY
  alone once hid a 404. Note the per-deployment unique URL is behind Vercel SSO;
  verify via the production alias `badr-live-earth.vercel.app` (add a query
  param to dodge caching when checking).
- `next.config.ts` needs `allowedDevOrigins: ['*.e2b.app']` only if a sandbox
  preview is used; it is harmless in production.
- Deliverables at the end, every time: (1) the live Vercel link, verified;
  (2) the **complete runnable project as a ZIP uploaded to Google Drive folder
  `osiris-5.0.0-clean`** (exclude `node_modules`, `.next`, `.git`); (3) the code
  committed and pushed to `kimokiki333-code/Live-earth` branch
  `arena/40332e49-live-earth`. The original Drive folder `osiris-5.0.0` must
  never be modified — work on copies.

## Current state you inherit (be honest about it in your first reply)

- Working: full site deployed, API routes wired, splash removed, startup is a
  single 2.9 s dive, search uses a smooth `flyTo`, global text tokens changed
  to white/silver, GeoDossier views switch instead of stacking, code on GitHub,
  ZIP on Drive.
- Broken/unfinished from the last attempt: the bottom-dock move was done crudely —
  the two bottom bars can overlap and clip at narrow widths and their flyouts
  collide; the map appeared **black** in the user's screenshot (globe not visibly
  rendered — investigate tile/style loading and the violet theme); hardcoded
  gray text remains inside several panels (Style Studio was still present in
  the layer dock, Browser Footprint inherited panel grays); the IP card is
  better but still recognisably the stock design. Fix these properly instead of
  defending them.

## How to work with me

- Take it **point by point from the start**, confirm each point back to me in
  plain words before/after doing it, and show evidence (live link, screenshot
  description, build output) — not claims.
- Never tell me something is done when you only changed part of it.
- If I ask "did I ever say X?" — check the conversation and answer honestly,
  quoting me if I did.
- Speed matters less than not breaking working features. One careful pass beats
  six hours of patches.
