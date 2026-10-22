import { NextResponse } from 'next/server';

export const maxDuration = 20;

/**
 * IP / host geolocation for the recon toolkit. Resolves domains to an IP
 * first (DNS-over-HTTPS), then locates via ipwho.is. Shape carries a nested
 * `geo` (what the toolkit reads) plus flat fields for the map pin.
 */
async function locate(ip: string): Promise<any> {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`ipwho.is ${res.status}`);
  const d = await res.json();
  if (d && d.success === false) throw new Error(d.message || 'lookup failed');
  return d;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('ip') || '').trim().replace(/^https?:\/\//, '').split('/')[0];
  if (!q) return NextResponse.json({ error: 'An IP address or domain is required' }, { status: 400 });
  try {
    let ip = q;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(q) && !q.includes(':')) {
      const doh = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(q)}&type=1`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8000),
      });
      const dj = doh.ok ? await doh.json() : null;
      const answer = (dj?.Answer || []).find((a: any) => a.type === 1);
      if (!answer) return NextResponse.json({ error: 'Domain does not resolve to an IPv4 address' }, { status: 404 });
      ip = answer.data;
    }
    const d = await locate(ip);
    const geo = {
      lat: d.latitude,
      lon: d.longitude,
      city: d.city,
      region: d.region,
      country: d.country,
      country_code: d.country_code,
      isp: d.connection?.isp || d.connection?.org,
      org: d.connection?.org,
      as: d.connection?.asn ? `AS${d.connection.asn}` : undefined,
      timezone: d.timezone?.id,
    };
    return NextResponse.json({ ip, host: q, geo, ...geo, lng: geo.lon });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'IP lookup failed' }, { status: 502 });
  }
}
