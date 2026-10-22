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

/**
 * Fallback catalogue: SatNOGS DB's latest-TLE list. Celestrak refuses some
 * datacentre egress IPs, and a 502 here means an empty sky on the map, so
 * when Celestrak answers with nothing we take SatNOGS' TLEs and categorise
 * by object name (their feed carries no category field).
 */
const NAME_CATEGORIES: [string, RegExp][] = [
  ['science', /ISS|ZARYA|TIANGONG|TIANHE|HUBBLE|HST|JWST|FERMI|SWIFT|Chandra|XMM|INTEGRAL|CHEOPS|TESS|HINODE|SDO\b|STEREO|PARKER|GAIA|ASTROSAT/i],
  ['navigation', /GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|COMPASS|IRNSS|NAVIC|QZSS|MICHIBIKI/i],
  ['military', /\bUSA\s?\d|NROL|YAOGAN|SKYNET|AEHF|WGS\b|MUOS|SBIRS|\bDSP\b|MILSTAR|MENTOR|TRUMPET|LACROSSE|TOPAZ|QUASAR|COSMOS 2[45]\d\d/i],
  ['comms', /STARLINK|ONEWEB|IRIDIUM|ORBCOMM|GLOBALSTAR|INTELSAT|EUTELSAT|\bSES\b|TELESAT|VIASAT|INMARSAT|THURAYA|ARABSAT|NILESAT|TURKSAT|HISPASAT|ASTRA|HOTBIRD|\bAMOS\b|AZERSPACE|TELSTAR|ANIK|DIRECTV|DISH\b|SIRIUS|\bXM\b|O3B|KUIPER|TDRS/i],
  ['earth_obs', /NOAA|METOP|METEOR|GOES|LANDSAT|SENTINEL|TERRA\b|AQUA\b|SUOMI|\bNPP\b|METEOSAT|FENGYUN|FY-\d|ELEKTRO|INSAT|RESOURCESAT|OCEANSAT|CARTOSAT|WORLDVIEW|GEOEYE|PLEIADES|\bSPOT\b|ALOS|SAOCOM|ICEYE|CAPELLA|SKYSAT|PLANET|DOVE\b|FLOCK/i],
];

function categoryForName(name: string): string {
  for (const [category, re] of NAME_CATEGORIES) if (re.test(name)) return category;
  return 'earth_obs';
}

async function fetchSatnogs(now: Date, push: (name: string, noradId: number, l1: string, l2: string, category: string) => void): Promise<void> {
  const res = await fetch('https://db.satnogs.org/api/tle/', {
    headers: { 'User-Agent': 'BADR-LIVE-EARTH/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return;
  const rows = await res.json();
  for (const row of Array.isArray(rows) ? rows : []) {
    const l1 = String(row.tle1 || '');
    const l2 = String(row.tle2 || '');
    const noradId = Number(l1.substring(2, 7));
    if (!noradId || !l1 || !l2) continue;
    const name = String(row.tle0 || `NORAD ${noradId}`).replace(/^0\s+/, '').trim();
    push(name, noradId, l1, l2, categoryForName(name));
  }
}

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

  if (satellites.length < 100) {
    // Celestrak refused us (or is down): rebuild from SatNOGS instead.
    satellites.length = 0;
    seen.clear();
    for (const k of Object.keys(category_counts)) category_counts[k] = 0;
    await fetchSatnogs(now, (name, noradId, l1, l2, category) => {
      if (seen.has(noradId)) return;
      const pos = propagateTLE(l1, l2, now);
      if (!pos) return;
      seen.add(noradId);
      satellites.push({ name, lat: pos.lat, lng: pos.lng, alt: Math.round(pos.altKm), category, noradId });
      category_counts[category]++;
    }).catch(() => undefined);
  }

  if (!satellites.length) {
    return NextResponse.json({ error: 'Satellite catalogue unavailable' }, { status: 502 });
  }

  const payload = { satellites, category_counts, total: satellites.length, timestamp: now.toISOString() };
  cache = { at: Date.now(), payload };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}
