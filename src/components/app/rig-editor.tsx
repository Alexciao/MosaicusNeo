"use client";
// I componenti del progetto, con pin, intervallo e opzioni. Funziona allo stesso modo per gli
// esperimenti pronti (le modifiche diventano una versione personale, ripristinabile) e per i
// progetti dell'utente.

import { useState } from "react";
import { Check, ChevronDown, CopyPlus, Plus, RotateCcw, Search, Trash, TriangleExclamationPoint, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SENSORS, COMPONENTS, COMPONENT_TAGS, COMPONENT_KEYWORDS, TAGS, GROUPS, MAX_ARDUINO, groupOf, isSlot, pinName, pinsFor, type ComponentGroup, type ComponentTag, type SensorType } from "@/lib/sensors/catalog";
import { validateRig, usedPins, sensorLabel, inputsOf, indicatorsOf, type SensorInstance } from "@/lib/sensors/rig";
import { QUANTITIES } from "@/lib/sensors/quantities";
import type { Param } from "@/lib/sensors/types";
import {
  useLab, labInfo, updateSensor, addSensor, checkAdd, removeSensor, pressSimButton, resetPreset, renameRig, newRig, deleteRig, testOutputs, openGuide,
} from "@/lib/lab-store";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { isPhoneWidth } from "@/lib/prefs";
import { intlLocale } from "@/i18n";
import { ComponentThumb } from "./board-diagram";
import { BluetoothHowTo } from "./wiring-diagram";
import { SdHowTo } from "./sd-controls";

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

/** Il pulsante: che cosa fa nei vari collegamenti; col simulatore si può «premere» da qui. */
function ButtonHint() {
  const t = useTranslations("rig.editor");
  const sim = useLab((s) => s.linkKind === "simulatore" && s.ready);
  const running = useLab((s) => s.running);
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-2.5 text-xs">
      <p>{t("buttonHint")}</p>
      {sim && <Button size="xs" variant="outline" className="self-start" onClick={pressSimButton}>{t("pressSim", { running: running ? "yes" : "no" })}</Button>}
    </div>
  );
}

function SensorCard({ s, defaultOpen }: { s: SensorInstance; defaultOpen: boolean }) {
  const t = useTranslations("rig.editor");
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
              {def.pins.map((p) => <span key={p.key} className="rounded bg-muted px-1.5 font-mono text-[0.65rem] font-semibold">{p.role.split(" ")[0]} {p.def <= 1 && p.fixed ? `D${p.def}` : pinName(s.pins[p.key])}</span>)}
              {isSlot(s.type) && !def.events && <span className="rounded px-1 text-[0.65rem] text-muted-foreground tabular">{t("every", { interval: s.interval >= 1000 ? `${(s.interval / 1000).toLocaleString(intlLocale)} s` : `${s.interval} ms` })}</span>}
              {def.events && <span className="rounded px-1 text-[0.65rem] text-muted-foreground">{t("events")}</span>}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        </CollapsibleTrigger>
        <Button size="icon-sm" variant="ghost" aria-label={t("removeNamed", { name: sensorLabel(s) })} disabled={running} className="text-muted-foreground hover:text-destructive"
          onClick={async () => { if (await confirm({ title: t("removeTitle", { name: sensorLabel(s) }), action: t("remove"), destructive: true })) removeSensor(s.id); }}>
          <Trash />
        </Button>
      </div>
      <CollapsibleContent className="flex flex-col gap-3 border-t p-3">
        {issues.map((i, k) => <p key={k} className={cn("text-xs", i.level === "error" ? "text-destructive" : "text-warning")}>{i.text}</p>)}
        <p className="text-xs text-muted-foreground">{def.description}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("name")} htmlFor={`${s.id}-label`}>
            <OptionField id={`${s.id}-label`} p={{ key: "label", label: t("name"), type: "text", value: "" }} value={s.label ?? def.short} disabled={running}
              onChange={(v) => updateSensor(s.id, { label: String(v) })} />
          </Field>
          {isSlot(s.type) && !def.events && (
            <Field label={t("interval")} unit="ms" htmlFor={`${s.id}-int`}>
              <OptionField key={`int-${s.interval}`} id={`${s.id}-int`} p={{ key: "interval", label: "", value: s.interval, min: minI, step: 10 }} value={s.interval} disabled={running}
                onChange={(v) => updateSensor(s.id, { interval: Math.max(minI, Number(v)) })} />
            </Field>
          )}
          {def.pins.filter((spec) => spec.fixed).length > 0 && (
            <Field label={t("fixedPins")} htmlFor={`${s.id}-pin-fixed`}>
              <p id={`${s.id}-pin-fixed`} className="flex flex-wrap gap-1 pt-1">
                {def.pins.filter((spec) => spec.fixed).map((spec) => <span key={spec.key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{spec.role.includes("D") ? spec.role : `${spec.role} ${pinName(spec.def)}`}</span>)}
              </p>
              {def.pins.find((spec) => spec.fixed && spec.note)?.note && <span className="text-[0.7rem] text-muted-foreground">{def.pins.find((spec) => spec.fixed && spec.note)!.note}</span>}
            </Field>
          )}
          {def.pins.filter((spec) => !spec.fixed).map((spec) => (
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
                        {(u || self) && <span className="ml-2 text-xs text-muted-foreground">{u ? sensorLabel(u.sensor) : t("usedHere")}</span>}
                        {shared && <span className="ml-2 text-xs text-muted-foreground">{t("sharedWith", { name: sensorLabel(u0!.sensor) })}</span>}
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
        {s.type === "sd" && <SdHowTo />}
        {s.type === "button" && <ButtonHint />}
        {(s.type === "hc06" || s.type === "ble") && <BluetoothHowTo kind={s.type} />}
        {!!advanced.length && (
          <Collapsible open={adv} onOpenChange={setAdv}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold">
              <ChevronDown className={cn("size-3.5 transition-transform", !adv && "-rotate-90")} /> {t("advanced")}
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

const fold = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function PickerCard({ type, count, disabled, why, onPick }: { type: SensorType; count: number; disabled: boolean; why?: string; onPick: () => void }) {
  const t = useTranslations("rig.editor");
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
          {disabled && why ? why : def.phone ? t("onPhone") : def.pins.map((p) => `${p.role.split(" ")[0]} (${p.kind === "analog" ? "A0…A5" : t("digitalPin")})`).join(" · ")}
        </span>
      </span>
      {count > 0 && (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-foreground px-1.5 py-0.5 text-[0.65rem] font-semibold text-background" title={t("alreadyIn")}>
          <Check className="size-3" />{count > 1 ? count : null}
        </span>
      )}
    </button>
  );
}

/**
 * Il catalogo dei componenti, diviso per che cosa fanno: sensori (gli ingressi), comandi, display
 * e LED (le uscite), memoria, Bluetooth, telefono. Tra i sensori si filtra anche per argomento;
 * la ricerca guarda in tutti i gruppi.
 */
export function ComponentPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("rig.editor");
  const rig = useLab((s) => s.rig);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ComponentGroup | "all">("all");
  const [tag, setTag] = useState<ComponentTag | "all">("all");
  const nArduino = inputsOf(rig).length;
  const count = (type: SensorType) => rig.sensors.filter((s) => s.type === type).length;
  const state = (type: SensorType): [boolean, string?] => {
    const def = SENSORS[type];
    if (count(type) >= def.max) return [true, def.max === 1 ? t("maxOne") : t("maxN", { n: def.max })];
    if (def.phone && rig.sensors.some((s) => !SENSORS[s.type].phone)) return [true, t("notWithArduino")];
    if (!def.phone && rig.sensors.some((s) => SENSORS[s.type].phone)) return [true, t("notWithPhone")];
    if (def.link && rig.sensors.some((s) => SENSORS[s.type].link)) return [true, t("oneBt")];
    if (isSlot(type) && nArduino >= MAX_ARDUINO) return [true, t("maxSensors", { n: MAX_ARDUINO })];
    // pin, bus I2C e posto sulla breadboard: se non c'è modo di montarlo davvero, non si aggiunge
    const plan = checkAdd(rig.sensors, type);
    if (!plan.ok) return [true, plan.error];
    return [false];
  };
  const q = fold(query.trim());
  const groupLabel = (g: ComponentGroup) => GROUPS.find(([id]) => id === g)?.[1] ?? "";
  const list = COMPONENTS.filter((type) => {
    const g = groupOf(type);
    if (q) {
      const d = SENSORS[type];
      const hay = fold([d.title, d.short, d.measures, d.description, COMPONENT_KEYWORDS[type], groupLabel(g), ...COMPONENT_TAGS[type].map((k) => TAGS.find(([id]) => id === k)?.[1] ?? "")].join(" "));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (group !== "all" && g !== group) return false;
    // «Tutti» senza ricerca: i componenti di Arduino; il telefono ha il suo gruppo
    if (group === "all" && !q && g === "phone") return false;
    if (group === "sensor" && tag !== "all" && !COMPONENT_TAGS[type].includes(tag)) return false;
    return true;
  });
  const sections = GROUPS.map(([g, label, hint]) => ({ g, label, hint, items: list.filter((type) => groupOf(type) === g) })).filter((s) => s.items.length);
  const pick = (type: SensorType) => { addSensor(type); onOpenChange(false); };
  const change = (o: boolean) => { onOpenChange(o); if (!o) { setQuery(""); setGroup("all"); setTag("all"); } };
  const chip = (id: string, label: string, on: boolean, onClick: () => void, small = false) => (
    <button key={id} type="button" onClick={onClick} aria-pressed={on}
      className={cn("shrink-0 rounded-full border font-medium transition-colors", small ? "px-2 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-xs",
        on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {label}
    </button>
  );
  const cards = (items: SensorType[]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((type) => { const [d, why] = state(type); return <PickerCard key={type} type={type} count={count(type)} disabled={d} why={why} onPick={() => pick(type)} />; })}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={change}>
      {/* un solo contenitore che scorre (con l'intestazione fissa in alto): su iPhone gli elenchi
          annidati in una finestra fissa non sempre scorrono, e qui si scorre anche dalla ricerca */}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[min(46rem,90dvh)] sm:max-w-2xl">
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-popover px-4 pt-4 pb-3">
            <DialogHeader className="pr-8">
              <DialogTitle>{t("pickerTitle")}</DialogTitle>
              <DialogDescription>{t("pickerDescription")}</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus={!isPhoneWidth()} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchAria")} className="h-9 pr-8 pl-8" />
              {query && (
                <button type="button" aria-label={t("clearSearch")} onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
              )}
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:flex-wrap" role="group" aria-label={t("groupAria")}>
              {chip("all", t("all"), group === "all", () => setGroup("all"))}
              {GROUPS.map(([id, label]) => chip(id, label, group === id, () => { setGroup(id); setTag("all"); }))}
            </div>
            {group === "sensor" && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:flex-wrap" role="group" aria-label={t("tagAria")}>
                {chip("t-all", t("anyTag"), tag === "all", () => setTag("all"), true)}
                {TAGS.map(([id, label]) => chip(`t-${id}`, label, tag === id, () => setTag(id), true))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4 p-4">
            {sections.length ? (
              group === "all" || q
                ? sections.map((s) => (
                  <section key={s.g} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold">{s.label} <span className="font-normal text-muted-foreground">· {s.hint}</span></h3>
                    {cards(s.items)}
                  </section>
                ))
                : <><p className="-mb-1 text-xs text-muted-foreground">{GROUPS.find(([id]) => id === group)?.[2]}.</p>{cards(list)}</>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("noneFound", { hasQuery: q ? "yes" : "no", query: query.trim(), inGroup: group !== "all" ? "yes" : "no" })}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("maxNote", { n: MAX_ARDUINO })}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RigEditor() {
  const t = useTranslations("rig.editor");
  const rig = useLab((s) => s.rig);
  const modified = useLab((s) => s.modified);
  const running = useLab((s) => s.running);
  const labId = useLab((s) => s.labId);
  const [picker, setPicker] = useState(false);
  const linked = useLab((s) => s.ready && !!s.linkKind);
  const inputs = inputsOf(rig), outs = indicatorsOf(rig);
  const info = labInfo(labId);
  const issues = validateRig(rig).filter((i) => !i.sensorId);
  const custom = info.kind === "custom";

  return (
    <div className="flex flex-col gap-3">
      {custom ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="rig-name" className="text-xs text-muted-foreground">{t("projectName")}</Label>
            <Input key={rig.id} id="rig-name" defaultValue={rig.name} onBlur={(e) => renameRig(e.target.value)} className="h-8" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="mr-auto">{modified ? t("personal", { title: info.title }) : t("componentsOf", { title: info.title })}</span>
          {modified && <Button size="xs" variant="outline" disabled={running} onClick={resetPreset}><RotateCcw /> {t("reset")}</Button>}
          <Button size="xs" variant="outline" disabled={running} onClick={() => newRig({ copy: true })} title={t("copyTitle")}><CopyPlus /> {t("copy")}</Button>
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
        <Button variant="outline" disabled={running} onClick={() => setPicker(true)} className="flex-1 border-dashed"><Plus /> {t("add")}</Button>
        {!!outs.length && (
          <Button variant="ghost" disabled={running || !linked} onClick={() => void testOutputs()} title={linked ? t("testTitle") : t("connectFirst")}>{t("test")}</Button>
        )}
      </div>
      {!rig.sensors.length && <p className="text-center text-xs text-muted-foreground">{t("empty")}</p>}
      {!!inputs.length && !outs.length && (
        <p className="text-xs text-muted-foreground">{t("outputsHint")} <button type="button" className="underline underline-offset-2" onClick={() => openGuide("outputs")}>{t("howItWorks")}</button></p>
      )}
      <ComponentPicker open={picker} onOpenChange={setPicker} />
      {custom && (
        <Button variant="ghost" size="sm" disabled={running} className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={async () => { if (await confirm({ title: t("deleteTitle", { name: rig.name }), description: t("deleteDescription"), action: t("delete"), destructive: true })) deleteRig(rig.id); }}>
          <Trash /> {t("deleteProject")}
        </Button>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">{t("quantities")}</summary>
        <p className="pt-1.5">{inputs.map((s) => `${sensorLabel(s)}: ${SENSORS[s.type].quantities(s.options).filter((q) => !q.hidden && !q.raw).map((q) => q.sym ?? QUANTITIES[q.key]?.sym ?? q.key).join(", ")}`).join(" · ") || "—"}</p>
      </details>
    </div>
  );
}
