'use client';

/* ══════════════════════════════════════════════════════════════════════
   BADR INTELLIGENCE TOOLS — permanently visible, right hand side.

   Renamed from "OSINT toolkit": this is identity, network, domain, threat
   and chain work in one place, so the panel says INTELLIGENCE TOOLS and the
   collapsed tab says INTEL SEARCH.

   Two layers of interaction, because 21 modules will not fit as 21 cards:

     1  IDENTITY (live) — five fast lookups that answer inline, on the spot.
        username · email · phone · ip/geo · domain

     2  FULL TOOLKIT — four group buttons that open the complete 21-module
        toolkit already in this app, straight into the right group:

        NETWORK & HOST  6  port scan · vuln sweep · shodan · bgp · mac · ip sweep
        DOMAIN & WEB    7  dns · whois · certs · ssl/tls · subdomains · headers · tech
        IDENTITY LAB    5  username · github · phone · fingerprint · email
        THREAT · CHAIN  3  threats · data leaks · chain intel + daily brief

   Every route called here already exists. Nothing is mocked; a failure is
   printed as a failure in yellow.
   ══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, type ReactNode } from 'react';

/* ── the icon set (inline, 24×24, one stroke weight) ───────────────────── */
const I = {
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 19 6" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c.7-3.6 3.9-5.6 7.5-5.6s6.8 2 7.5 5.6" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="m3.8 7 8.2 6 8.2-6" /></>,
  at: <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.6a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 7" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
  phone: <><path d="M6.5 3.5h3l1.6 4-2 1.4a11 11 0 0 0 5.6 5.6l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" /></>,
  run: <path d="M7 4.5 19 12 7 19.5Z" />,
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5S14.4 18.1 12 20.5C9.6 18.1 8.4 15.1 8.4 12S9.6 5.9 12 3.5Z" /></>,
  shield: <><path d="M12 3.2 19 6v6c0 4.2-3 7.3-7 8.8-4-1.5-7-4.6-7-8.8V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  chain: <><path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.5 6.3" /><path d="M14 10.5a4 4 0 0 0-5.7 0L5.5 13.3a4 4 0 1 0 5.7 5.7l1.3-1.3" /></>,
  locate: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
};

function Icon({ path, className }: { path: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

type Row = { label: string; value: string; tone?: 'found' | 'none' | 'warn'; href?: string };
type CardState = { busy: boolean; err?: string; rows: Row[]; note?: string };

const EMPTY: CardState = { busy: false, rows: [] };

function useCard() {
  const [s, setS] = useState<CardState>(EMPTY);
  const reset = () => setS({ busy: true, rows: [] });
  const fail = (msg: string) => setS({ busy: false, err: msg, rows: [] });
  const done = (rows: Row[], note?: string) => setS({ busy: false, rows, note });
  return { s, reset, fail, done };
}

async function getJson(url: string) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* leave null */ }
  if (!r.ok) throw new Error(j?.error || `${r.status} ${r.statusText}`);
  if (!j) throw new Error('server did not return JSON');
  return j;
}

function Result({ state }: { state: CardState }) {
  return (
    <>
      {state.err && <p className="badr-res-err">{state.err}</p>}
      {state.rows.length > 0 && (
        <div className="badr-res">
          {state.rows.map((r, i) => (
            <div className="badr-res-i" key={`${r.label}-${i}`}>
              {r.href ? (
                <a
                  className="badr-res-k badr-res-k--link"
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${r.href}`}
                >
                  {r.label}
                </a>
              ) : (
                <b title={r.label}>{r.label}</b>
              )}
              <span className={`badr-res-v ${r.tone || ''}`}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {state.note && !state.err && <p className="badr-res-note">{state.note}</p>}
    </>
  );
}

function Card({
  title, sub, icon, state, onRun, placeholder, kind,
}: {
  title: string; sub: string; icon: ReactNode; state: CardState;
  placeholder: string;
  onRun: (v: string) => void;
  kind: string;
}) {
  const [v, setV] = useState('');
  return (
    <section className="badr-card">
      <header className="badr-card-h">
        <Icon path={icon} className="badr-card-ic" />
        <span className="badr-card-t">{title}</span>
        <span className="badr-card-s">{sub}</span>
      </header>

      <form
        className="badr-field"
        onSubmit={(e) => { e.preventDefault(); const q = v.trim(); if (q) onRun(q); }}
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          aria-label={`${title} query`}
          id={`badr-${kind}`}
        />
        <button type="submit" className="badr-go" disabled={state.busy}>
          <Icon path={I.run} className="badr-go-ic" />
          {state.busy ? 'RUN…' : 'RUN'}
        </button>
      </form>

      <Result state={state} />
    </section>
  );
}

/* ── the four group launchers ─────────────────────────────────────────── */
const LAUNCHERS = [
  { tab: 'scanner', group: 'network', icon: I.server, title: 'NETWORK & HOST', sub: '6', list: 'Port scan · Vuln sweep · Shodan IoT · BGP route · MAC addr · IP sweep' },
  { tab: 'dns', group: 'domain', icon: I.globe, title: 'DOMAIN & WEB', sub: '7', list: 'DNS · WHOIS · Certs · SSL/TLS · Subdomains · Headers · Tech detect' },
  { tab: 'github', group: 'identity', icon: I.user, title: 'IDENTITY LAB', sub: '5', list: 'Username · GitHub recon · Phone intel · Fingerprint · Email intel' },
  { tab: 'threats', group: 'threat', icon: I.shield, title: 'THREAT & CHAIN', sub: '3', list: 'Threats · Data leaks · Chain intel + daily brief' },
];

export default function BadrOsint({ onOpenTool }: { onOpenTool?: (tab: string, group?: string) => void }) {
  const user = useCard();
  const mail = useCard();
  const dom = useCard();
  const ip = useCard();
  const phone = useCard();
  const self = useCard();
  const [collapsed, setCollapsed] = useState(false);

  /* The bottom bar ends where this panel begins. Publishing the width means
     the bar, the maximised window and this sidebar never have to guess. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--badr-side-w', collapsed ? '0px' : '320px');
    return () => { root.style.removeProperty('--badr-side-w'); };
  }, [collapsed]);

  /* ── username ── */
  const runUser = async (q: string) => {
    user.reset();
    try {
      const j = await getJson(`/api/osint/username?username=${encodeURIComponent(q)}`);
      const found = (j.found || []) as any[];
      /* Each hit is a link to the profile itself. A count you cannot open is
         not a result, it is a rumour. */
      const rows: Row[] = found.map((h) => ({ label: h.site, value: 'OPEN ↗', tone: 'found', href: h.url }));
      if (!rows.length) rows.push({ label: 'no confirmed profile', value: 'NONE', tone: 'none' });
      const blocked = (j.blocked || []).length;
      const inc = (j.inconclusive || []).length;
      user.done(rows, `${j.checked ?? '?'} sites checked · ${found.length} found` +
        (blocked ? ` · ${blocked} refused the check` : '') +
        (inc ? ` · ${inc} inconclusive` : ''));
    } catch (e: any) { user.fail(e.message); }
  };

  /* ── email ── */
  const runMail = async (q: string) => {
    mail.reset();
    try {
      const j = await getJson(`/api/osint/email?email=${encodeURIComponent(q)}`);
      const rows: Row[] = [
        { label: 'domain has mail', value: j.domain_deliverable ? 'YES' : 'NO', tone: j.domain_deliverable ? 'found' : 'none' },
        { label: 'gravatar', value: j.gravatar ? 'FOUND' : 'NONE', tone: j.gravatar ? 'found' : 'none' },
      ];
      for (const a of (j.accounts || [])) {
        rows.push({
          label: a.site,
          value: a.status === 'found' ? 'FOUND ↗' : a.status === 'error' ? 'CHECK' : 'NONE',
          tone: a.status === 'found' ? 'found' : a.status === 'error' ? 'warn' : 'none',
          href: a.status === 'found' ? a.url : undefined,
        });
      }
      if (typeof j.breached === 'boolean') {
        rows.push({ label: 'breaches', value: j.breached ? `${(j.breaches || []).length} FOUND` : 'NONE', tone: j.breached ? 'warn' : 'found' });
      }
      mail.done(rows, j.checked_count ? `${j.checked_count} checks run` : undefined);
    } catch (e: any) { mail.fail(e.message); }
  };

  /* ── domain ── */
  const runDom = async (q: string) => {
    dom.reset();
    try {
      const j = await getJson(`/api/osint/whois?domain=${encodeURIComponent(q)}`);
      const one = (v: any) => (Array.isArray(v) ? v[0] : v);
      const rows: Row[] = [
        { label: 'registrar', value: one(j.registrar) || '—', tone: j.registrar ? 'found' : 'none' },
        { label: 'created', value: String(one(j.creation_date) || '—').slice(0, 10) || '—' },
        { label: 'expires', value: String(one(j.expiration_date) || '—').slice(0, 10) || '—' },
        { label: 'nameservers', value: (j.name_servers || []).length ? String((j.name_servers || []).length) : '—' },
      ];
      dom.done(rows);
    } catch (e: any) { dom.fail(e.message); }
  };

  /* ── ip ── */
  const runIp = async (q: string) => {
    ip.reset();
    try {
      const j = await getJson(`/api/osint/ip?ip=${encodeURIComponent(q)}`);
      const rows: Row[] = [
        { label: 'address', value: j.ip || q },
        { label: 'location', value: [j.city, j.region, j.country].filter(Boolean).join(', ') || '—', tone: 'found' },
        { label: 'org', value: j.org || j.isp || j.asn || '—' },
        { label: 'timezone', value: j.timezone || '—' },
      ];
      ip.done(rows);
    } catch (e: any) { ip.fail(e.message); }
  };

  /* ── phone ── */
  const runPhone = async (q: string) => {
    phone.reset();
    try {
      const j = await getJson(`/api/osint/phone?number=${encodeURIComponent(q)}`);
      if (!j.valid) {
        phone.done([{ label: 'number', value: 'NOT VALID', tone: 'warn' }], 'carrier lookup skipped — the number does not parse');
        return;
      }
      const rows: Row[] = [
        { label: 'formatted', value: j.international || j.number || q, tone: 'found' },
        { label: 'country', value: j.region || j.country_code || '—' },
        { label: 'line type', value: j.line_type || '—' },
        { label: 'calling code', value: j.calling_code || '—' },
      ];
      phone.done(rows);
    } catch (e: any) { phone.fail(e.message); }
  };

  /* ── self track — where this connection comes from ── */
  const runSelf = async () => {
    self.reset();
    try {
      const j = await getJson('/api/geo');
      const rows: Row[] = [
        { label: 'address', value: j.query || j.ip || '—' },
        { label: 'place', value: [j.city, j.region, j.country].filter(Boolean).join(', ') || '—', tone: 'found' },
        { label: 'isp', value: j.isp || j.org || '—' },
        { label: 'coordinates', value: j.lat && j.lon ? `${Number(j.lat).toFixed(3)}, ${Number(j.lon).toFixed(3)}` : '—' },
      ];
      self.done(rows, 'Public record for this connection — city level, never a street address.');
    } catch (e: any) { self.fail(e.message); }
  };

  if (collapsed) {
    return (
      <button type="button" data-badr-side className="badr-side-tab" onClick={() => setCollapsed(false)} title="Open intelligence tools">
        <Icon path={I.radar} className="w-4 h-4" />
        <span>INTEL SEARCH</span>
      </button>
    );
  }

  return (
    <aside data-badr-side className="badr-side" aria-label="Intelligence tools">
      <header className="badr-side-h" onClick={() => setCollapsed(true)} title="Collapse intelligence tools">
        <Icon path={I.radar} className="badr-side-ic" />
        <span className="badr-side-t">INTELLIGENCE TOOLS</span>
        <button
          type="button"
          className="badr-side-x"
          onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
          title="Collapse"
          aria-label="Collapse intelligence tools"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </header>

      <div className="badr-side-b">
        <Card kind="username" title="USERNAME" sub="40+ SITES" icon={I.user} state={user.s}
          placeholder="username" onRun={runUser} />
        <Card kind="email" title="EMAIL" sub="BREACH + MX" icon={I.mail} state={mail.s}
          placeholder="name@domain.com" onRun={runMail} />
        <Card kind="phone" title="PHONE" sub="CARRIER" icon={I.phone} state={phone.s}
          placeholder="+20 …" onRun={runPhone} />
        <Card kind="ip" title="IP / GEO" sub="ASN · REP" icon={I.pin} state={ip.s}
          placeholder="1.1.1.1" onRun={runIp} />
        <Card kind="domain" title="DOMAIN" sub="WHOIS" icon={I.at} state={dom.s}
          placeholder="example.com" onRun={runDom} />


        {LAUNCHERS.map((l) => (
          <button
            key={l.tab}
            type="button"
            className="badr-launch"
            onClick={() => onOpenTool?.(l.tab, l.group)}
            title={l.list}
          >
            <Icon path={l.icon} className="badr-launch-ic" />
            <span className="badr-launch-t">{l.title}</span>
            <span className="badr-launch-n">{l.sub}</span>
            <svg viewBox="0 0 24 24" className="badr-launch-a" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        ))}

        <section className="badr-card">
          <header className="badr-card-h">
            <Icon path={I.locate} className="badr-card-ic" />
            <span className="badr-card-t">MY LOCATION</span>
            <span className="badr-card-s">SELF TRACK</span>
          </header>
          <button type="button" className="badr-go badr-go--wide" onClick={runSelf} disabled={self.s.busy}>
            <Icon path={I.run} className="badr-go-ic" />
            {self.s.busy ? 'TRACKING…' : 'TRACK MY PLACE'}
          </button>
          <Result state={self.s} />
        </section>
      </div>
    </aside>
  );
}
