import { NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * Breaking-news wire via the GDELT DOC API — keyless global news index.
 * Returns the shape the alert stack consumes: { news, sources, timestamp }.
 */
function toIso(seendate: string): string {
  // GDELT seendate: 20261022T123000Z
  const m = seendate?.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

export async function GET() {
  try {
    const query = encodeURIComponent('(war OR conflict OR missile OR earthquake OR explosion OR airstrike OR flood OR hurricane)');
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&timespan=24h&maxrecords=75&sort=datedesc&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'BADR-LIVE-EARTH/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return NextResponse.json({ error: `GDELT returned ${res.status}` }, { status: 502 });
    const data = await res.json();
    const seen = new Set<string>();
    const news = (data.articles || [])
      .filter((a: any) => a.title && !seen.has(a.title) && seen.add(a.title))
      .map((a: any) => ({
        title: a.title,
        published: toIso(a.seendate || ''),
        description: '',
        source: a.domain || 'gdelt',
        source_name: a.domain || 'GDELT',
        link: a.url,
        language: a.language,
        source_country: a.sourcecountry,
      }));
    return NextResponse.json({
      news,
      sources: [{ id: 'gdelt', name: 'GDELT DOC', status: 'ok', ok: true, count: news.length }],
      timestamp: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch {
    return NextResponse.json({ error: 'News wire unavailable' }, { status: 502 });
  }
}
