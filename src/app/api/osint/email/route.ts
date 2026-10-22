import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const maxDuration = 30;

/**
 * EMAIL INTEL — what is publicly knowable about an email address.
 *
 * Technique: account-existence checks against services' own public
 * endpoints (the family of checks pioneered by Holehe by megadose and
 * Blackbird — the approach is theirs, this keyless reimplementation is
 * ours), a Gravatar profile lookup, an MX deliverability check, and
 * breach exposure via XposedOrNot (same source as DATA LEAKS).
 *
 * Every checker runs independently; a service that blocks datacentre
 * traffic reports "unknown" rather than a false "not found".
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

type AccountCheck = {
  site: string;
  status: 'found' | 'not_found' | 'unknown';
  detail?: string;
  url?: string;
};

async function fetchJson(url: string, init?: RequestInit, ms = 9000): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers || {}) },
    signal: AbortSignal.timeout(ms),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data };
}

/* ── individual checkers ─────────────────────────────────────────────── */

async function checkDomainMx(domain: string): Promise<boolean | null> {
  try {
    for (const type of ['MX', 'A']) {
      const { data } = await fetchJson(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' } },
        7000,
      );
      if (Array.isArray(data?.Answer) && data.Answer.length > 0) return true;
    }
    return false;
  } catch { return null; }
}

async function checkGravatar(email: string, hash: string): Promise<any | null> {
  try {
    const { ok, data } = await fetchJson(`https://www.gravatar.com/${hash}.json`, undefined, 8000);
    const entry = ok ? data?.entry?.[0] : null;
    if (!entry) return { registered: false };
    return {
      registered: true,
      name: entry.displayName || entry.preferredUsername || null,
      username: entry.preferredUsername || null,
      about: entry.aboutMe || null,
      avatar: entry.thumbnailUrl || `https://www.gravatar.com/avatar/${hash}?s=160`,
      profile_url: entry.profileUrl || null,
      location: entry.currentLocation || null,
      accounts: (entry.accounts || []).map((a: any) => ({ service: a.shortname, url: a.url })),
      links: (entry.urls || []).map((u: any) => ({ title: u.title || u.value, url: u.value })),
    };
  } catch { return null; }
}

async function checkDuolingo(email: string): Promise<AccountCheck> {
  try {
    const { ok, data } = await fetchJson(`https://www.duolingo.com/2017-06-30/users?email=${encodeURIComponent(email)}`);
    if (!ok) return { site: 'Duolingo', status: 'unknown' };
    const user = data?.users?.[0];
    if (user) return { site: 'Duolingo', status: 'found', detail: `username: ${user.username}`, url: `https://www.duolingo.com/profile/${user.username}` };
    return { site: 'Duolingo', status: 'not_found' };
  } catch { return { site: 'Duolingo', status: 'unknown' }; }
}

async function checkFirefox(email: string): Promise<AccountCheck> {
  try {
    const { ok, data } = await fetchJson('https://api.accounts.firefox.com/v1/account/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!ok || typeof data?.exists !== 'boolean') return { site: 'Mozilla / Firefox', status: 'unknown' };
    return { site: 'Mozilla / Firefox', status: data.exists ? 'found' : 'not_found' };
  } catch { return { site: 'Mozilla / Firefox', status: 'unknown' }; }
}

async function checkSpotify(email: string): Promise<AccountCheck> {
  try {
    const { ok, data } = await fetchJson(`https://spclient.wg.spotify.com/signup/public/v1/account?validate=1&email=${encodeURIComponent(email)}`);
    if (!ok || !data) return { site: 'Spotify', status: 'unknown' };
    if (data.status === 20 || data?.errors?.email) return { site: 'Spotify', status: 'found' };
    if (data.status === 1) return { site: 'Spotify', status: 'not_found' };
    return { site: 'Spotify', status: 'unknown' };
  } catch { return { site: 'Spotify', status: 'unknown' }; }
}

async function checkMicrosoft(email: string): Promise<AccountCheck> {
  try {
    const { ok, data } = await fetchJson('https://login.microsoftonline.com/common/GetCredentialType', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Username: email,
        isOtherIdpSupported: true,
        checkPhones: false,
        isRemoteNGCSupported: true,
        isCookieBannerShown: false,
        isFidoSupported: true,
        country: 'US',
        isSignup: false,
      }),
    });
    if (!ok || typeof data?.IfExistsResult !== 'number') return { site: 'Microsoft / Outlook', status: 'unknown' };
    if (data.IfExistsResult === 0) return { site: 'Microsoft / Outlook', status: 'found' };
    if (data.IfExistsResult === 1) return { site: 'Microsoft / Outlook', status: 'not_found' };
    return { site: 'Microsoft / Outlook', status: 'unknown', detail: 'federated account (custom IdP)' };
  } catch { return { site: 'Microsoft / Outlook', status: 'unknown' }; }
}

async function checkGithub(email: string): Promise<AccountCheck> {
  try {
    const { ok, status, data } = await fetchJson(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`);
    if (status === 403 || status === 429) return { site: 'GitHub', status: 'unknown', detail: 'rate-limited' };
    if (!ok) return { site: 'GitHub', status: 'unknown' };
    const user = data?.items?.[0];
    if ((data?.total_count ?? 0) > 0 && user) {
      return { site: 'GitHub', status: 'found', detail: `@${user.login}`, url: user.html_url };
    }
    return { site: 'GitHub', status: 'not_found' };
  } catch { return { site: 'GitHub', status: 'unknown' }; }
}

async function checkBreaches(email: string): Promise<{ breached: boolean; breaches: string[]; data_exposed: string[] } | null> {
  try {
    const res = await fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(email)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { breached: false, breaches: [], data_exposed: [] };
    if (!res.ok) return null;
    const data = await res.json();
    const breaches: string[] = data?.BreachesSummary?.site ? data.BreachesSummary.site.split(';').filter(Boolean) : [];
    const exposed = new Set<string>();
    for (const item of data?.ExposedData || []) for (const dc of item.data_classes || []) exposed.add(dc);
    return { breached: breaches.length > 0, breaches, data_exposed: Array.from(exposed).sort() };
  } catch { return null; }
}

/* ── route ───────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }
  const [local, domain] = email.split('@');
  const hash = createHash('md5').update(email).digest('hex');

  const [mx, gravatar, breaches, ...accounts] = await Promise.all([
    checkDomainMx(domain),
    checkGravatar(email, hash),
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
