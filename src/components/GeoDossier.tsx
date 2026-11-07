'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Crosshair, Radar, Fingerprint, ShieldQuestion, MapPin, ArrowLeft, Clock, Languages, Monitor, AppWindow, Cpu, MemoryStick, MousePointer2, Wifi, Gpu, Cookie, EyeOff, Gauge } from 'lucide-react';
import {
  flagFor,
  localTimeAt,
  precisionLabel,
  confidenceTone,
  readFootprint,
  type Footprint,
  type LookupResult,
} from '@/lib/geo-ip';

/* ═══════════════════════════════════════════════════════════════
   BADR LIVE EARTH — Geolocation dossier
   ──────────────────────────────────────────────────────────────
   The card that answers "where is this, and how sure are you?" for either
   the visitor's own connection or a target they looked up.

   It deliberately never says "your location". It says what was detected and
   what that detection is worth — city-level, from registry records, not GPS,
   and not a street address. The confidence bar is the honest part of the
   card, so it is the most legible element on it.
   ═══════════════════════════════════════════════════════════════ */

interface GeoDossierProps {
  result: LookupResult;
  variant: 'origin' | 'target';
  onRecenter?: () => void;
  /** Hand the address to the recon console. */
  onScan?: (target: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

function ConfidenceRing({ value, tone }: { value: number; tone: string }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative w-[46px] h-[46px] shrink-0" title={`Confidence ${value}%`}>
      <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <motion.circle
          cx="22" cy="22" r={radius} fill="none"
          stroke={tone} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - value / 100) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 4px ${tone})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[13px] leading-none font-semibold" style={{ color: tone }}>{value}</span>
        <span className="font-mono text-[6.5px] tracking-[0.18em] text-[var(--text-muted)] mt-[2px]">CONF</span>
      </div>
    </div>
  );
}

function Copyable({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch { /* clipboard refused — the value is still on screen */ }
      }}
      className="group inline-flex items-center gap-1.5 text-left hover:text-[var(--cyan-primary)] transition-colors"
      title={`Copy ${label}`}
    >
      <span className="font-mono text-[13px] tracking-[0.06em] text-[var(--text-primary)]">{value}</span>
      {copied
        ? <Check className="w-3 h-3 text-[var(--alert-green)]" />
        : <Copy className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-[9px] font-mono font-semibold tracking-[0.2em] text-[var(--text-secondary)] uppercase">{label}</div>
      <div className="text-[12.5px] font-mono font-semibold text-white truncate mt-[3px]">{value}</div>
    </div>
  );
}

const GRADES: Record<Footprint['grade'], string> = {
  narrow: 'NARROW',
  typical: 'TYPICAL',
  distinctive: 'DISTINCTIVE',
  unique: 'NEAR-UNIQUE',
};

const ROW_ICONS: Record<string, typeof Clock> = {
  TIMEZONE: Clock, LANGUAGE: Languages, PLATFORM: Monitor, SCREEN: AppWindow,
  VIEWPORT: AppWindow, CPU: Cpu, MEMORY: MemoryStick, TOUCH: MousePointer2,
  NETWORK: Wifi, GPU: Gpu, COOKIES: Cookie, 'DO NOT TRACK': EyeOff,
};

function ScoreRing({ value }: { value: number }) {
  const r = 52; const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[128px] h-[128px] shrink-0">
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" />
        <motion.circle cx="64" cy="64" r={r} fill="none" stroke="var(--gold-primary)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} style={{ filter: 'drop-shadow(0 0 8px var(--gold-glow))' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[30px] leading-none font-bold text-white">{value}</span>
        <span className="font-mono text-[8px] tracking-[0.22em] text-[var(--text-secondary)] mt-1">/ 100 USED</span>
      </div>
    </div>
  );
}

/* The footprint is its OWN view: it replaces the WHOIS/IP view inside the
   same card (switch with the header buttons), never stacks underneath it. */
function FootprintPanel({ footprint, onBack }: { footprint: Footprint; onBack: () => void }) {
  return (
    <motion.div key="footprint" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-[0.18em] text-[var(--cyan-primary)] hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> WHOIS / IP
        </button>
        <span className="text-[9px] font-mono tracking-[0.2em] text-[var(--text-secondary)]">LOCAL ONLY · NOTHING SENT</span>
      </div>
      <div className="flex items-center gap-4 mb-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <ScoreRing value={footprint.entropy} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-[0.2em] text-[var(--gold-primary)]"><Gauge className="w-3.5 h-3.5" /> {GRADES[footprint.grade]}</div>
          <p className="text-[11px] font-mono text-white leading-relaxed mt-1.5"><span className="font-bold">{footprint.entropy}</span> of 100 identifying signals are visible.</p>
          <p className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed"><span className="text-white font-semibold">{100 - footprint.entropy}</span> remain free / hidden.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto styled-scrollbar pr-1">
        {footprint.rows.map(row => {
          const Icon = ROW_ICONS[row.label] ?? Fingerprint;
          return (
            <div key={row.label} title={row.note} className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[8.5px] font-mono font-semibold tracking-[0.18em] text-[var(--text-secondary)]"><Icon className="w-3 h-3 text-[var(--cyan-primary)]" />{row.label}</div>
              <div className="text-[11.5px] font-mono font-semibold text-white truncate mt-1">{row.value}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-mono text-[var(--text-secondary)] leading-relaxed mt-3">Read in this tab only. Nothing here is transmitted or stored.</p>
    </motion.div>
  );
}

export default function GeoDossier({ result, variant, onRecenter, onScan, onClose, compact = false }: GeoDossierProps) {
  const record = result.record;
  const [showFootprint, setShowFootprint] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);

  const footprint = useMemo(() => readFootprint(), []);

  if (!record) {
    return (
      <div className="glass-panel px-4 py-3 w-[min(92vw,380px)]">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="w-3.5 h-3.5 text-[var(--alert-orange)]" />
          <span className="text-[10px] font-mono tracking-[0.16em] text-[var(--text-secondary)]">
            {result.query ? `NO RECORD FOR ${result.query.toUpperCase()}` : 'ORIGIN UNRESOLVED'}
          </span>
        </div>
        <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1.5 leading-relaxed">
          {result.reason || 'No public registry answered for this address.'}
        </p>
      </div>
    );
  }

  const tone = confidenceTone(record.confidence);
  const place = [record.city, record.country].filter(Boolean).join(', ') || record.country || record.region || 'Unknown region';
  const title = variant === 'origin' ? 'DETECTED ACCESS ORIGIN' : 'TARGET GEOLOCATION';
  const subtitle = variant === 'origin'
    ? 'The public address you reached us from'
    : result.resolved === 'domain' ? 'Geolocated from the host it resolves to' : 'Public registry record for this address';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-panel relative overflow-hidden ${compact ? 'w-[min(94vw,420px)]' : 'w-[min(94vw,520px)]'}`}
      style={{ borderColor: 'var(--border-primary)' }}
    >
      {/* The only ornament: a hairline that fades across the top. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${tone}, transparent)` }}
      />

      <div className="px-4 pt-3 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: tone }} />
                <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
              </span>
              <span className="text-[8.5px] font-mono tracking-[0.24em]" style={{ color: tone }}>{title}</span>
            </div>
            <h3 className="text-[18px] font-mono font-semibold text-white tracking-[0.02em] mt-1.5 truncate">
              {flagFor(record.countryCode) && <span className="mr-1.5">{flagFor(record.countryCode)}</span>}
              {place}
            </h3>
            <p className="text-[10px] font-mono text-[var(--text-secondary)] mt-0.5 truncate">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <ConfidenceRing value={record.confidence} tone={tone} />
            {onClose && (
              <button
                onClick={onClose}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors -mt-5"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
        {showFootprint && footprint ? (
          <FootprintPanel footprint={footprint} onBack={() => setShowFootprint(false)} />
        ) : (
        <>
        <div className="flex items-center justify-between gap-3 mt-2.5 pb-2.5 border-b border-[var(--border-secondary)]">
          <Copyable value={record.ip} label="address" />
          <div className="flex items-center gap-1.5 text-[8px] font-mono tracking-[0.16em]" style={{ color: tone }}>
            <span>{precisionLabel(record.precision)}</span>
            <span className="opacity-40">·</span>
            <span className="text-[var(--text-muted)]">{record.provider}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2.5">
          <Stat label="ISP / ORG" value={record.isp || record.org || 'Not published'} hint="The network that allocates this address" />
          <Stat label="ASN" value={record.asn || 'Unlisted'} />
          <Stat label="REGION" value={record.region || '—'} />
          <Stat label="LOCAL TIME" value={localTimeAt(record, now)} hint={record.timezone || undefined} />
          <Stat label="COORDINATES" value={`${record.lat.toFixed(3)}, ${record.lng.toFixed(3)}`} hint="City centroid of the registry block" />
          <Stat
            label="CLASS"
            value={[record.hosting && 'DATACENTRE', record.proxy && 'PROXY/VPN', record.mobile && 'MOBILE'].filter(Boolean).join(' · ') || `${record.kind ?? 'IP'} · RESIDENTIAL`}
          />
          {record.ptr && (
            <div className="col-span-2 min-w-0" title="Reverse DNS — the name this address answers to">
              <div className="text-[8px] font-mono tracking-[0.2em] text-[var(--text-muted)] uppercase">Reverse DNS</div>
              <div className="text-[10px] font-mono text-[var(--text-secondary)] truncate mt-[2px]">{record.ptr}</div>
            </div>
          )}
        </div>

        {(record.hosting || record.proxy || record.mobile) && (
          <p className="text-[8.5px] font-mono leading-relaxed mt-2.5 px-2 py-1.5 rounded-sm border border-[var(--alert-orange)]/25 text-[var(--alert-orange)]/90 bg-[var(--alert-orange)]/5">
            {record.proxy
              ? 'A VPN or proxy is in the path — the pin marks the exit node, not the person.'
              : record.mobile
                ? 'Mobile carrier address — the pin marks the carrier gateway, often a different city.'
                : 'Datacentre address — machines live here, not people.'}
          </p>
        )}

        <p className="text-[8px] font-mono text-[var(--text-muted)] leading-relaxed mt-2.5">
          {result.notes[0] || 'Public IP registry record.'} This is an estimate at{' '}
          {record.precision === 'city' ? 'city' : record.precision === 'region' ? 'region' : 'country'} level — never a street address.
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {onRecenter && (
            <button
              onClick={onRecenter}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-primary)] hover:border-[var(--border-active)] bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-[8.5px] font-mono tracking-[0.16em] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Crosshair className="w-3 h-3" /> RECENTER
            </button>
          )}
          {onScan && (
            <button
              onClick={() => onScan(result.query || record.ip)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--cyan-primary)]/30 hover:border-[var(--cyan-primary)]/60 bg-[var(--cyan-primary)]/5 hover:bg-[var(--cyan-primary)]/10 transition-colors text-[8.5px] font-mono tracking-[0.16em] text-[var(--cyan-primary)]"
            >
              <Radar className="w-3 h-3" /> SCAN ADDRESS
            </button>
          )}
          <button
            onClick={() => setShowFootprint(v => !v)}
            aria-expanded={showFootprint}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors text-[8.5px] font-mono tracking-[0.16em] ${
              showFootprint
                ? 'border-[var(--gold-primary)]/50 bg-[var(--gold-primary)]/10 text-[var(--gold-primary)]'
                : 'border-[var(--border-primary)] hover:border-[var(--border-active)] bg-white/[0.03] hover:bg-white/[0.06] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Fingerprint className="w-3 h-3" /> FOOTPRINT
          </button>
        </div>

        </>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** A one-line strip used while the camera is in transit: where it is going and
 *  how far is left. Kept separate from the dossier so the map stays the star. */
export function TeleportBanner({
  target,
  from,
  to,
  startedAt,
  duration,
}: {
  target: string;
  from: { lat: number; lng: number } | null;
  to: { lat: number; lng: number };
  startedAt: number;
  duration: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setElapsed(Date.now() - startedAt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);

  const { remaining, progress } = useMemo(() => {
    const p = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    let km = 0;
    if (from) {
      const R = 6371;
      const dLat = ((to.lat - from.lat) * Math.PI) / 180;
      const dLng = ((to.lng - from.lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      km = 2 * R * Math.asin(Math.sqrt(a));
    }
    return { remaining: Math.max(0, Math.round(km * (1 - eased))), progress: p };
  }, [elapsed, duration, from, to]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="pointer-events-none select-none"
    >
      <div className="glass-panel px-3.5 py-2 w-[min(88vw,330px)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3 h-3 text-[var(--cyan-primary)] shrink-0 animate-pulse" />
            <span className="text-[9px] font-mono tracking-[0.16em] text-[var(--text-secondary)] truncate">
              TRAVERSING → {target}
            </span>
          </div>
          <span className="text-[8.5px] font-mono tabular-nums text-[var(--cyan-primary)] shrink-0">
            {remaining.toLocaleString()} KM
          </span>
        </div>
        <div className="h-[2px] w-full rounded-full bg-white/8 mt-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, var(--cyan-primary), var(--gold-primary))' }}
          />
        </div>
        <div className="text-[7.5px] font-mono tracking-[0.2em] text-[var(--text-muted)] mt-1.5">
          CITY-SCALE APPROACH · STREET LEVEL SUPPRESSED
        </div>
      </div>
    </motion.div>
  );
}
