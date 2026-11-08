# THE PROMPT — copy everything between the lines into another AI

_Paste this whole document. Attach the repo (git clone) or the latest zip.
It is written to be self-contained: the receiving model has never seen this project._

---

You are taking over a UI-only phase of a working Next.js application called
**BADR LIVE EARTH** — a live global-monitoring map (MapLibre, 46 API routes,
28 intelligence modules). The application already works. **Nothing here is a
feature request. It is a design-fit task.**

## How to run and verify (do this before and after every change)

```
npm ci
./node_modules/.bin/tsc --noEmit     # must print nothing
npm run build                        # must exit 0
./node_modules/.bin/next start -p 3000 -H 0.0.0.0
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/   # must be 200
```

Then confirm your CSS class actually shipped:
`curl -s http://127.0.0.1:3000/ | grep -o 'your-new-class'`
and check it appears in the built stylesheet under `/.next/static/chunks/*.css`.

Do not report a change as done until those four commands pass. Never claim a
visual result you have not seen — say "not verified in a browser" instead.

## The design language (already approved — do not invent a new one)

CSS variables live in `:root` inside `src/app/badr-skin.css`:

- gold `#ffd700` — brand, titles
- neon green `#39ff88` — a thing that is ON
- silver `#aeb6c6` — a thing that is OFF
- yellow `#ffd400` — error / down / unavailable
- red `#ff2d55` — alerts only
- cyan `#63e6ff` — secondary data, links
- plates `#0b1019` / `#080c14`; hairlines `rgba(255,255,255,.10)`

Layout contract:
- fixed top bar: logo tile + title on the left, four map buttons + ALERT pill on the right, red alert strip under it
- left rail: **9 group buttons**, each opening a flyout listing that group's layers
- right sidebar: **INTELLIGENCE TOOLS**, permanently visible on desktop
- bottom centre: tool dock
- every panel that opens must be a floating window: drag by title bar, resize from all four edges and four corners, minimise / maximise / close, click to raise, remember position

## The work, in priority order

### 1. The geolocation dossier card — the user's single biggest complaint
File: `src/components/GeoDossier.tsx` (the card), `src/app/page.tsx` (where it is mounted).

a. It must **open maximised** for every visitor — full viewport — and the user may
   then minimise it. Today it opens as a 470 px window.
   Add a `defaultMax` prop to `src/components/BadrWindow.tsx` and pass it for `id="dossier"`.
b. Inside the card there are two extra buttons (browser footprint + one more).
   Clicking them today **stacks a panel on top of the card**, hiding whichever is
   behind. They must appear **beside** the card or **below** it. Never on top.
c. **Resizing must resize the content.** Stretching the window today grows a black
   rectangle while the card keeps its fixed width. The cause is this hard width at
   `GeoDossier.tsx:202`:
   `w-[min(94vw,520px)]`
   When the card is inside a window it must be `width:100%`. Make `.badr-win-bd`
   (in `badr-skin.css`) a flex column so children stretch.
   The ROUTE window already behaves correctly because `DirectionsBar` is fluid —
   use it as the reference.

### 2. Delete duplicated controls
- In `src/app/page.tsx`, the bottom dock block (search for `badr-dock`) contains
  four buttons that duplicate rail layers. Delete those four.
- In `src/components/BadrRail.tsx`, remove the `onOpenFeatures` button — its only
  job was restoring those duplicates.

### 3. Left rail spacing
`.badr-rail` in `badr-skin.css`: buttons are too tight. Increase the gap to ~10 px
and add a separator between groups. Keep the transparent background (no full-height
slab) and the 62 px column.

### 4. The alert panel
File: `src/components/LiveAlerts.tsx`.
- It must collapse to a **single bar** and expand as a **drop-down** over the map.
- It must never leave a dark rectangle over the map when collapsed. (A previous fix
  sets the container to `h-auto` when `!expanded` — keep that behaviour.)
- Its "pin reports on map" and "1 live source" controls are decorative. Leave them,
  but do not claim they work.

### 5. The toolkit pop-up shell
File: `src/components/OsintPanel.tsx`.
- It still uses the old full-screen shell with the old header and old icon shapes.
  Move it onto the `BadrWindow` component like every other panel.
- Remove the word "TOOLKIT" from its headings.
- It is opened with a group filter already implemented (`groupOnly` state fed by
  `seed.group`): the four launcher buttons in `BadrOsint.tsx` must keep showing
  only their own group's modules (6 / 7 / 5 / 3).

### 6. Colour pass
Replace remaining grey/legacy surfaces with the palette above. Do not introduce new
greys — use the six variables.

## Hard rules

- Do not remove a working feature. This is a visual pass.
- Do not pad the map container to make room for panels: the map is full-bleed and
  panels float above it. (An earlier `padding-left: 58px` on `main > div.absolute.inset-0`
  shrank the canvas but not the map layers, producing a grey band. It is removed.
  Do not reintroduce it.)
- Every window geometry write must go through `clampGeom()` in `BadrWindow.tsx`.
  A previous version let a west-edge resize walk a window to x = −1400, off-screen
  and unreachable.
- The basemap style must stay local (`/dark-matter-style.json`). Fetching it from
  `basemaps.cartocdn.com` made the map render black on some networks.
- Do not add: 3D controls, an AI chat panel, new analytics, or new API routes.

## Report back with

1. Each numbered item: what you changed, file and line, and the command output that
   proves it (`tsc`, `build`, `GET /`, the grep hit).
2. Anything you could not do, and why.
3. A short list of what a human must check by eye in a browser — because you cannot.

---

# WHERE TO TAKE IT — ranked

**1. Best: Claude Code or Cursor, running in the repo folder.**
It can run the four verify commands itself and iterate until they pass. The prompt
above already contains the commands, so it needs no extra setup.
→ `git clone https://github.com/kimokiki333-code/Live-earth` · `git checkout arena/529bfa4a-live-earth`

**2. Good: ChatGPT / Claude in the browser, with the zip attached.**
It cannot run the build, so it will return patches you paste in. Slower, and it will
guess at line numbers. Attach `BADR-LIVE-EARTH-v6.zip`.

**3. For looks only: v0 / Lovable.**
Use it to mock a screen, not to touch this repo. The map and the 46 routes will not
survive a rebuild in those tools.

Do not take it to: InfinityFree, any PHP shared host, or anything that cannot run
Node. The app has 46 server routes; a static host will show a map and dead buttons.
