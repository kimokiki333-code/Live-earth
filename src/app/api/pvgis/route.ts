import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * STEP 1 of the solar designer: the yield engine.
 *
 * Provider reality check (verified live, July 2026):
 *  - PVGIS (European Commission) is the reference engine, but its host
 *    403s datacentre IPs — from a server it usually cannot be reached.
 *  - NASA POWER also failed from our deployment region.
 *  - Open-Meteo's archive API is machine-friendly and global: hourly
 *    ERA5 reanalysis radiation (GHI / diffuse / direct-normal), which we
 *    transpose onto the tilted panel plane ourselves (Duffie & Beckman
 *    incidence geometry + isotropic sky model).
 * The response always names its `source`; numbers are never relabelled.
 *
 * GET /api/pvgis?lat=30.04&lon=31.24&kwp=5&tilt=30&azimuth=0
 * azimuth: 0 = south, -90 = east, 90 = west.
 */

const cache = new Map<string, { at: number; data: any }>();
const LOSS = 0.14;
const D2R = Math.PI / 180;

/* ── solar geometry (Duffie & Beckman) ─────────────────────────────── */

/** cos of angle of incidence on a tilted plane; ≤0 means sun behind panel. */
function cosIncidence(lat: number, tilt: number, surfAz: number, decl: number, hourAngle: number): number {
  const phi = lat * D2R, beta = tilt * D2R, gamma = surfAz * D2R;
  return (
    Math.sin(decl) * Math.sin(phi) * Math.cos(beta) -
    Math.sin(decl) * Math.cos(phi) * Math.sin(beta) * Math.cos(gamma) +
    Math.cos(decl) * Math.cos(phi) * Math.cos(beta) * Math.cos(hourAngle) +
    Math.cos(decl) * Math.sin(phi) * Math.sin(beta) * Math.cos(gamma) * Math.cos(hourAngle) +
    Math.cos(decl) * Math.sin(beta) * Math.sin(gamma) * Math.sin(hourAngle)
  );
}

function dayOfYear(y: number, m: number, d: number): number {
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400_000);
}

/* ── provider 1: Open-Meteo archive (ERA5 hourly) ──────────────────── */

async function tryOpenMeteo(lat: number, lon: number, kwp: number, tilt: number, azimuth: number, attempts: string[]): Promise<any | null> {
  try {
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=2023-01-01&end_date=2023-12-31` +
      `&hourly=shortwave_radiation,diffuse_radiation,direct_normal_irradiance&timezone=UTC`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) { attempts.push(`open-meteo: HTTP ${res.status}`); return null; }
    const data = await res.json();
    const h = data?.hourly;
    const times: string[] = h?.time, ghi: (number | null)[] = h?.shortwave_radiation,
      dhi: (number | null)[] = h?.diffuse_radiation, dni: (number | null)[] = h?.direct_normal_irradiance;
    if (!Array.isArray(times) || !Array.isArray(ghi) || !Array.isArray(dhi) || !Array.isArray(dni)) {
      attempts.push('open-meteo: unexpected payload'); return null;
    }

    const monthlyPoa = new Array(12).fill(0); // Wh/m²
    let used = 0;
    for (let i = 0; i < times.length; i++) {
      const g = ghi[i], df = dhi[i], dn = dni[i];
      if (g == null || df == null || dn == null || g <= 0) continue;
      // times are "2023-03-15T13:00" in UTC
      const month = Number(times[i].slice(5, 7));
      const day = Number(times[i].slice(8, 10));
      const hourUtc = Number(times[i].slice(11, 13));
      const n = dayOfYear(2023, month, day);
      const decl = 23.45 * D2R * Math.sin((2 * Math.PI * (284 + n)) / 365);
      // equation of time (minutes) + longitude shift → local solar time
      const B = (2 * Math.PI * (n - 81)) / 364;
      const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
      const solarTime = hourUtc + 0.5 + lon / 15 + eot / 60;
      const hourAngle = 15 * D2R * (solarTime - 12);
      const cosT = Math.max(0, cosIncidence(lat, tilt, azimuth, decl, hourAngle));
      const poa =
        dn * cosT +
        df * ((1 + Math.cos(tilt * D2R)) / 2) +
        g * 0.2 * ((1 - Math.cos(tilt * D2R)) / 2);
      monthlyPoa[month - 1] += poa; // W/m² over the hour ≈ Wh/m²
      used++;
    }
    if (used < 8000) { attempts.push(`open-meteo: only ${used} usable hours`); return null; }

    const monthly = monthlyPoa.map((wh, i) => ({ month: i + 1, kwh: Math.round((wh / 1000) * kwp * (1 - LOSS)) }));
    const annual = monthly.reduce((s, m) => s + m.kwh, 0);
    return {
      annual_kwh: annual,
      specific_yield: Math.round(annual / kwp),
      annual_irradiation: Math.round(monthlyPoa.reduce((s, v) => s + v, 0) / 1000),
      monthly,
      source: 'Open-Meteo archive (ERA5 reanalysis) + Duffie–Beckman plane-of-array model',
    };
  } catch (e: any) {
    attempts.push(`open-meteo: ${e?.name === 'TimeoutError' ? 'timeout' : 'network error'}`);
    return null;
  }
}

/* ── provider 2: PVGIS (reference engine; usually 403 from servers) ── */

async function tryPvgis(lat: number, lon: number, kwp: number, tilt: number, azimuth: number, attempts: string[]): Promise<any | null> {
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
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { attempts.push(`pvgis: HTTP ${res.status}`); continue; }
      const data = await res.json();
      const fixed = data?.outputs?.totals?.fixed;
      const monthly = data?.outputs?.monthly?.fixed;
      if (!fixed || !Array.isArray(monthly)) { attempts.push('pvgis: unexpected payload'); continue; }
      return {
        annual_kwh: Math.round(fixed.E_y),
        specific_yield: Math.round(fixed.E_y / kwp),
        annual_irradiation: Math.round(fixed['H(i)_y']),
        monthly: monthly.map((m: any) => ({ month: m.month, kwh: Math.round(m.E_m) })),
        source: `PVGIS (${base.includes('v5_3') ? '5.3' : '5.2'})`,
      };
    } catch (e: any) {
      attempts.push(`pvgis: ${e?.name === 'TimeoutError' ? 'timeout' : 'network error'}`);
    }
  }
  return null;
}

/* ── provider 3: NASA POWER monthly climatology ────────────────────── */

function extraterrestrialDaily(latDeg: number, n: number): number {
  const lat = latDeg * D2R;
  const decl = 23.45 * D2R * Math.sin((2 * Math.PI * (284 + n)) / 365);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl))));
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * n) / 365);
  return (24 / Math.PI) * 1361 * dr * (Math.cos(lat) * Math.cos(decl) * Math.sin(ws) + ws * Math.sin(lat) * Math.sin(decl)) / 1000;
}

async function tryNasaPower(lat: number, lon: number, kwp: number, tilt: number, azimuth: number, attempts: string[]): Promise<any | null> {
  try {
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON&start=2016&end=2022`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) { attempts.push(`nasa-power: HTTP ${res.status}`); return null; }
    const data = await res.json();
    const p = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    if (!p) { attempts.push('nasa-power: unexpected payload'); return null; }
    const keys = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const ghiDaily = keys.map(k => Number(p[k]));
    if (ghiDaily.some(v => !Number.isFinite(v) || v <= 0)) { attempts.push('nasa-power: bad monthly values'); return null; }

    const midDay = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const phi = lat * D2R, beta = tilt * D2R, gamma = azimuth * D2R;
    let annualPoa = 0;
    const monthly = ghiDaily.map((ghi, i) => {
      const H0 = extraterrestrialDaily(lat, midDay[i]);
      const kt = H0 > 0 ? Math.min(0.85, ghi / H0) : 0;
      let kd: number;
      if (kt <= 0.22) kd = 1 - 0.09 * kt;
      else if (kt <= 0.8) kd = 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
      else kd = 0.165;
      const diffuse = ghi * kd, beam = ghi - diffuse;
      const decl = 23.45 * D2R * Math.sin((2 * Math.PI * (284 + midDay[i])) / 365);
      const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl))));
      const num = Math.cos(phi - beta) * Math.cos(decl) * Math.sin(ws) + ws * Math.sin(phi - beta) * Math.sin(decl);
      const den = Math.cos(phi) * Math.cos(decl) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(decl);
      const rbSouth = den > 0 ? Math.max(0, num / den) : 0;
      const rb = azimuth === 0 ? rbSouth : rbSouth * (0.55 + 0.45 * Math.cos(gamma * 0.9));
      const poaDaily = beam * rb + diffuse * ((1 + Math.cos(beta)) / 2) + ghi * 0.2 * ((1 - Math.cos(beta)) / 2);
      const poaMonthly = poaDaily * daysInMonth[i];
      annualPoa += poaMonthly;
      return { month: i + 1, kwh: Math.round(poaMonthly * kwp * (1 - LOSS)) };
    });
    const annual = monthly.reduce((s, m) => s + m.kwh, 0);
    return {
      annual_kwh: annual,
      specific_yield: Math.round(annual / kwp),
      annual_irradiation: Math.round(annualPoa),
      monthly,
      source: 'NASA POWER climatology + isotropic transposition',
    };
  } catch (e: any) {
    attempts.push(`nasa-power: ${e?.name === 'TimeoutError' ? 'timeout' : 'network error'}`);
    return null;
  }
}

/* ── route ─────────────────────────────────────────────────────────── */

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

  const attempts: string[] = [];
  const result =
    (await tryOpenMeteo(lat, lon, kwp, tilt, azimuth, attempts)) ??
    (await tryPvgis(lat, lon, kwp, tilt, azimuth, attempts)) ??
    (await tryNasaPower(lat, lon, kwp, tilt, azimuth, attempts));
  if (!result) {
    return NextResponse.json({ error: 'All yield data providers are unreachable right now', attempts }, { status: 502 });
  }

  const payload = { location: { lat, lon }, system: { kwp, tilt, azimuth, loss: 14 }, ...result };
  cache.set(key, { at: Date.now(), data: payload });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=86400' } });
}
