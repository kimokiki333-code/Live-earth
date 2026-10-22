import { NextResponse } from 'next/server';

export const maxDuration = 20;

/** CVE detail via the CVE Program's own API (cveawg) — keyless for reads. */
export async function GET(req: Request) {
  const cve = (new URL(req.url).searchParams.get('cve') || '').trim().toUpperCase();
  if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) {
    return NextResponse.json({ error: 'A valid CVE id is required' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://cveawg.mitre.org/api/cve/${encodeURIComponent(cve)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return NextResponse.json({ error: `CVE service returned ${res.status}` }, { status: 502 });
    const d = await res.json();
    const cna = d.containers?.cna || {};
    const description = (cna.descriptions || []).find((x: any) => x.lang === 'en')?.value || '';
    let severity: string | undefined;
    let cvss: number | undefined;
    let cwe: string | undefined;
    for (const m of cna.metrics || []) {
      const v3 = m.cvssV3_1 || m.cvssV3_0 || m.cvssV2_0;
      if (v3) { cvss = v3.baseScore; severity = v3.baseSeverity; break; }
    }
    for (const p of cna.problemTypes || []) {
      for (const desc of p.descriptions || []) {
        if (desc.cweId) { cwe = desc.cweId; break; }
      }
      if (cwe) break;
    }
    const affected = (cna.affected || []).slice(0, 8).map((a: any) => ({ vendor: a.vendor || '—', product: a.product || '—' }));
    return NextResponse.json({ id: cve, description, severity, cvss, cwe, affected }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    });
  } catch {
    return NextResponse.json({ error: 'CVE lookup failed' }, { status: 502 });
  }
}
