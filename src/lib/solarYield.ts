/**
 * In-browser solar yield engine — the same math as /api/pvgis, ported so
 * the solar designer works on purely static hosting (e.g. InfinityFree)
 * where no Node server exists. Fetches Open-Meteo's ERA5 archive directly
 * from the visitor's browser (their API permits CORS) and transposes the
 * hourly radiation onto the panel plane with Duffie & Beckman geometry.
 *
 * Verified against the server route's live output (Cairo/Berlin/Khartoum,
 * tilt & azimuth matrices, July 2026). Keep the two implementations in
 * sync — same constants, same preceding-hour alignment.
 */

const LOSS = 0.14;
const D2R = Math.PI / 180;

export interface YieldResult {
  annual_kwh: number;
  specific_yield: number;
  annual_irradiation: number;
  monthly: { month: number; kwh: number }[];
  source: string;
}

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

/** Aggregate one year of hourly ERA5 radiation into monthly production. */
export function aggregateHourly(
  lat: number, lon: number, kwp: number, tilt: number, azimuth: number,
  times: string[], ghi: (number | null)[], dhi: (number | null)[], dni: (number | null)[],
): YieldResult | null {
  if (times.length < 8000) return null;
  const monthlyPoa = new Array(12).fill(0); // Wh/m²
  let used = 0;
  for (let i = 0; i < times.length; i++) {
    const g = ghi[i], df = dhi[i];
    if (g == null || df == null || g <= 0) continue;
    const month = Number(times[i].slice(5, 7));
    const day = Number(times[i].slice(8, 10));
    const hourUtc = Number(times[i].slice(11, 13));
    const n = dayOfYear(2023, month, day);
    const decl = 23.45 * D2R * Math.sin((2 * Math.PI * (284 + n)) / 365);
    const B = (2 * Math.PI * (n - 81)) / 364;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    // Open-Meteo stamps radiation as the average of the PRECEDING hour.
    const solarTime = hourUtc - 0.5 + lon / 15 + eot / 60;
    const hourAngle = 15 * D2R * (solarTime - 12);
    let dn = dni[i];
    if (dn == null) {
      const phi = lat * D2R;
      const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
      dn = cosZ > 0.02 ? Math.max(0, (g - df) / cosZ) : 0;
    }
    const cosT = Math.max(0, cosIncidence(lat, tilt, azimuth, decl, hourAngle));
    const poa =
      dn * cosT +
      df * ((1 + Math.cos(tilt * D2R)) / 2) +
      g * 0.2 * ((1 - Math.cos(tilt * D2R)) / 2);
    monthlyPoa[month - 1] += poa;
    used++;
  }
  if (used < 3000 || monthlyPoa.reduce((s, v) => s + v, 0) <= 0) return null;
  const monthly = monthlyPoa.map((wh, i) => ({ month: i + 1, kwh: Math.round((wh / 1000) * kwp * (1 - LOSS)) }));
  const annual = monthly.reduce((s, m) => s + m.kwh, 0);
  return {
    annual_kwh: annual,
    specific_yield: Math.round(annual / kwp),
    annual_irradiation: Math.round(monthlyPoa.reduce((s, v) => s + v, 0) / 1000),
    monthly,
    source: 'Open-Meteo archive (ERA5 reanalysis) + Duffie–Beckman plane-of-array model — computed in your browser',
  };
}

/** Full browser-side calculation: fetch ERA5 hourly data, then aggregate. */
export async function computeYieldInBrowser(
  lat: number, lon: number, kwp: number, tilt: number, azimuth: number,
): Promise<YieldResult> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=2023-01-01&end_date=2023-12-31` +
    `&hourly=shortwave_radiation,diffuse_radiation,direct_normal_irradiance&timezone=UTC`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const data = await res.json();
  const h = data?.hourly;
  if (!h?.time || !h?.shortwave_radiation || !h?.diffuse_radiation || !h?.direct_normal_irradiance) {
    throw new Error('Unexpected data from Open-Meteo');
  }
  const result = aggregateHourly(lat, lon, kwp, tilt, azimuth, h.time, h.shortwave_radiation, h.diffuse_radiation, h.direct_normal_irradiance);
  if (!result) throw new Error('Not enough radiation data for this location');
  return result;
}
