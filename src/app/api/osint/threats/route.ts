import { NextResponse } from 'next/server';

export const maxDuration = 25;

/**
 * Threat reputation, keyless: Shodan InternetDB (open ports / known CVEs on
 * the host) cross-checked against abuse.ch Feodo Tracker — the live botnet
 * C2 blocklist. A Feodo hit is as close to ground truth as free intel gets.
 */
let feodoCache: { at: number; rows: any[] } | null = null;

async function feodoRows(): Promise<any[]> {
  if (feodoCache && Date.now() - feodoCache.at < 3600_000) return feodoCache.rows;
  const res = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist.json', {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return feodoCache?.rows || [];
  const rows = await res.json();
  feodoCache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return feodoCache.rows;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().replace(/^https?:\/\//, '').split('/')[0];
  if (!q) return NextResponse.json({ error: 'An IP, domain or hash is required' }, { status: 400 });

  try {
    let ip = q;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(q) && !q.includes(':') && !/^[a-f0-9]{32,64}$/i.test(q)) {
      const doh = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(q)}&type=1`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8000),
      });
      const dj = doh.ok ? await doh.json() : null;
      const answer = (dj?.Answer || []).find((a: any) => a.type === 1);
      if (answer) ip = answer.data;
    }

    const [idb, feodo] = await Promise.all([
      fetch(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(9000) })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
      feodoRows().catch(() => [] as any[]),
    ]);

    const feodoHit = feodo.find((r: any) => r.ip_address === ip);
    const vulns: string[] = idb?.vulns || [];
    const tags: string[] = [...(idb?.tags || [])];
    if (feodoHit?.malware) tags.push(String(feodoHit.malware));

    let risk = 0;
    if (feodoHit) risk = 95;
    else if (vulns.length) risk = Math.min(85, 35 + vulns.length * 5);
    else if ((idb?.ports || []).length > 12) risk = 30;
    else if (idb) risk = 8;

    return NextResponse.json({
      query: q,
      resolved_ip: ip !== q ? ip : undefined,
      risk_score: risk,
      malicious: Boolean(feodoHit),
      category: feodoHit ? `Botnet C2 — ${feodoHit.malware || 'Feodo Tracker'}` : vulns.length ? 'Known vulnerable host' : 'No adverse reputation',
      total_reports: (feodoHit ? 1 : 0) + vulns.length,
      last_seen: feodoHit?.last_online || undefined,
      tags,
      open_ports: idb?.ports || [],
      vulnerabilities: vulns.slice(0, 20),
      hostnames: idb?.hostnames || [],
      sources: ['Shodan InternetDB', 'abuse.ch Feodo Tracker'],
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Threat lookup failed' }, { status: 502 });
  }
}
