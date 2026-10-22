'use client';

import { useMemo, useState } from 'react';

/**
 * SOLAR DESIGNER — STEP 1 PROOF
 * Engine check only: place + roof size -> panel count -> real PVGIS yield.
 * No map yet (that is Step 2). Every number on this page comes from the
 * PVGIS satellite database via /api/pvgis, or from the packing math shown.
 */

const PRESETS = [
  { name: 'cairo, Egypt', lat: 30.0444, lon: 31.2357 },
  { name: 'Alexandria, Egypt', lat: 31.2001, lon: 29.9187 },
  { name: 'Berlin, Germany', lat: 52.52, lon: 13.405 },
  { name: 'Seville, Spain', lat: 37.3891, lon: -5.9845 },
];

const PANEL = { length: 2.278, width: 1.134, gap: 0.02 }; // typical 550 W class module, metres
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pack(roofL: number, roofW: number, tiltDeg: number) {
  const tilt = (tiltDeg * Math.PI) / 180;
  // Row pitch: the panel's ground shadow footprint + the clearance so the
  // row behind is not shaded at a low winter sun (30 degrees assumed).
  const pitchTilted = PANEL.length * Math.cos(tilt) + (PANEL.length * Math.sin(tilt)) / Math.tan((30 * Math.PI) / 180);
  const tryLayout = (across: number, along: number, useTiltPitch: boolean) => {
    const cols = Math.floor((across + PANEL.gap) / (PANEL.width + PANEL.gap));
    const rowPitch = useTiltPitch ? pitchTilted : PANEL.length + PANEL.gap;
    const rows = Math.max(0, Math.floor((along - PANEL.length) / rowPitch) + (along >= PANEL.length ? 1 : 0));
    return cols * rows;
  };
  const flush = tryLayout(roofW, roofL, false);
  const tilted = tryLayout(roofW, roofL, true);
  return Math.max(flush, tilted);
}

export default function SolarStep1() {
  const [place, setPlace] = useState(PRESETS[0]);
  const [lat, setLat] = useState('30.0444');
  const [lon, setLon] = useState('31.2357');
  const [roofL, setRoofL] = useState(20);
  const [roofW, setRoofW] = useState(12);
  const [watts, setWatts] = useState(550);
  const [tilt, setTilt] = useState(30);
  const [azimuth, setAzimuth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const panels = useMemo(() => pack(roofL, roofW, tilt), [roofL, roofW, tilt]);
  const kwp = (panels * watts) / 1000;
  const maxMonthly = result ? Math.max(...result.monthly.map((m: any) => m.kwh)) : 0;

  const azimuthLabel = azimuth === 0 ? 'South' : azimuth === -90 ? 'East' : azimuth === 90 ? 'West'
    : azimuth < 0 ? `${Math.abs(azimuth)}° east of south` : `${azimuth}° west of south`;

  async function calculate() {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`/api/pvgis?lat=${lat}&lon=${lon}&kwp=${kwp.toFixed(2)}&tilt=${tilt}&azimuth=${azimuth}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Engine returned ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e?.message || 'Engine unreachable');
    } finally { setLoading(false); }
  }

  const inputCls = 'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]';
  const labelCls = 'block text-[10px] font-mono tracking-[0.18em] text-[#C9CEDA] mb-1.5';

  return (
    <main className="min-h-screen bg-[#05070D] text-white px-4 py-8 md:px-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-[#D4AF37] text-black flex items-center justify-center font-mono font-bold">S</div>
          <div>
            <h1 className="font-mono font-bold tracking-[0.25em] text-[#D4AF37]">SOLAR DESIGNER</h1>
            <p className="text-[11px] font-mono text-[#C9CEDA]">STEP 1 — ENGINE PROOF · place + roof → panels → real production (PVGIS)</p>
          </div>
        </div>

        <div className="grid md:grid-cols-[360px_1fr] gap-5 mt-6">
          {/* ── INPUTS ── */}
          <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4 h-fit">
            <div>
              <span className={labelCls}>TEST PLACE</span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => { setPlace(p); setLat(String(p.lat)); setLon(String(p.lon)); setResult(null); }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono border transition-colors ${place.name === p.name ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>LATITUDE</label><input className={inputCls} value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" /></div>
              <div><label className={labelCls}>LONGITUDE</label><input className={inputCls} value={lon} onChange={e => setLon(e.target.value)} inputMode="decimal" /></div>
              <div><label className={labelCls}>ROOF LENGTH (m)</label><input className={inputCls} type="number" min={1} value={roofL} onChange={e => setRoofL(Number(e.target.value))} /></div>
              <div><label className={labelCls}>ROOF WIDTH (m)</label><input className={inputCls} type="number" min={1} value={roofW} onChange={e => setRoofW(Number(e.target.value))} /></div>
            </div>
            <div>
              <label className={labelCls}>PANEL POWER</label>
              <div className="flex gap-1.5">
                {[450, 550, 600].map(w => (
                  <button key={w} onClick={() => setWatts(w)} className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono border ${watts === w ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>{w} W</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>TILT — {tilt}°</label>
              <input type="range" min={0} max={60} value={tilt} onChange={e => setTilt(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
            </div>
            <div>
              <label className={labelCls}>DIRECTION — {azimuthLabel}</label>
              <input type="range" min={-90} max={90} step={5} value={azimuth} onChange={e => setAzimuth(Number(e.target.value))} className="w-full accent-[#D4AF37]" />
              <div className="flex justify-between text-[9px] font-mono text-white/40"><span>EAST</span><span>SOUTH</span><span>WEST</span></div>
            </div>

            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3 font-mono">
              <div className="flex justify-between text-[11px]"><span className="text-[#C9CEDA]">PANELS FIT</span><span className="text-white font-bold">{panels}</span></div>
              <div className="flex justify-between text-[11px] mt-1"><span className="text-[#C9CEDA]">SYSTEM SIZE</span><span className="text-[#D4AF37] font-bold">{kwp.toFixed(1)} kWp</span></div>
              <p className="text-[9px] text-white/40 mt-2 leading-relaxed">Packing: {PANEL.length}×{PANEL.width} m modules, {PANEL.gap * 100} cm gaps, tilted rows spaced for a 30° winter sun. An estimate — the real layout comes in Step 3.</p>
            </div>

            <button onClick={calculate} disabled={loading || panels === 0}
              className="w-full py-3 rounded-xl bg-[#D4AF37] text-black font-mono font-bold text-sm tracking-wider disabled:opacity-50 hover:bg-[#e5c65a] transition-colors">
              {loading ? 'CONTACTING PVGIS…' : 'CALCULATE PRODUCTION'}
            </button>
            {error && <p className="text-[12px] font-mono text-red-400 border border-red-500/30 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          </section>

          {/* ── OUTPUT ── */}
          <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 min-h-[420px]">
            {!result && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <p className="font-mono text-white/50 text-sm">Pick a place, size the roof, press CALCULATE.</p>
                <p className="font-mono text-white/30 text-[11px] mt-2 max-w-sm">The numbers will come from the European Commission's PVGIS satellite database — the real engine test for Step 1.</p>
              </div>
            )}
            {loading && <div className="h-full flex items-center justify-center py-16"><p className="font-mono text-[#D4AF37] text-sm animate-pulse">Fetching satellite-derived solar data…</p></div>}
            {result && (
              <div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[9px] font-mono tracking-[0.18em] text-[#C9CEDA]">PER YEAR</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-white mt-1">{result.annual_kwh.toLocaleString()} <span className="text-xs text-white/50">kWh</span></div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[9px] font-mono tracking-[0.18em] text-[#C9CEDA]">PER kWp</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-white mt-1">{result.specific_yield.toLocaleString()} <span className="text-xs text-white/50">kWh</span></div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[9px] font-mono tracking-[0.18em] text-[#C9CEDA]">SUN ON PANELS</div>
                    <div className="text-xl md:text-2xl font-mono font-bold text-white mt-1">{result.annual_irradiation.toLocaleString()} <span className="text-xs text-white/50">kWh/m²</span></div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-[10px] font-mono tracking-[0.18em] text-[#C9CEDA] mb-2">MONTH BY MONTH (kWh)</div>
                  <div className="flex items-end gap-1.5 h-40">
                    {result.monthly.map((m: any) => (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[9px] font-mono text-white/60">{m.kwh.toLocaleString()}</span>
                        <div className="w-full rounded-t bg-[#D4AF37]/80" style={{ height: `${Math.max(3, (m.kwh / maxMonthly) * 110)}px` }} />
                        <span className="text-[9px] font-mono text-white/40">{MONTHS[m.month - 1]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] font-mono text-white/40 mt-6 leading-relaxed">
                  Source: {result.source} · {result.system.kwp} kWp at {result.system.tilt}° tilt, {result.system.loss}% system losses.
                  Long-term satellite average — an honest estimate (±~5%), not a guarantee. Step 2 puts this on the map.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
