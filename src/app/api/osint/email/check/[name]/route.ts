import { NextResponse } from 'next/server';
import { SINGLE_CHECKS } from '@/lib/emailChecks';

export const maxDuration = 20;

/**
 * ONE email check, alone — for step-by-step verification before the
 * combined EMAIL INTEL tool is trusted.
 * GET /api/osint/email/check/gravatar?email=someone@example.com
 * names: gravatar | duolingo | firefox | spotify | microsoft | github | breaches | mx
 */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }
  const check = SINGLE_CHECKS[name];
  if (!check) {
    return NextResponse.json({ error: `Unknown check "${name}"`, available: Object.keys(SINGLE_CHECKS) }, { status: 404 });
  }
  try {
    const result = await check(email);
    return NextResponse.json({ check: name, email, result }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
  } catch (e: any) {
    return NextResponse.json({ check: name, email, error: e?.message || 'check failed' }, { status: 502 });
  }
}
