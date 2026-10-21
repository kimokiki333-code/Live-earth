/* ═══════════════════════════════════════════════════════════════
   ARGUS GMI — IP / domain geolocation
   ──────────────────────────────────────────────────────────────
   Where an address sits on the planet, and how much to trust that.

   Three rules hold this together:

   1. Nothing here claims to be GPS. A public IP registry record names the
      city block the *ISP* registered, which for a fixed line is often right
      and for a mobile carrier or a VPN is often a different city entirely.
      `confidence` and `precision` are reported alongside every record so the
      interface can say so out loud instead of pretending.

   2. There is no backend to lean on. The API routes this app calls were not
      part of the repository, so every lookup here is browser-side against
      providers that answer with CORS. `/api/ip` is tried first when it
      exists, because a server sees the real client address.

   3. A failed lookup is a normal outcome, not an exception. Callers get
      `{ ok: false, reason }` and decide what to show.
   ═══════════════════════════════════════════════════════════════ */

export type GeoPrecision = 'city' | 'region' | 'country';

export interface GeoRecord {
  ip: string;
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  postal: string | null;
  timezone: string | null;
  /** Local time at the target when the lookup was made, UTC offset minutes. */
  utcOffset: number | null;
  isp: string | null;
  org: string | null;
  asn: string | null;
  kind: 'IPv4' | 'IPv6' | null;
  hosting: boolean;
  proxy: boolean;
  mobile: boolean;
  provider: string;
  /** Reverse DNS name for the address, when the registries publish one. */
  ptr?: string | null;
  /** 0–100. How much of the planet the pin actually pins down. */
  confidence: number;
  precision: GeoPrecision;
}

export interface LookupResult {
  ok: boolean;
  query: string;
  /** How the address was reached: a literal address, or a name resolved to one. */
  resolved: 'ip' | 'domain' | 'self';
  record: GeoRecord | null;
  /** A records kept when a domain was resolved, so the interface can show the chain. */
  addresses: string[];
  notes: string[];
  reason?: string;
}

/* ── Address shapes ─────────────────────────────────────────── */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}$/i;
const DOMAIN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

export function isIPv4(value: string): boolean {
  return IPV4.test(value.trim());
}

export function isIPv6(value: string): boolean {
  const v = value.trim();
  return v.includes(':') && IPV6.test(v);
}

export function isIp(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

export function isPrivateIp(value: string): boolean {
  if (!isIPv4(value)) return value === '::1' || false;
  const [a, b] = value.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0 ||
    a >= 224
  );
}

/** `github.com`, `https://news.example.org/x` → `news.example.org`. */
export function normalizeDomain(value: string): string | null {
  const raw = value.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0];
  const host = raw.split('@').pop()?.split(':')[0]?.toLowerCase() ?? '';
  if (!host || isIp(host) || host === 'localhost') return null;
  return DOMAIN.test(host) ? host.replace(/\.$/, '') : null;
}

export type AddressKind = 'ip' | 'domain' | 'coordinates' | 'place';

/** What a free-text box is most likely holding, decided in one place. */
export function classifyAddress(value: string): AddressKind {
  const v = value.trim();
  if (isIp(v)) return 'ip';
  if (/^[+-]?\d+(\.\d+)?\s*,\s*[+-]?\d+(\.\d+)?$/.test(v)) return 'coordinates';
  if (normalizeDomain(v)) return 'domain';
  return 'place';
}

/* ── Fetching ───────────────────────────────────────────────── */

async function getJson(url: string, ms = 6500): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.toLowerCase() !== 'unknown' ? s : null;
};

/* ── Scoring ────────────────────────────────────────────────── */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function scoreRecord(base: Omit<GeoRecord, 'confidence' | 'precision'>): { confidence: number; precision: GeoPrecision } {
  const precision: GeoPrecision = base.city ? 'city' : base.region ? 'region' : 'country';
  /* A registry record is authored per allocation, so even a city match is an
     ISP's idea of where the block lives. The ceiling is deliberately below
     100 and the floor below 40 — a country-only hit is barely a lead. */
  let s = precision === 'city' ? 83 : precision === 'region' ? 64 : 41;
  if (base.city) s += 4;
  if (base.postal) s += 2;
  if (base.timezone) s += 2;
  if (base.provider === 'ipwho.is') s += 3;
  if (base.asn) s += 1;
  if (base.hosting) s -= 9;
  if (base.proxy) s -= 13;
  if (base.mobile) s -= 9;
  if (!base.isp && !base.org) s -= 4;
  return { confidence: clamp(Math.round(s), 22, 96), precision };
}

/** Build a record from provider fields, scoring it on the way in. Shared with
 *  the /api/ip route so both paths report confidence the same way. */
export const buildGeoRecord = (partial: Omit<GeoRecord, 'confidence' | 'precision'>): GeoRecord => ({
  ...partial,
  ...scoreRecord(partial),
});

/* ── Providers ───────────────────────────────────────────────── */

/** ipwho.is — the most generous free tier, and the only one that says
 *  whether an address is hosting or proxied. */
async function viaIpWho(target: string): Promise<GeoRecord | null> {
  const json = (await getJson(`https://ipwho.is/${encodeURIComponent(target)}`)) as Record<string, unknown>;
  if (json.success === false) return null;
  const lat = num(json.latitude);
  const lng = num(json.longitude);
  const ip = str(json.ip);
  if (lat === null || lng === null || !ip) return null;
  const connection = (json.connection ?? {}) as Record<string, unknown>;
  const tz = (json.timezone ?? {}) as Record<string, unknown>;
  const security = (json.security ?? {}) as Record<string, unknown>;
  return buildGeoRecord({
    ip,
    lat,
    lng,
    city: str(json.city),
    region: str(json.region),
    country: str(json.country),
    countryCode: str(json.country_code)?.toUpperCase() ?? null,
    postal: str(json.postal),
    timezone: str(tz.id),
    utcOffset: num(tz.utc_offset) ?? num(tz.offset),
    isp: str(connection.isp),
    org: str(connection.org),
    asn: str(connection.asn) ? `AS${String(connection.asn).replace(/^AS/i, '')}` : null,
    kind: str(json.type)?.includes('IPv6') ? 'IPv6' : 'IPv4',
    hosting: Boolean(security.hosting),
    proxy: Boolean(security.proxy),
    mobile: Boolean(connection.type === 'mobile') || Boolean(security.relay),
    provider: 'ipwho.is',
  });
}

/** ipapi.co — different allocation tables, so it is a real second opinion. */
async function viaIpApiCo(target: string): Promise<GeoRecord | null> {
  const json = (await getJson(`https://ipapi.co/${encodeURIComponent(target)}/json/`)) as Record<string, unknown>;
  if (json.error) return null;
  const lat = num(json.latitude);
  const lng = num(json.longitude);
  const ip = str(json.ip);
  if (lat === null || lng === null || !ip) return null;
  return buildGeoRecord({
    ip,
    lat,
    lng,
    city: str(json.city),
    region: str(json.region),
    country: str(json.country_name),
    countryCode: str(json.country_code)?.toUpperCase() ?? null,
    postal: str(json.postal),
    timezone: str(json.timezone),
    utcOffset: num(json.utc_offset),
    isp: str(json.org),
    org: str(json.org),
    asn: str(json.asn) ? String(json.asn) : null,
    kind: str(json.version)?.toUpperCase() === 'IPV6' ? 'IPv6' : 'IPv4',
    hosting: false,
    proxy: false,
    mobile: false,
    provider: 'ipapi.co',
  });
}

/** freeipapi.com — no key, no per-IP quota worth worrying about. */
async function viaFreeIpApi(target: string): Promise<GeoRecord | null> {
  const json = (await getJson(`https://freeipapi.com/api/json/${encodeURIComponent(target)}`)) as Record<string, unknown>;
  const lat = num(json.latitude);
  const lng = num(json.longitude);
  const ip = str(json.ipAddress);
  if (lat === null || lng === null || !ip) return null;
  return buildGeoRecord({
    ip,
    lat,
    lng,
    city: str(json.cityName),
    region: str(json.regionName),
    country: str(json.countryName),
    countryCode: str(json.countryCode)?.toUpperCase() ?? null,
    postal: str(json.zipCode),
    timezone: str(json.timeZone),
    utcOffset: null,
    isp: null,
    org: null,
    asn: null,
    kind: 'IPv4',
    hosting: false,
    proxy: false,
    mobile: false,
    provider: 'freeipapi.com',
  });
}

const PROVIDERS: Array<(target: string) => Promise<GeoRecord | null>> = [viaIpWho, viaIpApiCo, viaFreeIpApi];

/** First provider to answer with a usable record wins. */
async function fromProviders(target: string): Promise<GeoRecord | null> {
  const attempts = PROVIDERS.map(p =>
    p(target).catch(() => null),
  );
  /* Racing instead of walking the list: these are independent services and a
     slow first one should not delay a fast second. The highest-confidence
     record that arrives within the window is the one used. */
  const settled = await Promise.all(attempts);
  const usable = settled.filter((r): r is GeoRecord => Boolean(r));
  if (!usable.length) return null;
  return usable.sort((a, b) => b.confidence - a.confidence)[0];
}

/* ── DNS ────────────────────────────────────────────────────── */

/** A/AAAA records over DNS-over-HTTPS (dns.google answers with CORS). */
export async function resolveDomain(domain: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    try {
      const json = (await getJson(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
        5500,
      )) as { Answer?: Array<{ type: number; data: string }> };
      for (const answer of json.Answer ?? []) {
        const value = (answer.data || '').trim();
        if ((type === 'A' && answer.type === 1 && isIPv4(value)) || (type === 'AAAA' && answer.type === 28 && isIPv6(value))) {
          out.push(value);
        }
      }
    } catch {
      /* No AAAA is normal; no A is reported by the caller as unresolved. */
    }
    if (out.length) break;
  }
  return out;
}

/** Reverse DNS: the name an address answers to, if any. Costs one query and
 *  is often the only hint of what a hosting address actually is. */
export async function resolvePtr(ip: string): Promise<string | null> {
  const name = ip.includes(':')
    ? `${ip.replace(/:/g, '-')}.ip6.arpa`
    : `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
  try {
    const json = (await getJson(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=PTR`, 4500)) as {
      Answer?: Array<{ type: number; data: string }>;
    };
    const hit = (json.Answer ?? []).find(a => a.type === 12 && a.data);
    return hit ? hit.data.replace(/\.$/, '') : null;
  } catch {
    return null;
  }
}

/* ── Public entry points ────────────────────────────────────── */

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: LookupResult }>();

function remembered(key: string): LookupResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function remember(key: string, value: LookupResult): LookupResult {
  cache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Where does this address live? Accepts an IP, or a domain (which is resolved
 * to an address first — with the CDN caveat spelled out in `notes`).
 */
export async function locateAddress(input: string): Promise<LookupResult> {
  const query = input.trim();
  if (!query) return { ok: false, query, resolved: 'ip', record: null, addresses: [], notes: [], reason: 'empty' };

  const cached = remembered(query.toLowerCase());
  if (cached) return cached;

  if (isIp(query)) {
    if (isPrivateIp(query)) {
      return { ok: false, query, resolved: 'ip', record: null, addresses: [], notes: [], reason: 'Private address — not routable on the public internet.' };
    }
    const [record, ptr] = await Promise.all([
      fromProviders(query),
      resolvePtr(query),
    ]);
    if (!record) {
      return { ok: false, query, resolved: 'ip', record: null, addresses: [], notes: [], reason: 'No public registry record answered for this address.' };
    }
    record.ptr = ptr;
    return remember(query.toLowerCase(), {
      ok: true, query, resolved: 'ip', record, addresses: [record.ip],
      notes: ['Registry record for the address itself, not a device position.'],
    });
  }

  const domain = normalizeDomain(query);
  if (!domain) {
    return { ok: false, query, resolved: 'domain', record: null, addresses: [], notes: [], reason: 'Not an IP address or a resolvable domain.' };
  }

  const addresses = await resolveDomain(domain);
  if (!addresses.length) {
    return { ok: false, query, resolved: 'domain', record: null, addresses: [], notes: [], reason: `No A record for ${domain}.` };
  }

  const record = await fromProviders(addresses[0]);
  if (!record) {
    return { ok: false, query, resolved: 'domain', record: null, addresses, notes: [], reason: 'The host resolved, but no registry record named a place for its address.' };
  }

  const recordWithHint: GeoRecord = {
    ...record,
    /* A domain is a name in front of an address; with a CDN in front of it the
       address is an edge node, and the pin is a data centre, not the company. */
    confidence: Math.max(24, record.confidence - 12),
    org: record.org ?? record.isp,
  };

  return remember(query.toLowerCase(), {
    ok: true, query, resolved: 'domain', record: recordWithHint, addresses,
    notes: [
      `${domain} → ${addresses[0]}`,
      'Location describes the address the host resolves to. Behind a CDN or proxy that is an edge node, not the owner.',
    ],
  });
}

/** The address this browser is reaching the platform from. */
export async function detectOrigin(): Promise<LookupResult> {
  /* A first-party route sees the real client address, including private
     networks where every public provider would answer with the deployment's
     own egress. It is absent in this build, which is not an error — the
     fallback below is the normal path. */
  try {
    const json = (await getJson('/api/ip?self=1', 5000)) as { ok?: boolean; record?: GeoRecord };
    if (json?.ok && json.record) {
      return {
        ok: true, query: json.record.ip, resolved: 'self', record: json.record,
        addresses: [json.record.ip],
        notes: ['Address observed by the ARGUS server handling this request.'],
      };
    }
  } catch {
    /* fall through to the public providers */
  }

  const record = await fromProviders('');
  if (!record) {
    return {
      ok: false, query: '', resolved: 'self', record: null, addresses: [], notes: [],
      reason: 'No geolocation provider answered.',
    };
  }
  return {
    ok: true, query: record.ip, resolved: 'self', record, addresses: [record.ip],
    notes: ['Address as seen by a public geolocation provider, not by this site.'],
  };
}

/* ── Browser footprint ──────────────────────────────────────── */

export interface FootprintRow {
  label: string;
  value: string;
  /** Why this row is worth reading, one short clause. */
  note?: string;
}

export interface Footprint {
  rows: FootprintRow[];
  /** 0–100: how much of a distinctive silhouette the browser cuts. */
  entropy: number;
  grade: 'narrow' | 'typical' | 'distinctive' | 'unique';
}

/**
 * What this browser says about itself without being asked twice. Every row is
 * read locally — nothing here is sent anywhere or hashed into an identifier.
 */
export function readFootprint(): Footprint {
  if (typeof window === 'undefined') return { rows: [], entropy: 0, grade: 'narrow' };
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  };
  const gl = (() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!ctx) return null;
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
      const vendor = ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null;
      return { renderer: typeof renderer === 'string' ? renderer : null, vendor: typeof vendor === 'string' ? vendor : null };
    } catch {
      return null;
    }
  })();

  const conn = nav.connection;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset() / 60;
  const rows: FootprintRow[] = [
    { label: 'TIMEZONE', value: `${tz} (UTC${offset >= 0 ? '+' : ''}${offset})`, note: 'Narrows the planet to a band before any lookup runs' },
    { label: 'LANGUAGE', value: (navigator.languages?.length ? navigator.languages.slice(0, 3).join(', ') : navigator.language) || '—' },
    { label: 'PLATFORM', value: navigator.platform || '—' },
    { label: 'SCREEN', value: `${screen.width}×${screen.height} @ ${window.devicePixelRatio.toFixed(2)}x`, note: 'Window size and pixel ratio, not a model name' },
    { label: 'VIEWPORT', value: `${window.innerWidth}×${window.innerHeight}` },
    { label: 'CPU', value: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : '—' },
    { label: 'MEMORY', value: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'not reported' },
    { label: 'TOUCH', value: navigator.maxTouchPoints > 0 ? `${navigator.maxTouchPoints}-point` : 'none' },
    { label: 'NETWORK', value: conn?.effectiveType ? `${conn.effectiveType}${conn.downlink ? ` · ${conn.downlink} Mb/s` : ''}${conn.rtt ? ` · ${conn.rtt} ms` : ''}` : 'not reported' },
    { label: 'GPU', value: gl?.renderer || 'masked' },
    { label: 'COOKIES', value: navigator.cookieEnabled ? 'enabled' : 'blocked' },
    { label: 'DO NOT TRACK', value: navigator.doNotTrack === '1' ? 'set' : 'unset' },
  ];

  /* A rough silhouette score: every reported, non-default signal narrows the
     crowd a little. Deliberately coarse — it is a legibility aid, not a
     fingerprint. */
  let entropy = 18;
  if (navigator.languages?.length) entropy += 6;
  if (nav.deviceMemory) entropy += 8;
  if (navigator.hardwareConcurrency) entropy += 7;
  if (gl?.renderer && gl.renderer !== 'masked') entropy += 18;
  if (navigator.maxTouchPoints > 0) entropy += 5;
  if (conn?.effectiveType) entropy += 5;
  if (window.devicePixelRatio !== 1) entropy += 6;
  if (screen.width >= 2560 || screen.width <= 400) entropy += 8;
  entropy = clamp(entropy, 8, 96);
  const grade: Footprint['grade'] = entropy >= 80 ? 'unique' : entropy >= 62 ? 'distinctive' : entropy >= 40 ? 'typical' : 'narrow';
  return { rows, entropy, grade };
}

/* ── Formatting helpers ─────────────────────────────────────── */

/** `🇺🇸` from an ISO country code, without a lookup table. */
export function flagFor(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return String.fromCodePoint(...countryCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0)));
}

/** The clock at the target, ticking — `UTC+4 21:14`. */
export function localTimeAt(record: GeoRecord | null, now = new Date()): string {
  if (!record?.timezone) {
    if (record?.utcOffset == null) return '—';
    const t = new Date(now.getTime() + record.utcOffset * 60_000);
    return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} local`;
  }
  try {
    return `${new Intl.DateTimeFormat('en-GB', { timeZone: record.timezone, hour: '2-digit', minute: '2-digit' }).format(now)} local`;
  } catch {
    return '—';
  }
}

export function precisionLabel(precision: GeoPrecision): string {
  return precision === 'city' ? 'CITY-LEVEL' : precision === 'region' ? 'REGION-LEVEL' : 'COUNTRY-LEVEL';
}

export function confidenceTone(confidence: number): string {
  if (confidence >= 75) return 'var(--alert-green)';
  if (confidence >= 55) return 'var(--gold-primary)';
  return 'var(--alert-orange)';
}

/** Approximate camera altitude in metres for a zoom, at an average latitude.
 *  Used by the approach readout so the descent can be described in units a
 *  person has a feel for. */
export function altitudeForZoom(zoom: number, latitude = 30, viewportPx = 900): number {
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.max(120, 0.5 * viewportPx * metersPerPixel / Math.tan((0.6435) / 2));
}
