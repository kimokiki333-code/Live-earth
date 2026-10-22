import { NextResponse } from 'next/server';

export const maxDuration = 20;

/**
 * Sweep bootstrap: validates the target and locates its network centre.
 * The per-host Shodan InternetDB probing happens in the browser (batched),
 * so this route only has to say where the subnet lives.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ip = (searchParams.get('ip') || '').trim();
  const cidr = Math.min(28, Math.max(16, Number(searchParams.get('cidr')) || 24));
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return NextResponse.json({ error: 'A valid IPv4 address is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(9000) });
    const d = res.ok ? await res.json() : null;
    return NextResponse.json({
      target_ip: ip,
      cidr,
      center: {
        lat: d?.latitude ?? null,
        lng: d?.longitude ?? null,
        city: d?.city || 'Unknown',
        country: d?.country || 'Unknown',
        isp: d?.connection?.isp || d?.connection?.org || 'Unknown',
        asn: d?.connection?.asn ? `AS${d.connection.asn}` : 'Unknown',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Sweep bootstrap failed' }, { status: 502 });
  }
}
