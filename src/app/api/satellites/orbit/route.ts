import { NextResponse } from 'next/server';
import { getSatelliteCache } from '@/lib/satellite-cache';
import { orbitPath, orbitalPeriodMinutes, splitAtAntimeridian } from '@/lib/orbit';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — one satellite's orbit track.
 *
 * Returns a full revolution, sampled from the same TLE the map position came
 * from, so the track passes through the satellite rather than near it.
 *
 * Served on demand rather than bundled into /api/satellites: that response is
 * already several megabytes for ~19,000 satellites, and an operator looks at
 * one orbit at a time.
 *
 * The TLE catalogue is the disk cache the satellites route already maintains.
 * Reading it here avoids a second fetch to CelesTrak, which rate-limits.
 */

interface Tle { name: string; line1: string; line2: string }

const ORBIT_CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; byNorad: Map<string, Tle> } | null = null;

function noradOf(line1: string): string {
  return line1.substring(2, 7).trim();
}

function catalogue(): Map<string, Tle> {
  if (cache && Date.now() - cache.at < ORBIT_CACHE_TTL_MS) return cache.byNorad;
  const byNorad = new Map<string, Tle>();
  const current = getSatelliteCache().sats;
  for (const sat of current) {
    if (sat?.line1 && sat?.line2) byNorad.set(noradOf(sat.line1), sat as Tle);
  }
  cache = { at: Date.now(), byNorad };
  return byNorad;
}

async function fetchSingleTle(noradId: string): Promise<Tle | null> {
  try {
    const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${encodeURIComponent(noradId)}&FORMAT=tle`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'OSIRIS/5.0 (satellite-orbit)' } });
    if (!res.ok) return null;
    const lines = (await res.text()).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let i = -1;
    for (let n = 0; n < lines.length - 1; n++) {
      if (lines[n].startsWith('1') && lines[n + 1].startsWith('2')) { i = n; break; }
    }
    if (i < 0 || !lines[i + 1]) return null;
    const name = i > 0 && !lines[i - 1].startsWith('1') && !lines[i - 1].startsWith('2') ? lines[i - 1] : `SAT-${noradId}`;
    return { name, line1: lines[i], line2: lines[i + 1] };
  } catch {
    return null;
  }
}

/**
 * The moment the track is drawn around.
 *
 * It defaults to now, but now is usually the wrong answer. The marker on the
 * map was propagated when /api/satellites was fetched, and that happens once,
 * when the layer is switched on — it is never re-polled. Twenty minutes later
 * the marker is where the satellite was twenty minutes ago, and a track
 * propagated from now starts nine thousand kilometres away from it. The maths
 * was right in both places and the two answers still did not meet.
 *
 * So the caller passes the epoch its marker came from. Anything absurd is
 * ignored rather than trusted: a far-future `t` would propagate a TLE well
 * outside the window it is accurate in, and quietly draw a wrong orbit.
 */
function anchorTime(raw: string | null): Date {
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return new Date();
  const drift = Math.abs(ms - Date.now());
  return drift > 7 * 24 * 3600_000 ? new Date() : new Date(ms);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get('id')?.trim();
  if (!id || !/^\d{1,6}$/.test(id)) {
    return NextResponse.json({ error: 'numeric NORAD id required' }, { status: 400 });
  }

  let tle = catalogue().get(String(Number(id)));
  if (!tle) tle = await fetchSingleTle(String(Number(id))) ?? undefined;
  if (!tle) return NextResponse.json({ error: 'not in catalogue', noradId: id }, { status: 404 });

  const periodMinutes = orbitalPeriodMinutes(tle.line2);
  const anchor = anchorTime(params.get('t'));
  // Half a revolution either side, so the satellite sits in the middle of its
  // own track rather than at one end of it. Starting the path at the satellite
  // showed where it was going and nothing of where it came from, and left any
  // residual timing error hanging the marker off the end of the line.
  const from = periodMinutes
    ? new Date(anchor.getTime() - (periodMinutes * 60_000) / 2)
    : anchor;
  const path = orbitPath(tle.line1, tle.line2, 180, from);
  if (path.length < 2) {
    return NextResponse.json({ error: 'could not propagate', noradId: id }, { status: 422 });
  }

  return NextResponse.json({
    noradId: id,
    name: tle.name,
    periodMinutes,
    /** Epoch the track is centred on, so a caller can tell it was honoured. */
    anchoredAt: anchor.toISOString(),
    // Split at the antimeridian so each run draws as one continuous line
    // instead of one segment sweeping back across the whole world.
    segments: splitAtAntimeridian(path).map(run =>
      run.map(p => [
        Math.round(p.lng * 10000) / 10000,
        Math.round(p.lat * 10000) / 10000,
        Math.round(p.altKm),
      ]),
    ),
  }, {
    // An orbit is stable for far longer than a position: the shape only
    // changes when a fresh TLE lands.
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  });
}
