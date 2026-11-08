'use client';

/* ══════════════════════════════════════════════════════════════════════
   BADR WINDOW — a real floating panel.

   The complaint this answers: every pop-up in this app was nailed to the
   corner it opened in. You could not carry it out of the way of the map,
   you could not widen it to read a long result, and a second panel simply
   landed on top of the first.

   So the pop-ups now behave like windows:

     · drag anywhere by the title bar
     · resize from all four edges and all four corners
     · minimise to a title bar · maximise to the viewport · close
     · the one you click rises above the others
     · position and size are remembered for the session

   It renders through a portal, so no transformed ancestor can drag it back
   into a corner (that is exactly what pinned the old search box over the
   dock).
   ══════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Square, X } from 'lucide-react';

type Geom = { x: number; y: number; w: number; h: number | null };

/* Module-level so a window keeps its place when its parent re-renders or the
   panel is closed and reopened — a window that jumps home on every refresh is
   worse than one that never moved. */
const MEMORY = new Map<string, Geom>();
let TOP_Z = 900;

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type Edge = typeof EDGES[number];

/* A window must never be able to leave the viewport. The first cut of this
   clamped x to `innerWidth - 120` on the LEFT of that expression and to 0 on
   the right, which let a west-edge resize walk a window to x = -1400 and lose
   it for good. Every geometry update now goes through here. */
const TITLE_KEEP = 96;   // title bar that must stay reachable

function clampGeom(g: Geom, minW: number, minH: number): Geom {
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  const w = Math.min(Math.max(minW, g.w), Math.max(minW, vw - 24));
  const h = g.h === null ? null : Math.min(Math.max(minH, g.h), Math.max(minH, vh - 24));
  const x = Math.min(Math.max(0, g.x), Math.max(0, vw - TITLE_KEEP));
  const y = Math.min(Math.max(0, g.y), Math.max(0, vh - 40));
  return { x, y, w, h };
}

export type BadrWindowProps = {
  id: string;
  title: string;
  subtitle?: string;
  accent?: 'gold' | 'green' | 'red' | 'cyan';
  children: ReactNode;
  onClose?: () => void;
  /** Title-bar only, contents hidden. */
  collapsed?: boolean;
  /** Called when the user clicks a collapsed window's title bar. */
  onExpand?: () => void;
  defaultW?: number;
  defaultH?: number;
  minW?: number;
  minH?: number;
  /** Where it first appears. */
  side?: 'right' | 'left' | 'centre';
  defaultTop?: number;
};

export default function BadrWindow({
  id, title, subtitle, accent = 'gold', children, onClose,
  collapsed = false, onExpand,
  defaultW = 380, defaultH, minW = 260, minH = 120,
  side = 'right', defaultTop = 104,
}: BadrWindowProps) {
  const [mounted, setMounted] = useState(false);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [z, setZ] = useState(TOP_Z);
  const [maxed, setMaxed] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const sizeRef = useRef<{ edge: Edge; x: number; y: number; w: number; h: number } | null>(null);

  /* Place it once, on the client, from the remembered geometry. */
  useEffect(() => {
    setMounted(true);
    const saved = MEMORY.get(id);
    if (saved) { setGeom(clampGeom(saved, minW, minH)); return; }
    const vw = window.innerWidth;
    const x = side === 'right' ? Math.max(12, vw - defaultW - 24)
      : side === 'left' ? 76
      : Math.max(12, Math.round((vw - defaultW) / 2));
    const g: Geom = { x, y: defaultTop, w: defaultW, h: defaultH ?? null };
    MEMORY.set(id, g);
    setGeom(g);
  }, [id, side, defaultW, defaultH, defaultTop]);

  const commit = useCallback((g: Geom) => {
    MEMORY.set(id, g);
    setGeom(g);
  }, [id]);

  useEffect(() => {
    const onResize = () => setGeom((g) => (g ? clampGeom(g, minW, minH) : g));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minW, minH]);

  const raise = useCallback(() => {
    TOP_Z += 1;
    setZ(TOP_Z);
  }, []);

  /* ── drag ───────────────────────────────────────────────────────────── */
  const onHeaderDown = (e: React.PointerEvent) => {
    if (!geom || maxed) return;
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    raise();
    dragRef.current = { dx: e.clientX - geom.x, dy: e.clientY - geom.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHeaderMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !geom) return;
    setGeom(clampGeom({ ...geom, x: e.clientX - d.dx, y: e.clientY - d.dy }, minW, minH));
  };

  const onHeaderUp = (e: React.PointerEvent) => {
    if (!dragRef.current || !geom) return;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    MEMORY.set(id, geom);
  };

  /* ── resize ─────────────────────────────────────────────────────────── */
  const onEdgeDown = (edge: Edge) => (e: React.PointerEvent) => {
    if (!geom) return;
    e.stopPropagation();
    raise();
    sizeRef.current = { edge, x: e.clientX, y: e.clientY, w: geom.w, h: geom.h ?? (e.currentTarget.closest('.badr-win') as HTMLElement)?.offsetHeight ?? minH };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onEdgeMove = (e: React.PointerEvent) => {
    const s = sizeRef.current;
    if (!s || !geom) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    let { x, y, w, h } = { x: geom.x, y: geom.y, w: s.w, h: s.h };
    if (s.edge.includes('e')) w = Math.max(minW, s.w + dx);
    if (s.edge.includes('s')) h = Math.max(minH, s.h + dy);
    if (s.edge.includes('w')) {
      w = Math.max(minW, s.w - dx);
      x = geom.x + (s.w - w);
    }
    if (s.edge.includes('n')) {
      h = Math.max(minH, s.h - dy);
      y = geom.y + (s.h - h);
    }
    setGeom(clampGeom({ x, y, w, h }, minW, minH));
  };

  const onEdgeUp = () => {
    if (!sizeRef.current || !geom) return;
    sizeRef.current = null;
    MEMORY.set(id, geom);
  };

  if (!mounted || !geom) return null;

  const style: React.CSSProperties = maxed
    ? { left: 14, top: 14, width: window.innerWidth - 28, height: window.innerHeight - 28, zIndex: z }
    : { left: geom.x, top: geom.y, width: geom.w, height: geom.h ?? undefined, zIndex: z };

  const node = (
    <section
      className={`badr-win badr-win--${accent}${collapsed ? ' is-min' : ''}${maxed ? ' is-max' : ''}`}
      style={style}
      role="dialog"
      aria-label={title}
      onPointerDownCapture={raise}
    >
      <header
        className="badr-win-h"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onDoubleClick={() => setMaxed((m) => !m)}
        title={collapsed ? 'Click to expand' : 'Drag to move · double-click to maximise'}
        onClick={() => { if (collapsed && onExpand) onExpand(); }}
      >
        <span className="badr-win-dot" aria-hidden="true" />
        <span className="badr-win-t">{title}</span>
        {subtitle && <span className="badr-win-s">{subtitle}</span>}
        <span className="badr-win-btns">
          {onClose && (
            <button
              type="button"
              className="badr-win-b"
              onClick={(e) => { e.stopPropagation(); collapsed && onExpand ? onExpand() : (onClose?.()); }}
              aria-label="Collapse to a bar"
              title="Collapse to a bar"
            >
              <Minus className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            className="badr-win-b"
            onClick={(e) => { e.stopPropagation(); setMaxed((m) => !m); }}
            aria-label={maxed ? 'Restore size' : 'Maximise'}
            title={maxed ? 'Restore size' : 'Maximise'}
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          {onClose && (
            <button
              type="button"
              className="badr-win-b badr-win-b--x"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label="Close"
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      </header>

      {!collapsed && (
        <>
          <div className="badr-win-bd">{children}</div>
          {!maxed && EDGES.map((edge) => (
            <span
              key={edge}
              className={`badr-win-grip badr-win-grip--${edge}`}
              onPointerDown={onEdgeDown(edge)}
              onPointerMove={onEdgeMove}
              onPointerUp={onEdgeUp}
            />
          ))}
        </>
      )}
    </section>
  );

  return createPortal(node, document.body);
}
