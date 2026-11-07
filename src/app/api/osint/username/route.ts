import { NextResponse } from 'next/server';
import { scanUsername, isValidUsername } from '@/lib/sherlock';

export const maxDuration = 60;

/** Username hunt — sherlock engine (lib/sherlock) with control-handle calibration. */
export async function GET(req: Request) {
  const username = (new URL(req.url).searchParams.get('username') || '').trim().replace(/^@/, '');
  if (!username || !isValidUsername(username)) {
    return NextResponse.json({ error: 'A valid username is required' }, { status: 400 });
  }
  try {
    const scan = await scanUsername(username, { concurrency: 12, timeoutMs: 8000 });
    return NextResponse.json(scan, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Username hunt failed' }, { status: 502 });
  }
}
