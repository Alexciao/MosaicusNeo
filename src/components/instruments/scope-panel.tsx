"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ChevronDown, Crosshair, Eye, EyeOff, Mic, Music, Pause, Play, Send, Snowflake, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createScopeEngine, DT_STEPS, EXAMPLES, N_ARD, WIN_STEPS, LIVE, slotColor, type Circuit } from "@/lib/mosaicus/scope-engine";
import { fmtIt } from "@/lib/mosaicus/screen.js";
import { sig, noteOf } from "@/lib/mosaicus/dsp.js";
import type { Instrument } from "@/lib/sensors/presets";
import { instrumentApi, registerInstrument } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

const segItem = "aria-pressed:bg-primary aria-pressed:text-primary-foreground";

export function Segmented<T extends string>({ value, onChange, items, label, className }: { value: T; onChange: (v: T) => void; items: [T, React.ReactNode, string?][]; label: string; className?: string }) {
  return (
    <ToggleGroup aria-label={label} variant="outline" size="sm" spacing={0} value={[value]} onValueChange={(v) => { if (v[0] != null) onChange(v[0] as T); }} className={className}>
      {items.map(([id, content, title]) => <ToggleGroupItem key={id} value={id} title={title} className={segItem}>{content}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

export function ScopePanel({ exp }: { exp: Instrument }) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const engine = useMemo(() => createScopeEngine({ ...instrumentApi(exp), toast: (m: string) => toast(m) }, () => bump()), [exp]);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const { resolvedTheme } = useTheme();
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
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 md:flex-row md:flex-wrap md:items-center">
        {ard ? (
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Circuito</Label>
            <Select value={S.circuit} onValueChange={(v) => v && engine.setCircuit(v as Circuit)} items={{ mic: "Microfono del kit", coil: "Bobina e magnete", lamp: "Luce di una lampada" }}>
              <SelectTrigger size="sm" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mic">Microfono del kit</SelectItem>
                <SelectItem value="coil">Bobina e magnete</SelectItem>
                <SelectItem value="lamp">Luce di una lampada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Segmented label="Sorgente del segnale" value={(S.source ?? "") as "mic" | "ex" | ""} onChange={(v) => v && void engine.selectSource(v)}
            items={[["mic", <><Mic /> Microfono</>], ["ex", <><Music /> Esempi</>]]} />
        )}
        <div className="flex flex-wrap gap-2 md:ml-auto">
          {S.readouts.map(([l, v, u]) => (
            <div key={l} className="min-w-24 rounded-lg border bg-muted/40 px-3 py-1.5">
              <p className="text-[0.7rem] font-medium text-muted-foreground">{l}</p>
              <p className="tabular leading-tight"><b className="text-lg font-bold">{v}</b><span className="ml-1 text-xs text-muted-foreground">{u}</span></p>
            </div>
          ))}
        </div>
      </Card>

      {!ard && S.source === "ex" && (
        <Card className="flex flex-row flex-wrap items-center gap-2 p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">La₃ = 220 Hz</span>
          {[...EXAMPLES, ["beats", "Battimenti 440 + 443 Hz"] as [string, string]].map(([id, l]) => (
            <Button key={id} size="sm" variant={S.example === id && !S.paused ? "default" : "outline"} onClick={() => engine.playExample(id)}>{l}</Button>
          ))}
          {genOn && <span className="text-xs font-medium text-brand">＋ Synth acceso</span>}
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" variant={running ? "destructive" : "default"} onClick={() => void engine.run()} className="min-w-28">
            {running ? (ard ? <><Square className="fill-current" /> Ferma</> : <><Pause /> Pausa</>) : <><Play className="fill-current" /> Avvia</>}
          </Button>
          <Button size="lg" variant="outline" disabled={S.slots.length >= 3 || !S.live || !S.showLive} onClick={engine.freeze} title="Ferma e conserva la traccia (fino a 3)">
            <Snowflake /> {S.slots.length >= 3 ? "Tre tracce: togline una" : "Congela"}
          </Button>
          <div className="flex flex-wrap gap-2">
            {S.slots.map((s) => (
              <div key={s.id} className={cn("flex items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2", !s.visible && "opacity-50")} style={{ borderColor: slotColor(s.id) }}>
                <button type="button" onClick={() => engine.toggleSlot(s.id)} title="Mostra/nascondi" className="flex items-center gap-1 text-sm font-bold" style={{ color: slotColor(s.id) === "#ffffff" || slotColor(s.id) === "#fff" ? undefined : slotColor(s.id) }}>
                  {s.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{s.id}
                </button>
                <Input defaultValue={s.name} onBlur={(e) => engine.renameSlot(s.id, e.target.value)} aria-label={`Nome della traccia ${s.id}`} className="h-7 w-24 text-xs" />
                <small className="tabular text-xs text-muted-foreground">
                  {Number.isFinite(s.f) ? `${fmtIt(sig(s.f, 4), 1)} Hz${noteOf(s.f) && !ard ? ` · ${noteOf(s.f)?.label}` : ""}` : "—"}
                </small>
                <Button size="icon-xs" variant="ghost" onClick={() => engine.removeSlot(s.id)} aria-label="Elimina traccia"><X /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="relative aspect-[16/9] max-h-[60vh] w-full overflow-hidden rounded-lg bg-screen sm:aspect-[2/1]">
          <canvas ref={waveRef} aria-label="Forma d'onda" className="absolute inset-0 size-full" />
          {S.screenMsg && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-white/80">{S.screenMsg}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {ard ? (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">⟷ finestra</Label>
                <Select value={String(S.dt)} onValueChange={(v) => v && engine.setDt(+v)} items={Object.fromEntries(DT_STEPS.map((d) => [String(d), `${fmtIt((d * N_ARD) / 1000, 1)} ms`]))}>
                  <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{DT_STEPS.map((d) => <SelectItem key={d} value={String(d)}>{fmtIt((d * N_ARD) / 1000, 1)} ms</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex min-w-56 items-center gap-3">
                <Label className="text-sm text-muted-foreground">trigger</Label>
                <Slider className="w-36 data-horizontal:w-36" min={0} max={5} step={0.01} value={S.level} onValueChange={(v) => engine.previewLevel(v as number)} onValueCommitted={() => engine.commitLevel()} aria-label="Livello del trigger" />
                <b className="tabular w-16 text-sm whitespace-nowrap">{fmtIt(S.level, 2)} V</b>
                <Button size="sm" variant="outline" onClick={engine.levelToMean} title="Trigger al valore medio del segnale"><Crosshair /> media</Button>
              </div>
              <Segmented label="Modo di acquisizione" value={S.single ? "1" : "0"} onChange={(v) => engine.setSingle(v === "1")} items={[["0", "continuo"], ["1", "singolo"]]} />
            </>
          ) : (
            <div className="flex min-w-60 items-center gap-3">
              <Label className="text-sm text-muted-foreground">⟷ finestra</Label>
              <Slider className="w-40 data-horizontal:w-40" min={0} max={WIN_STEPS.length - 1} step={1} value={Math.max(0, WIN_STEPS.indexOf(S.winMs))} onValueChange={(v) => engine.setWin(v as number)} aria-label="Finestra dei tempi" />
              <b className="tabular w-14 text-sm whitespace-nowrap">{S.winMs} ms</b>
            </div>
          )}
          <Segmented label="Trigger" value={String(S.edge)} onChange={(v) => engine.setEdge(+v)}
            items={[["1", "↗", "Trigger sul fronte di salita"], ["-1", "↘", "Trigger sul fronte di discesa"], ["0", "⟿", "Senza trigger"]]} />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={S.same} onCheckedChange={(v) => engine.setSame(!!v)} /> stessa altezza
          </label>
        </div>

        <div className="relative aspect-[4/1] min-h-32 w-full overflow-hidden rounded-lg bg-screen">
          <canvas ref={specRef} aria-label="Spettro" className="absolute inset-0 size-full" />
        </div>

        {!!S.recipe.length && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
              <b className="w-16 text-foreground">Armoniche</b>
              <div className="grid flex-1 grid-cols-8 text-center">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <i key={n} className="not-italic">{n}</i>)}</div>
            </div>
            {S.recipe.map((r) => (
              <div key={r.id} className="flex items-end gap-3 py-0.5">
                <b className="w-16 truncate text-xs" title={r.name}>{r.id === "ora" ? "dal vivo" : r.id}</b>
                <div className="grid h-8 flex-1 grid-cols-8 items-end gap-1">
                  {r.amps.map((a, i) => (
                    <i key={i} title={fmtIt(a, 2)} className="block rounded-t-sm" style={{ height: `${Math.round((Math.min(1.15, Math.max(0, a)) * 100) / 1.15)}%`, background: r.id === "ora" ? LIVE : r.color, minHeight: 2 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void engine.sendWaves()}><Send /> Invia le forme d&apos;onda a Elaborazione</Button>
          <Button variant="outline" onClick={() => void engine.sendSpectra()}>Invia gli spettri</Button>
        </div>

        {ard && (
          <Collapsible open={advOpen} onOpenChange={setAdvOpen} className="rounded-lg border">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold">
              <ChevronDown className={cn("size-4 transition-transform", !advOpen && "-rotate-90")} /> Grandezza misurata
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 border-t p-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Grandezza</Label>
                <Select value={S.qty} onValueChange={(v) => v && engine.setQty(v as "V" | "I")} items={{ V: "Tensione V − V₀", I: "Corrente I = (V − V₀)/R" }}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="V">Tensione V − V₀</SelectItem><SelectItem value="I">Corrente I = (V − V₀)/R</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">V₀ (V)</Label>
                <Input key={`v0-${S.V0}`} type="number" step="0.01" defaultValue={S.V0} onBlur={(e) => engine.setV0(parseFloat(e.target.value))} className="h-8" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">R (Ω)</Label>
                <Input key={`r-${S.R}`} type="number" step="any" min="0.001" defaultValue={S.R} onBlur={(e) => engine.setR(parseFloat(e.target.value))} className="h-8" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Card>
    </div>
  );
}
