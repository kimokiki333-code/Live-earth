import { NextResponse } from 'next/server';

export const maxDuration = 30;

/** Certificate Transparency via crt.sh — every cert ever issued for a domain. */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ error: 'A valid domain is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent('%.' + domain)}&output=json`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return NextResponse.json({ error: `crt.sh returned ${res.status}` }, { status: 502 });
    const rows = await res.json();
    if (Array.isArray(rows)) rows.sort((a: any, b: any) => String(b.not_before).localeCompare(String(a.not_before)));
    const seen = new Set<string>();
    const certificates: any[] = [];
    for (const c of Array.isArray(rows) ? rows : []) {
      const key = `${c.issuer_name}|${c.common_name}|${c.not_before}`;
      if (seen.has(key)) continue;
      seen.add(key);
      certificates.push({
        issuer_name: c.issuer_name,
        common_name: c.common_name,
        name_value: c.name_value,
        not_before: c.not_before,
        not_after: c.not_after,
      });
      if (certificates.length >= 100) break;
    }
    return NextResponse.json({ domain, certificates, timestamp: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch {
    return NextResponse.json({ error: 'Certificate lookup failed' }, { status: 502 });
  }
}
