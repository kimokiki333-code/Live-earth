'use client';

/* ══════════════════════════════════════════════════════════════════════
   BADR OSINT SIDEBAR — permanently visible, right hand side.

   Not a skin: every card calls a real route that already exists in this
   app, and prints what came back. Failures are shown as failures.

     Username  GET /api/osint/username?username=
     Email     GET /api/osint/email?email=
     Domain    GET /api/osint/whois?domain=
     IP / Geo  GET /api/osint/ip?ip=
     Phone     GET /api/osint/phone?number=

   State colours: found = neon green · absent = silver · failure = yellow.
   ══════════════════════════════════════════════════════════════════════ */

import { useState, type ReactNode } from 'react';

/* ── the new icon set (inline, 24×24, one stroke weight) ───────────────── */
const I = {
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 19 6" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c.7-3.6 3.9-5.6 7.5-5.6s6.8 2 7.5 5.6" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="m3.8 7 8.2 6 8.2-6" /></>,
  at: <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.6a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 7" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
  phone: <><path d="M6.5 3.5h3l1.6 4-2 1.4a11 11 0 0 0 5.6 5.6l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" /></>,
  run: <path d="M7 4.5 19 12 7 19.5Z" />,
};

function Icon({ path, className }: { path: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

type Row = { label: string; value: string; tone?: 'found' | 'none' | 'warn' };
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

      {state.err && <p className="badr-res-err">{state.err}</p>}

      {state.rows.length > 0 && (
        <div className="badr-res">
          {state.rows.map((r, i) => (
            <div className="badr-res-i" key={`${r.label}-${i}`}>
              <b title={r.label}>{r.label}</b>
              <span className={`badr-res-v ${r.tone || ''}`}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {state.note && !state.err && <p className="badr-res-note">{state.note}</p>}
    </section>
  );
}

export default function BadrOsint() {
  const user = useCard();
  const mail = useCard();
  const dom = useCard();
  const ip = useCard();
  const phone = useCard();
  const [collapsed, setCollapsed] = useState(false);

  /* ── username ── */
  const runUser = async (q: string) => {
    user.reset();
    try {
      const j = await getJson(`/api/osint/username?username=${encodeURIComponent(q)}`);
      const found = (j.found || []) as any[];
      const rows: Row[] = found.slice(0, 8).map((h) => ({ label: h.site, value: 'FOUND', tone: 'found' }));
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
      for (const a of (j.accounts || []).slice(0, 6)) {
        rows.push({
          label: a.site,
          value: a.status === 'found' ? 'FOUND' : a.status === 'error' ? 'CHECK' : 'NONE',
          tone: a.status === 'found' ? 'found' : a.status === 'error' ? 'warn' : 'none',
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

  if (collapsed) {
    return (
      <button type="button" className="badr-side-tab" onClick={() => setCollapsed(false)} title="Open OSINT toolkit">
        <Icon path={I.radar} className="w-4 h-4" />
        <span>OSINT</span>
      </button>
    );
  }

  return (
    <aside className="badr-side" aria-label="OSINT toolkit">
      <header className="badr-side-h">
        <Icon path={I.radar} className="badr-side-ic" />
        <span className="badr-side-t">OSINT TOOLKIT</span>
        <span className="badr-side-n">5 ENGINES</span>
        <button type="button" className="badr-side-x" onClick={() => setCollapsed(true)} title="Collapse">
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
        <Card kind="domain" title="DOMAIN" sub="WHOIS" icon={I.at} state={dom.s}
          placeholder="example.com" onRun={runDom} />
        <Card kind="ip" title="IP / GEO" sub="ASN · REP" icon={I.pin} state={ip.s}
          placeholder="1.1.1.1" onRun={runIp} />
        <Card kind="phone" title="PHONE" sub="CARRIER" icon={I.phone} state={phone.s}
          placeholder="+20 …" onRun={runPhone} />
      </div>
    </aside>
  );
}
