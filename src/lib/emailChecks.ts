import { createHash } from 'crypto';

/**
 * Individual email-intelligence checkers. Each one stands alone and can be
 * tested alone via /api/osint/email/check/<name>?email=...
 *
 * Technique family: account-existence checks against services' own public
 * endpoints (pioneered by Holehe by megadose and Blackbird — the approach
 * is theirs, this keyless implementation is ours), Gravatar profile lookup,
 * MX deliverability, and breach exposure via XposedOrNot.
 *
 * A checker returns 'unknown' when the service blocks or misbehaves —
 * never a guessed 'not_found'.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export type AccountCheck = {
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

export function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

/** Does the domain accept mail at all? (MX, falling back to A) */
export async function checkDomainMx(domain: string): Promise<boolean | null> {
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

/** Gravatar: public-by-design profile + avatar + verified accounts. */
export async function checkGravatar(email: string): Promise<any | null> {
  const hash = md5(email);
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

export async function checkDuolingo(email: string): Promise<AccountCheck> {
  try {
    const { ok, data } = await fetchJson(`https://www.duolingo.com/2017-06-30/users?email=${encodeURIComponent(email)}`);
    if (!ok) return { site: 'Duolingo', status: 'unknown' };
    const user = data?.users?.[0];
    if (user) {
      const uname = user.username || user.name || '';
      return uname
        ? { site: 'Duolingo', status: 'found', detail: `username: ${uname}`, url: `https://www.duolingo.com/profile/${uname}` }
        : { site: 'Duolingo', status: 'found', detail: 'account exists' };
    }
    return { site: 'Duolingo', status: 'not_found' };
  } catch { return { site: 'Duolingo', status: 'unknown' }; }
}

export async function checkFirefox(email: string): Promise<AccountCheck> {
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

export async function checkSpotify(email: string): Promise<AccountCheck> {
  try {
    const { ok, data } = await fetchJson(`https://spclient.wg.spotify.com/signup/public/v1/account?validate=1&email=${encodeURIComponent(email)}`);
    if (!ok || !data) return { site: 'Spotify', status: 'unknown' };
    if (data.status === 20 || data?.errors?.email) return { site: 'Spotify', status: 'found' };
    if (data.status === 1) return { site: 'Spotify', status: 'not_found' };
    return { site: 'Spotify', status: 'unknown' };
  } catch { return { site: 'Spotify', status: 'unknown' }; }
}

export async function checkMicrosoft(email: string): Promise<AccountCheck> {
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

export async function checkGithub(email: string): Promise<AccountCheck> {
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

export async function checkBreaches(email: string): Promise<{ breached: boolean; breaches: string[]; data_exposed: string[] } | null> {
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

/** Registry for the single-check test endpoint. */
export const SINGLE_CHECKS: Record<string, (email: string) => Promise<any>> = {
  gravatar: (email) => checkGravatar(email),
  duolingo: (email) => checkDuolingo(email),
  firefox: (email) => checkFirefox(email),
  spotify: (email) => checkSpotify(email),
  microsoft: (email) => checkMicrosoft(email),
  github: (email) => checkGithub(email),
  breaches: (email) => checkBreaches(email),
  mx: (email) => checkDomainMx(email.split('@')[1] || '').then(deliverable => ({ domain: email.split('@')[1] || '', deliverable })),
};
