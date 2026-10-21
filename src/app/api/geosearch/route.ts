import { NextResponse } from 'next/server';
import { nominatim } from '@/lib/nominatim';

export const maxDuration = 15;

/**
 * BADR LIVE EARTH — place search (was missing; Search and the route planner
 * both call this, so both were dead).
 * GET /api/geosearch?q=London[&lat=..&lng=..] -> { results: [{name, context, lat, lng, kind, score}] }
 */
interface NominatimRow {
  lat: string; lon: string; display_name: string; type?: string; class?: string; importance?: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const params: Record<string, string> = { q, limit: '8', addressdetails: '1', dedupe: '1' };
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // Bias toward what the map is looking at without hard-restricting results.
    params.viewbox = `${lng - 3},${lat + 3},${lng + 3},${lat - 3}`;
    params.bounded = '0';
  }
  const rows = await nominatim<NominatimRow[]>('search', params);
  const results = (rows || []).map((r) => {
    const parts = (r.display_name || '').split(',').map((x) => x.trim()).filter(Boolean);
    return {
      name: parts[0] || r.display_name,
      context: parts.slice(1).join(', '),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      kind: r.type || r.class || 'place',
      score: r.importance ?? 0,
    };
  }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  return NextResponse.json({ results });
}
