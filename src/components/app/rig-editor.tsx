"use client";
// Il montaggio: i sensori collegati, con pin, ritmo e opzioni. Funziona allo stesso modo per gli
// esperimenti pronti (le modifiche diventano una versione personale, ripristinabile) e per i
// montaggi liberi.

import { useState } from "react";
import { ChevronDown, CopyPlus, Plus, RotateCcw, Trash, TriangleExclamationPoint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SENSORS, ARDUINO_SENSORS, MAX_ARDUINO, pinName, pinsFor, type SensorType } from "@/lib/sensors/catalog";
import { validateRig, usedPins, sensorLabel, type SensorInstance } from "@/lib/sensors/rig";
import { QUANTITIES } from "@/lib/sensors/quantities";
import type { Param } from "@/lib/sensors/types";
import {
  useLab, labInfo, updateSensor, addSensor, removeSensor, resetPreset, renameRig, newRig, deleteRig,
} from "@/lib/lab-store";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { toneBg } from "./tone";

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
  const Icon = def.icon;
  const taken = usedPins(rig, s.id);
  const issues = validateRig(rig).filter((i) => i.sensorId === s.id);
  const basic = def.options.filter((o) => !o.advanced && !(s.type === "analog" && s.options.calibrate !== "yes" && ["sym", "unit", "k", "q"].includes(o.key)));
  const advanced = def.options.filter((o) => o.advanced);
  const minI = def.minInterval?.(s.options) ?? def.interval.min;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-lg border bg-card", issues.some((i) => i.level === "error") && "border-destructive/50")}>
      <div className="flex items-center gap-2.5 p-2.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[def.tone])}><Icon className="size-4.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{sensorLabel(s)}</span>
            <span className="flex flex-wrap gap-1 pt-0.5">
              {def.pins.map((p) => <span key={p.key} className="rounded bg-muted px-1.5 font-mono text-[0.65rem] font-semibold">{p.role.split(" ")[0]} {pinName(s.pins[p.key])}</span>)}
              <span className="rounded px-1 text-[0.65rem] text-muted-foreground tabular">ogni {s.interval >= 1000 ? `${s.interval / 1000} s` : `${s.interval} ms`}</span>
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        </CollapsibleTrigger>
        <Button size="icon-sm" variant="ghost" aria-label={`Togli ${sensorLabel(s)}`} disabled={running} className="text-muted-foreground hover:text-destructive"
          onClick={async () => { if (await confirm({ title: `Togliere «${sensorLabel(s)}» dal montaggio?`, action: "Togli", destructive: true })) removeSensor(s.id); }}>
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
          <Field label="Una lettura ogni" unit="ms" htmlFor={`${s.id}-int`}>
            <OptionField key={`int-${s.interval}`} id={`${s.id}-int`} p={{ key: "interval", label: "", value: s.interval, min: minI, step: 10 }} value={s.interval} disabled={running}
              onChange={(v) => updateSensor(s.id, { interval: Math.max(minI, Number(v)) })} />
          </Field>
          {def.pins.map((spec) => (
            <Field key={spec.key} label={spec.role} htmlFor={`${s.id}-pin-${spec.key}`}>
              <Select value={String(s.pins[spec.key])} disabled={running}
                onValueChange={(v) => v != null && updateSensor(s.id, { pins: { ...s.pins, [spec.key]: Number(v) } })}
                items={Object.fromEntries(pinsFor(spec.kind).map((p) => [String(p), pinName(p)]))}>
                <SelectTrigger id={`${s.id}-pin-${spec.key}`} size="sm" className="w-full min-w-0 font-mono"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pinsFor(spec.kind).map((p) => {
                    const u = taken.get(p);
                    const self = Object.entries(s.pins).find(([k, v]) => k !== spec.key && v === p);
                    return (
                      <SelectItem key={p} value={String(p)} disabled={!!u || !!self}>
                        <span className="font-mono">{pinName(p)}</span>
                        {(u || self) && <span className="ml-2 text-xs text-muted-foreground">{u ? sensorLabel(u.sensor) : "già usato qui"}</span>}
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

function PickerCard({ type, disabled, why, onPick }: { type: SensorType; disabled: boolean; why?: string; onPick: () => void }) {
  const def = SENSORS[type];
  const Icon = def.icon;
  return (
    <button type="button" disabled={disabled} onClick={onPick}
      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[def.tone])}><Icon className="size-5" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{def.title}</span>
        <span className="block text-xs text-muted-foreground">{def.measures}</span>
        <span className="mt-1 block text-[0.7rem] text-muted-foreground">
          {disabled && why ? why : def.pins.map((p) => `${p.role.split(" ")[0]} (${p.kind === "analog" ? "A0…A5" : "pin digitale"})`).join(" · ")}
        </span>
      </span>
    </button>
  );
}

export function SensorPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rig = useLab((s) => s.rig);
  const nArduino = rig.sensors.length;
  const count = (t: SensorType) => rig.sensors.filter((s) => s.type === t).length;
  const state = (t: SensorType): [boolean, string?] => {
    const def = SENSORS[t];
    if (count(t) >= def.max) return [true, def.max === 1 ? "già nel montaggio (ce ne può essere uno solo)" : `al massimo ${def.max}`];
    if (nArduino >= MAX_ARDUINO) return [true, `Arduino legge al massimo ${MAX_ARDUINO} sensori`];
    return [false];
  };
  const pick = (t: SensorType) => { addSensor(t); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aggiungi un sensore</DialogTitle>
          <DialogDescription>Sensori da collegare ad Arduino: il firmware MosaicusNeo li legge tutti, fino a {MAX_ARDUINO} insieme, ognuno con il suo ritmo. I pin si scelgono dopo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {ARDUINO_SENSORS.map((t) => { const [d, why] = state(t); return <PickerCard key={t} type={t} disabled={d} why={why} onPick={() => pick(t)} />; })}
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
  const info = labInfo(labId);
  const issues = validateRig(rig).filter((i) => !i.sensorId);
  const custom = info.kind === "custom";

  return (
    <div className="flex flex-col gap-3">
      {custom ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="rig-name" className="text-xs text-muted-foreground">Nome del montaggio</Label>
            <Input key={rig.id} id="rig-name" defaultValue={rig.name} onBlur={(e) => renameRig(e.target.value)} className="h-8" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="mr-auto">{modified ? <>Versione personale di «{info.title}»</> : <>Sensori di «{info.title}»</>}</span>
          {modified && <Button size="xs" variant="outline" disabled={running} onClick={resetPreset}><RotateCcw /> Ripristina</Button>}
          <Button size="xs" variant="outline" disabled={running} onClick={() => newRig({ copy: true })} title="Crea un montaggio libero a partire da questo"><CopyPlus /> Copia come montaggio</Button>
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
      <Button variant="outline" disabled={running} onClick={() => setPicker(true)} className="border-dashed"><Plus /> Aggiungi un sensore</Button>
      {!rig.sensors.length && <p className="text-center text-xs text-muted-foreground">Scegli i sensori che hai collegato ad Arduino: l&apos;app ti mostra come collegarli e li legge tutti insieme.</p>}
      <SensorPicker open={picker} onOpenChange={setPicker} />
      {custom && (
        <Button variant="ghost" size="sm" disabled={running} className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={async () => { if (await confirm({ title: `Eliminare il montaggio «${rig.name}»?`, description: "Le misure già fatte restano nel Quaderno.", action: "Elimina", destructive: true })) deleteRig(rig.id); }}>
          <Trash /> Elimina questo montaggio
        </Button>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Grandezze misurate</summary>
        <p className="pt-1.5">{rig.sensors.map((s) => `${sensorLabel(s)}: ${SENSORS[s.type].quantities(s.options).filter((q) => !q.hidden && !q.raw).map((q) => q.sym ?? QUANTITIES[q.key]?.sym ?? q.key).join(", ")}`).join(" · ") || "—"}</p>
      </details>
    </div>
  );
}
