"use client";
// Strumenti dei riquadri di Elaborazione: pannelli laterali (retta a occhio, tangente, fit, righello)
// e il grafico dei residui. La logica di calcolo è la stessa della versione originale.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Minus, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Chart, ChartGroup } from "@/lib/mosaicus/chart.js";
import { MODELS, MODEL_ORDER, runsTest } from "@/lib/mosaicus/fits.js";
import { formatMeasure, fmt } from "@/lib/mosaicus/analysis.js";
import type { BoxColumn } from "@/lib/workbench-store";
import { fmtNum } from "@/lib/prefs";
import { cn } from "@/lib/utils";

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
  const balance = Math.abs(up - down) <= Math.max(2, 0.15 * (up + down));
  const steps = ["Tira la retta", "Misura la pendenza"];
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
        {steps.map((t, i) => (
          <li key={t} className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5", eye.step === i + 1 ? "border-primary bg-primary text-primary-foreground" : eye.step > i + 1 ? "text-muted-foreground line-through" : "text-muted-foreground")}>
            <b>{i + 1}</b> {t}
          </li>
        ))}
      </ol>
      {eye.step === 1 ? (
        <>
          <Say>Trascina i <b>cerchi verdi</b>: la retta deve passare in mezzo ai punti.</Say>
          <p className={cn("tabular text-sm font-semibold", balance ? "text-success" : "text-muted-foreground")}>⬆ {up} · ⬇ {down} {balance ? "✓ in equilibrio" : ""}</p>
          <Button size="sm" className="self-start" onClick={onNext}>Fatto <ArrowRight /></Button>
        </>
      ) : (
        <>
          {!result && <Say>Tocca <b>due punti della retta</b>, lontani tra loro.</Say>}
          {result && (
            <>
              <CalcBox>
                <div>m = <Frac top={`Δ${cy.sym}`} bottom={`Δ${cx.sym}`} /> = <Frac top={`${fmtNum(result.B.y)} − ${fmtNum(result.A.y)}`} bottom={`${fmtNum(result.B.x)} − ${fmtNum(result.A.x)}`} /> = <b>{n4(result.m)} {su}</b></div>
                <div className="text-muted-foreground">{cy.sym} = {n4(result.m)}·{cx.sym} {result.q < 0 ? "−" : "+"} {n4(Math.abs(result.q))}</div>
              </CalcBox>
              {meaning && <Meaning>{cap(meaning)} ≈ <b>{n4(result.m)} {su}</b></Meaning>}
              {eye.cmp && (
                <p className="text-sm">Computer: <b>{formatMeasure(eye.cmp.m, eye.cmp.s, su)}</b> · differenza {rel.toLocaleString("it-IT", { maximumFractionDigits: 1 })} % · {rel <= 3 ? <b className="text-success">Ottima! ✓</b> : rel <= 10 ? <b className="text-success">Buona ✓</b> : <b className="text-warning">Riprova ↺</b>}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onSave(result!)}><Save /> Salva</Button>
                <Button size="sm" variant="outline" onClick={onCompare}>{eye.cmp ? "Nascondi il computer" : "E il computer?"}</Button>
              </div>
            </>
          )}
          <Button size="sm" variant="ghost" className="self-start" onClick={onBack}><ArrowLeft /> Ritocca la retta</Button>
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
  if (!t) return <Say>Tocca un punto della curva.</Say>;
  if (t === "few") return <><Say>Tocca un punto della curva.</Say><p className="text-sm text-destructive">Servono almeno 3 punti vicini.</p></>;
  return (
    <div className="flex flex-col gap-3">
      <CalcBox>
        <div>m = <Frac top={`Δ${cy.sym}`} bottom={`Δ${cx.sym}`} /> = <Frac top={fmtNum(t.m * t.dx)} bottom={fmtNum(t.dx)} /> = <b>{n4(t.m)} {su}</b></div>
      </CalcBox>
      {meaning && <Meaning>{cap(meaning)} istantanea in {cx.sym} = {fmtNum(t.P.x)} {cx.unit}: <b>{n4(t.m)} {su}</b></Meaning>}
      <Why title="Come si calcola?">
        <p>Una curva misurata non ha una formula: l&apos;app prende i {t.near} punti misurati più vicini a P e ci fa passare la parabola che li approssima meglio. La tangente è la retta che tocca quella parabola in P. Il triangolo mostra la pendenza: di quanto sale {cy.sym} quando {cx.sym} aumenta di {fmtNum(t.dx)} {cx.unit}.</p>
      </Why>
      <Button size="sm" className="self-start" onClick={onSave}><Save /> Salva</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------
export interface PhysicsValue { label: string; unit: string; value: number; sigma: number }
export function FitPanel({ suggested, model, fit, phys, cx, cy, onModel, onSave, showResid, onResid }: {
  suggested: string[]; model: string | null; fit: any; phys: PhysicsValue[]; cx: BoxColumn; cy: BoxColumn;
  onModel: (id: string) => void; onSave: () => void; showResid: boolean; onResid: () => void;
}) {
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
      <th className="py-1 pr-2 text-left text-xs font-medium text-muted-foreground">{p.label ?? p.sym}</th>
      <td className="py-1 text-right text-sm font-semibold tabular">{p.key === "sd" ? `${n4(p.value)} ${p.unit}` : formatMeasure(p.value, p.sigma, p.unit)}</td>
    </tr>
  ));
  const isLine = model === "lin";
  return (
    <div className="flex flex-col gap-3">
      <Say>Scegli un modello.</Say>
      {!!suggested.length && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted-foreground">Consigliati</span>{suggested.map((id) => btn(id, true))}</div>}
      <Collapsible open={more} onOpenChange={setMore}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold"><ChevronDown className={cn("size-3.5 transition-transform", !more && "-rotate-90")} /> Altri modelli</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-wrap gap-1.5 pt-2">{others.map((id: string) => btn(id))}</CollapsibleContent>
      </Collapsible>
      {fit?.error && <p className="text-sm text-destructive">{fit.error}</p>}
      {fit && !fit.error && (
        <>
          <p className="rounded-md bg-muted px-3 py-2 text-center font-semibold tabular">{fit.eq}</p>
          <table className="w-full"><tbody>{rowsOf(phys.length ? phys : [fit.params[0]])}</tbody></table>
          <p className="text-xs text-muted-foreground"><b>±</b> perché i punti oscillano di circa <b>{fmt(fit.s, 2)} {cy.unit}</b> intorno alla curva · {fit.n} punti · {fmtNum(fit.t1)}–{fmtNum(fit.t2)} {cx.unit}</p>
          <div className="flex flex-col gap-1.5">
            <Why title="Tutti i parametri del modello">
              <p className="font-mono">{(MODELS as any)[model!].formula}</p>
              <table className="w-full"><tbody>{rowsOf(fit.params)}</tbody></table>
            </Why>
            <Why title="L'incertezza: termini e formule">
              <p><b>Deviazione standard dei dati</b>, s = {n4(fit.s)} {cy.unit}: quanto oscillano i punti intorno alla curva. Si calcola dai residui r (dato − curva): s = √( Σr² / (n − p) ), con n punti e p parametri del modello.</p>
              <p><b>Incertezza tipo</b> di un parametro: il numero dopo il ±. Dipende da s e da quanti e quanto distribuiti sono i punti.{isLine ? ` Per la pendenza della retta: σₘ = s / √Σ(${cx.sym} − ${cx.sym}̄)². Più largo è il tratto sull'asse orizzontale, più piccola è l'incertezza.` : " Per i modelli non lineari si ricava dalla stessa s, tenendo conto di quanto ogni parametro «sposta» la curva."}</p>
              <p>Prova a confrontarla con la retta a occhio: è la stessa idea, fatta a mano.</p>
            </Why>
            <Why title={<>Che cos&apos;è R² = {Number.isFinite(fit.r2) ? fit.r2.toLocaleString("it-IT", { maximumFractionDigits: 5 }) : "—"}?</>}>
              <p>R² dice quale frazione della variazione dei dati è spiegata dal modello: <b>1</b> = i punti stanno tutti sulla curva, <b>0</b> = il modello non spiega nulla. Un R² alto non basta a dire che il modello è giusto (una retta su un tratto di parabola può dare R² = 0,99): per questo c&apos;è la verifica dei residui.</p>
            </Why>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSave}><Save /> Salva</Button>
            <Button size="sm" variant="outline" onClick={onResid}>{showResid ? "Nascondi i residui" : "Il modello è giusto?"}</Button>
          </div>
        </>
      )}
    </div>
  );
}

export function Residuals({ fit, T, xLabel, cy }: { fit: any; T: number[]; xLabel: string; cy: BoxColumn }) {
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
      <b className="text-sm">Residui = dato − modello</b>
      <div className="relative h-40"><canvas ref={ref} aria-label="Grafico dei residui" className="absolute inset-0 size-full" /></div>
      {rt.verdict === "sistematici" ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">✗ I residui hanno un <b>andamento sistematico</b>: cambiano segno solo {rt.runs} volte, mentre per dati casuali ce ne aspetteremmo circa {fmtNum(rt.mu, 0)}. I punti stanno «a pancia» rispetto alla curva: <b>il modello non descrive bene questo tratto</b>. Prova un altro modello o un altro tratto.</p>
      ) : rt.verdict === "casuali" ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">✓ I residui sono <b>sparsi a caso</b> intorno a zero: cambiano segno {rt.runs} volte (per dati casuali ce ne aspettiamo circa {fmtNum(rt.mu, 0)}). Il modello è <b>adeguato</b> per questo tratto.</p>
      ) : <p className="text-sm text-muted-foreground">Troppo pochi punti per un verdetto.</p>}
      <Why title="Come funziona la verifica?">
        <p>Se il modello è giusto, ogni punto sta sopra o sotto la curva «a caso», come lanciando una moneta: i segni dei residui cambiano spesso. Se il modello è sbagliato, ci sono lunghi tratti tutti sopra e poi tutti sotto. L&apos;app conta i cambi di segno e li confronta con quelli attesi per il caso (<i>test delle successioni</i> di Wald–Wolfowitz: verdetto negativo se il numero di successioni è più di 2 deviazioni standard sotto l&apos;atteso).</p>
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
  const lo = Math.min(r.x1, r.x2), hi = Math.max(r.x1, r.x2), d = hi - lo;
  const isFreq = cx.unit === "Hz";
  const toS = TO_SECONDS[cx.unit];
  const T = d / r.n, f = toS ? 1 / (T * toS) : NaN;
  return (
    <div className="flex flex-col gap-3">
      <Say>{isFreq ? <>Metti le linee su due <b>picchi</b> e conta gli intervalli tra i due.</> : <>Metti le linee su due punti <b>uguali</b> dell&apos;onda (due creste) e conta i periodi tra i due.</>}</Say>
      <div className="flex items-center gap-2 text-sm">
        <span>N =</span>
        <Button size="icon-xs" variant="outline" onClick={() => onN(Math.max(1, r.n - 1))} aria-label="Uno in meno"><Minus /></Button>
        <b className="tabular w-6 text-center text-base">{r.n}</b>
        <Button size="icon-xs" variant="outline" onClick={() => onN(r.n + 1)} aria-label="Uno in più"><Plus /></Button>
        <span className="text-muted-foreground">{isFreq ? "intervalli" : r.n === 1 ? "periodo" : "periodi"}</span>
      </div>
      <CalcBox>
        {isFreq ? (
          <div>f₀ = <Frac top={`Δ${cx.sym}`} bottom="N" /> = <Frac top={`${fmtNum(d, 4)} ${cx.unit}`} bottom={r.n} /> = <b>{fmtNum(T, 4)} {cx.unit}</b></div>
        ) : (
          <>
            <div>T = <Frac top={`Δ${cx.sym}`} bottom="N" /> = <Frac top={`${fmtNum(d, 4)} ${cx.unit}`} bottom={r.n} /> = <b>{fmtNum(T, 4)} {cx.unit}</b></div>
            {Number.isFinite(f) && <div>f = <Frac top="1" bottom="T" /> = <b>{fmtNum(f, f < 10 ? 3 : 1)} Hz</b></div>}
          </>
        )}
      </CalcBox>
      <p className="text-xs text-muted-foreground">Più periodi abbracci, più la misura è precisa: l&apos;errore di lettura si divide per N.</p>
      <Button size="sm" className="self-start" onClick={onSave}><Save /> Salva</Button>
    </div>
  );
}
