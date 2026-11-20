"use client";
// Strumenti dei riquadri di Elaborazione: pannelli laterali (retta a occhio, tangente, fit, righello)
// e il grafico dei residui. La logica di calcolo è la stessa della versione originale.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Minus, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Chart, ChartGroup } from "@/lib/mosaicus/chart.js";
import { MODELS, MODEL_ORDER, runsTest } from "@/lib/mosaicus/fits.js";
import { formatMeasure, fmt } from "@/lib/mosaicus/analysis.js";
import type { BoxColumn } from "@/lib/workbench-store";
import { fmtNum } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Sym, plainSym } from "@/components/app/sym";
import { intlLocale } from "@/i18n";

const bold = (c: React.ReactNode) => <b>{c}</b>;

export const n4 = (v: number) => fmt(v, 4);
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function Why({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-semibold">
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !open && "-rotate-90")} />{title}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 px-2.5 pb-2.5 text-xs leading-relaxed text-muted-foreground">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export const Say = ({ children }: { children: React.ReactNode }) => <p className="text-sm">{children}</p>;
export const CalcBox = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5 rounded-lg border border-brand/25 bg-accent/40 px-3 py-2.5 text-sm tabular">{children}</div>
);
export const Frac = ({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) => (
  <span className="frac"><span>{top}</span><span>{bottom}</span></span>
);
export const Meaning = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-md bg-tone-sky px-3 py-2 text-sm">{children}</p>
);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Retta a occhio
// ---------------------------------------------------------------------------
export interface EyeState {
  step: 1 | 2;
  h1: { x: number; y: number };
  h2: { x: number; y: number };
  pts: { x: number; y: number }[];
  cmp: { m: number; s: number; n: number; x1: number; y1: number; x2: number; y2: number } | null;
}
export const lineThrough = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const m = (b.y - a.y) / (b.x - a.x);
  return { m, q: a.y - m * a.x, at: (x: number) => a.y + m * (x - a.x) };
};
export const read3 = (v: number) => (Number.isFinite(v) && v !== 0 ? +v.toPrecision(3) : v);

export function EyePanel({ eye, cx, cy, su, meaning, up, down, onNext, onBack, onCompare, onSave }: {
  eye: EyeState; cx: BoxColumn; cy: BoxColumn; su: string; meaning: string | null; up: number; down: number;
  onNext: () => void; onBack: () => void; onCompare: () => void; onSave: (r: { m: number; q: number; A: { x: number; y: number }; B: { x: number; y: number } }) => void;
}) {
  const t = useTranslations("workbench.tools");
  const balance = Math.abs(up - down) <= Math.max(2, 0.15 * (up + down));
  const steps = [t("eye.step1"), t("eye.step2")];
  let result: { m: number; q: number; A: { x: number; y: number }; B: { x: number; y: number } } | null = null;
  if (eye.step === 2 && eye.pts.length === 2) {
    const [A, B] = eye.pts, ya = read3(A.y), yb = read3(B.y);
    const m = (yb - ya) / (B.x - A.x);
    result = { m, q: ya - m * A.x, A: { x: A.x, y: ya }, B: { x: B.x, y: yb } };
  }
  const rel = result && eye.cmp ? Math.abs((result.m - eye.cmp.m) / eye.cmp.m) * 100 : NaN;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex gap-2 text-xs">
        {steps.map((label, i) => (
          <li key={label} className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5", eye.step === i + 1 ? "border-primary bg-primary text-primary-foreground" : eye.step > i + 1 ? "text-muted-foreground line-through" : "text-muted-foreground")}>
            <b>{i + 1}</b> {label}
          </li>
        ))}
      </ol>
      {eye.step === 1 ? (
        <>
          <Say>{t.rich("eye.drag", { b: bold })}</Say>
          <p className={cn("tabular text-sm font-semibold", balance ? "text-success" : "text-muted-foreground")}>⬆ {up} · ⬇ {down} {balance ? t("eye.balanced") : ""}</p>
          <Button size="sm" className="self-start" onClick={onNext}>{t("eye.done")} <ArrowRight /></Button>
        </>
      ) : (
        <>
          {!result && <Say>{t.rich("eye.pickTwo", { b: bold })}</Say>}
          {result && (
            <>
              <CalcBox>
                <div>m = <Frac top={<Sym>{`Δ${cy.sym}`}</Sym>} bottom={<Sym>{`Δ${cx.sym}`}</Sym>} /> = <Frac top={`${fmtNum(result.B.y)} − ${fmtNum(result.A.y)}`} bottom={`${fmtNum(result.B.x)} − ${fmtNum(result.A.x)}`} /> = <b>{n4(result.m)} {su}</b></div>
                <div className="text-muted-foreground"><Sym>{cy.sym}</Sym> = {n4(result.m)}·<Sym>{cx.sym}</Sym> {result.q < 0 ? "−" : "+"} {n4(Math.abs(result.q))}</div>
              </CalcBox>
              {meaning && <Meaning>{cap(meaning)} ≈ <b>{n4(result.m)} {su}</b></Meaning>}
              {eye.cmp && (
                <p className="text-sm">{t.rich("eye.leastSquares", { b: bold, value: formatMeasure(eye.cmp.m, eye.cmp.s, su), rel: rel.toLocaleString(intlLocale, { maximumFractionDigits: 1 }) })} · {rel <= 3 ? <b className="text-success">{t("eye.excellent")}</b> : rel <= 10 ? <b className="text-success">{t("eye.good")}</b> : <b className="text-warning">{t("eye.adjust")}</b>}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onSave(result!)}><Save /> {t("save")}</Button>
                <Button size="sm" variant="outline" onClick={onCompare}>{eye.cmp ? t("eye.hideLsq") : t("eye.compareLsq")}</Button>
              </div>
            </>
          )}
          <Button size="sm" variant="ghost" className="self-start" onClick={onBack}><ArrowLeft /> {t("eye.back")}</Button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tangente
// ---------------------------------------------------------------------------
export interface TangentResult { m: number; P: { x: number; y: number }; dx: number; near: number }
export function TangentPanel({ t, cx, cy, su, meaning, onSave }: { t: TangentResult | null | "few"; cx: BoxColumn; cy: BoxColumn; su: string; meaning: string | null; onSave: () => void }) {
  const tr = useTranslations("workbench.tools");
  if (!t) return <Say>{tr("tangent.tap")}</Say>;
  if (t === "few") return <><Say>{tr("tangent.tap")}</Say><p className="text-sm text-destructive">{tr("tangent.needThree")}</p></>;
  return (
    <div className="flex flex-col gap-3">
      <CalcBox>
        <div>m = <Frac top={<Sym>{`Δ${cy.sym}`}</Sym>} bottom={<Sym>{`Δ${cx.sym}`}</Sym>} /> = <Frac top={fmtNum(t.m * t.dx)} bottom={fmtNum(t.dx)} /> = <b>{n4(t.m)} {su}</b></div>
      </CalcBox>
      {meaning && <Meaning>{tr.rich("tangent.instant", { b: bold, meaning, Meaning: cap(meaning), x: plainSym(cx.sym), v: fmtNum(t.P.x), unit: cx.unit, m: n4(t.m), su })}</Meaning>}
      <Why title={tr("tangent.howTitle")}>
        <p><Sym>{tr("tangent.how", { n: t.near, y: cy.sym, x: cx.sym, dx: fmtNum(t.dx), unit: cx.unit })}</Sym></p>
      </Why>
      <Button size="sm" variant="outline" className="self-start" onClick={onSave}><Save /> {tr("save")}</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------
export interface PhysicsValue { label: string; unit: string; value: number; sigma: number }
export function FitPanel({ suggested, model, fit, phys, cx, cy, onModel, onSave, showResid, onResid, compare, onCompare }: {
  suggested: string[]; model: string | null; fit: any; phys: PhysicsValue[]; cx: BoxColumn; cy: BoxColumn;
  onModel: (id: string) => void; onSave: () => void; showResid: boolean; onResid: () => void;
  compare: ModelRow[] | null; onCompare: () => void;
}) {
  const t = useTranslations("workbench.tools");
  const others = MODEL_ORDER.filter((id: string) => !suggested.includes(id));
  const [more, setMore] = useState(!suggested.length);
  const btn = (id: string, sug = false) => (
    <Button key={id} size="xs" variant={model === id ? "default" : "outline"} title={(MODELS as any)[id].formula}
      className={cn(sug && model !== id && "border-primary/40")} onClick={() => onModel(id)}>
      {(MODELS as any)[id].label}
    </Button>
  );
  const rowsOf = (list: any[]) => list.map((p, i) => (
    <tr key={i} className="border-b last:border-0">
      <th className="py-1 pr-2 text-left text-xs font-medium text-muted-foreground"><Sym>{p.label ?? p.sym}</Sym></th>
      <td className="py-1 text-right text-sm font-semibold tabular">{p.key === "sd" ? `${n4(p.value)} ${p.unit}` : formatMeasure(p.value, p.sigma, p.unit)}</td>
    </tr>
  ));
  const isLine = model === "lin";
  return (
    <div className="flex flex-col gap-3">
      {!!suggested.length && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted-foreground">{t("fit.suggested")}</span>{suggested.map((id) => btn(id, true))}</div>}
      <Collapsible open={more} onOpenChange={setMore}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold"><ChevronDown className={cn("size-3.5 transition-transform", !more && "-rotate-90")} /> {suggested.length ? t("fit.otherModels") : t("fit.models")}</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-wrap gap-1.5 pt-2">{others.map((id: string) => btn(id))}</CollapsibleContent>
      </Collapsible>
      <Button size="xs" variant="ghost" className="self-start" onClick={onCompare}>{compare ? t("fit.hideCompare") : t("fit.compareAll")}</Button>
      {compare && <CompareModels rows={compare} current={model} unit={cy.unit} onPick={onModel} />}
      {fit?.error && <p className="text-sm text-destructive">{fit.error}</p>}
      {fit && !fit.error && (
        <>
          <p className="rounded-md bg-muted px-3 py-2 text-center font-semibold tabular">{fit.eq}</p>
          <table className="w-full"><tbody>{rowsOf(phys.length ? phys : [fit.params[0]])}</tbody></table>
          <p className="text-xs text-muted-foreground">{t.rich("fit.spread", { b: bold, s: fmt(fit.s, 2), unit: cy.unit, n: fit.n, t1: fmtNum(fit.t1), t2: fmtNum(fit.t2), xunit: cx.unit })}</p>
          <div className="flex flex-col gap-1.5">
            <Why title={t("fit.allParams")}>
              <p className="font-mono">{(MODELS as any)[model!].formula}</p>
              <table className="w-full"><tbody>{rowsOf(fit.params)}</tbody></table>
            </Why>
            <Why title={t("fit.uncTitle")}>
              <p>{t.rich("fit.unc1", { b: bold, s: n4(fit.s), unit: cy.unit })}</p>
              <p>{t.rich("fit.unc2", { b: bold })} {isLine ? t("fit.uncLine", { x: plainSym(cx.sym) }) : t("fit.uncNonlin")}</p>
              <p>{t("fit.unc3")}</p>
            </Why>
            <Why title={t("fit.r2Title", { r2: Number.isFinite(fit.r2) ? fit.r2.toLocaleString(intlLocale, { maximumFractionDigits: 5 }) : "—" })}>
              <p>{t.rich("fit.r2Body", { b: bold })}</p>
            </Why>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onSave}><Save /> {t("save")}</Button>
            <Button size="sm" variant="outline" onClick={onResid}>{showResid ? t("fit.hideResid") : t("fit.checkResid")}</Button>
          </div>
        </>
      )}
    </div>
  );
}

export function Residuals({ fit, T, xLabel, cy }: { fit: any; T: number[]; xLabel: string; cy: BoxColumn }) {
  const t = useTranslations("workbench.tools.resid");
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = new ChartGroup({ includeZero: false });
    const c = g.add(new Chart(ref.current, { compact: false }));
    c.setData({
      series: [
        { x: T, y: fit.residuals, mode: "points", color: cssVar("--mz-rosa-d"), label: "r" },
        { x: [fit.t1, fit.t2], y: [0, 0], mode: "line", color: cssVar("--mz-axis"), width: 1.2 },
      ],
      xLabel, yLabel: cy.unit ? `r (${cy.unit})` : "r",
    });
    return () => g.destroy();
  }, [fit, T, xLabel, cy.unit]);
  const rt = runsTest(fit.residuals);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <b className="text-sm">{t("title")}</b>
      <div className="relative h-40"><canvas ref={ref} aria-label={t("chart")} className="absolute inset-0 size-full" /></div>
      {rt.verdict === "sistematici" ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{t.rich("systematic", { b: bold, runs: rt.runs, mu: fmtNum(rt.mu, 0) })}</p>
      ) : rt.verdict === "casuali" ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{t.rich("random", { b: bold, runs: rt.runs, mu: fmtNum(rt.mu, 0) })}</p>
      ) : <p className="text-sm text-muted-foreground">{t("tooFew")}</p>}
      <Why title={t("howTitle")}>
        <p>{t.rich("how", { i: (c) => <i>{c}</i> })}</p>
      </Why>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Righello
// ---------------------------------------------------------------------------
export interface RulerState { x1: number; x2: number; n: number }
export const TO_SECONDS: Record<string, number> = { s: 1, ms: 1e-3, "µs": 1e-6, us: 1e-6, min: 60 };
export function RulerPanel({ r, cx, onN, onSave }: { r: RulerState; cx: BoxColumn; onN: (n: number) => void; onSave: () => void }) {
  const t = useTranslations("workbench.tools");
  const lo = Math.min(r.x1, r.x2), hi = Math.max(r.x1, r.x2), d = hi - lo;
  const isFreq = cx.unit === "Hz";
  const toS = TO_SECONDS[cx.unit];
  const T = d / r.n, f = toS ? 1 / (T * toS) : NaN;
  return (
    <div className="flex flex-col gap-3">
      <Say>{t.rich(isFreq ? "ruler.peaks" : "ruler.crests", { b: bold })}</Say>
      <div className="flex items-center gap-2 text-sm">
        <span>N =</span>
        <Button size="icon-xs" variant="outline" onClick={() => onN(Math.max(1, r.n - 1))} aria-label={t("ruler.fewer")}><Minus /></Button>
        <b className="tabular w-6 text-center text-base">{r.n}</b>
        <Button size="icon-xs" variant="outline" onClick={() => onN(r.n + 1)} aria-label={t("ruler.more")}><Plus /></Button>
        <span className="text-muted-foreground">{t(isFreq ? "ruler.intervals" : "ruler.periods", { n: r.n })}</span>
      </div>
      <CalcBox>
        {isFreq ? (
          <div>f₀ = <Frac top={<Sym>{`Δ${cx.sym}`}</Sym>} bottom="N" /> = <Frac top={`${fmtNum(d, 4)} ${cx.unit}`} bottom={r.n} /> = <b>{fmtNum(T, 4)} {cx.unit}</b></div>
        ) : (
          <>
            <div>T = <Frac top={<Sym>{`Δ${cx.sym}`}</Sym>} bottom="N" /> = <Frac top={`${fmtNum(d, 4)} ${cx.unit}`} bottom={r.n} /> = <b>{fmtNum(T, 4)} {cx.unit}</b></div>
            {Number.isFinite(f) && <div>f = <Frac top="1" bottom="T" /> = <b>{fmtNum(f, f < 10 ? 3 : 1)} Hz</b></div>}
          </>
        )}
      </CalcBox>
      <p className="text-xs text-muted-foreground">{t("ruler.precision")}</p>
      <Button size="sm" variant="outline" className="self-start" onClick={onSave}><Save /> {t("save")}</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intestazione degli strumenti: che cosa fa, in una riga
// ---------------------------------------------------------------------------
export function ToolIntro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statistiche del tratto
// ---------------------------------------------------------------------------
export interface Stats { n: number; x1: number; x2: number; mean: number; sd: number; sem: number; min: number; max: number; first: number; last: number; rate: number }

export function computeStats(x: number[], y: number[], sel: [number, number] | null): Stats | null {
  const [a, b] = sel ?? [-Infinity, Infinity];
  const pts: [number, number][] = [];
  x.forEach((xi, i) => { if (Number.isFinite(xi) && Number.isFinite(y[i]) && xi >= a && xi <= b) pts.push([xi, y[i]]); });
  if (pts.length < 2) return null;
  pts.sort((p, q) => p[0] - q[0]);
  const ys = pts.map((p) => p[1]), n = ys.length;
  const mean = ys.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(ys.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const [x1, first] = pts[0], [x2, last] = pts[n - 1];
  return { n, x1, x2, mean, sd, sem: sd / Math.sqrt(n), min: Math.min(...ys), max: Math.max(...ys), first, last, rate: (last - first) / (x2 - x1) };
}

export function StatsPanel({ st, selected, cx, cy, su, meaning, onClear, onSave }: {
  st: Stats | null; selected: boolean; cx: BoxColumn; cy: BoxColumn; su: string; meaning: string | null; onClear: () => void; onSave: () => void;
}) {
  const t = useTranslations("workbench.tools");
  if (!st) return <Say>{t("stats.needTwo")}</Say>;
  const u = cy.unit ? ` ${cy.unit}` : "";
  const row = (label: React.ReactNode, value: React.ReactNode, hint?: string) => (
    <tr className="border-b last:border-0" title={hint}>
      <th className="py-1 pr-2 text-left text-xs font-medium text-muted-foreground"><Sym>{label}</Sym></th>
      <td className="py-1 text-right text-sm font-semibold tabular">{value}</td>
    </tr>
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {selected ? <>{t("stats.selected", { a: fmtNum(st.x1), b: fmtNum(st.x2), unit: cx.unit, n: st.n })} <button type="button" className="ml-1 underline underline-offset-2" onClick={onClear}>{t("stats.useAll")}</button></> : <>{t("stats.allData", { n: st.n })}</>}
      </p>
      <table className="w-full"><tbody>
        {row(t("stats.mean", { y: cy.sym }), formatMeasure(st.mean, st.sem, cy.unit), t("stats.meanHint"))}
        {row(t("stats.sd"), `${n4(st.sd)}${u}`, t("stats.sdHint"))}
        {row(t("stats.minMax"), `${n4(st.min)} · ${n4(st.max)}${u}`)}
        {row(t("stats.change", { y: cy.sym }), `${n4(st.last - st.first)}${u}`, t("stats.changeHint"))}
        {row(meaning ? t("stats.meanMeaning", { meaning }) : t("stats.rate", { y: cy.sym, x: cx.sym }), `${n4(st.rate)} ${su}`)}
      </tbody></table>
      <Why title={t("stats.whyTitle")}>
        <p>{t.rich("stats.why1", { b: bold })}</p>
        <p>{t("stats.why2")}</p>
      </Why>
      <Button size="sm" variant="outline" className="self-start" onClick={onSave}><Save /> {t("save")}</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confronto dei modelli
// ---------------------------------------------------------------------------
export interface ModelRow { id: string; label: string; r2: number; s: number; n: number; verdict: string; error?: string }

export function CompareModels({ rows, current, unit, onPick }: { rows: ModelRow[]; current: string | null; unit: string; onPick: (id: string) => void }) {
  const t = useTranslations("workbench.tools.compare");
  const ok = rows.filter((r) => !r.error);
  const best = ok.length ? ok.reduce((a, b) => (b.s < a.s ? b : a)).id : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1 pr-2 font-medium">{t("model")}</th><th className="py-1 pr-2 text-right font-medium">s ({unit || "—"})</th><th className="py-1 pr-2 text-right font-medium">R²</th><th className="py-1 text-right font-medium">{t("residuals")}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => !r.error && onPick(r.id)}
                className={cn("border-t", r.error ? "text-muted-foreground" : "cursor-pointer hover:bg-muted/60", current === r.id && "bg-accent/50")}>
                <td className="py-1 pr-2 font-medium">{r.label}{r.id === best && <span className="ml-1.5 rounded bg-success/15 px-1 text-[0.6rem] font-semibold text-success">{t("best")}</span>}</td>
                <td className="py-1 pr-2 text-right tabular">{r.error ? "—" : fmt(r.s, 2)}</td>
                <td className="py-1 pr-2 text-right tabular">{r.error || !Number.isFinite(r.r2) ? "—" : r.r2.toLocaleString(intlLocale, { maximumFractionDigits: 4 })}</td>
                <td className="py-1 text-right">{r.error ? "" : r.verdict === "casuali" ? <span className="text-success">{t("random")}</span> : r.verdict === "sistematici" ? <span className="text-destructive">{t("systematic")}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.7rem] leading-relaxed text-muted-foreground">{t.rich("footer", { b: bold })}</p>
    </div>
  );
}
