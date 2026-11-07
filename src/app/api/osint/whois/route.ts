import { NextResponse } from 'next/server';

export const maxDuration = 25;

/**
 * WHOIS via RDAP — the registry's own structured record, keyless.
 * rdap.org's redirector refuses datacentre clients, so resolve the real
 * registry endpoint from IANA's RDAP bootstrap (tld → service URL) and
 * ask the registry directly.
 */
let bootstrapCache: { at: number; services: any[] } | null = null;

async function rdapServiceFor(tld: string): Promise<string | null> {
  if (!bootstrapCache || Date.now() - bootstrapCache.at > 24 * 3600_000) {
    const res = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    bootstrapCache = { at: Date.now(), services: data.services || [] };
  }
  for (const [tlds, urls] of bootstrapCache.services) {
    if ((tlds as string[]).includes(tld)) return (urls as string[])[0].replace(/\/?$/, '/');
  }
  return null;
}

export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 });
  }
  const headers = { Accept: 'application/rdap+json, application/json', 'User-Agent': 'BADR-LIVE-EARTH/1.0' };
  try {
    const tld = domain.split('.').pop() || '';
    const base = await rdapServiceFor(tld).catch(() => null);
    const candidates = [
      ...(base ? [`${base}domain/${domain}`] : []),
      `https://rdap.org/domain/${domain}`,
    ];
    let d: any = null;
    let lastStatus = 0;
    for (const url of candidates) {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) }).catch(() => null);
      if (res?.ok) { d = await res.json(); break; }
      lastStatus = res?.status || 0;
    }
    if (!d) {
      // RDAP refused (some registries 403 datacentre clients): fall back to
      // the classic plain-text WHOIS record and parse the labelled lines.
      const ht = await fetch(`https://api.hackertarget.com/whois/?q=${encodeURIComponent(domain)}`, {
        headers: { 'User-Agent': 'BADR-LIVE-EARTH/1.0' },
        signal: AbortSignal.timeout(12000),
      }).catch(() => null);
      const text = ht?.ok ? await ht.text() : '';
      if (!text || /error|invalid/i.test(text.slice(0, 60))) {
        return NextResponse.json({ error: `Registry returned ${lastStatus || 'no answer'}` }, { status: 502 });
      }
      const grab = (labels: string[]) => {
        for (const line of text.split('\n')) {
          const idx = line.indexOf(':');
          if (idx < 0) continue;
          if (labels.includes(line.slice(0, idx).trim().toLowerCase())) return line.slice(idx + 1).trim();
        }
        return undefined;
      };
      const grabAll = (labels: string[]) => text.split('\n')
        .filter(line => labels.includes(line.slice(0, line.indexOf(':')).trim().toLowerCase()))
        .map(line => line.slice(line.indexOf(':') + 1).trim()).filter(Boolean);
      return NextResponse.json({
        domain_name: domain,
        registrar: grab(['registrar', 'sponsoring registrar']),
        creation_date: grab(['creation date', 'created', 'registration date']),
        expiration_date: grab(['registry expiry date', 'expiry date', 'expiration date', 'registrar registration expiration date']),
        updated_date: grab(['updated date', 'last modified']),
        status: grabAll(['domain status', 'status']),
        name_servers: grabAll(['name server', 'nameserver', 'nserver']),
        timestamp: new Date().toISOString(),
      }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } });
    }

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
