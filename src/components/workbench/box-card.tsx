"use client";
// Un riquadro di Elaborazione: grafico con assi a scelta, strumenti, analisi salvate, foglio dei dati.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { ArrowLeftRight, ChartSpline, ChevronDown, Copy, Eye, EyeOff, Maximize2, MousePointer2, Ruler, Spline, TrendingUp, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chart, ChartGroup } from "@/lib/mosaicus/chart.js";
import { runModel, runsTest, MODELS, MODEL_ORDER } from "@/lib/mosaicus/fits.js";
import { polyfit, formatMeasure } from "@/lib/mosaicus/analysis.js";
import { quantityOf } from "@/lib/sensors/quantities";
import { useWorkbench, computeRows, colInfo, axisLabel, type Analysis, type Box } from "@/lib/workbench-store";
import { confirm } from "@/lib/confirm";
import { fmtNum } from "@/lib/prefs";
import { Segmented } from "@/components/instruments/scope-panel";
import { cn } from "@/lib/utils";
import { Sym } from "@/components/app/sym";
import {
  EyePanel, FitPanel, Residuals, RulerPanel, StatsPanel, TangentPanel, ToolIntro, computeStats, cssVar, lineThrough, n4, read3,
  type EyeState, type ModelRow, type PhysicsValue, type RulerState, type TangentResult,
} from "./box-tools";
import { DataSheet } from "./data-sheet";
import { BoxMap } from "./box-map";

type Tool = "select" | "line" | "tangent" | "fit" | "ruler";

function slopeUnit(yU: string, xU: string) {
  if (!xU) return yU;
  if (xU === "s") {
    if (!yU) return "s⁻¹";
    if (yU.endsWith("/s²")) return yU.replace("/s²", "/s³");
    if (yU.endsWith("/s")) return `${yU}²`;
    return `${yU}/s`;
  }
  return `${yU || "1"}/${xU}`;
}
function niceStep(v: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1)));
  const n = v / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

export function BoxCard({ box }: { box: Box }) {
  const many = useWorkbench((s) => s.boxes.length > 1);
  const t = useTranslations("workbench");
  const updateBox = useWorkbench((s) => s.updateBox);
  const focusId = useWorkbench((s) => s.focusId);
  const { resolvedTheme } = useTheme();
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const groupRef = useRef<any>(null);
  const chartRef = useRef<any>(null);

  const [tool, setToolState] = useState<Tool>(box.wave ? "ruler" : "select");
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [eye, setEye] = useState<EyeState | null>(null);
  const [tangentPick, setTangentPick] = useState<{ i: number; range: [number, number] } | null>(null);
  const [fitModel, setFitModel] = useState<string | null>(null);
  const [showResid, setShowResid] = useState(false);
  const [ruler, setRuler] = useState<RulerState | null>(null);
  const [compareOn, setCompareOn] = useState(false);

  const { rows, errors } = useMemo(() => computeRows(box), [box]);
  const x = useMemo(() => rows.map((r) => r[box.xKey]), [rows, box.xKey]);
  const y = useMemo(() => rows.map((r) => r[box.yKey]), [rows, box.yKey]);
  const cx = colInfo(box, box.xKey), cy = colInfo(box, box.yKey);
  const su = slopeUnit(cy.unit, cx.unit);
  const meaning = box.xKey === "t" ? quantityOf(box.yKey)?.slope ?? null : null;
  const finiteX = useMemo(() => x.filter(Number.isFinite), [x]);

  // --- strumenti: a ogni cambio di strumento o di assi si riparte da capo
  const initTool = (tl: Tool) => {
    setTangentPick(null); setShowResid(false);
    // la retta di best fit è il punto di partenza; gli altri modelli sono in «Avanzate»
    setFitModel(tl === "fit" ? "lin" : null);
    if (tl === "line") {
      const ys = y.filter(Number.isFinite);
      const x0 = Math.min(...finiteX), x1 = Math.max(...finiteX);
      const ym = ys.reduce((s, q) => s + q, 0) / (ys.length || 1);
      setEye({ step: 1, h1: { x: x0 + 0.2 * (x1 - x0), y: ym }, h2: { x: x0 + 0.8 * (x1 - x0), y: ym }, pts: [], cmp: null });
    } else setEye(null);
    if (tl === "ruler") {
      const a = Math.min(...finiteX), b = Math.max(...finiteX);
      setRuler((keep) => (keep && keep.x1 >= a && keep.x2 <= b ? keep : { x1: a + 0.2 * (b - a), x2: a + 0.6 * (b - a), n: 1 }));
    }
  };
  const setTool = (tl: Tool) => { setToolState(tl); initTool(tl); };
  // cambiati gli assi: lo strumento riparte sui dati nuovi (aggiustamento dello stato durante il render)
  const axesKey = `${box.xKey}|${box.yKey}`;
  const [prevAxes, setPrevAxes] = useState(axesKey);
  if (prevAxes !== axesKey) { setPrevAxes(axesKey); initTool(tool); }

  // --- risultati degli strumenti
  const fitPoints = useMemo(() => {
    if (tool !== "fit") return null;
    const [a, b] = selection ?? [-Infinity, Infinity];
    const tt: number[] = [], yy: number[] = [];
    x.forEach((xi, i) => { if (Number.isFinite(xi) && Number.isFinite(y[i]) && xi >= a && xi <= b) { tt.push(xi); yy.push(y[i]); } });
    const order = tt.map((_, i) => i).sort((i, j) => tt[i] - tt[j]);
    return { T: order.map((i) => tt[i]), Y: order.map((i) => yy[i]) };
  }, [tool, selection, x, y]);
  const units = useMemo(() => ({ x: cx.unit, y: cy.unit, xs: cx.sym, ys: cy.sym }), [cx.unit, cy.unit, cx.sym, cy.sym]);
  const compare: ModelRow[] | null = useMemo(() => {
    if (!compareOn || !fitPoints) return null;
    return MODEL_ORDER.map((id: string) => {
      const f = runModel(id, fitPoints.T, fitPoints.Y, units);
      const label = (MODELS as any)[id].label;
      if (f.error) return { id, label, r2: NaN, s: NaN, n: 0, verdict: "", error: f.error };
      return { id, label, r2: f.r2, s: f.s, n: f.n, verdict: runsTest(f.residuals).verdict };
    });
  }, [compareOn, fitPoints, units]);

  const fitData = useMemo(() => {
    if (tool !== "fit" || !fitModel || !fitPoints) return null;
    const { T, Y } = fitPoints;
    const fit = runModel(fitModel, T, Y, units);
    if (fit.error) return { fit, T, phys: [] as PhysicsValue[], curve: null };
    const q = box.xKey === "t" ? quantityOf(box.yKey) : null;
    const phys: PhysicsValue[] = (q?.physics?.[fitModel] || []).map((p) => { const [v, s] = p.calc(fit); return { label: p.label, unit: p.unit, value: v, sigma: s }; });
    const N = 300, X: number[] = [], Yc: number[] = [];
    for (let i = 0; i <= N; i++) { const tt = fit.t1 + ((fit.t2 - fit.t1) * i) / N; X.push(tt); Yc.push(fit.curve(tt)); }
    return { fit, T, phys, curve: { x: X, y: Yc } };
  }, [tool, fitModel, fitPoints, units, box.xKey, box.yKey]);

  const stats = useMemo(() => (tool === "select" ? computeStats(x, y, selection) : null), [tool, x, y, selection]);

  const tangent: TangentResult | null | "few" = useMemo(() => {
    if (tool !== "tangent" || tangentPick == null) return null;
    const { i, range } = tangentPick;
    const idx = x.map((_, k) => k).filter((k) => Number.isFinite(x[k]) && Number.isFinite(y[k])).sort((a, b) => x[a] - x[b]);
    const pos = idx.indexOf(i);
    const near = idx.slice(Math.max(0, pos - 3), Math.min(idx.length - 1, pos + 3) + 1);
    const f = near.length >= 3 ? polyfit(near.map((k) => x[k]), near.map((k) => y[k]), 2, x[i]) : null;
    if (!f) return "few";
    const [x0, x1] = range;
    return { m: f.coef[1], P: { x: x[i], y: y[i] }, dx: niceStep((x1 - x0) * 0.25), near: near.length };
  }, [tool, tangentPick, x, y]);

  const balance = useMemo(() => {
    if (!eye) return { up: 0, down: 0 };
    const L = lineThrough(eye.h1, eye.h2);
    let up = 0, down = 0;
    x.forEach((xi, i) => { if (Number.isFinite(xi) && Number.isFinite(y[i])) { if (y[i] > L.at(xi)) up++; else down++; } });
    return { up, down };
  }, [eye, x, y]);

  // --- disegni sopra il grafico
  const overlays = useMemo(() => {
    if (typeof window === "undefined") return [];
    const green = cssVar("--mz-green"), rosa = cssVar("--mz-rosa"), rosaD = cssVar("--mz-rosa-d"), muted = cssVar("--mz-muted");
    const out: any[] = [];
    for (const a of box.analyses) {
      if (a.xKey !== box.xKey || a.yKey !== box.yKey || a.hidden) continue;
      if (a.kind === "fit" && a.curve) out.push({ type: "curve", x: a.curve.x, y: a.curve.y, color: rosa, width: 2, dash: [6, 4] });
      if (a.kind === "ruler" && a.span) out.push({ type: "span", ...a.span, color: muted, label: a.spanLabel });
      if (a.kind === "stats" && a.seg) out.push({ type: "segment", ...a.seg, color: muted, width: 1.6, dash: [5, 4] });
      if ((a.kind === "line" || a.kind === "tangent") && a.seg) out.push({ type: "segment", ...a.seg, extend: a.kind === "line", color: green, width: 1.6, dash: [6, 4] });
    }
    if (tool === "line" && eye) {
      out.push({ type: "segment", x1: eye.h1.x, y1: eye.h1.y, x2: eye.h2.x, y2: eye.h2.y, extend: true, color: green, width: 2.6 });
      if (eye.step === 1) out.push({ type: "anchor", handle: true, free: true, id: "h1", ...eye.h1, color: green }, { type: "anchor", handle: true, free: true, id: "h2", ...eye.h2, color: green });
      if (eye.cmp) out.push({ type: "segment", x1: eye.cmp.x1, y1: eye.cmp.y1, x2: eye.cmp.x2, y2: eye.cmp.y2, extend: true, color: rosa, width: 2, dash: [2, 3] });
      if (eye.step === 2) {
        eye.pts.forEach((p, i) => out.push({ type: "anchor", x: p.x, y: p.y, label: i ? "B" : "A", color: rosaD }));
        if (eye.pts.length === 2) {
          const [A, B] = eye.pts;
          out.push({ type: "triangle", x1: A.x, y1: A.y, x2: B.x, y2: B.y, color: rosaD, dxLabel: `Δ${cx.sym} = ${fmtNum(B.x - A.x)} ${cx.unit}`, dyLabel: `Δ${cy.sym} = ${fmtNum(read3(B.y) - read3(A.y))} ${cy.unit}` });
        }
      }
    }
    if (tool === "tangent" && tangent && tangent !== "few") {
      const { P, m, dx } = tangent, Q = { x: P.x + dx, y: P.y + m * dx };
      out.push(
        { type: "segment", x1: P.x - dx * 1.6, y1: P.y - m * dx * 1.6, x2: P.x + dx * 1.6, y2: P.y + m * dx * 1.6, color: green, width: 2.4 },
        { type: "triangle", x1: P.x, y1: P.y, x2: Q.x, y2: Q.y, color: rosaD, dxLabel: `Δ${cx.sym} = ${fmtNum(dx)} ${cx.unit}`, dyLabel: `Δ${cy.sym} = ${fmtNum(m * dx)} ${cy.unit}` },
        { type: "anchor", id: "P", x: P.x, y: P.y, label: "P", color: rosaD },
      );
    }
    if (tool === "select" && stats) out.push({ type: "segment", x1: stats.x1, y1: stats.mean, x2: stats.x2, y2: stats.mean, color: rosaD, width: 2, dash: [5, 4] });
    if (tool === "fit" && fitData?.curve) out.push({ type: "curve", x: fitData.curve.x, y: fitData.curve.y, color: rosaD, width: 2.8, dash: [7, 4] });
    if (tool === "ruler" && ruler) {
      const d = Math.abs(ruler.x2 - ruler.x1);
      out.push(
        { type: "span", x1: ruler.x1, x2: ruler.x2, color: rosaD, label: `Δ${cx.sym} = ${fmtNum(d, 4)} ${cx.unit}` },
        { type: "vline", id: "x1", x: ruler.x1, color: rosaD, label: "1" },
        { type: "vline", id: "x2", x: ruler.x2, color: rosaD, label: "2" },
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.analyses, box.xKey, box.yKey, tool, eye, tangent, fitData, ruler, stats, cx, cy, resolvedTheme]);

  // --- gestori chiamati dal grafico (sempre gli ultimi)
  const handlers = useRef<any>({});
  useLayoutEffect(() => { handlers.current = {
    onSelect: (sel: [number, number] | null) => setSelection(sel),
    onPick: (i: number) => { if (tool === "tangent") setTangentPick({ i, range: groupRef.current.currentRange() }); },
    onAnchorMove: (_id: string, i: number) => { if (tool === "tangent") setTangentPick({ i, range: groupRef.current.currentRange() }); },
    onAnchorDrag: (id: string, px: number, py: number) => {
      if (tool === "line" && eye) {
        const other = id === "h1" ? eye.h2 : eye.h1;
        if (Math.abs(px - other.x) < 1e-9) return;
        setEye({ ...eye, [id]: { x: px, y: py } });
      } else if (tool === "ruler" && ruler) setRuler({ ...ruler, [id]: px });
    },
    onClickXY: (px: number) => {
      if (tool === "ruler" && ruler) { const k = Math.abs(px - ruler.x1) < Math.abs(px - ruler.x2) ? "x1" : "x2"; setRuler({ ...ruler, [k]: px }); return; }
      if (tool === "line" && eye?.step === 2) {
        // aggancio alla griglia: l'ascissa si arrotonda alla mezza divisione più vicina
        const st = chartRef.current.gridSteps().x / 2;
        const xs = Math.round(px / st) * st;
        const p = { x: xs, y: lineThrough(eye.h1, eye.h2).at(xs) };
        let pts = eye.pts.length >= 2 ? [] : [...eye.pts];
        if (pts.length === 1 && Math.abs(pts[0].x - p.x) < st / 2) return;
        pts = [...pts, p].sort((a, b) => a.x - b.x);
        setEye({ ...eye, pts });
      }
    },
  }; });

  // --- grafico: creato una volta, poi aggiornato
  useEffect(() => {
    const g = new ChartGroup({ includeZero: false, onSelect: (s: any) => handlers.current.onSelect(s) });
    const c = g.add(new Chart(canvasRef.current, { compact: false }));
    c.onPick = (i: number) => handlers.current.onPick(i);
    c.onAnchorMove = (id: string, i: number) => handlers.current.onAnchorMove(id, i);
    c.onAnchorDrag = (id: string, px: number, py: number) => handlers.current.onAnchorDrag(id, px, py);
    groupRef.current = g; chartRef.current = c;
    return () => { g.destroy(); groupRef.current = null; chartRef.current = null; };
  }, []);
  useEffect(() => {
    const c = chartRef.current; if (!c) return;
    c.xSym = cx.sym;
    c.setData({ series: [{ x, y, label: cy.sym, mode: box.wave && box.xKey === box.columns[0].key ? "line" : "points", width: 1.8 }], xLabel: axisLabel(cx), yLabel: axisLabel(cy) });
    c.setOverlays(overlays);
    c.tool = tool === "line" || tool === "tangent" || tool === "ruler" ? "pick" : "select";
    const needClick = tool === "ruler" || (tool === "line" && eye?.step === 2);
    c.onClickXY = needClick ? (px: number, py: number) => handlers.current.onClickXY(px, py) : null;
    c.c.style.cursor = tool === "ruler" ? "ew-resize" : tool === "line" ? (eye?.step === 2 ? "copy" : "grab") : c.tool === "pick" ? "pointer" : "crosshair";
  });

  // --- arrivo da Misura: porta in vista il riquadro
  useEffect(() => {
    if (focusId !== box.id) return;
    const el = rootRef.current;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("lim");
    el?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    // appena arrivato da Misura: sale al suo posto (solo se è nuovo, non quando lo si riapre)
    if (!still && Date.now() - box.created < 3000) {
      el?.animate([{ opacity: 0, transform: "translateY(12px) scale(0.99)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    }
    if (!document.documentElement.classList.contains("lim")) {
      el?.animate([{ boxShadow: "0 0 0 3px #C6F432" }, { boxShadow: "0 0 0 3px #C6F432", offset: 0.6 }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
    }
    useWorkbench.getState().focus(null);
  }, [focusId, box.id, box.created]);

  // --- salvataggio delle analisi
  const saveAnalysis = (a: Omit<Analysis, "id" | "xKey" | "yKey" | "axes">) => {
    updateBox(box.id, (b) => ({ analyses: [...b.analyses, { ...a, id: Date.now(), xKey: b.xKey, yKey: b.yKey, axes: `${colInfo(b, b.yKey).sym}(${colInfo(b, b.xKey).sym})` } as Analysis] }));
    toast.success(t("box.savedToast"));
  };

  const eyeCompare = () => {
    if (!eye) return;
    if (eye.cmp) { setEye({ ...eye, cmp: null }); return; }
    const tt: number[] = [], yy: number[] = [];
    x.forEach((xi, i) => { if (Number.isFinite(xi) && Number.isFinite(y[i])) { tt.push(xi); yy.push(y[i]); } });
    const f = polyfit(tt, yy, 1, tt[0]);
    if (!f) return;
    const mf = f.coef[1], q0 = f.coef[0] - mf * f.tRef, a = Math.min(...tt), b = Math.max(...tt);
    setEye({ ...eye, cmp: { m: mf, s: f.sigma[1], n: tt.length, x1: a, y1: mf * a + q0, x2: b, y2: mf * b + q0 } });
  };

  const setAxis = (ax: "x" | "y", key: string) => updateBox(box.id, ax === "x" ? { xKey: key } : { yKey: key });

  // negli assi solo grandezze fisiche: i dati tecnici del sensore restano fuori
  const axisCols = [...box.columns.filter((c) => !quantityOf(c.key)?.raw || c.key === box.xKey || c.key === box.yKey), ...box.computed];
  const axisItems = Object.fromEntries(axisCols.map((c) => [c.key, axisLabel(c)]));
  const suggested = box.xKey === "t" ? quantityOf(box.yKey)?.models || [] : [];

  const swapAxes = () => updateBox(box.id, { xKey: box.yKey, yKey: box.xKey });
  const collapsed = !!box.collapsed;
  const fmtResult = (a: Analysis) => Number.isFinite(a.main.sigma) ? formatMeasure(a.main.value, a.main.sigma, a.main.unit) : `${n4(a.main.value)} ${a.main.unit}`;
  const intro = (k: Tool): [string, string] => [t(`intro.${k}.title`), t(`intro.${k}.text`)];
  const INTRO: Record<Tool, [string, string]> = { select: intro("select"), line: intro("line"), tangent: intro("tangent"), fit: intro("fit"), ruler: intro("ruler") };

  return (
    <Card ref={rootRef as any} id={`box-${box.id}`} className="scroll-mt-20 gap-0 p-0">
      <header className={cn("flex items-start gap-2 p-3 sm:gap-3 sm:p-4", !collapsed && "border-b")}>
        <Button size="icon-sm" variant="ghost" className="mt-0.5 text-muted-foreground" aria-expanded={!collapsed} aria-label={collapsed ? t("box.expand") : t("box.collapse")}
          onClick={() => updateBox(box.id, { collapsed: !collapsed })}>
          <ChevronDown aria-hidden className={cn("transition-transform duration-200 ease-out", collapsed && "-rotate-90")} />
        </Button>
        <div className="min-w-0 flex-1">
          <Input key={box.title} defaultValue={box.title} aria-label={t("box.name")}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== box.title) updateBox(box.id, { title: v }); }}
            className="h-8 border-transparent bg-transparent px-1 text-base font-semibold shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent" />
          <p className="truncate px-1 text-xs text-muted-foreground">
            {box.sessionName ? (box.sessionName.startsWith(box.expTitle) ? box.sessionName : `${box.expTitle} · ${box.sessionName}`) : box.expTitle}
            {!box.title.includes(fmtNum(box.t1, 2)) && ` · ${fmtNum(box.t1, 2)}–${fmtNum(box.t2, 2)} ${box.tUnit || "s"}`} · {t("box.points", { n: box.rows.length })}
          </p>
          {box.subtitle && <p className="truncate px-1 text-xs text-muted-foreground">{box.subtitle}</p>}
          {collapsed && !!box.analyses.length && (
            <ul className="mt-2 flex flex-wrap gap-1.5 px-1">
              {box.analyses.map((a) => (
                <li key={a.id} className="rounded-[5px] border px-2 py-0.5 text-xs"><span className="text-muted-foreground"><Sym>{a.main.label}</Sym></span> <b className="tabular">{fmtResult(a)}</b></li>
              ))}
            </ul>
          )}
        </div>
        {many && (
          <label className="mt-1.5 flex h-7 shrink-0 cursor-pointer items-center gap-2 px-1 text-[13px] text-muted-foreground" title={t("box.exportTitle")}>
            <Checkbox checked={box.checked} onCheckedChange={(v) => updateBox(box.id, { checked: !!v })} />
            <span className="hidden sm:inline">{t("box.exportAria")}</span>
          </label>
        )}
        <Button size="icon-sm" variant="ghost" aria-label={t("box.duplicate")} title={t("box.duplicateTitle")} className="text-muted-foreground"
          onClick={() => void useWorkbench.getState().duplicateBox(box.id)}>
          <Copy />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={t("box.delete")} className="text-muted-foreground hover:text-destructive"
          onClick={async () => {
            if (await confirm({ title: t("box.deleteTitle", { title: box.title }), description: t("box.deleteDesc"), action: t("box.deleteAction"), destructive: true })) await useWorkbench.getState().removeBox(box.id);
          }}>
          <Trash />
        </Button>
      </header>

      <div hidden={collapsed}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={box.yKey} onValueChange={(v) => v && setAxis("y", String(v))} items={axisItems}>
            <SelectTrigger size="sm" className="min-w-24" aria-label={t("box.yAxis")}><SelectValue /></SelectTrigger>
            <SelectContent>{axisCols.map((c) => <SelectItem key={c.key} value={c.key}>{axisLabel(c)}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{t("box.versus")}</span>
          <Select value={box.xKey} onValueChange={(v) => v && setAxis("x", String(v))} items={axisItems}>
            <SelectTrigger size="sm" className="min-w-24" aria-label={t("box.xAxis")}><SelectValue /></SelectTrigger>
            <SelectContent>{axisCols.map((c) => <SelectItem key={c.key} value={c.key}>{axisLabel(c)}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="icon-sm" variant="ghost" aria-label={t("box.swap")} title={t("box.swap")} onClick={swapAxes}><ArrowLeftRight /></Button>
        </div>
        <Segmented<Tool> label={t("box.tools")} value={tool} onChange={setTool} className="md:ml-auto"
          items={[
            ["select", <><MousePointer2 /><span className="hidden sm:inline">{t("intro.select.short")}</span></>, INTRO.select[1]],
            ["line", <><TrendingUp /><span className="hidden sm:inline">{t("intro.line.short")}</span></>, INTRO.line[1]],
            ["tangent", <><Spline /><span className="hidden sm:inline">{t("intro.tangent.short")}</span></>, INTRO.tangent[1]],
            ["fit", <><ChartSpline /><span className="hidden sm:inline">{t("intro.fit.short")}</span></>, INTRO.fit[1]],
            ["ruler", <><Ruler /><span className="hidden sm:inline">{t("intro.ruler.short")}</span></>, INTRO.ruler[1]],
          ]} />
        <Button size="icon-sm" variant="outline" aria-label={t("box.fitAll")} title={t("box.fitAll")} onClick={() => groupRef.current?.fitAll()}><Maximize2 /></Button>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[clamp(260px,46vh,520px)] overflow-hidden bg-[var(--mz-chart-bg)]">
          <canvas ref={canvasRef} aria-label={t("box.chart")} className="absolute inset-0 size-full touch-none" />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <div key={tool} className="mz-enter flex flex-col gap-3">
            <ToolIntro title={INTRO[tool][0]}>{INTRO[tool][1]}</ToolIntro>
            {tool === "select" && (
              <StatsPanel st={stats} selected={!!selection} cx={cx} cy={cy} su={su} meaning={meaning}
                onClear={() => groupRef.current?.setSelection(null, true)}
                onSave={() => {
                  if (!stats) return;
                  saveAnalysis({
                    kind: "stats", title: t("result.statsTitle", { a: fmtNum(stats.x1), b: fmtNum(stats.x2), unit: cx.unit }),
                    main: { label: t("result.statsMain", { y: cy.sym }), value: stats.mean, sigma: stats.sem, unit: cy.unit },
                    detail: t("result.statsDetail", { n: stats.n, sd: n4(stats.sd), unit: cy.unit, min: n4(stats.min), max: n4(stats.max), y: cy.sym, x: cx.sym, rate: n4(stats.rate), su }),
                    eq: `${cy.sym}̄ = ${formatMeasure(stats.mean, stats.sem, cy.unit)}`,
                    physics: [{ label: t("result.sd"), value: stats.sd, sigma: NaN, unit: cy.unit }, { label: meaning ? t("result.meanMeaning", { meaning }) : `Δ${cy.sym}/Δ${cx.sym}`, value: stats.rate, sigma: NaN, unit: su }],
                    seg: { x1: stats.x1, y1: stats.mean, x2: stats.x2, y2: stats.mean },
                  });
                }} />
            )}
            {tool === "line" && eye && (
              <EyePanel eye={eye} cx={cx} cy={cy} su={su} meaning={meaning} up={balance.up} down={balance.down}
                onNext={() => setEye({ ...eye, step: 2, pts: [] })}
                onBack={() => setEye({ ...eye, step: 1, pts: [], cmp: null })}
                onCompare={eyeCompare}
                onSave={(r) => saveAnalysis({
                  kind: "line", title: t("result.lineTitle"),
                  main: { label: meaning ? t("result.slopeMeaning", { meaning }) : t("result.slopeM"), value: r.m, sigma: NaN, unit: su },
                  detail: t("result.lineDetail", { ax: fmtNum(r.A.x), ay: fmtNum(r.A.y), bx: fmtNum(r.B.x), by: fmtNum(r.B.y) }) + (eye.cmp ? `; ${t("result.leastSquares", { m: n4(eye.cmp.m), s: n4(eye.cmp.s), su })}` : ""),
                  eq: `${cy.sym} = ${n4(r.m)}·${cx.sym} ${r.q < 0 ? "−" : "+"} ${n4(Math.abs(r.q))}`,
                  seg: { x1: eye.h1.x, y1: eye.h1.y, x2: eye.h2.x, y2: eye.h2.y },
                })} />
            )}
            {tool === "tangent" && (
              <TangentPanel t={tangent} cx={cx} cy={cy} su={su} meaning={meaning}
                onSave={() => {
                  if (!tangent || tangent === "few") return;
                  const { P, m, dx, near } = tangent;
                  saveAnalysis({
                    kind: "tangent", title: t("result.tangentTitle", { x: cx.sym, v: fmtNum(P.x), unit: cx.unit }),
                    main: { label: meaning ? t("result.instantMeaning", { meaning }) : t("result.tangentSlope"), value: m, sigma: NaN, unit: su },
                    detail: t("result.tangentDetail", { x: fmtNum(P.x), y: fmtNum(P.y), n: near }),
                    eq: t("result.tangentEq", { m: n4(m), su }),
                    seg: { x1: P.x - dx, y1: P.y - m * dx, x2: P.x + dx, y2: P.y + m * dx },
                  });
                }} />
            )}
            {tool === "fit" && (
              <>
                <p className="text-xs text-muted-foreground">{selection ? <>{t("box.fitRange", { a: fmtNum(selection[0]), b: fmtNum(selection[1]), unit: cx.unit })} <button className="ml-1 inline-flex items-center underline" onClick={() => groupRef.current?.setSelection(null, true)}><X className="size-3" />{t("box.useAll")}</button></> : <>{t("box.fitAllData")}</>}</p>
                <FitPanel suggested={suggested} model={fitModel} fit={fitData?.fit} phys={fitData?.phys ?? []} cx={cx} cy={cy}
                  onModel={(id) => { setFitModel(id); setShowResid(false); }}
                  compare={compare} onCompare={() => setCompareOn(!compareOn)}
                  showResid={showResid} onResid={() => setShowResid(!showResid)}
                  onSave={() => {
                    const d = fitData!; const fit = d.fit; const id = fitModel!;
                    const p0 = fit.params[0];
                    const main = d.phys[0] || { label: p0.sym, value: p0.value, sigma: p0.sigma, unit: p0.unit };
                    saveAnalysis({
                      kind: "fit", title: t("result.fitTitle", { label: fit.label }), model: id,
                      main: { label: main.label, value: main.value, sigma: main.sigma, unit: main.unit },
                      detail: t("result.fitDetail", { n: fit.n, t1: fmtNum(fit.t1), t2: fmtNum(fit.t2), unit: cx.unit, r2: Number.isFinite(fit.r2) ? fit.r2.toFixed(5) : "—" }),
                      eq: fit.eq, r2: fit.r2, n: fit.n, t1: fit.t1, t2: fit.t2,
                      params: fit.params.map(({ key, sym, value, sigma, unit }: any) => ({ key, sym, value, sigma, unit })),
                      physics: d.phys,
                      curve: { x: d.curve!.x.filter((_, i) => i % 3 === 0), y: d.curve!.y.filter((_, i) => i % 3 === 0) },
                    });
                  }} />
                {showResid && fitData && !fitData.fit.error && <Residuals fit={fitData.fit} T={fitData.T} xLabel={axisLabel(cx)} cy={cy} />}
              </>
            )}
            {tool === "ruler" && ruler && (
              <RulerPanel r={ruler} cx={cx} onN={(n) => setRuler({ ...ruler, n })}
                onSave={() => {
                  const lo = Math.min(ruler.x1, ruler.x2), hi = Math.max(ruler.x1, ruler.x2), d = hi - lo, T = d / ruler.n;
                  const isFreq = cx.unit === "Hz";
                  const toS = ({ s: 1, ms: 1e-3, "µs": 1e-6, us: 1e-6, min: 60 } as Record<string, number>)[cx.unit];
                  const f = toS ? 1 / (T * toS) : NaN;
                  saveAnalysis(isFreq
                    ? { kind: "ruler", title: t("result.spectrumTitle"), main: { label: t("result.harmonics"), value: T, sigma: NaN, unit: cx.unit },
                        detail: `${fmtNum(lo, 4)}–${fmtNum(hi, 4)} ${cx.unit}, N = ${ruler.n}`, eq: `f₀ = Δ${cx.sym}/N = ${fmtNum(d, 4)}/${ruler.n} ${cx.unit}`, span: { x1: lo, x2: hi }, spanLabel: `f₀ = ${fmtNum(T, 4)} ${cx.unit}` }
                    : { kind: "ruler", title: t("result.rulerTitle"), main: { label: t("result.period"), value: T, sigma: NaN, unit: cx.unit },
                        detail: `${fmtNum(lo, 4)}–${fmtNum(hi, 4)} ${cx.unit}, N = ${ruler.n}${Number.isFinite(f) ? `; f = ${fmtNum(f, 2)} Hz` : ""}`,
                        eq: `T = Δ${cx.sym}/N = ${fmtNum(d, 4)}/${ruler.n} ${cx.unit}${Number.isFinite(f) ? ` → f = ${fmtNum(f, 2)} Hz` : ""}`,
                        physics: Number.isFinite(f) ? [{ label: t("result.period"), value: T, sigma: NaN, unit: cx.unit }, { label: t("result.frequency"), value: f, sigma: NaN, unit: "Hz" }] : [],
                        span: { x1: lo, x2: hi }, spanLabel: `T = ${fmtNum(T, 4)} ${cx.unit}` });
                }} />
            )}
          </div>

          {!!box.analyses.length && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <h4 className="text-sm font-semibold">{t("box.savedTitle")}</h4>
              <ul className="flex flex-col gap-1.5">
                {box.analyses.map((a, i) => {
                  const here = a.xKey === box.xKey && a.yKey === box.yKey;
                  return (
                    <li key={a.id} className={cn("flex items-start gap-1 rounded-lg border px-3 py-2", a.hidden && "opacity-60")}>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="flex items-baseline gap-1.5"><b className="truncate">{a.title}</b> <small className="shrink-0 text-muted-foreground">{a.axes}</small></p>
                        <p className="tabular"><Sym>{a.main.label}</Sym>: <b>{fmtResult(a)}</b></p>
                        <p className="truncate text-xs text-muted-foreground" title={a.detail}>{a.eq}</p>
                      </div>
                      <Button size="icon-xs" variant="ghost" disabled={!here} aria-label={a.hidden ? t("box.show") : t("box.hide")}
                        title={here ? (a.hidden ? t("box.show") : t("box.hide")) : t("box.visibleWith", { axes: a.axes })}
                        onClick={() => updateBox(box.id, (b) => ({ analyses: b.analyses.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)) }))}>
                        {a.hidden ? <EyeOff /> : <Eye />}
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label={t("box.deleteResult")} onClick={() => updateBox(box.id, (b) => ({ analyses: b.analyses.filter((_, j) => j !== i) }))}><X /></Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {box.columns.some((c) => c.key === "lat") && box.columns.some((c) => c.key === "lon") && <BoxMap box={box} rows={rows} selection={selection} />}
      <DataSheet box={box} rows={rows} errors={errors} />
      </div>
    </Card>
  );
}
