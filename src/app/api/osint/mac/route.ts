import { NextResponse } from 'next/server';

export const maxDuration = 15;

/** MAC vendor lookup via macvendors.com — keyless OUI registry. */
export async function GET(req: Request) {
  const mac = (new URL(req.url).searchParams.get('mac') || '').trim();
  if (!/^[0-9a-fA-F]{2}([:-]?[0-9a-fA-F]{2}){5}$/.test(mac.replace(/\./g, ''))) {
    return NextResponse.json({ error: 'A valid MAC address is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(mac)}`, { signal: AbortSignal.timeout(8000) });
    const vendor = res.ok ? (await res.text()).trim() : 'Not Found';
    return NextResponse.json({ mac, vendor: vendor || 'Not Found' }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    });
  } catch {
    return NextResponse.json({ mac, vendor: 'Not Found' });
  }
}
