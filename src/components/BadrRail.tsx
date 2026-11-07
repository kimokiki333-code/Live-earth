'use client';

/* ══════════════════════════════════════════════════════════════════════
   BADR LEFT RAIL — one button per layer GROUP, never per layer.

   Why: the first version put all 26 layers in the rail, so the six satellite
   layers became six identical satellite icons and the three camera layers
   became three identical camera icons. That reads as a fault, not a control.

   Now: 9 group buttons. Click one and a panel opens beside the rail listing
   that group's layers by name, each with its own switch and its own count —
   so the numbers have room and the icons stop repeating.

   States, per the design contract:
     ON    neon green  ·  OFF  dark plate + silver  ·  DOWN  yellow
   ══════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { X, Wrench, Layers } from 'lucide-react';
import { LAYER_GROUPS } from './LayerPanel';

type Props = {
  activeLayers: Record<string, boolean>;
  setActiveLayers: (fn: (prev: any) => any) => void;
  data: any;
  capabilities?: Record<string, boolean>;
  /** Bumped by the page when another panel opens, so this flyout gets out of the way. */
  closeSignal?: number;
  onOpenTools?: () => void;
  onOpenFeatures?: () => void;
};

export default function BadrRail({ activeLayers, setActiveLayers, data, capabilities = {}, closeSignal = 0, onOpenTools, onOpenFeatures }: Props) {
  const groups = LAYER_GROUPS
    .map((g) => ({ ...g, layers: g.layers.filter((l: any) => !l.requires || capabilities[l.requires]) }))
    .filter((g) => g.layers.length > 0);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [top, setTop] = useState(120);
  const railRef = useRef<HTMLElement | null>(null);

  /* Any other panel opening closes this one — one panel at a time. */
  useEffect(() => { if (closeSignal) setOpenKey(null); }, [closeSignal]);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openKey]);

  const countOf = (layer: any): number | null => {
    const dk = layer.dataKey;
    if (!dk) return null;
    if (layer.catKey && data?.category_counts) return data.category_counts[layer.catKey] ?? 0;
    let total = 0;
    let found = false;
    for (const k of String(dk).split(',')) {
      if (Array.isArray(data?.[k])) { total += data[k].length; found = true; }
    }
    return found ? total : null;
  };

  const isOn = (g: any) => g.layers.some((l: any) => !!activeLayers[l.key]);
  const onCount = (g: any) => g.layers.filter((l: any) => !!activeLayers[l.key]).length;

  const toggle = (key: string) => {
    setActiveLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));
  };

  /* Open the flyout level with the button that was pressed, kept inside the
     viewport so a group near the bottom never opens off-screen. */
  const openGroup = (key: string, el: HTMLElement) => {
    if (openKey === key) { setOpenKey(null); return; }
    const r = el.getBoundingClientRect();
    const panelH = Math.min(360, window.innerHeight - 120);
    setTop(Math.max(96, Math.min(r.top - 8, window.innerHeight - panelH - 16)));
    setOpenKey(key);
  };

  const open = groups.find((g) => g.label === openKey) || null;

  return (
    <>
      <nav className="badr-rail" aria-label="Map layer groups" ref={railRef as any}>
        {groups.map((group) => {
          const anyOn = isOn(group);
          const n = onCount(group);
          const active = openKey === group.label;
          return (
            <button
              key={group.label}
              type="button"
              onClick={(e) => openGroup(group.label, e.currentTarget)}
              aria-pressed={anyOn}
              aria-expanded={active}
              aria-label={`${group.fullLabel} — ${group.layers.length} layers, ${n} on`}
              title={`${group.fullLabel} — ${group.layers.length} layers${n ? `, ${n} on` : ''}`}
              className={`badr-rail-btn${anyOn ? ' on' : ''}${active ? ' sel' : ''}`}
            >
              <group.icon className="badr-rail-ic" />
              {anyOn && (
                <span className="badr-rail-dot" aria-hidden="true">
                  {n > 1 ? n : ''}
                </span>
              )}
            </button>
          );
        })}

        <div className="badr-rail-foot">
          {onOpenTools && (
            <button type="button" className="badr-rail-btn" onClick={onOpenTools}
              title="Intelligence tools — all 21 modules" aria-label="Open intelligence tools">
              <Wrench className="badr-rail-ic" />
            </button>
          )}
          {onOpenFeatures && (
            <button type="button" className="badr-rail-btn" onClick={onOpenFeatures}
              title="All layers and features" aria-label="Open all layers">
              <Layers className="badr-rail-ic" />
            </button>
          )}
        </div>
      </nav>

      {open && (
        <>
          <button type="button" className="badr-rail-scrim" onClick={() => setOpenKey(null)} aria-label="Close layer list" tabIndex={-1} />
          <div className="badr-rail-fly" style={{ top }} role="dialog" aria-label={open.fullLabel}>
            <header className="badr-rail-fly-h">
              <open.icon className="badr-rail-fly-ic" />
              <span className="badr-rail-fly-t">{open.fullLabel}</span>
              <button type="button" className="badr-rail-fly-x" onClick={() => setOpenKey(null)} aria-label="Close">
                <X className="w-3 h-3" />
              </button>
            </header>
            <div className="badr-rail-fly-b">
              {open.layers.map((layer: any) => {
                const on = !!activeLayers[layer.key];
                const c = countOf(layer);
                const dormant = layer.parent && !activeLayers[layer.parent];
                return (
                  <button
                    key={layer.key}
                    type="button"
                    onClick={() => toggle(layer.key)}
                    aria-pressed={on}
                    className={`badr-rail-row${on ? ' on' : ''}${dormant ? ' dim' : ''}`}
                    title={layer.description || layer.label}
                  >
                    <span className="badr-rail-row-sw" aria-hidden="true" />
                    <span className="badr-rail-row-l">{layer.label}</span>
                    <span className="badr-rail-row-n">{c === null ? '' : c}</span>
                  </button>
                );
              })}
            </div>
            <footer className="badr-rail-fly-f">
              {open.layers.filter((l: any) => !!activeLayers[l.key]).length} of {open.layers.length} on
            </footer>
          </div>
        </>
      )}
    </>
  );
}
