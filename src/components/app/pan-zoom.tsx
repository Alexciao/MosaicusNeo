"use client";
// Tela con zoom e spostamento, per lo schema dei collegamenti a tutto schermo.
//  - trackpad: due dita scorrono, il pizzico ingrandisce (Chrome, Edge e Firefox lo mandano come
//    rotella con Ctrl; Safari con i gesture event)
//  - mouse: la rotella scorre (Maiusc in orizzontale), Ctrl + rotella ingrandisce, si trascina col
//    tasto sinistro, doppio clic ingrandisce
//  - tocco: un dito trascina, due dita pizzicano
//  - tastiera: + e − ingrandiscono, 0 adatta, le frecce spostano
// La posizione si scrive direttamente nello stile (niente rendering di React a ogni fotogramma).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX = 8;
const DRAG_SLOP = 4;

interface View { k: number; x: number; y: number }

/** Oltre il bordo lo schema segue il dito sempre meno (rubber-band, come su iOS). */
const rubber = (v: number, lo: number, hi: number, dim: number) => {
  const rb = (o: number) => (o * dim * 0.55) / (dim + 0.55 * o);
  return v < lo ? lo - rb(lo - v) : v > hi ? hi + rb(v - hi) : v;
};

/** bare: senza bordo (a tutto schermo); autoFocus: la tastiera funziona subito (+, −, 0, frecce). */
export function PanZoom({ children, contentWidth = 1200, className, bare = false, autoFocus = false }: { children: React.ReactNode; contentWidth?: number; className?: string; bare?: boolean; autoFocus?: boolean }) {
  const t = useTranslations("rig.guide.zoom");
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ k: 1, x: 0, y: 0 });
  const fitK = useRef(1);
  const touched = useRef(false);          // l'utente ha già mosso: non riadattare a ogni ridimensionamento
  const [pct, setPct] = useState(100);
  const [kbd, setKbd] = useState(false);        // il contorno del fuoco solo dopo un tasto (non dopo il clic che apre lo schema)

  const apply = useCallback(() => {
    const el = inner.current; if (!el) return;
    const { k, x, y } = view.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
    setPct(Math.round((k / fitK.current) * 100));
  }, []);

  /** I limiti dello spostamento: resta sempre un pezzo dello schema dentro la finestra. */
  const bounds = useCallback((k: number) => {
    const b = box.current, el = inner.current;
    if (!b || !el) return null;
    const W = b.clientWidth, H = b.clientHeight, w = contentWidth * k, h = el.offsetHeight * k, m = 80;
    return {
      W, H,
      x: (w <= W ? [-w + m, W - m] : [W - w - m * 2, m * 2]) as [number, number],
      y: (h <= H ? [-h + m, H - m] : [H - h - m * 2, m * 2]) as [number, number],
    };
  }, [contentWidth]);

  /** Tiene sempre un pezzo dello schema dentro la finestra. */
  const clamp = useCallback((v: View): View => {
    const bd = bounds(v.k);
    if (!bd) return v;
    return { k: v.k, x: Math.min(Math.max(v.x, bd.x[0]), bd.x[1]), y: Math.min(Math.max(v.y, bd.y[0]), bd.y[1]) };
  }, [bounds]);

  const fit = useCallback(() => {
    const b = box.current, el = inner.current;
    if (!b || !el) return;
    const W = b.clientWidth, H = b.clientHeight, h = el.offsetHeight || 1;
    const pad = 16;
    const k = Math.min((W - pad * 2) / contentWidth, (H - pad * 2) / h);
    fitK.current = k;
    view.current = { k, x: (W - contentWidth * k) / 2, y: (H - h * k) / 2 };
    apply();
  }, [apply, contentWidth]);

  /** Ingrandisce di f intorno al punto (px, py) della finestra. */
  const zoomAt = useCallback((f: number, px: number, py: number) => {
    const v = view.current;
    const k = Math.min(Math.max(v.k * f, fitK.current * 0.5), MAX);
    const r = k / v.k;
    view.current = clamp({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r });
    touched.current = true;
    apply();
  }, [apply, clamp]);

  const panBy = useCallback((dx: number, dy: number) => {
    const v = view.current;
    view.current = clamp({ k: v.k, x: v.x + dx, y: v.y + dy });
    touched.current = true;
    apply();
  }, [apply, clamp]);

  const zoomCenter = (f: number) => { const b = box.current; if (b) zoomAt(f, b.clientWidth / 2, b.clientHeight / 2); };

  useLayoutEffect(() => {
    fit();
    const b = box.current, el = inner.current;
    if (!b || !el) return;
    const ro = new ResizeObserver(() => { if (!touched.current) fit(); else { view.current = clamp(view.current); apply(); } });
    ro.observe(b); ro.observe(el);
    return () => ro.disconnect();
  }, [fit, clamp, apply]);

  useEffect(() => {
    // dentro una finestra di dialogo il fuoco arriva dopo l'apertura: lo prendo al fotogramma dopo
    const raf = autoFocus ? requestAnimationFrame(() => box.current?.focus({ preventScroll: true })) : 0;
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  // rotella e gesti: listener nativi, perché servono non passivi (preventDefault)
  useEffect(() => {
    const b = box.current; if (!b) return;
    const local = (e: { clientX: number; clientY: number }) => { const r = b.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? b.clientHeight : 1;
      let dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        // pizzico sul trackpad (delta piccoli e fitti) o Ctrl + rotella (scatti grandi): stessa curva
        const d = Math.max(-60, Math.min(60, dy));
        const [px, py] = local(e);
        zoomAt(Math.exp(-d * 0.01), px, py);
        return;
      }
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      panBy(-dx, -dy);
    };
    // Safari (macOS): il pizzico arriva come gesture event
    let g0 = 1;
    type GestureEv = Event & { scale: number; clientX: number; clientY: number };
    const onGStart = (e: Event) => { e.preventDefault(); g0 = 1; };
    const onGChange = (e: Event) => {
      e.preventDefault();
      const ge = e as GestureEv;
      const [px, py] = local(ge);
      zoomAt(ge.scale / g0, px, py);
      g0 = ge.scale;
    };
    b.addEventListener("wheel", onWheel, { passive: false });
    b.addEventListener("gesturestart", onGStart);
    b.addEventListener("gesturechange", onGChange);
    b.addEventListener("gestureend", onGStart);
    return () => {
      b.removeEventListener("wheel", onWheel);
      b.removeEventListener("gesturestart", onGStart);
      b.removeEventListener("gesturechange", onGChange);
      b.removeEventListener("gestureend", onGStart);
    };
  }, [zoomAt, panBy]);

  // trascinamento e pizzico con i puntatori (mouse, penna, dita)
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; sx: number; sy: number; dist?: number; cx?: number; cy?: number } | null>(null);
  const suppressClick = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  // trascinamento con un dito: la posizione «del dito», senza limiti; quella mostrata è elastica
  const raw = useRef<{ x: number; y: number } | null>(null);
  const settleRaf = useRef(0);
  const vel = useRef({ x: 0, y: 0, t: 0 });

  /** Rilasciato oltre il bordo: torna dentro con una molla smorzata criticamente (niente rimbalzo),
   *  partendo dalla velocità del dito; un nuovo tocco la ferma dove si trova. */
  const settle = useCallback(() => {
    cancelAnimationFrame(settleRaf.current);
    const target = clamp(view.current);
    if (target.x === view.current.x && target.y === view.current.y) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("lim")) {
      view.current = target; apply(); return;
    }
    const w = (2 * Math.PI) / 0.35;                   // risposta 0,35 s
    let vx = vel.current.x, vy = vel.current.y, last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      const v = view.current;
      vx += (-w * w * (v.x - target.x) - 2 * w * vx) * dt;
      vy += (-w * w * (v.y - target.y) - 2 * w * vy) * dt;
      view.current = { k: v.k, x: v.x + vx * dt, y: v.y + vy * dt };
      const done = Math.abs(view.current.x - target.x) < 0.5 && Math.abs(view.current.y - target.y) < 0.5 && Math.hypot(vx, vy) < 20;
      if (done) view.current = target;
      apply();
      if (!done) settleRaf.current = requestAnimationFrame(step);
    };
    settleRaf.current = requestAnimationFrame(step);
  }, [apply, clamp]);
  useEffect(() => () => cancelAnimationFrame(settleRaf.current), []);

  /** Sposta con un dito: oltre il bordo con resistenza crescente. */
  const dragBy = (dx: number, dy: number) => {
    const v = view.current, bd = bounds(v.k);
    const r = raw.current ?? (raw.current = { x: v.x, y: v.y });
    r.x += dx; r.y += dy;
    const now = performance.now(), dt = Math.max(1, now - vel.current.t);
    vel.current = { x: (dx / dt) * 1000, y: (dy / dt) * 1000, t: now };
    view.current = bd ? { k: v.k, x: rubber(r.x, bd.x[0], bd.x[1], bd.W), y: rubber(r.y, bd.y[0], bd.y[1], bd.H) } : { k: v.k, x: r.x, y: r.y };
    touched.current = true;
    apply();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelAnimationFrame(settleRaf.current);        // afferrato mentre torna dentro: si ferma lì
    raw.current = null;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    suppressClick.current = false;
    if (pts.current.size === 1) drag.current = { moved: false, sx: e.clientX, sy: e.clientY };
    else if (pts.current.size === 2) {
      const [a, c] = [...pts.current.values()];
      drag.current = { moved: true, sx: 0, sy: 0, dist: Math.hypot(a.x - c.x, a.y - c.y), cx: (a.x + c.x) / 2, cy: (a.y + c.y) / 2 };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pts.current.get(e.pointerId), d = drag.current;
    if (!p || !d) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size >= 2 && d.dist) {
      raw.current = null;
      const [a, c] = [...pts.current.values()];
      const dist = Math.hypot(a.x - c.x, a.y - c.y), cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
      const r = box.current!.getBoundingClientRect();
      panBy(cx - d.cx!, cy - d.cy!);
      zoomAt(dist / d.dist, cx - r.left, cy - r.top);
      Object.assign(d, { dist, cx, cy });
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setGrabbing(true);
      // superata la soglia, lo schema recupera i pixel già percorsi: resta sotto il dito da dove l'ha preso
      dragBy(e.clientX - d.sx, e.clientY - d.sy);
      return;
    }
    dragBy(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (drag.current?.moved) suppressClick.current = true;
    if (pts.current.size === 0) {
      drag.current = null; setGrabbing(false); raw.current = null;
      // fermo da più di 80 ms prima di alzare il dito: niente velocità residua
      if (performance.now() - vel.current.t > 80) vel.current = { x: 0, y: 0, t: 0 };
      settle();
    }
    else if (pts.current.size === 1) { const [a] = [...pts.current.values()]; drag.current = { moved: true, sx: a.x, sy: a.y }; raw.current = null; }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!kbd && e.key !== "Escape") setKbd(true);
    const step = 60;
    const map: Record<string, () => void> = {
      "+": () => zoomCenter(1.25), "=": () => zoomCenter(1.25), "-": () => zoomCenter(0.8), "0": () => { touched.current = false; fit(); },
      ArrowLeft: () => panBy(step, 0), ArrowRight: () => panBy(-step, 0), ArrowUp: () => panBy(0, step), ArrowDown: () => panBy(0, -step),
    };
    const f = map[e.key];
    if (f && !e.altKey) { e.preventDefault(); f(); }
  };

  const refit = () => { touched.current = false; fit(); };
  return (
    <div className={cn("relative overflow-hidden", bare ? "bg-muted/30" : "rounded-lg border bg-background", className)}>
      <div ref={box} tabIndex={0} role="application" aria-label={t("aria")}
        className={cn("absolute inset-0 touch-none outline-none select-none", kbd && "focus:ring-2 focus:ring-ring/40 focus:ring-inset", grabbing ? "cursor-grabbing" : "cursor-grab")}
        style={{ backgroundImage: "radial-gradient(circle, color-mix(in oklab, var(--foreground) 9%, transparent) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        onPointerDown={(e) => { if (kbd) setKbd(false); onPointerDown(e); }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; } }}
        onDoubleClick={(e) => { const r = box.current!.getBoundingClientRect(); zoomAt(e.shiftKey ? 0.5 : 2, e.clientX - r.left, e.clientY - r.top); }}
        onKeyDown={onKeyDown}>
        <div ref={inner} className="absolute top-0 left-0 origin-top-left" style={{ width: contentWidth }}>{children}</div>
      </div>
      <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm">
        <Button size="icon-sm" variant="ghost" aria-label={t("out")} title={`${t("out")} (−)`} onClick={() => zoomCenter(0.8)}><Minus /></Button>
        <button type="button" className="h-7 min-w-13 rounded-md px-1.5 text-center text-xs font-medium tabular transition-colors hover:bg-muted" title={`${t("fit")} (0)`} aria-label={t("fit")}
          onClick={refit}>{pct}%</button>
        <Button size="icon-sm" variant="ghost" aria-label={t("in")} title={`${t("in")} (+)`} onClick={() => zoomCenter(1.25)}><Plus /></Button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button size="icon-sm" variant="ghost" aria-label={t("fit")} title={`${t("fit")} (0)`} onClick={refit}><Scan /></Button>
      </div>
    </div>
  );
}
