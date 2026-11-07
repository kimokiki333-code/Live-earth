import { NextResponse } from 'next/server';

export const maxDuration = 20;

/** DNS records via Cloudflare DNS-over-HTTPS — keyless, all major types. */
const TYPES: Record<string, number> = { A: 1, AAAA: 28, MX: 15, NS: 2, TXT: 16, CNAME: 5, SOA: 6, CAA: 257 };

async function queryType(name: string, type: number): Promise<any[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.Answer) ? data.Answer : [];
}

export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 });
  }
  try {
    const out: Record<string, any> = { domain, timestamp: new Date().toISOString() };
    await Promise.all(Object.entries(TYPES).map(async ([label, code]) => {
      const answers = await queryType(domain, code).catch(() => []);
      if (!answers.length) return;
      if (label === 'MX') out.MX = answers.map(a => { const [priority, ...rest] = String(a.data).split(' '); return { priority: Number(priority) || 0, exchange: rest.join(' ').replace(/\.$/, '') }; });
      else if (label === 'TXT') out.TXT = answers.map(a => String(a.data).replace(/"/g, ''));
      else if (label === 'SOA') { const p = String(answers[0].data).split(' '); out.SOA = { nsname: p[0], hostmaster: p[1], serial: p[2] }; }
      else out[label] = answers.map(a => String(a.data).replace(/\.$/, ''));
    }));
    return NextResponse.json(out, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch {
    return NextResponse.json({ error: 'DNS lookup failed' }, { status: 502 });
  }
}
