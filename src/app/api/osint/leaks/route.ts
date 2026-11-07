import { NextResponse } from 'next/server';

export const maxDuration = 20;

/** Breach exposure via XposedOrNot — keyless breach-analytics endpoint. */
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get('email') || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 404) {
      return NextResponse.json({ email, breached: false, breaches: [], data_exposed: [] });
    }
    if (!res.ok) return NextResponse.json({ error: `Breach service returned ${res.status}` }, { status: 502 });
    const data = await res.json();
    const breaches: string[] = data?.BreachesSummary?.site ? data.BreachesSummary.site.split(';').filter(Boolean) : [];
    const exposed = new Set<string>();
    for (const item of data?.ExposedData || []) {
      for (const dc of item.data_classes || []) exposed.add(dc);
    }
    return NextResponse.json({
      email,
      breached: breaches.length > 0,
      breaches,
      data_exposed: Array.from(exposed).sort(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  } catch {
    return NextResponse.json({ error: 'Breach lookup failed' }, { status: 502 });
  }
}
