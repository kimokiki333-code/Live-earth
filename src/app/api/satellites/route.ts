import { NextResponse } from 'next/server';
import { propagateTLE } from '@/lib/orbit';

export const maxDuration = 60;

/**
 * Live satellite catalogue: Celestrak GP elements (TLE) propagated to *now*
 * with SGP4 (lib/orbit). This replaces the route the UI always called but
 * the project never had — which is why every SPACE toggle except ADS-B
 * flights drew an empty sky.
 *
 * Starlink alone is ~9k objects; it is evenly sampled to a cap so the map
 * stays fluid. Counts in `category_counts` describe what is drawn.
 */
const GROUPS: { group: string; category: string; cap?: number }[] = [
  { group: 'stations', category: 'science' },
  { group: 'science', category: 'science' },
  { group: 'weather', category: 'earth_obs' },
  { group: 'resource', category: 'earth_obs' },
  { group: 'gps-ops', category: 'navigation' },
  { group: 'glo-ops', category: 'navigation' },
  { group: 'galileo', category: 'navigation' },
  { group: 'beidou', category: 'navigation' },
  { group: 'starlink', category: 'comms', cap: 2400 },
  { group: 'oneweb', category: 'comms' },
  { group: 'iridium', category: 'comms' },
  { group: 'iridium-NEXT', category: 'comms' },
  { group: 'orbcomm', category: 'comms' },
  { group: 'globalstar', category: 'comms' },
  { group: 'geo', category: 'comms' },
  { group: 'military', category: 'military' },
];

let cache: { at: number; payload: any } | null = null;

async function fetchGroup(group: string): Promise<any[]> {
  const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`, {
    headers: { 'User-Agent': 'BADR-LIVE-EARTH/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function GET() {
  if (cache && Date.now() - cache.at < 5 * 60_000) {
    return NextResponse.json(cache.payload, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  }
  const now = new Date();
  const satellites: any[] = [];
  const category_counts: Record<string, number> = { comms: 0, military: 0, navigation: 0, earth_obs: 0, science: 0 };
  const seen = new Set<number>();

  const settled = await Promise.allSettled(GROUPS.map(g => fetchGroup(g.group)));
  settled.forEach((result, gi) => {
    if (result.status !== 'fulfilled') return;
    const { category, cap } = GROUPS[gi];
    let rows = result.value;
    if (cap && rows.length > cap) {
      const step = rows.length / cap;
      rows = Array.from({ length: cap }, (_, i) => rows[Math.floor(i * step)]);
    }
    for (const row of rows) {
      const noradId = Number(row.NORAD_CAT_ID);
      if (!noradId || seen.has(noradId) || !row.TLE_LINE1 || !row.TLE_LINE2) continue;
      const pos = propagateTLE(row.TLE_LINE1, row.TLE_LINE2, now);
      if (!pos) continue;
      seen.add(noradId);
      satellites.push({
        name: row.OBJECT_NAME || `NORAD ${noradId}`,
        lat: pos.lat,
        lng: pos.lng,
        alt: Math.round(pos.altKm),
        category,
        noradId,
      });
      category_counts[category]++;
    }
  });

  if (!satellites.length) {
    return NextResponse.json({ error: 'Satellite catalogue unavailable' }, { status: 502 });
  }

  const payload = { satellites, category_counts, total: satellites.length, timestamp: now.toISOString() };
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}
