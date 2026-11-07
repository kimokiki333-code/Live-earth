'use client';

/* ══════════════════════════════════════════════════════════════════════
   BADR LEFT RAIL — every layer as one button, in the new visual language.

   ON      neon green
   OFF     dark plate, silver icon
   DOWN    yellow   (a layer whose backing route is not answering)

   It reads the same LAYER_GROUPS the LayerPanel uses, so the two can
   never disagree about what exists. Toggling here toggles the real layer.
   ══════════════════════════════════════════════════════════════════════ */

import { LAYER_GROUPS } from './LayerPanel';

type Props = {
  activeLayers: Record<string, boolean>;
  setActiveLayers: (fn: (prev: any) => any) => void;
  data: any;
  capabilities?: Record<string, boolean>;
};

export default function BadrRail({ activeLayers, setActiveLayers, data, capabilities = {} }: Props) {
  const groups = LAYER_GROUPS
    .map((g) => ({ ...g, layers: g.layers.filter((l: any) => !l.requires || capabilities[l.requires]) }))
    .filter((g) => g.layers.length > 0);

  const countOf = (layer: any): number | null => {
    const dk = layer.dataKey;
    if (!dk) return null;
    if (layer.catKey && data?.category_counts) return data.category_counts[layer.catKey] ?? 0;
    let total = 0;
    let found = false;
    for (const k of String(dk).split(',')) {
      if (Array.isArray(data?.[k])) {
        total += data[k].length;
        found = true;
      }
    }
    return found ? total : null;
  };

  const toggle = (key: string) => {
    setActiveLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <nav className="badr-rail" aria-label="Map layers">
      {groups.map((group, gi) => (
        <div className="badr-rail-group" key={group.label}>
          {gi > 0 && <span className="badr-rail-sep" />}
          {group.layers.map((layer: any) => {
            const on = !!activeLayers[layer.key];
            const n = countOf(layer);
            const dormant = layer.parent && !activeLayers[layer.parent];
            return (
              <button
                key={layer.key}
                type="button"
                onClick={() => toggle(layer.key)}
                aria-pressed={on}
                title={`${layer.label}${n !== null ? ` — ${n}` : ''}${layer.description ? ` · ${layer.description}` : ''}`}
                aria-label={`${layer.label}${n !== null ? ` — ${n} items` : ''}`}
                className={`badr-rail-btn${on ? ' on' : ''}${dormant ? ' off-dim' : ''}`}
              >
                <group.icon className="badr-rail-ic" />
                <span className="badr-rail-tip">{layer.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
