import { NextResponse } from 'next/server';

export const maxDuration = 20;

/** BGP / ASN intelligence via RIPEstat — keyless routing registry data. */
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`RIPEstat ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ error: 'An IP address or ASN is required' }, { status: 400 });

  try {
    const asnMatch = q.match(/^(?:AS)?(\d{1,10})$/i);
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(q) || q.includes(':');

    if (isIp) {
      const info = await getJson(`https://stat.ripe.net/data/network-info/data.json?resource=${encodeURIComponent(q)}`);
      const prefix = info?.data?.prefix;
      const asns: string[] = info?.data?.asns || [];
      const prefixes = [];
      for (const asn of asns.slice(0, 3)) {
        const overview = await getJson(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`).catch(() => null);
        prefixes.push({
          prefix,
          asn: {
            asn: Number(asn),
            name: overview?.data?.holder || `AS${asn}`,
            country_code: '',
            description: overview?.data?.holder || '',
          },
        });
      }
      return NextResponse.json({ query: q, type: 'ip', ip: { prefixes }, timestamp: new Date().toISOString() });
    }

    if (asnMatch) {
      const asn = asnMatch[1];
      const [overview, announced] = await Promise.all([
        getJson(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`).catch(() => null),
        getJson(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asn}`).catch(() => null),
      ]);
      const holder: string = overview?.data?.holder || '';
      const list: any[] = announced?.data?.prefixes || [];
      return NextResponse.json({
        query: q,
        type: 'asn',
        asn: {
          asn: Number(asn),
          name: holder.replace(/^AS\d+\s*/i, '') || `AS${asn}`,
          description: holder,
          country_code: '',
        },
        prefixes: {
          total_v4: list.filter(p => !String(p.prefix).includes(':')).length,
          total_v6: list.filter(p => String(p.prefix).includes(':')).length,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Query must be an IP address or ASN' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'BGP lookup failed' }, { status: 502 });
  }
}
