import { NextResponse } from 'next/server';
import { orbitPath, splitAtAntimeridian, orbitalPeriodMinutes } from '@/lib/orbit';

export const maxDuration = 30;

/** One satellite's ground track for the next full revolution (Celestrak TLE). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') || '').trim();
  const atRaw = searchParams.get('t');
  if (!/^\d{1,8}$/.test(id)) return NextResponse.json({ error: 'A NORAD id is required' }, { status: 400 });

  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${encodeURIComponent(id)}&FORMAT=json`, {
      headers: { 'User-Agent': 'BADR-LIVE-EARTH/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return NextResponse.json({ error: `Celestrak returned ${res.status}` }, { status: 502 });
    const rows = await res.json().catch(() => []);
    let row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.TLE_LINE1 || !row?.TLE_LINE2) {
      // Celestrak refused: find the TLE in SatNOGS' list instead.
      const alt = await fetch(`https://db.satnogs.org/api/tle/?norad_cat_id=${encodeURIComponent(id)}`, {
        headers: { 'User-Agent': 'BADR-LIVE-EARTH/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      }).catch(() => null);
      const altData: any = alt?.ok ? await alt.json().catch(() => null) : null;
      const list: any[] = Array.isArray(altData) ? altData : altData?.results || [];
      const hit = list.find((r: any) => Number(String(r.tle1 || '').substring(2, 7)) === Number(id)) || list[0];
      if (hit) row = { OBJECT_NAME: String(hit.tle0 || '').replace(/^0\s+/, ''), TLE_LINE1: hit.tle1, TLE_LINE2: hit.tle2 };
    }
    if (!row?.TLE_LINE1 || !row?.TLE_LINE2) return NextResponse.json({ error: 'Satellite not in catalogue' }, { status: 404 });

    const from = atRaw && !Number.isNaN(Date.parse(atRaw)) ? new Date(atRaw) : new Date();
    const path = orbitPath(row.TLE_LINE1, row.TLE_LINE2, 180, from);
    const segments = splitAtAntimeridian(path).map(run => run.map(p => [p.lng, p.lat, Math.round(p.altKm)]));
    return NextResponse.json({
      id,
      name: row.OBJECT_NAME,
      segments,
      periodMinutes: orbitalPeriodMinutes(row.TLE_LINE2),
    }, { headers: { 'Cache-Control': 'public, s-maxage=120' } });
  } catch {
    return NextResponse.json({ error: 'Orbit computation failed' }, { status: 502 });
  }
}
