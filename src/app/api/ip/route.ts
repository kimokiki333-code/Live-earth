import { NextResponse } from 'next/server';
import { buildGeoRecord, isIp, isPrivateIp, type GeoRecord } from '@/lib/geo-ip';

export const maxDuration = 12;

/**
 * ARGUS GMI — address origin, resolved server-side.
 *
 * Two reasons this route exists at all:
 *
 *   The browser cannot see the address it is being served to, and every
 *   public provider reports the address that asked *them*. Called through
 *   this route, the answer is about the visitor's connection instead of the
 *   visitor's browser.
 *
 *   Not every network allows a browser to reach ipwho.is or ipapi.co
 *   directly (CORS, corporate filters). From here it is an ordinary outbound
 *   HTTP call, and the same providers are still the source.
 *
 * The client falls back to calling them itself if this route is missing or
 * cannot reach the network — see lib/geo-ip.ts. Neither path is trusted to be
 * the truth: both report a city-level estimate and say so.
 *
 * `GET /api/ip`          → the caller's address
 * `GET /api/ip?q=1.1.1.1` → that address
 */

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.toLowerCase() !== 'unknown' ? s : null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The last hop a trusted proxy wrote, never the client-written left entry. */
function clientAddress(request: Request): string | null {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf && isIp(cf)) return cf.trim();
  const real = request.headers.get('x-real-ip');
  if (real && isIp(real)) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map(h => h.trim()).filter(isIp);
    if (hops.length) return hops[hops.length - 1];
  }
  return null;
}

async function json(url: string, ms = 6000): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      headers: { Accept: 'application/json', 'User-Agent': 'ARGUS-GMI/1.0 (geoip)' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function lookup(target: string): Promise<GeoRecord | null> {
  const [who, co] = await Promise.all([
    json(`https://ipwho.is/${encodeURIComponent(target)}`),
    json(`https://ipapi.co/${encodeURIComponent(target)}/json/`),
  ]);

  const candidates: GeoRecord[] = [];

  if (who && who.success !== false) {
    const lat = num(who.latitude);
    const lng = num(who.longitude);
    const connection = (who.connection ?? {}) as Record<string, unknown>;
    const timezone = (who.timezone ?? {}) as Record<string, unknown>;
    const security = (who.security ?? {}) as Record<string, unknown>;
    if (lat !== null && lng !== null) {
      candidates.push(buildGeoRecord({
        ip: str(who.ip) ?? target,
        lat, lng,
        city: str(who.city),
        region: str(who.region),
        country: str(who.country),
        countryCode: str(who.country_code)?.toUpperCase() ?? null,
        postal: str(who.postal),
        timezone: str(timezone.id),
        utcOffset: num(timezone.utc_offset) ?? num(timezone.offset),
        isp: str(connection.isp),
        org: str(connection.org),
        asn: str(connection.asn) ? `AS${String(connection.asn).replace(/^AS/i, '')}` : null,
        kind: (str(who.type) ?? '').includes('IPv6') ? 'IPv6' : 'IPv4',
        hosting: Boolean(security.hosting),
        proxy: Boolean(security.proxy),
        mobile: connection.type === 'mobile',
        provider: 'ipwho.is',
      }));
    }
  }

  if (co && !co.error) {
    const lat = num(co.latitude);
    const lng = num(co.longitude);
    if (lat !== null && lng !== null) {
      candidates.push(buildGeoRecord({
        ip: str(co.ip) ?? target,
        lat, lng,
        city: str(co.city),
        region: str(co.region),
        country: str(co.country_name),
        countryCode: str(co.country_code)?.toUpperCase() ?? null,
        postal: str(co.postal),
        timezone: str(co.timezone),
        utcOffset: num(co.utc_offset),
        isp: str(co.org),
        org: str(co.org),
        asn: str(co.asn),
        kind: (str(co.version) ?? '').toUpperCase() === 'IPV6' ? 'IPv6' : 'IPv4',
        hosting: false,
        proxy: false,
        mobile: false,
        provider: 'ipapi.co',
      }));
    }
  }

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.confidence - a.confidence)[0];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asked = (url.searchParams.get('q') ?? '').trim();
  const self = url.searchParams.get('self') === '1';

  if (asked && !isIp(asked)) {
    return NextResponse.json({ ok: false, reason: 'Not an IP address.' }, { status: 400 });
  }

  /* A lookup of somebody else's address is safe to cache; the caller's own
     address must never be cached, by us or by an intermediary. */
  const target = asked || clientAddress(request);

  if (!target) {
    return NextResponse.json({ ok: false, reason: 'No client address in the request headers.' }, { status: 200 });
  }

  if (isPrivateIp(target)) {
    return NextResponse.json(
      { ok: false, reason: 'Private address — the request reached the server over a local network.', ip: target },
      { status: 200 },
    );
  }

  const record = await lookup(target);
  if (!record) {
    return NextResponse.json({ ok: false, reason: 'No provider answered.', ip: target }, { status: 200 });
  }

  return NextResponse.json(
    { ok: true, self: self && !asked, record },
    { headers: { 'Cache-Control': asked ? 'public, max-age=900' : 'no-store' } },
  );
}
