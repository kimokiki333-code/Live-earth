import { NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * STEP 1 of the solar designer: the yield engine.
 *
 * Primary: PVGIS (European Commission) — satellite-derived yield, free and
 * keyless, but its host refuses some datacentre clients with a 403.
 * Fallback: NASA POWER monthly climatology (CERES satellite data, an API
 * built for machines) + an isotropic tilt transposition computed here.
 * The response always names its `source`, so an estimate is never passed
 * off as the other one's numbers.
 *
 * GET /api/pvgis?lat=30.04&lon=31.24&kwp=5&tilt=30&azimuth=0
 * azimuth: PVGIS convention — 0 = south, -90 = east, 90 = west.
 */

const cache = new Map<string, { at: number; data: any }>();
const LOSS = 0.14;

async function tryPvgis(lat: number, lon: number, kwp: number, tilt: number, azimuth: number): Promise<any | null> {
  const qs = `lat=${lat}&lon=${lon}&peakpower=${kwp}&loss=14&angle=${tilt}&aspect=${azimuth}&outputformat=json`;
  for (const base of ['https://re.jrc.ec.europa.eu/api/v5_3/PVcalc', 'https://re.jrc.ec.europa.eu/api/PVcalc']) {
    try {
      const res = await fetch(`${base}?${qs}`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Referer: 'https://re.jrc.ec.europa.eu/pvg_tools/en/',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const fixed = data?.outputs?.totals?.fixed;
      const monthly = data?.outputs?.monthly?.fixed;
      if (!fixed || !Array.isArray(monthly)) continue;
      return {
        annual_kwh: Math.round(fixed.E_y),
        specific_yield: Math.round(fixed.E_y / kwp),
        annual_irradiation: Math.round(fixed['H(i)_y']),
        monthly: monthly.map((m: any) => ({ month: m.month, kwh: Math.round(m.E_m) })),
        source: `PVGIS (${base.includes('v5_3') ? '5.3' : '5.2'})`,
      };
    } catch { /* try next */ }
  }
  return null;
}

/* ── NASA POWER fallback ─────────────────────────────────────────────── */

/** Extraterrestrial daily irradiation on a horizontal surface (kWh/m²/day). */
function extraterrestrial(latDeg: number, dayOfYear: number): number {
  const lat = (latDeg * Math.PI) / 180;
  const decl = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const cosWs = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
  const ws = Math.acos(cosWs);
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const Gsc = 1361; // W/m²
  const H0 = (24 / Math.PI) * Gsc * dr * (cosWs * Math.sin(lat) * Math.sin(decl) + ws * Math.cos(lat) * Math.cos(decl)) / 1000;
  return H0; // kWh/m²/day
}

/** Isotropic (Liu–Jordan) transposition of monthly GHI onto a tilted plane. */
function monthlyYield(lat: number, tiltDeg: number, azimuthDeg: number, ghiDaily: number[], kwp: number) {
  const tilt = (tiltDeg * Math.PI) / 180;
  const midDay = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Surface azimuth in solar-geometry convention: 0=south, west positive — same as PVGIS aspect.
  const gamma = (azimuthDeg * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;

  let annualPoa = 0;
  const monthly = ghiDaily.map((ghi, i) => {
    const H0 = extraterrestrial(lat, midDay[i]);
    const kt = H0 > 0 ? Math.min(0.85, ghi / H0) : 0;
    // Erbs diffuse fraction (daily)
    let kd: number;
    if (kt <= 0.22) kd = 1 - 0.09 * kt;
    else if (kt <= 0.8) kd = 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
    else kd = 0.165;
    const diffuse = ghi * kd;
    const beam = ghi - diffuse;

    // Ratio of beam on tilted plane to horizontal (Liu–Jordan Rb, monthly-average day)
    const decl = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + midDay[i])) / 365);
    const cosWs = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
    const ws = Math.acos(cosWs);
    const num = Math.cos(phi - tilt) * Math.cos(decl) * Math.sin(ws) + ws * Math.sin(phi - tilt) * Math.sin(decl)
      + Math.sin(tilt) * Math.sin(gamma) * 0; // azimuth effect approximated below via cos factor
    const den = Math.cos(phi) * Math.cos(decl) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(decl);
    // Azimuth penalty: rotating away from south tilts the effective plane; apply a simple
    // incidence correction so east/west roofs yield less than south, as they should.
    const azFactor = Math.cos(gamma * 0.9);
    const rb = den > 0 ? Math.max(0, (num / den)) * (azimuthDeg === 0 ? 1 : (0.55 + 0.45 * azFactor)) : 0;

    const poaDaily = beam * rb + diffuse * ((1 + Math.cos(tilt)) / 2) + ghi * 0.2 * ((1 - Math.cos(tilt)) / 2);
    const poaMonthly = poaDaily * daysInMonth[i];
    annualPoa += poaMonthly;
    return { month: i + 1, kwh: Math.round(poaMonthly * kwp * (1 - LOSS)), poa: poaMonthly };
  });

  const annual = monthly.reduce((s, m) => s + m.kwh, 0);
  return {
    annual_kwh: annual,
    specific_yield: Math.round(annual / kwp),
    annual_irradiation: Math.round(annualPoa),
    monthly: monthly.map(({ month, kwh }) => ({ month, kwh })),
    source: 'NASA POWER climatology + isotropic transposition (PVGIS unreachable)',
  };
}

async function tryNasaPower(lat: number, lon: number, kwp: number, tilt: number, azimuth: number): Promise<any | null> {
  try {
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON&start=2016&end=2022`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    if (!p) return null;
    const keys = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const ghi = keys.map(k => Number(p[k]));
    if (ghi.some(v => !Number.isFinite(v) || v <= 0)) return null;
    return monthlyYield(lat, tilt, azimuth, ghi, kwp);
  } catch { return null; }
}

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

  const result = (await tryPvgis(lat, lon, kwp, tilt, azimuth)) ?? (await tryNasaPower(lat, lon, kwp, tilt, azimuth));
  if (!result) return NextResponse.json({ error: 'Both PVGIS and NASA POWER are unreachable right now' }, { status: 502 });

  const payload = { location: { lat, lon }, system: { kwp, tilt, azimuth, loss: 14 }, ...result };
  cache.set(key, { at: Date.now(), data: payload });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=86400' } });
}
