# HANDOFF — BADR LIVE EARTH · design pass

_Written at the end of the 2025-11-08 session. Read this first. It exists so the next
session does not start from zero and does not ship v7, v8, v9 to get to the same place._

Branch: `arena/529bfa4a-live-earth` · HEAD at writing: `3fd0494`
Latest deliverable: `BADR-LIVE-EARTH-v6.zip` (Drive `1KDd75sj7O7esajdeeNv9beyXS5_ooocV`)

Build commands (this repo, Next 16.3.4, no env keys needed):

```
npm ci                 # ~60 s, 504 packages
./node_modules/.bin/tsc --noEmit    # must print nothing
npm run build          # must exit 0
./node_modules/.bin/next start -p 3000 -H 0.0.0.0
```

---

## 0 · Standing rules (do not drift from these)

- **Honesty beats polish.** If something is not verified, say "not verified". Never
  claim a browser render — there is no browser in the sandbox.
- **No new zip unless there is a real fix inside it.** He is drowning in versions.
  One deliverable, clearly named.
- **Verify before declaring:** `tsc` 0 · `build` 0 · `GET /` 200 · grep the new class
  names in the served HTML **and** in the built CSS chunk.
- **Nothing may overlap or be cut off.** No 3D option to be *removed* (he later said
  leave the 3D button alone — it is fine, keep it).
- Upload new Drive files, never overwrite. Folder: `1bCTrn-HfK71JXGcIi3LG-MruAC3d9hsR`.
- Drive `upload_file` fails once at random, then succeeds on the immediate retry.
  That is normal — retry once.

---

## 1 · What is already built and working (do not rebuild)

| Piece | File | State |
|---|---|---|
| Top bar: gold logo tile, title, 4 map buttons, ALERT pill, red strip | `src/app/page.tsx` (`badr-topbar`) + `badr-skin.css` | done, verified |
| Left rail: **9 group buttons** + flyout listing that group's layers | `src/components/BadrRail.tsx` | done |
| Right sidebar: **INTELLIGENCE TOOLS**, 5 live cards + 4 group launchers + MY LOCATION | `src/components/BadrOsint.tsx` | done |
| Floating windows: drag, resize from 4 edges + 4 corners, min/max/close, z-stack, memory, **clamped on-screen** | `src/components/BadrWindow.tsx` | done |
| Basemap style served locally (`/dark-matter-style.json`) + yellow failure notice | `src/components/OsirisMap.tsx` | done — this was the black-map cause |
| Map full-bleed (the `padding-left:58px` that made the grey band is gone) | `badr-skin.css` | done |
| Group launchers open **only their own group** (`groupOnly`) | `OsintPanel.tsx` (`seed.group`) | done |
| Username / email hits are **clickable profile links** | `BadrOsint.tsx` | done |
| Empty GEO DOSSIER window no longer renders on load | `page.tsx` | done |

Verified at `3fd0494`: `tsc` 0 · `build` 0 · `GET /` 200 / 56,468 B ·
`/dark-matter-style.json` 200 / 70,850 B.

---

## 2 · THE WORK LIST — what he asked for and has NOT got yet

Ordered by how much they annoy him. This is the whole to-do; nothing else is pending.

### A. The ID / geolocation dossier card (his #1, repeated five times)
1. **It must open MAXIMISED**, on its own, for every visitor — not a small card in the
   corner. Then the user may minimise it. Today it opens as a 470 px window.
   - `BadrWindow`: add a `defaultMax` prop; render `#dossier` with it.
2. **The browser-footprint button must reveal, not cover.** Inside the card there are
   two extra buttons (footprint + one more). Clicking currently stacks their panel on
   top of the card, so you lose whichever is behind. They must sit **beside** it
   (side by side) or **below** it. Never on top.
   - `src/components/GeoDossier.tsx` — find the footprint/`onScan` buttons.
3. **Resizing must resize the content, not the frame.** Stretching the dossier today
   grows a black rectangle while the card inside keeps its fixed width:
   `GeoDossier.tsx:202` → `w-[min(94vw,520px)]`. That hard width is the bug.
   Fix: when inside a window, the card is `width:100%`, and `BadrWindow`'s `.badr-win-bd`
   gets `display:flex` so children stretch. (ROUTE already behaves correctly because
   `DirectionsBar` is fluid — use it as the reference.)

### B. Remove the duplicated old controls
4. **Delete the four old bottom-dock buttons** (the ones that duplicate rail layers —
   surveillance, satellites, etc.). They reappear whenever a panel opens, which is why
   he sees "four buttons appear out of nowhere".
5. **Delete the LAYERS button from the rail** once (4) is gone — its only job is
   restoring those duplicates. Same for anything else that re-opens that dock.
   - `page.tsx` → the `badr-dock` block; `BadrRail.tsx` → `onOpenFeatures`.

### C. Left rail spacing
6. Buttons are still "stacked like they have to touch each other". Wants more air:
   gap ~10 px, and grouping separators. `.badr-rail` in `badr-skin.css`.

### D. The ALERT panel
7. Still the old floating design. He wants it **docked as a drop-down bar**: roll up to a
   single bar, roll down over the map, real maximise/minimise, and it must never leave a
   dark rectangle over the map when collapsed (`LiveAlerts.tsx`).
8. Its "pin reports on map" and "1 live source" buttons do nothing. He said forget the
   live-alert part — leave them, but do not claim they work.

### E. The toolkit pop-up shell
9. `OsintPanel` still uses the **old full-screen shell** (old header, old icon shapes).
   It must use the same `BadrWindow` language: title bar, min/max/close, draggable,
   and **no "toolkit" titles** — he has asked twice to remove that word/heading.
10. Inside it, colours, icon shapes and titles are all still the old palette. It is the
    last big old-design surface.

### F. Colours
11. Everything still reads too grey/old. Palette already defined in `badr-skin.css`
    `:root` — gold `#ffd700`, neon-on `#39ff88`, alert `#ff2d55`, cyan `#63e6ff`.
    Use them; stop introducing new greys.

---

## 3 · Root causes already found (do not re-diagnose)

- **Black map on every host** → style JSON was fetched from `basemaps.cartocdn.com`.
  Now local. If it is *still* black, it is the tile host being blocked on his network —
  the yellow notice will say so; ask him for its text before touching code.
- **Windows vanished forever** → west-edge resize had no floor (`x` went to −1400).
  Fixed with `clampGeom()` in `BadrWindow.tsx`; keep every geometry write inside it.
- **Grey band down the left** → `main > div.absolute.inset-0 { padding-left:58px }`
  shrank the canvas but not the layers. Removed. Never pad the map container again;
  float panels above it.
- **Empty GEO DOSSIER bar over the map on first paint** → window rendered with no data.
  Now returns `null` when there is nothing to show.

---

## 4 · Dead ends — do not spend time here again

- **Google API key `AIzaSyA65lEHUEizIsNtlbNo-l2K18dT680nsaM`** — this is an AMP
  `getClientId` browser key scraped from a save-me page. It is not a Search, Maps,
  YouTube or People key. It identifies nobody. It cannot be used from our domain
  (referrer-restricted) and is not ours. Ignore it.
- **Cloudflare Workers AI keys** — abandoned earlier; do not revive.
- **InfinityFree / any static host** — impossible: 46 server routes. Vercel, Netlify,
  Render, Fly, or a Docker VPS only.
- **AI chat panel** — cancelled by the user. Never raise it.

---

## 5 · How he judges the work

He looks at the deployed page, not at the diff. So: the change has to be visible in the
first three seconds — a panel that is bigger, a button that is gone, a colour that
changed. Cosmetic CSS that only shifts a few pixels reads to him as "you did nothing",
and he will say so.

He is tired and he is funny about it. Keep replies short, numbered, and free of
enthusiasm he has not asked for.
