import { NextResponse } from 'next/server';
import {
  checkDomainMx, checkGravatar, checkBreaches,
  checkDuolingo, checkFirefox, checkSpotify, checkMicrosoft, checkGithub,
} from '@/lib/emailChecks';

export const maxDuration = 30;

/**
 * EMAIL INTEL — the combined tool. Every check inside it lives in
 * lib/emailChecks and is individually testable at
 * /api/osint/email/check/<name>?email=... (verified one by one first,
 * per step-by-step discipline).
 */
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }
  const [local, domain] = email.split('@');

  const [mx, gravatar, breaches, ...accounts] = await Promise.all([
    checkDomainMx(domain),
    checkGravatar(email),
    checkBreaches(email),
    checkDuolingo(email),
    checkFirefox(email),
    checkSpotify(email),
    checkMicrosoft(email),
    checkGithub(email),
  ]);

  const found = accounts.filter(a => a.status === 'found');
  return NextResponse.json({
    email,
    domain,
    username_hint: local,
    domain_deliverable: mx,
    gravatar,
    accounts,
    found_count: found.length,
    checked_count: accounts.length + (gravatar ? 1 : 0),
    breached: breaches?.breached ?? null,
    breaches: breaches?.breaches ?? [],
    data_exposed: breaches?.data_exposed ?? [],
    sources: ['Gravatar', 'Duolingo', 'Mozilla accounts', 'Spotify', 'Microsoft', 'GitHub', 'XposedOrNot', 'Cloudflare DoH'],
  }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}
