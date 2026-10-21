import { NextResponse } from 'next/server';

export const maxDuration = 12;

/**
 * BADR LIVE EARTH — caller's own location by IP (was missing; the route
 * planner's "my location" fallback and OSINT self-track call this).
 * Shape mirrors ip-api: { status, lat, lon, city, country, query, isp, org, as }
 */
function clientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) { const hops = fwd.split(',').map((h) => h.trim()).filter(Boolean); if (hops.length) return hops[hops.length - 1]; }
  return '';
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const d = await res.json();
    if (d && d.success !== false && typeof d.latitude === 'number' && typeof d.longitude === 'number') {
      return NextResponse.json({
        status: 'success', lat: d.latitude, lon: d.longitude,
        city: d.city || '', country: d.country || '',
        query: d.ip || ip, isp: d.connection?.isp || '', org: d.connection?.org || '',
        as: d.connection?.asn ? `AS${d.connection.asn}` : '',
      });
    }
  } catch { /* fall through */ }
  return NextResponse.json({ status: 'fail', message: 'Could not determine location' }, { status: 200 });
}
