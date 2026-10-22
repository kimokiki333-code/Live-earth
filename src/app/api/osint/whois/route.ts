import { NextResponse } from 'next/server';

export const maxDuration = 20;

/** WHOIS via RDAP — the registry's own structured record, keyless. */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ error: `Registry returned ${res.status}` }, { status: 502 });
    const d = await res.json();

    let registrar: string | undefined;
    for (const e of d.entities || []) {
      if ((e.roles || []).includes('registrar')) {
        const fn = (e.vcardArray?.[1] || []).find((v: any[]) => v[0] === 'fn');
        registrar = fn?.[3];
      }
    }
    const events: Record<string, string> = {};
    for (const ev of d.events || []) events[ev.eventAction] = ev.eventDate;

    return NextResponse.json({
      domain_name: d.ldhName || domain,
      registrar,
      creation_date: events.registration,
      expiration_date: events.expiration,
      updated_date: events['last changed'],
      status: d.status || [],
      name_servers: (d.nameservers || []).map((n: any) => n.ldhName).filter(Boolean),
      timestamp: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } });
  } catch {
    return NextResponse.json({ error: 'WHOIS lookup failed' }, { status: 502 });
  }
}
