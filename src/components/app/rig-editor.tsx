"use client";
// I componenti del progetto, con pin, intervallo e opzioni. Funziona allo stesso modo per gli
// esperimenti pronti (le modifiche diventano una versione personale, ripristinabile) e per i
// progetti dell'utente.

import { useState } from "react";
import { Check, ChevronDown, CopyPlus, Plus, RotateCcw, Search, Trash, TriangleExclamationPoint, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SENSORS, COMPONENTS, COMPONENT_TAGS, COMPONENT_KEYWORDS, TAGS, MAX_ARDUINO, pinName, pinsFor, type ComponentTag, type SensorType } from "@/lib/sensors/catalog";
import { validateRig, usedPins, sensorLabel, inputsOf, outputsOf, type SensorInstance } from "@/lib/sensors/rig";
import { QUANTITIES } from "@/lib/sensors/quantities";
import type { Param } from "@/lib/sensors/types";
import {
  useLab, labInfo, updateSensor, addSensor, removeSensor, resetPreset, renameRig, newRig, deleteRig, testOutputs, openGuide,
} from "@/lib/lab-store";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { isPhoneWidth } from "@/lib/prefs";
import { ComponentThumb } from "./board-diagram";

function OptionField({ p, value, onChange, id, disabled }: { p: Param; value: number | string; onChange: (v: number | string) => void; id: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value ?? ""));
  if (p.type === "select") {
    return (
      <Select value={String(value)} onValueChange={(v) => v != null && onChange(String(v))} items={Object.fromEntries(p.options!)} disabled={disabled}>
        <SelectTrigger id={id} size="sm" className="w-full min-w-0"><SelectValue className="truncate" /></SelectTrigger>
        <SelectContent>{p.options!.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  const commit = () => {
    if (p.type === "text") { if (text !== value) onChange(text); return; }
    const v = parseFloat(text.replace(",", "."));
    if (!Number.isFinite(v)) { setText(String(value)); return; }
    if (v !== value) onChange(v);
  };
  return (
    <Input id={id} type={p.type === "text" ? "text" : "number"} inputMode={p.type === "text" ? "text" : "decimal"} step={p.step ?? "any"} min={p.min}
      value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      className="h-8 tabular" />
  );
}

function Field({ label, unit, htmlFor, children }: { label: string; unit?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs leading-snug font-medium text-muted-foreground">{label}{unit ? <span className="font-normal"> ({unit})</span> : null}</Label>
      {children}
    </div>
  );
}

function SensorCard({ s, defaultOpen }: { s: SensorInstance; defaultOpen: boolean }) {
  const rig = useLab((st) => st.rig);
  const running = useLab((st) => st.running);
  const [open, setOpen] = useState(defaultOpen);
  const [adv, setAdv] = useState(false);
  const def = SENSORS[s.type];
  const taken = usedPins(rig, s.id);
  const issues = validateRig(rig).filter((i) => i.sensorId === s.id);
  const basic = def.options.filter((o) => !o.advanced && !(s.type === "analog" && s.options.calibrate !== "yes" && ["sym", "unit", "k", "q"].includes(o.key)));
  const advanced = def.options.filter((o) => o.advanced);
  const minI = def.minInterval?.(s.options) ?? def.interval.min;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-lg border bg-card", issues.some((i) => i.level === "error") && "border-destructive/50")}>
      <div className="flex items-center gap-2.5 p-2.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted p-1"><ComponentThumb type={s.type} options={s.options} className="size-full" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{sensorLabel(s)}</span>
            <span className="flex flex-wrap gap-1 pt-0.5">
              {def.pins.map((p) => <span key={p.key} className="rounded bg-muted px-1.5 font-mono text-[0.65rem] font-semibold">{p.role.split(" ")[0]} {pinName(s.pins[p.key])}</span>)}
              {!def.output && !def.events && <span className="rounded px-1 text-[0.65rem] text-muted-foreground tabular">ogni {s.interval >= 1000 ? `${s.interval / 1000} s` : `${s.interval} ms`}</span>}
              {def.events && <span className="rounded px-1 text-[0.65rem] text-muted-foreground">a ogni passaggio</span>}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        </CollapsibleTrigger>
        <Button size="icon-sm" variant="ghost" aria-label={`Togli ${sensorLabel(s)}`} disabled={running} className="text-muted-foreground hover:text-destructive"
          onClick={async () => { if (await confirm({ title: `Togliere «${sensorLabel(s)}» dal progetto?`, action: "Togli", destructive: true })) removeSensor(s.id); }}>
          <Trash />
        </Button>
      </div>
      <CollapsibleContent className="flex flex-col gap-3 border-t p-3">
        {issues.map((i, k) => <p key={k} className={cn("text-xs", i.level === "error" ? "text-destructive" : "text-warning")}>{i.text}</p>)}
        <p className="text-xs text-muted-foreground">{def.description}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" htmlFor={`${s.id}-label`}>
            <OptionField id={`${s.id}-label`} p={{ key: "label", label: "Nome", type: "text", value: "" }} value={s.label ?? def.short} disabled={running}
              onChange={(v) => updateSensor(s.id, { label: String(v) })} />
          </Field>
          {!def.output && !def.events && (
            <Field label="Una lettura ogni" unit="ms" htmlFor={`${s.id}-int`}>
              <OptionField key={`int-${s.interval}`} id={`${s.id}-int`} p={{ key: "interval", label: "", value: s.interval, min: minI, step: 10 }} value={s.interval} disabled={running}
                onChange={(v) => updateSensor(s.id, { interval: Math.max(minI, Number(v)) })} />
            </Field>
          )}
          {def.pins.map((spec) => (
            <Field key={spec.key} label={spec.role} htmlFor={`${s.id}-pin-${spec.key}`}>
              <Select value={String(s.pins[spec.key])} disabled={running}
                onValueChange={(v) => v != null && updateSensor(s.id, { pins: { ...s.pins, [spec.key]: Number(v) } })}
                items={Object.fromEntries(pinsFor(spec.kind).map((p) => [String(p), pinName(p)]))}>
                <SelectTrigger id={`${s.id}-pin-${spec.key}`} size="sm" className="w-full min-w-0 font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pinsFor(spec.kind).map((p) => {
                    const u0 = taken.get(p);
                    const shared = !!u0 && !!spec.bus && u0.bus === spec.bus;     // stesso filo I2C: si può
                    const u = shared ? undefined : u0;
                    const self = Object.entries(s.pins).find(([k, v]) => k !== spec.key && v === p);
                    return (
                      <SelectItem key={p} value={String(p)} disabled={!!u || !!self}>
                        <span className="font-mono">{pinName(p)}</span>
                        {(u || self) && <span className="ml-2 text-xs text-muted-foreground">{u ? sensorLabel(u.sensor) : "già usato qui"}</span>}
                        {shared && <span className="ml-2 text-xs text-muted-foreground">in comune con {sensorLabel(u0!.sensor)}</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {spec.note && <span className="text-[0.7rem] text-muted-foreground">{spec.note}</span>}
            </Field>
          ))}
          {basic.map((p) => (
            <Field key={p.key} label={p.label} unit={p.unit} htmlFor={`${s.id}-${p.key}`}>
              <OptionField key={`${p.key}-${s.options[p.key]}`} id={`${s.id}-${p.key}`} p={p} value={s.options[p.key]} disabled={running}
                onChange={(v) => updateSensor(s.id, { options: { [p.key]: v } })} />
            </Field>
          ))}
        </div>
        {!!advanced.length && (
          <Collapsible open={adv} onOpenChange={setAdv}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold">
              <ChevronDown className={cn("size-3.5 transition-transform", !adv && "-rotate-90")} /> Opzioni avanzate
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 pt-3 sm:grid-cols-2">
              {advanced.map((p) => (
                <Field key={p.key} label={p.label} unit={p.unit} htmlFor={`${s.id}-${p.key}`}>
                  <OptionField key={`${p.key}-${s.options[p.key]}`} id={`${s.id}-${p.key}`} p={p} value={s.options[p.key]} disabled={running}
                    onChange={(v) => updateSensor(s.id, { options: { [p.key]: v } })} />
                </Field>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function PickerCard({ type, count, disabled, why, onPick }: { type: SensorType; count: number; disabled: boolean; why?: string; onPick: () => void }) {
  const def = SENSORS[type];
  return (
    <button type="button" disabled={disabled} onClick={onPick}
      className="group relative flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:border-foreground/25 hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50">
      <span className="grid size-16 shrink-0 place-items-center rounded-md bg-muted p-1.5 transition-transform group-enabled:group-hover:scale-105">
        <ComponentThumb type={type} className="size-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block pr-6 text-sm leading-snug font-semibold">{def.title}</span>
        <span className="block text-xs text-muted-foreground">{def.measures}</span>
        <span className="mt-1 block text-[0.7rem] text-muted-foreground">
          {disabled && why ? why : def.pins.map((p) => `${p.role.split(" ")[0]} (${p.kind === "analog" ? "A0…A5" : "pin digitale"})`).join(" · ")}
        </span>
      </span>
      {count > 0 && (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-foreground px-1.5 py-0.5 text-[0.65rem] font-semibold text-background" title="Già nel progetto">
          <Check className="size-3" />{count > 1 ? count : null}
        </span>
      )}
    </button>
  );
}

/** Il catalogo dei componenti: sensori, display, LED e cicalino, tutti insieme; si cerca e si filtra. */
export function ComponentPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rig = useLab((s) => s.rig);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<ComponentTag | "all">("all");
  const nArduino = inputsOf(rig).length;
  const count = (t: SensorType) => rig.sensors.filter((s) => s.type === t).length;
  const state = (t: SensorType): [boolean, string?] => {
    const def = SENSORS[t];
    if (count(t) >= def.max) return [true, def.max === 1 ? "già nel progetto (massimo uno)" : `al massimo ${def.max}`];
    if (!def.output && nArduino >= MAX_ARDUINO) return [true, `Arduino legge al massimo ${MAX_ARDUINO} sensori`];
    return [false];
  };
  const q = fold(query.trim());
  const list = COMPONENTS.filter((t) => {
    if (tag !== "all" && !COMPONENT_TAGS[t].includes(tag)) return false;
    if (!q) return true;
    const d = SENSORS[t];
    const hay = fold([d.title, d.short, d.measures, d.description, COMPONENT_KEYWORDS[t], ...COMPONENT_TAGS[t].map((k) => TAGS.find(([id]) => id === k)?.[1] ?? "")].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  const pick = (t: SensorType) => { addSensor(t); onOpenChange(false); };
  const change = (o: boolean) => { onOpenChange(o); if (!o) { setQuery(""); setTag("all"); } };
  const chip = (id: ComponentTag | "all", label: string) => (
    <button key={id} type="button" onClick={() => setTag(id)} aria-pressed={tag === id}
      className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        tag === id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {label}
    </button>
  );
  return (
    <Dialog open={open} onOpenChange={change}>
      {/* un solo contenitore che scorre (con l'intestazione fissa in alto): su iPhone gli elenchi
          annidati in una finestra fissa non sempre scorrono, e qui si scorre anche dalla ricerca */}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[min(46rem,90dvh)] sm:max-w-2xl">
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-popover px-4 pt-4 pb-3">
            <DialogHeader className="pr-8">
              <DialogTitle>Aggiungi un componente</DialogTitle>
              <DialogDescription>Sensori, display, LED e cicalino. I pin si scelgono dopo l&apos;aggiunta.</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus={!isPhoneWidth()} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca: temperatura, distanza, display…" aria-label="Cerca un componente" className="h-9 pr-8 pl-8" />
              {query && (
                <button type="button" aria-label="Cancella la ricerca" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
              )}
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:flex-wrap" role="group" aria-label="Filtra per tipo">
              {chip("all", "Tutti")}
              {TAGS.map(([id, label]) => chip(id, label))}
            </div>
          </div>
          <div className="p-4">
            {list.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((t) => { const [d, why] = state(t); return <PickerCard key={t} type={t} count={count(t)} disabled={d} why={why} onPick={() => pick(t)} />; })}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Nessun componente{q ? <> per «{query.trim()}»</> : null}{tag !== "all" ? " in questa categoria" : ""}.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Massimo {MAX_ARDUINO} sensori, ognuno con il suo intervallo. Display, LED e cicalino non contano.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RigEditor() {
  const rig = useLab((s) => s.rig);
  const modified = useLab((s) => s.modified);
  const running = useLab((s) => s.running);
  const labId = useLab((s) => s.labId);
  const [picker, setPicker] = useState(false);
  const linked = useLab((s) => s.ready && !!s.linkKind);
  const inputs = inputsOf(rig), outs = outputsOf(rig);
  const info = labInfo(labId);
  const issues = validateRig(rig).filter((i) => !i.sensorId);
  const custom = info.kind === "custom";

  return (
    <div className="flex flex-col gap-3">
      {custom ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="rig-name" className="text-xs text-muted-foreground">Nome del progetto</Label>
            <Input key={rig.id} id="rig-name" defaultValue={rig.name} onBlur={(e) => renameRig(e.target.value)} className="h-8" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="mr-auto">{modified ? <>Versione personale di «{info.title}»</> : <>Componenti di «{info.title}»</>}</span>
          {modified && <Button size="xs" variant="outline" disabled={running} onClick={resetPreset}><RotateCcw /> Ripristina</Button>}
          <Button size="xs" variant="outline" disabled={running} onClick={() => newRig({ copy: true })} title="Crea un tuo progetto con questi componenti"><CopyPlus /> Copia come progetto</Button>
        </div>
      )}

      {issues.map((i, k) => (
        <p key={k} className={cn("flex gap-1.5 rounded-md px-2.5 py-2 text-xs", i.level === "error" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>
          <TriangleExclamationPoint className="mt-px size-3.5 shrink-0" />{i.text}
        </p>
      ))}

      <div className="flex flex-col gap-2">
        {rig.sensors.map((s) => <SensorCard key={s.id} s={s} defaultOpen={rig.sensors.length === 1 || custom} />)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={running} onClick={() => setPicker(true)} className="flex-1 border-dashed"><Plus /> Aggiungi un componente</Button>
        {!!outs.length && (
          <Button variant="ghost" disabled={running || !linked} onClick={() => void testOutputs()} title={linked ? "Accende il LED, suona il cicalino e scrive sul display" : "Collega prima Arduino"}>Prova display, LED e cicalino</Button>
        )}
      </div>
      {!rig.sensors.length && <p className="text-center text-xs text-muted-foreground">Nessun componente. Aggiungi quelli che colleghi ad Arduino.</p>}
      {!!inputs.length && !outs.length && (
        <p className="text-xs text-muted-foreground">Facoltativo: un display, un LED RGB o un cicalino mostrano se Arduino è pronto o sta misurando. <button type="button" className="underline underline-offset-2" onClick={() => openGuide("outputs")}>Come funzionano</button></p>
      )}
      <ComponentPicker open={picker} onOpenChange={setPicker} />
      {custom && (
        <Button variant="ghost" size="sm" disabled={running} className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={async () => { if (await confirm({ title: `Eliminare il progetto «${rig.name}»?`, description: "Le misure già fatte restano nel Quaderno.", action: "Elimina", destructive: true })) deleteRig(rig.id); }}>
          <Trash /> Elimina il progetto
        </Button>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Grandezze misurate</summary>
        <p className="pt-1.5">{inputs.map((s) => `${sensorLabel(s)}: ${SENSORS[s.type].quantities(s.options).filter((q) => !q.hidden && !q.raw).map((q) => q.sym ?? QUANTITIES[q.key]?.sym ?? q.key).join(", ")}`).join(" · ") || "—"}</p>
      </details>
    </div>
  );
}
