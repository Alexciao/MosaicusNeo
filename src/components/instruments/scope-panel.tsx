"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Crosshair, Eye, EyeOff, Mic, MoveHorizontal, Music, Pause, Play, Send, Snowflake, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { GlideNav } from "@/components/app/glide-nav";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createScopeEngine, DT_STEPS, EXAMPLES, N_ARD, WIN_STEPS, LIVE, slotColor, type Circuit } from "@/lib/mosaicus/scope-engine";
import { fmtIt } from "@/lib/mosaicus/screen.js";
import { sig, noteOf } from "@/lib/mosaicus/dsp.js";
import type { Instrument } from "@/lib/sensors/presets";
import { instrumentApi, registerInstrument } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { useState } from "react";


/** Scelta tra poche opzioni, con la pillola che scivola (come le altre schede dell'app). */
export function Segmented<T extends string>({ value, onChange, items, label, className }: { value: T; onChange: (v: T) => void; items: [T, React.ReactNode, string?][]; label: string; className?: string }) {
  return (
    <GlideNav label={label} value={value} className={cn("w-fit max-w-full shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]", className)}
      items={items.map(([id, content, title]) => ({ id, content, title, onSelect: () => onChange(id) }))} />
  );
}

/** Etichetta di una lettura: il simbolo finale (f, T) in corsivo, come una variabile. */
function ReadoutLabel({ text }: { text: string }) {
  const m = text.match(/^(.*\S)\s+([A-Za-z])$/);
  return m ? <>{m[1]} <i>{m[2]}</i></> : <>{text}</>;
}

export function ScopePanel({ exp }: { exp: Instrument }) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const engine = useMemo(() => createScopeEngine({ ...instrumentApi(exp), toast: (m: string) => toast(m) }, () => bump()), [exp]);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const t = useTranslations("app.scope");
  const { S, ard } = engine;

  useEffect(() => {
    engine.mount(waveRef.current!, specRef.current!);
    registerInstrument({ onLine: engine.onLine, linkChanged: engine.linkChanged });
    return () => { registerInstrument(null); engine.destroy(); };
  }, [engine]);
  useEffect(() => { engine.refreshStyle(); }, [resolvedTheme, engine]);

  const running = engine.isRunning();
  const genOn = engine.generatorOn();

  return (
    <Card className="gap-0 p-0">
      {/* barra: avvio, congela, sorgente · letture */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {running ? (
            <Button onClick={() => void engine.run()} className={cn("min-w-24", ard ? "bg-red-600 text-white hover:bg-red-700" : "")} variant={ard ? "default" : "outline"}>
              {ard ? <><Square className="fill-current" /> {t("stop")}</> : <><Pause /> {t("pause")}</>}
            </Button>
          ) : (
            <Button variant="brand" onClick={() => void engine.run()} className="min-w-24"><Play className="fill-current" /> {t("start")}</Button>
          )}
          <Button variant="outline" disabled={S.slots.length >= 3 || !S.live || !S.showLive} onClick={engine.freeze} title={t("freezeTitle")}>
            <Snowflake /> {S.slots.length >= 3 ? t("maxTraces") : t("freeze")}
          </Button>
        </div>
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
        {ard ? (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {t("circuit")}
            <Select value={S.circuit} onValueChange={(v) => v && engine.setCircuit(v as Circuit)} items={{ mic: t("mic"), coil: t("coil"), lamp: t("lamp") }}>
              <SelectTrigger size="sm" className="w-48 text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mic">{t("mic")}</SelectItem>
                <SelectItem value="coil">{t("coil")}</SelectItem>
                <SelectItem value="lamp">{t("lamp")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        ) : (
          <Segmented label={t("source")} value={(S.source ?? "") as "mic" | "ex" | ""} onChange={(v) => v && void engine.selectSource(v)}
            items={[["mic", <><Mic /> {t("micSource")}</>], ["ex", <><Music /> {t("examples")}</>]]} />
        )}
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 md:ml-auto">
          {S.readouts.map(([l, v, u]) => (
            <div key={l} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground"><ReadoutLabel text={l} /></dt>
              <dd className="tabular text-base font-medium">{v}<span className="ml-1 text-xs font-normal text-muted-foreground">{u}</span></dd>
            </div>
          ))}
        </dl>
      </div>

      {!ard && S.source === "ex" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
          <span className="mr-2 text-xs text-muted-foreground">{t("a3")}</span>
          {[...EXAMPLES, ["beats", t("beats")] as [string, string]].map(([id, l]) => (
            <Button key={id} size="sm" variant={S.example === id && !S.paused ? "default" : "ghost"} onClick={() => engine.playExample(id)}>{l}</Button>
          ))}
          {genOn && <span className="ml-auto text-xs text-muted-foreground">{t("synthOn")}</span>}
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {!!S.slots.length && (
          <div className="flex flex-wrap gap-2">
            {S.slots.map((s) => (
              <div key={s.id} className={cn("flex items-center gap-1.5 rounded-md border py-0.5 pr-0.5 pl-2", !s.visible && "opacity-50")}>
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: slotColor(s.id) === "#ffffff" || slotColor(s.id) === "#fff" ? "var(--foreground)" : slotColor(s.id) }} />
                <button type="button" onClick={() => engine.toggleSlot(s.id)} title={t("toggle")} className="flex items-center gap-1 text-[13px] font-medium">
                  {s.visible ? <Eye className="size-3.5 text-muted-foreground" /> : <EyeOff className="size-3.5 text-muted-foreground" />}{s.id}
                </button>
                <Input defaultValue={s.name} onBlur={(e) => engine.renameSlot(s.id, e.target.value)} aria-label={t("traceName", { id: s.id })} className="h-7 w-24 border-transparent bg-transparent px-1.5 text-xs shadow-none hover:border-input" />
                <small className="tabular text-xs text-muted-foreground">
                  {Number.isFinite(s.f) ? `${fmtIt(sig(s.f, 4), 1)} Hz${noteOf(s.f) && !ard ? ` · ${noteOf(s.f)?.label}` : ""}` : "—"}
                </small>
                <Button size="icon-xs" variant="ghost" onClick={() => engine.removeSlot(s.id)} aria-label={t("removeTrace")}><X /></Button>
              </div>
            ))}
          </div>
        )}

        <div className="relative aspect-[16/9] max-h-[60vh] w-full overflow-hidden rounded-md bg-screen sm:aspect-[2/1]">
          <canvas ref={waveRef} aria-label={t("wave")} className="absolute inset-0 size-full" />
          {S.screenMsg && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex -translate-y-1/2 justify-center">
              <span className="rounded bg-screen/85 px-2 py-1 text-[13px] text-white/75">{S.screenMsg}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {ard ? (
            <>
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                {t("window")}
                <Select value={String(S.dt)} onValueChange={(v) => v && engine.setDt(+v)} items={Object.fromEntries(DT_STEPS.map((d) => [String(d), `${fmtIt((d * N_ARD) / 1000, 1)} ms`]))}>
                  <SelectTrigger size="sm" className="w-28 text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>{DT_STEPS.map((d) => <SelectItem key={d} value={String(d)}>{fmtIt((d * N_ARD) / 1000, 1)} ms</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <div className="flex min-w-56 items-center gap-3">
                <Label className="text-[13px] font-normal text-muted-foreground">{t("trigger")}</Label>
                <Slider className="w-36 data-horizontal:w-36" min={0} max={5} step={0.01} value={S.level} onValueChange={(v) => engine.previewLevel(v as number)} onValueCommitted={() => engine.commitLevel()} aria-label={t("triggerLevel")} />
                <span className="tabular w-14 text-[13px] font-medium whitespace-nowrap">{fmtIt(S.level, 2)} V</span>
                <Button size="sm" variant="ghost" onClick={engine.levelToMean} title={t("meanTitle")}><Crosshair /> {t("mean")}</Button>
              </div>
              <Segmented label={t("acquisition")} value={S.single ? "1" : "0"} onChange={(v) => engine.setSingle(v === "1")} items={[["0", t("continuous")], ["1", t("single")]]} />
            </>
          ) : (
            <div className="flex min-w-60 items-center gap-3">
              <Label className="text-[13px] font-normal text-muted-foreground">{t("window")}</Label>
              <Slider className="w-40 data-horizontal:w-40" min={0} max={WIN_STEPS.length - 1} step={1} value={Math.max(0, WIN_STEPS.indexOf(S.winMs))} onValueChange={(v) => engine.setWin(v as number)} aria-label={t("timeWindow")} />
              <span className="tabular w-14 text-[13px] font-medium whitespace-nowrap">{S.winMs} ms</span>
            </div>
          )}
          <Segmented label={t("triggerGroup")} value={String(S.edge)} onChange={(v) => engine.setEdge(+v)}
            items={[["1", <ArrowUpRight key="r" aria-label={t("rising")} />, t("rising")], ["-1", <ArrowDownRight key="f" aria-label={t("falling")} />, t("falling")], ["0", <MoveHorizontal key="n" aria-label={t("noTrigger")} />, t("noTrigger")]]} />
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={S.same} onCheckedChange={(v) => engine.setSame(!!v)} /> {t("sameHeight")}
          </label>
        </div>

        <div className="relative aspect-[4/1] min-h-32 w-full overflow-hidden rounded-md bg-screen">
          <canvas ref={specRef} aria-label={t("spectrum")} className="absolute inset-0 size-full" />
        </div>

        {!!S.recipe.length && (
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="w-16 font-medium text-foreground">{t("harmonics")}</span>
              <div className="grid flex-1 grid-cols-8 text-center tabular">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <span key={n}>{n}</span>)}</div>
            </div>
            {S.recipe.map((r) => (
              <div key={r.id} className="flex items-end gap-3 py-0.5">
                <span className="w-16 truncate text-xs" title={r.name}>{r.id === "ora" ? t("live") : r.id}</span>
                <div className="grid h-8 flex-1 grid-cols-8 items-end gap-1">
                  {r.amps.map((a, i) => (
                    <i key={i} title={fmtIt(a, 2)} className="block rounded-t-[2px]" style={{ height: `${Math.round((Math.min(1.15, Math.max(0, a)) * 100) / 1.15)}%`, background: r.id === "ora" ? LIVE : r.color, minHeight: 2 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ard && (
        <Collapsible open={advOpen} onOpenChange={setAdvOpen} className="border-t">
          <CollapsibleTrigger className="flex h-10 w-full items-center gap-2 px-4 text-sm font-medium outline-none hover:bg-foreground/[0.02] focus-visible:bg-foreground/[0.04]">
            <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform duration-200 ease-out", !advOpen && "-rotate-90")} /> {t("measured")}
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground">{t("quantity")}</Label>
              <Select value={S.qty} onValueChange={(v) => v && engine.setQty(v as "V" | "I")} items={{ V: t("voltage"), I: t("current") }}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="V">{t("voltage")}</SelectItem><SelectItem value="I">{t("current")}</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground"><i>V</i>₀ (V)</Label>
              <Input key={`v0-${S.V0}`} type="number" step="0.01" defaultValue={S.V0} onBlur={(e) => engine.setV0(parseFloat(e.target.value))} className="h-8" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground"><i>R</i> (Ω)</Label>
              <Input key={`r-${S.R}`} type="number" step="any" min="0.001" defaultValue={S.R} onBlur={(e) => engine.setR(parseFloat(e.target.value))} className="h-8" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => void engine.sendWaves()}><Send /> {t("sendWaves")}</Button>
        <Button variant="ghost" size="sm" onClick={() => void engine.sendSpectra()}>{t("sendSpectra")}</Button>
      </div>
    </Card>
  );
}
