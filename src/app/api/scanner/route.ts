import { NextResponse } from 'next/server';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';

export const maxDuration = 45;

/**
 * Host scanner, keyless and self-hosted: real TCP connects for ports, a real
 * TLS handshake for SSL/TLS, real HTTP fetches for headers/tech, crt.sh for
 * subdomains, Shodan InternetDB for known-vuln exposure.
 */
const SERVICES: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3',
  143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 465: 'SMTPS', 587: 'SMTP', 993: 'IMAPS', 995: 'POP3S',
  1723: 'PPTP', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis',
  8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 27017: 'MongoDB', 9200: 'Elasticsearch', 5060: 'SIP',
};
const QUICK_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1723, 3306, 3389, 5900, 8080, 8443];
const FULL_PORTS = [...QUICK_PORTS, 465, 587, 5432, 6379, 5060, 9200, 27017, 135, 139, 161, 389, 636, 873, 2049, 3128, 8000, 8888, 9090, 10000];

function probePort(ip: string, port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    const done = (open: boolean) => { if (!settled) { settled = true; socket.destroy(); resolve(open); } };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, ip);
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

async function resolveHost(target: string): Promise<string> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) return target;
  const rec = await dns.lookup(target, { family: 4 });
  return rec.address;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawTarget = (searchParams.get('target') || '').trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const type = (searchParams.get('type') || 'quick').toLowerCase();
  if (!rawTarget) return NextResponse.json({ error: 'A target host is required' }, { status: 400 });

  try {
    /* ── subdomains: crt.sh enumeration ── */
    if (type === 'subdomains') {
      const res = await fetch(`https://crt.sh/?q=${encodeURIComponent('%.' + rawTarget)}&output=json`, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) return NextResponse.json({ error: `crt.sh returned ${res.status}` }, { status: 502 });
      const rows = await res.json();
      const names = new Set<string>();
      for (const r of Array.isArray(rows) ? rows : []) {
        for (const n of String(r.name_value || '').split('\n')) {
          const clean = n.trim().toLowerCase();
          if (clean && !clean.includes('*')) names.add(clean);
        }
      }
      const subdomains = Array.from(names).sort().slice(0, 300);
      return NextResponse.json({ target: rawTarget, domain: rawTarget, count: subdomains.length, subdomains });
    }

    const ip = await resolveHost(rawTarget).catch(() => null);
    if (!ip) return NextResponse.json({ error: 'Target does not resolve' }, { status: 404 });

    /* ── vuln: Shodan InternetDB exposure ── */
    if (type === 'vuln') {
      const res = await fetch(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(9000) });
      const d = res.ok ? await res.json() : { vulns: [], ports: [] };
      const vulns: string[] = d.vulns || [];
      return NextResponse.json({
        target: rawTarget,
        ip,
        vulnerabilities: vulns.map((id: string) => ({ id, type: 'cve' })),
        risk_level: vulns.length > 5 ? 'HIGH' : vulns.length > 0 ? 'MEDIUM' : 'LOW',
        open_ports: d.ports || [],
        hostnames: d.hostnames || [],
      });
    }

    /* ── ssl: live TLS handshake ── */
    if (type === 'ssl') {
      const info = await new Promise<any>((resolve, reject) => {
        const socket = tls.connect({ host: rawTarget, servername: rawTarget, port: 443, timeout: 8000, rejectUnauthorized: false }, () => {
          const cert: any = socket.getPeerCertificate();
          const cipher: any = socket.getCipher();
          resolve({
            protocol: socket.getProtocol(),
            cipher: cipher?.name,
            valid: socket.authorized,
            issuer: [cert.issuer?.O, cert.issuer?.CN].filter(Boolean).join(' / ') || undefined,
            subject: cert.subject?.CN || rawTarget,
            expires: cert.valid_to,
            valid_from: cert.valid_from,
            sans: String(cert.subjectaltname || '').replace(/DNS:/g, '').split(', ').filter(Boolean),
            serial: cert.serialNumber,
          });
          socket.end();
        });
        socket.once('error', reject);
        socket.once('timeout', () => { socket.destroy(); reject(new Error('TLS timeout')); });
      });
      return NextResponse.json({ target: rawTarget, ip, ...info });
    }

    /* ── headers / tech: live HTTP fetch ── */
    if (type === 'headers' || type === 'tech') {
      let response: globalThis.Response | null = null;
      let finalUrl = '';
      for (const scheme of ['https', 'http']) {
        try {
          response = await fetch(`${scheme}://${rawTarget}`, {
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BADR-LIVE-EARTH scanner)' },
          });
          finalUrl = response.url;
          break;
        } catch { /* try next scheme */ }
      }
      if (!response) return NextResponse.json({ error: 'No HTTP response from target' }, { status: 502 });
      const h = Object.fromEntries(response.headers.entries());

      if (type === 'headers') {
        const watched = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
        const present: Record<string, string> = {};
        const missing: string[] = [];
        for (const w of watched) (h[w] ? (present[w] = h[w]) : missing.push(w));
        return NextResponse.json({
          target: rawTarget, ip, url: finalUrl, status: response.status,
          security_headers: present, missing_headers: missing,
          score: `${watched.length - missing.length}/${watched.length}`,
          server: h['server'], powered_by: h['x-powered-by'],
        });
      }

      const html = (await response.text().catch(() => '')).slice(0, 200_000);
      const tech: string[] = [];
      const signatures: [RegExp, string][] = [
        [/wp-content|wp-includes/i, 'WordPress'], [/_next\//i, 'Next.js'], [/__nuxt/i, 'Nuxt'],
        [/data-reactroot|react-dom/i, 'React'], [/ng-version|angular/i, 'Angular'], [/data-v-[a-f0-9]{8}/i, 'Vue.js'],
        [/cdn\.shopify\.com/i, 'Shopify'], [/Drupal/i, 'Drupal'], [/Joomla/i, 'Joomla'],
        [/gatsby/i, 'Gatsby'], [/svelte/i, 'Svelte'], [/laravel/i, 'Laravel'],
      ];
      for (const [re, name] of signatures) if (re.test(html)) tech.push(name);
      if (h['server']) tech.push(`Server: ${h['server']}`);
      if (h['x-powered-by']) tech.push(`Powered by: ${h['x-powered-by']}`);
      const title = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim();
      return NextResponse.json({ target: rawTarget, ip, url: finalUrl, status: response.status, title, technologies: tech });
    }

    /* ── port scan (quick / full) ── */
    const portsToScan = type === 'full' ? FULL_PORTS : QUICK_PORTS;
    const started = Date.now();
    const results = await mapLimit(portsToScan, 12, async port => ({ port, open: await probePort(ip, port) }));
    const open = results.filter(r => r.open).map(r => ({ port: r.port, state: 'open', service: SERVICES[r.port] || 'unknown' }));
    return NextResponse.json({
      host: rawTarget,
      target: rawTarget,
      ip,
      scan_type: type,
      duration: `${((Date.now() - started) / 1000).toFixed(1)}s`,
      ports: open,
      scanned: portsToScan.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Scan failed' }, { status: 502 });
  }
}
