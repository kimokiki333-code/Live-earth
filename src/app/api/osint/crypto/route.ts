import { NextResponse } from 'next/server';
import { analyseAddress } from '@/lib/chainIntel';

export const maxDuration = 60;

/** Wallet forensics — BTC / ETH / SOL via keyless chain APIs (lib/chainIntel). */
export async function GET(req: Request) {
  const address = (new URL(req.url).searchParams.get('address') || '').trim();
  if (!address) return NextResponse.json({ error: 'A wallet address is required' }, { status: 400 });
  try {
    const intel = await analyseAddress(address);
    return NextResponse.json(intel, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Chain lookup failed' }, { status: 502 });
  }
}
