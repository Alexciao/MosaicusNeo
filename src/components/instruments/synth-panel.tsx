"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { ChevronDown, Hand, Keyboard, Minus, Play, Plus, Radio, Smartphone, Square, Volume1, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SY, WAVES, ENV, INSTR, instrLabel } from "@/lib/mosaicus/synth-engine.js";
import {
  createSynthController, toSlider, fromSlider, FMIN, FMAX, RANGES, rangeLabel, SCALE_UI, SCALE_NAME, SCALES, MODES, D_NEAR, D_FAR, type SynthMode,
} from "@/lib/mosaicus/synth-controller";
import { noteOf, noteFreq, NOTE_IT } from "@/lib/mosaicus/dsp.js";
import { fmtIt } from "@/lib/mosaicus/screen.js";
import type { Instrument } from "@/lib/sensors/presets";
import { instrumentApi, registerInstrument } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { Segmented } from "./scope-panel";

const MODE_ICON: Record<SynthMode, typeof Keyboard> = { keys: Keyboard, ribbon: Hand, tilt: Smartphone, sonar: Radio };

function WaveIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 28 22" width={28} height={22} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tastiera di due ottave (da La₃): tasti bianchi in fila, neri sovrapposti. */
function PianoKeys({ onKey, activeF }: { onKey: (n: number) => void; activeF: number | null }) {
  const lowN = -9, octaves = 2;
  const whites: { n: number; name: string; oct: number; c: boolean }[] = [];
  const blacks: { n: number; i: number; name: string; oct: number }[] = [];
  for (let s = 0; s <= octaves * 12; s++) {
    const n = lowN + s, idx = (((n + 9) % 12) + 12) % 12, name = NOTE_IT[idx], oct = 4 + Math.floor((n + 9) / 12);
    if (name.includes("♯")) blacks.push({ n, i: whites.length, name, oct });
    else whites.push({ n, name, oct, c: idx === 0 });
  }
  const on = (n: number) => activeF != null && Math.abs(1200 * Math.log2(activeF / noteFreq(n))) < 3;
  const W = whites.length;
  return (
    <div className="relative h-36 w-full touch-none select-none sm:h-40">
      <div className="flex h-full gap-px">
        {whites.map((k) => (
          <button key={k.n} type="button" title={`${k.name}${k.oct}`} onPointerDown={(e) => { e.preventDefault(); onKey(k.n); }}
            className={cn("flex flex-1 items-end justify-center rounded-b-md border bg-white pb-1.5 text-[0.65rem] font-medium text-neutral-500 shadow-sm transition-colors hover:bg-neutral-50 dark:border-white/10",
              on(k.n) && "bg-primary text-primary-foreground hover:bg-primary")}>
            {k.c ? `${k.name}${k.oct}` : k.name}
          </button>
        ))}
      </div>
      {blacks.map((k) => (
        <button key={k.n} type="button" title={`${k.name}${k.oct}`} onPointerDown={(e) => { e.preventDefault(); onKey(k.n); }}
          className={cn("absolute top-0 h-[60%] -translate-x-1/2 rounded-b-md bg-neutral-900 shadow-md transition-colors hover:bg-neutral-700 dark:bg-black dark:ring-1 dark:ring-white/15", on(k.n) && "bg-primary hover:bg-primary")}
          style={{ left: `${(k.i / W) * 100}%`, width: `${(100 / W) * 0.62}%` }} />
      ))}
    </div>
  );
}

export function SynthPanel({ exp }: { exp: Instrument }) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const ctl = useMemo(() => createSynthController({ ...instrumentApi(exp), toast: (m: string) => toast(m) }, () => bump()), [exp]);
  const scrRef = useRef<HTMLCanvasElement>(null);
  const ribRef = useRef<HTMLCanvasElement>(null);
  const [fText, setFText] = useState<string | null>(null);
  const [eqOpen, setEqOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const t = useTranslations("app.synth");
  const L = ctl.L;

  useEffect(() => {
    ctl.mount(scrRef.current!, ribRef.current!);
    registerInstrument({ onLine: ctl.onLine, linkChanged: ctl.linkChanged });
    return () => { registerInstrument(null); ctl.destroy(); };
  }, [ctl]);
  useEffect(() => { ctl.refreshStyle(); }, [resolvedTheme, ctl]);

  const mode = SY.mode as SynthMode;
  const f = mode === "keys" ? SY.f : Number.isFinite(L.n) ? noteFreq(L.n) : NaN;
  const nt = Number.isFinite(f) ? noteOf(f) : null;
  const live = ctl.isLive();
  const oneShot = mode === "keys" && SY.env !== "continuo";
  const terms = (SY.amps as number[]).map((v, i) => (v ? { v, i, neg: SY.sgn[i] < 0 } : null)).filter(Boolean) as { v: number; i: number; neg: boolean }[];
  const eq = terms.map((t, j) => `${t.neg ? (j ? " − " : "−") : j ? " + " : ""}${fmtIt(t.v, 2)}·sin(${t.i ? t.i + 1 : ""}ωt)`).join("");
  const fb = Math.abs(SY.df);
  const hint: Record<string, string> = {
    ribbon: t("hintRibbon"),
    tilt: t("hintTilt"),
    sonar: t("hintSonar", { near: D_NEAR * 100, far: D_FAR * 100 }),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* display e trasporto */}
      <Card className="flex flex-row flex-wrap items-center gap-4 p-4">
        <div className="flex min-w-48 items-baseline gap-3 rounded-xl bg-screen px-4 py-2 text-lime">
          <b className="text-3xl font-bold tabular">{nt ? (mode !== "keys" && SY.scale === "continua" && Math.abs(nt.cents) > 10 ? `≈ ${nt.label}` : nt.label) : "—"}</b>
          <span className="tabular text-sm text-lime/80">{Number.isFinite(f) ? `${fmtIt(f, f < 100 ? 1 : 0)} Hz` : ""}</span>
          <em className="text-xs text-white/70 not-italic">
            {mode === "sonar" && Number.isFinite(L.d) ? t("hand", { d: fmtIt(L.d * 100, 0) })
              : mode === "tilt" && L.tilt != null ? t("tilt", { a: fmtIt(L.tilt, 0) })
                : mode !== "keys" && Number.isFinite(L.n) ? <>n = {fmtIt(L.n, SY.scale === "continua" ? 1 : 0)} → f = 440·2<sup>n/12</sup></> : null}
          </em>
        </div>
        {mode !== "ribbon" && (
          <Button size="lg" variant={live ? "destructive" : "default"} className="min-w-32" onClick={() => void ctl.play()}>
            {live ? <><Square className="fill-current" /> {t("stop")}</> : <><Play className="fill-current" /> {oneShot ? t("playOnce") : t("play")}</>}
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          <Volume1 className="size-4" />
          <Slider className="w-32 data-horizontal:w-32" min={0} max={1} step={0.01} value={SY.vol} onValueChange={(v) => ctl.setVol(v as number)} aria-label={t("volume")} />
          <Volume2 className="size-4" />
        </label>
      </Card>

      {/* timbro */}
      <Card className="flex flex-col gap-4 p-4">
        <h3 className="font-semibold">{t("timbre")}</h3>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="relative aspect-[2/1] overflow-hidden rounded-lg bg-screen"><canvas ref={scrRef} aria-label={t("wave")} className="absolute inset-0 size-full" /></div>
          <div className="grid grid-cols-8 gap-1.5">
            {(SY.amps as number[]).map((a, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Slider orientation="vertical" className="h-28" min={0} max={1} step={0.01} value={a} onValueChange={(v) => ctl.setHarmonic(i, v as number)} aria-label={t("harmonicAmp", { n: i + 1 })} />
                <b className="text-xs">{i + 1}</b>
                <small className="tabular text-[0.65rem] text-muted-foreground">{fmtIt(a, 2)}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label={t("waves")} value={SY.preset in WAVES ? SY.preset : ""} onChange={(id) => ctl.setPreset(id)}
            items={Object.entries(WAVES).map(([id, w]) => [id, <><WaveIcon d={(w as { d: string }).d} /><span className="hidden sm:inline">{(w as { label: string }).label}</span></>, (w as { label: string }).label])} />
          <div className="flex flex-wrap gap-1.5">
            {INSTR.map((id) => <Button key={id} size="sm" variant={SY.preset === id ? "default" : "outline"} onClick={() => ctl.setPreset(id)}>{instrLabel(id)}</Button>)}
          </div>
          {SY.preset === "libera" && <span className="text-xs font-medium text-brand">{t("free")}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("envelope")}</span>
          <Segmented label={t("envelope")} value={SY.env} onChange={(id) => ctl.setEnv(id)}
            items={Object.entries(ENV).map(([id, e]) => [id, <><WaveIcon d={(e as { d: string }).d} /><span>{(e as { label: string }).label}</span></>, (e as { label: string }).label])} />
        </div>
        <Collapsible open={eqOpen} onOpenChange={setEqOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold">
            <ChevronDown className={cn("size-4 transition-transform", !eqOpen && "-rotate-90")} /> {t("formula")}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <p className="rounded-md bg-muted px-3 py-2 font-mono text-sm">y = {eq || "0"}{(SY.tail as number[]).some(Boolean) ? t("higher") : ""}</p>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* come lo suoni */}
      <Card className="flex flex-col gap-4 p-4">
        <Segmented label={t("howToPlay")} value={mode} onChange={(m) => void ctl.setMode(m)}
          items={MODES.map(([id, l]) => { const I = MODE_ICON[id]; return [id, <><I /> {l}</>]; })} />

        <div className={cn("flex flex-col gap-4", mode !== "keys" && "hidden")}>
          <PianoKeys onKey={ctl.pressKey} activeF={mode === "keys" ? SY.f : null} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon-sm" variant="outline" onClick={() => ctl.setF(SY.f - 1)} aria-label="−1 Hz"><Minus /></Button>
            <Slider className="min-w-40 flex-1 data-horizontal:w-auto" min={0} max={1000} step={1} value={toSlider(SY.f)} onValueChange={(v) => ctl.setF(fromSlider(v as number))} aria-label={t("freq")} />
            <Button size="icon-sm" variant="outline" onClick={() => ctl.setF(SY.f + 1)} aria-label="+1 Hz"><Plus /></Button>
            <Input type="text" inputMode="decimal" className="h-8 w-24 tabular" aria-label={t("freqHz")}
              value={fText ?? String(SY.f)} onChange={(e) => setFText(e.target.value)} onFocus={() => setFText(String(SY.f))}
              onBlur={() => { const v = parseFloat(String(fText).replace(",", ".")); if (Number.isFinite(v)) ctl.setF(Math.min(FMAX, Math.max(FMIN, v))); setFText(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            <span className="text-sm text-muted-foreground">Hz</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={SY.two} onCheckedChange={(v) => ctl.setTwo(!!v)} /> {t("second")}</label>
            {SY.two && (
              <>
                <span className="flex items-center gap-2 text-sm">f₂ = f + Δf
                  <Slider className="w-36 data-horizontal:w-36" min={-10} max={10} step={0.5} value={SY.df} onValueChange={(v) => ctl.setDf(v as number)} aria-label={t("df")} />
                  <b className="tabular w-16">{SY.df > 0 ? "+" : SY.df < 0 ? "−" : ""}{fmtIt(Math.abs(SY.df), 1)} Hz</b>
                </span>
                <p className="text-sm text-muted-foreground">
                  {fb ? t.rich("beats", { fb: fmtIt(fb, 1), T: fmtIt(1 / fb, 2), sub: (c) => <sub>{c}</sub>, b: (c) => <b className="text-foreground">{c}</b> }) : t("noBeats")}
                </p>
              </>
            )}
          </div>
        </div>

        <div className={cn("flex flex-col gap-4", mode === "keys" && "hidden")}>
          <div className="relative h-24 overflow-hidden rounded-lg bg-screen touch-none">
            <canvas ref={ribRef} aria-label={t("ribbon")} className="absolute inset-0 size-full" />
          </div>
          <p className="text-sm text-muted-foreground">{hint[mode]}</p>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">{t("notes")}</Label>
            <Select value={SY.range} onValueChange={(v) => v && ctl.setRange(String(v))} items={Object.fromEntries(Object.keys(RANGES).map((r) => [r, rangeLabel(r)]))}>
              <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(RANGES).map((r) => <SelectItem key={r} value={r}>{rangeLabel(r)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3">
            <div role="group" aria-label={t("tonic")} className="flex flex-wrap gap-1">
              {NOTE_IT.map((n: string, i: number) => (
                <Button key={n} size="xs" variant={SY.tonic === i ? "default" : "outline"} onClick={() => ctl.setTonic(i)} className="min-w-10">{n}</Button>
              ))}
            </div>
            <p aria-live="polite" className="text-sm font-semibold">
              {SCALES[SY.scale] && SY.scale !== "cromatica" ? `${NOTE_IT[SY.tonic]} ${SCALE_NAME[SY.scale]}` : SCALE_NAME[SY.scale]}
            </p>
            {SCALE_UI.map(([ic, g, list]) => (
              <div key={g} className="flex flex-wrap items-center gap-1.5">
                <span className="w-28 text-xs text-muted-foreground">{ic} {g}</span>
                {list.map(([k, l]) => <Button key={k} size="xs" variant={SY.scale === k ? "default" : "outline"} onClick={() => ctl.setScale(k)}>{l}</Button>)}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("speakerHint")}</p>
      </Card>
    </div>
  );
}
