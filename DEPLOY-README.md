# BADR LIVE EARTH — deploy this zip

This is the **real Next.js app**, not a mock-up: 28 live API routes, MapLibre map,
35 toggleable layers, CCTV, flights, satellites, OSINT toolkit, navigation.

It now carries the approved skin: new header/title row, the four map buttons in
their own place, the lifted bottom dock, and the state colours.

---

## Deploy to Vercel (fastest)

```bash
unzip badr-live-earth-v1.zip
cd badr-live-earth
npm install
npx vercel --prod
```

Or: push the folder to GitHub, then Vercel → **Add New → Project → Import**.
No settings to change — Next is detected automatically.
`next.config.ts` already skips `output: 'standalone'` on Vercel so its packaging step is happy.

## Deploy with Docker

```bash
docker build -t badr-live-earth .
docker run -p 3000:3000 badr-live-earth
```

The Dockerfile uses `output: 'standalone'`, which `next.config.ts` enables
whenever `VERCEL` is not set.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

Production: `npm run build && npm start`

---

## Environment

The app runs without any keys. Optional keys turn on extra sources — copy
`.env.example` to `.env.local` and fill only what you have.
Anything missing degrades that one layer; it does not break the page.

---

## What changed in this build (skin only)

| file | change |
|---|---|
| `src/app/badr-skin.css` | **new** — state contract, header/strip/dock re-skin, 820 px reflow |
| `src/app/layout.tsx` | imports the skin after `globals.css` |
| `src/app/page.tsx` | 4 surgical edits: the map-button strip is no longer positioned with `left: 120px` / `12px`, it has its own corner (desktop) and its own row (phone); the title drops the `0.35em` tracking that ran it under those buttons; the sub-line hides on phones; the bottom strip becomes `.badr-dock` lifted above the safe area |

No feature was removed. No layer, panel, route or handler was touched.

### The overlap, specifically

Before: on a phone both the title block and the 3D/2D/NIGHT/SAT strip sat at the
top-left. The title is `BADR LIVE EARTH` at `tracking: 0.35em`, so it ran straight
under the strip — the "button hiding behind another button" you saw.

After, at ≤820 px:
- row 1 — logo + `BADR LIVE EARTH` (15 px, `0.13em`, one line)
- row 2 — the four segments, sharing the full width evenly
- the sub-line is hidden so the header never grows to a third row

At desktop widths the strip keeps the top-right corner alone, and the title stops
short of it.

---

## Verified here

- `npm run build` → exit 0, all routes compiled
- `npx tsc --noEmit` → exit 0
- `GET /` → 200, and the served HTML contains every skin hook
- the skin rules are present in the served CSS chunk (`badr-viewstrip` found in
  `/_next/static/chunks/*.css`)
- API smoke: `/api/maritime` 200. `/api/earthquakes`, `/api/news`, `/api/satellites`
  fail **inside this sandbox only** — its outbound allowlist blocks those upstreams.
  They are unchanged code and will work on a host with open internet.

**Not verified:** a real browser render. This sandbox has no working Chromium
(missing `libnss3`), so I could not screenshot it. The live preview is served from
this same build, so what you see there is exactly what deploys.
