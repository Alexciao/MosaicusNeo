"use client";
// Un riquadro di Elaborazione: grafico con assi a scelta, strumenti, analisi salvate, foglio dei dati.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Maximize2, MousePointer2, Ruler, Spline, TrendingUp, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chart, ChartGroup } from "@/lib/mosaicus/chart.js";
import { runModel } from "@/lib/mosaicus/fits.js";
import { polyfit, formatMeasure } from "@/lib/mosaicus/analysis.js";
import { QUANTITIES } from "@/lib/mosaicus/experiments";
import { useWorkbench, computeRows, colInfo, axisLabel, type Analysis, type Box } from "@/lib/workbench-store";
import { confirm } from "@/lib/confirm";
import { fmtNum } from "@/lib/prefs";
import { Segmented } from "@/components/instruments/scope-panel";
import {
  EyePanel, FitPanel, Residuals, RulerPanel, Say, TangentPanel, cssVar, lineThrough, n4, read3,
  type EyeState, type PhysicsValue, type RulerState, type TangentResult,
} from "./box-tools";
import { DataSheet } from "./data-sheet";

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

  const { rows, errors } = useMemo(() => computeRows(box), [box]);
  const x = useMemo(() => rows.map((r) => r[box.xKey]), [rows, box.xKey]);
  const y = useMemo(() => rows.map((r) => r[box.yKey]), [rows, box.yKey]);
  const cx = colInfo(box, box.xKey), cy = colInfo(box, box.yKey);
  const su = slopeUnit(cy.unit, cx.unit);
  const meaning = box.xKey === "t" ? QUANTITIES[box.yKey]?.slope ?? null : null;
  const finiteX = useMemo(() => x.filter(Number.isFinite), [x]);

  // --- strumenti: a ogni cambio di strumento o di assi si riparte da capo
  const initTool = (t: Tool) => {
    setTangentPick(null); setShowResid(false);
    if (t !== "fit") setFitModel(null);
    if (t === "line") {
      const ys = y.filter(Number.isFinite);
      const x0 = Math.min(...finiteX), x1 = Math.max(...finiteX);
      const ym = ys.reduce((s, q) => s + q, 0) / (ys.length || 1);
      setEye({ step: 1, h1: { x: x0 + 0.2 * (x1 - x0), y: ym }, h2: { x: x0 + 0.8 * (x1 - x0), y: ym }, pts: [], cmp: null });
    } else setEye(null);
    if (t === "ruler") {
      const a = Math.min(...finiteX), b = Math.max(...finiteX);
      setRuler((keep) => (keep && keep.x1 >= a && keep.x2 <= b ? keep : { x1: a + 0.2 * (b - a), x2: a + 0.6 * (b - a), n: 1 }));
    }
  };
  const setTool = (t: Tool) => { setToolState(t); initTool(t); };
  // cambiati gli assi: lo strumento riparte sui dati nuovi (aggiustamento dello stato durante il render)
  const axesKey = `${box.xKey}|${box.yKey}`;
  const [prevAxes, setPrevAxes] = useState(axesKey);
  if (prevAxes !== axesKey) { setPrevAxes(axesKey); initTool(tool); }

  // --- risultati degli strumenti
  const fitData = useMemo(() => {
    if (tool !== "fit" || !fitModel) return null;
    const [a, b] = selection ?? [-Infinity, Infinity];
    const tt: number[] = [], yy: number[] = [];
    x.forEach((xi, i) => { if (Number.isFinite(xi) && Number.isFinite(y[i]) && xi >= a && xi <= b) { tt.push(xi); yy.push(y[i]); } });
    const order = tt.map((_, i) => i).sort((i, j) => tt[i] - tt[j]);
    const T = order.map((i) => tt[i]), Y = order.map((i) => yy[i]);
    const fit = runModel(fitModel, T, Y, { x: cx.unit, y: cy.unit, xs: cx.sym, ys: cy.sym });
    if (fit.error) return { fit, T, phys: [] as PhysicsValue[], curve: null };
    const q = box.xKey === "t" ? QUANTITIES[box.yKey] : null;
    const phys: PhysicsValue[] = (q?.physics?.[fitModel] || []).map((p) => { const [v, s] = p.calc(fit); return { label: p.label, unit: p.unit, value: v, sigma: s }; });
    const N = 300, X: number[] = [], Yc: number[] = [];
    for (let i = 0; i <= N; i++) { const t = fit.t1 + ((fit.t2 - fit.t1) * i) / N; X.push(t); Yc.push(fit.curve(t)); }
    return { fit, T, phys, curve: { x: X, y: Yc } };
  }, [tool, fitModel, selection, x, y, cx.unit, cy.unit, cx.sym, cy.sym, box.xKey, box.yKey]);

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
  }, [box.analyses, box.xKey, box.yKey, tool, eye, tangent, fitData, ruler, cx, cy, resolvedTheme]);

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
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.animate([{ boxShadow: "0 0 0 3px #C6F432" }, { boxShadow: "0 0 0 3px #C6F432", offset: 0.6 }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
    useWorkbench.getState().focus(null);
  }, [focusId, box.id]);

  // --- salvataggio delle analisi
  const saveAnalysis = (a: Omit<Analysis, "id" | "xKey" | "yKey" | "axes">) => {
    updateBox(box.id, (b) => ({ analyses: [...b.analyses, { ...a, id: Date.now(), xKey: b.xKey, yKey: b.yKey, axes: `${colInfo(b, b.yKey).sym}(${colInfo(b, b.xKey).sym})` } as Analysis] }));
    toast.success("Analisi salvata nel riquadro.");
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
  const axisCols = [...box.columns.filter((c) => !QUANTITIES[c.key]?.raw || c.key === box.xKey || c.key === box.yKey), ...box.computed];
  const axisItems = Object.fromEntries(axisCols.map((c) => [c.key, axisLabel(c)]));
  const suggested = box.xKey === "t" ? QUANTITIES[box.yKey]?.models || [] : [];

  return (
    <Card ref={rootRef as any} className="scroll-mt-20 gap-0 p-0">
      <header className="flex items-start gap-3 border-b p-4">
        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground" title="Includi questo riquadro nell'export">
          <Checkbox checked={box.checked} onCheckedChange={(v) => updateBox(box.id, { checked: !!v })} aria-label="Esporta questo riquadro" />
          <span className="hidden sm:inline">Esporta</span>
        </label>
        <div className="min-w-0 flex-1">
          <Input key={box.title} defaultValue={box.title} aria-label="Nome del riquadro"
            onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== box.title) updateBox(box.id, { title: t }); }}
            className="h-8 border-transparent bg-transparent px-1 text-base font-semibold shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent" />
          <p className="truncate px-1 text-xs text-muted-foreground">
            {box.expTitle}{box.sessionName ? ` · da «${box.sessionName}»` : ""} · {fmtNum(box.t1, 2)}–{fmtNum(box.t2, 2)} {box.tUnit || "s"} · {box.rows.length} punti
          </p>
          {box.subtitle && <p className="truncate px-1 text-xs text-muted-foreground">{box.subtitle}</p>}
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Elimina il riquadro" className="text-muted-foreground hover:text-destructive"
          onClick={async () => {
            if (await confirm({ title: `Eliminare il riquadro «${box.title}»?`, description: "I dati della misura originale restano nel Quaderno.", action: "Elimina", destructive: true })) await useWorkbench.getState().removeBox(box.id);
          }}>
          <Trash />
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        {(["x", "y"] as const).map((ax) => (
          <div key={ax} className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">{ax === "x" ? "asse orizzontale" : "asse verticale"}</Label>
            <Select value={ax === "x" ? box.xKey : box.yKey} onValueChange={(v) => v && setAxis(ax, String(v))} items={axisItems}>
              <SelectTrigger size="sm" className="min-w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{axisCols.map((c) => <SelectItem key={c.key} value={c.key}>{axisLabel(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
        <Segmented<Tool> label="Strumenti" value={tool} onChange={setTool} className="md:ml-auto"
          items={[
            ["select", <><MousePointer2 /><span className="hidden sm:inline">Tratto</span></>, "Trascina sul grafico per scegliere il tratto da analizzare"],
            ["line", <><TrendingUp /><span className="hidden sm:inline">Retta</span></>, "Tira tu la retta che media i punti, poi misurane la pendenza"],
            ["tangent", <><Spline /><span className="hidden sm:inline">Tangente</span></>, "Scegli un punto misurato: tangente alla curva in quel punto"],
            ["fit", <><span className="font-serif text-base leading-none">∿</span><span className="hidden sm:inline">Fit</span></>, "Retta o curva dei minimi quadrati"],
            ["ruler", <><Ruler /><span className="hidden sm:inline">Righello</span></>, "Due cursori verticali: periodo e frequenza"],
          ]} />
        <Button size="icon-sm" variant="outline" aria-label="Adatta" title="Mostra tutti i dati" onClick={() => groupRef.current?.fitAll()}><Maximize2 /></Button>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[clamp(260px,46vh,520px)] overflow-hidden rounded-lg border bg-[var(--mz-chart-bg)]">
          <canvas ref={canvasRef} aria-label="Grafico del riquadro" className="absolute inset-0 size-full touch-none" />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3">
            {tool === "select" && <Say>Trascina sul grafico per scegliere un tratto{selection ? <>: <b className="tabular">{fmtNum(selection[0])} – {fmtNum(selection[1])} {cx.unit}</b></> : "."}</Say>}
            {tool === "line" && eye && (
              <EyePanel eye={eye} cx={cx} cy={cy} su={su} meaning={meaning} up={balance.up} down={balance.down}
                onNext={() => setEye({ ...eye, step: 2, pts: [] })}
                onBack={() => setEye({ ...eye, step: 1, pts: [], cmp: null })}
                onCompare={eyeCompare}
                onSave={(r) => saveAnalysis({
                  kind: "line", title: "Retta a occhio",
                  main: { label: meaning ? `pendenza (${meaning})` : "pendenza m", value: r.m, sigma: NaN, unit: su },
                  detail: `A = (${fmtNum(r.A.x)}; ${fmtNum(r.A.y)}), B = (${fmtNum(r.B.x)}; ${fmtNum(r.B.y)})${eye.cmp ? `; computer: ${n4(eye.cmp.m)} ± ${n4(eye.cmp.s)} ${su}` : ""}`,
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
                    kind: "tangent", title: `Tangente in ${cx.sym} = ${fmtNum(P.x)} ${cx.unit}`,
                    main: { label: meaning ? `${meaning} istantanea` : "pendenza della tangente", value: m, sigma: NaN, unit: su },
                    detail: `P = (${fmtNum(P.x)}; ${fmtNum(P.y)}); parabola sui ${near} punti vicini`,
                    eq: `pendenza = ${n4(m)} ${su}`,
                    seg: { x1: P.x - dx, y1: P.y - m * dx, x2: P.x + dx, y2: P.y + m * dx },
                  });
                }} />
            )}
            {tool === "fit" && (
              <>
                {selection && <p className="text-xs text-muted-foreground">Sul tratto {fmtNum(selection[0])} – {fmtNum(selection[1])} {cx.unit} <button className="ml-1 inline-flex items-center underline" onClick={() => groupRef.current?.setSelection(null, true)}><X className="size-3" />tutto</button></p>}
                <FitPanel suggested={suggested} model={fitModel} fit={fitData?.fit} phys={fitData?.phys ?? []} cx={cx} cy={cy}
                  onModel={(id) => { setFitModel(id); setShowResid(false); }}
                  showResid={showResid} onResid={() => setShowResid(!showResid)}
                  onSave={() => {
                    const d = fitData!; const fit = d.fit; const id = fitModel!;
                    const p0 = fit.params[0];
                    const main = d.phys[0] || { label: p0.sym, value: p0.value, sigma: p0.sigma, unit: p0.unit };
                    saveAnalysis({
                      kind: "fit", title: `Fit: ${fit.label}`, model: id,
                      main: { label: main.label, value: main.value, sigma: main.sigma, unit: main.unit },
                      detail: `${fit.n} punti, ${fmtNum(fit.t1)}–${fmtNum(fit.t2)} ${cx.unit}; R² = ${Number.isFinite(fit.r2) ? fit.r2.toFixed(5) : "—"}`,
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
                    ? { kind: "ruler", title: "Righello sullo spettro", main: { label: "distanza tra armoniche f₀", value: T, sigma: NaN, unit: cx.unit },
                        detail: `${fmtNum(lo, 4)}–${fmtNum(hi, 4)} ${cx.unit}, N = ${ruler.n}`, eq: `f₀ = Δ${cx.sym}/N = ${fmtNum(d, 4)}/${ruler.n} ${cx.unit}`, span: { x1: lo, x2: hi }, spanLabel: `f₀ = ${fmtNum(T, 4)} ${cx.unit}` }
                    : { kind: "ruler", title: "Righello", main: { label: "periodo T", value: T, sigma: NaN, unit: cx.unit },
                        detail: `${fmtNum(lo, 4)}–${fmtNum(hi, 4)} ${cx.unit}, N = ${ruler.n}${Number.isFinite(f) ? `; f = ${fmtNum(f, 2)} Hz` : ""}`,
                        eq: `T = Δ${cx.sym}/N = ${fmtNum(d, 4)}/${ruler.n} ${cx.unit}${Number.isFinite(f) ? ` → f = ${fmtNum(f, 2)} Hz` : ""}`,
                        physics: Number.isFinite(f) ? [{ label: "periodo T", value: T, sigma: NaN, unit: cx.unit }, { label: "frequenza f", value: f, sigma: NaN, unit: "Hz" }] : [],
                        span: { x1: lo, x2: hi }, spanLabel: `T = ${fmtNum(T, 4)} ${cx.unit}` });
                }} />
            )}
          </div>

          {!!box.analyses.length && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <h4 className="text-sm font-semibold">Analisi salvate</h4>
              <ul className="flex flex-col gap-1.5">
                {box.analyses.map((a, i) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-lg border px-3 py-2">
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{a.title}</b> <small className="text-muted-foreground">· {a.axes}</small>
                      <p className="tabular">{a.main.label}: <b>{Number.isFinite(a.main.sigma) ? formatMeasure(a.main.value, a.main.sigma, a.main.unit) : `${n4(a.main.value)} ${a.main.unit}`}</b></p>
                      <p className="truncate text-xs text-muted-foreground">{a.eq}</p>
                    </div>
                    <Button size="icon-xs" variant="ghost" aria-label="Elimina l'analisi" onClick={() => updateBox(box.id, (b) => ({ analyses: b.analyses.filter((_, j) => j !== i) }))}><X /></Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <DataSheet box={box} rows={rows} errors={errors} />
    </Card>
  );
}
