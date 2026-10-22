import { NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * STEP 1 of the solar designer: the yield engine.
 * Proxy to the European Commission's PVGIS (free, no key): given a place,
 * a system size, tilt and azimuth, it returns satellite-derived monthly
 * and annual production. Cached per parameter-set (PVGIS asks for
 * <= 1 request/second; a site's long-term average never changes).
 *
 * GET /api/pvgis?lat=30.04&lon=31.24&kwp=5&tilt=30&azimuth=0
 * azimuth: PVGIS convention — 0 = south, -90 = east, 90 = west.
 */
let cache = new Map<string, { at: number; data: any }>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  const kwp = Math.min(1000, Math.max(0.1, Number(searchParams.get('kwp')) || 5));
  const tilt = Math.min(90, Math.max(0, Number(searchParams.get('tilt')) || 30));
  const azimuth = Math.min(180, Math.max(-180, Number(searchParams.get('azimuth')) || 0));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Valid lat/lon are required' }, { status: 400 });
  }

  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${kwp},${tilt},${azimuth}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'public, s-maxage=86400' } });
  }

  const qs = `lat=${lat}&lon=${lon}&peakpower=${kwp}&loss=14&angle=${tilt}&aspect=${azimuth}&outputformat=json`;
  const bases = [
    'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc',
    'https://re.jrc.ec.europa.eu/api/PVcalc',
  ];
  let lastError = 'PVGIS unreachable';
  for (const base of bases) {
    try {
      const res = await fetch(`${base}?${qs}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'BADR-LIVE-EARTH solar-step1' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { lastError = `PVGIS returned ${res.status}`; continue; }
      const data = await res.json();
      const fixed = data?.outputs?.totals?.fixed;
      const monthly = data?.outputs?.monthly?.fixed;
      if (!fixed || !Array.isArray(monthly)) { lastError = 'Unexpected PVGIS response'; continue; }
      const payload = {
        location: { lat, lon },
        system: { kwp, tilt, azimuth, loss: 14 },
        annual_kwh: Math.round(fixed.E_y),
        specific_yield: Math.round(fixed.E_y / kwp),
        annual_irradiation: Math.round(fixed['H(i)_y']),
        monthly: monthly.map((m: any) => ({ month: m.month, kwh: Math.round(m.E_m) })),
        source: `PVGIS (${base.includes('v5_3') ? '5.3' : '5.2'})`,
      };
      cache.set(key, { at: Date.now(), data: payload });
      return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=86400' } });
    } catch (e: any) {
      lastError = e?.message || 'PVGIS unreachable';
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
