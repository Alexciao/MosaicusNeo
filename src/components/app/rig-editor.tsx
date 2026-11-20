"use client";
// I componenti del progetto, con pin, intervallo e opzioni. Funziona allo stesso modo per gli
// esperimenti pronti (le modifiche diventano una versione personale, ripristinabile) e per i
// progetti dell'utente.

import { Fragment, useRef, useState } from "react";
import { Check, ChevronDown, CopyPlus, Info, Plus, Search, Trash, TriangleExclamationPoint, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SENSORS, COMPONENTS, COMPONENT_TAGS, COMPONENT_KEYWORDS, TAGS, GROUPS, MAX_ARDUINO, defaultOptions, groupOf, isSlot, pinName, pinsFor, type ComponentGroup, type ComponentTag, type SensorType } from "@/lib/sensors/catalog";
import { validateRig, usedPins, sensorLabel, inputsOf, indicatorsOf, type SensorInstance } from "@/lib/sensors/rig";
import { QUANTITIES } from "@/lib/sensors/quantities";
import type { Param } from "@/lib/sensors/types";
import {
  useLab, labInfo, updateSensor, addSensor, addSensors, checkAdd, removeSensor, pressSimButton, newRig, testOutputs,
} from "@/lib/lab-store";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { isPhoneWidth } from "@/lib/prefs";
import { intlLocale } from "@/i18n";
import { ComponentThumb } from "./board-diagram";
import { Sym } from "./sym";

/** unit: l'unità dentro il campo, a destra (non nell'etichetta). */
function OptionField({ p, value, onChange, id, disabled, unit }: { p: Param; value: number | string; onChange: (v: number | string) => void; id: string; disabled?: boolean; unit?: string }) {
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
  const input = (
    <Input id={id} type={p.type === "text" ? "text" : "number"} inputMode={p.type === "text" ? "text" : "decimal"} step={p.step ?? "any"} min={p.min}
      value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      className={cn("h-8 tabular", unit && "pr-10")} />
  );
  if (!unit) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

/** hint: una nota sul campo, in un suggerimento (ⓘ accanto all'etichetta) invece che in un paragrafo. */
function Field({ label, htmlFor, wide, hint, children }: { label: string; htmlFor: string; wide?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", wide && "sm:col-span-2")}>
      <span className="flex min-w-0 items-start gap-1">
        <Label htmlFor={htmlFor} className="text-xs leading-snug font-medium text-muted-foreground">{label.charAt(0).toUpperCase() + label.slice(1)}</Label>
        {hint && (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} aria-label={hint} className="grid size-4 shrink-0 cursor-help place-items-center rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" />}>
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-pretty">{hint}</TooltipContent>
          </Tooltip>
        )}
      </span>
      {children}
    </div>
  );
}
/** Le tendine con voci lunghe occupano tutta la riga (sennò il testo si taglia). */
const wideSelect = (p: Param) => p.type === "select" && (p.options ?? []).some(([, l]) => l.length > 16);

/** Il pulsante col simulatore: si può «premere» da qui. */
function ButtonHint() {
  const t = useTranslations("rig.editor");
  const sim = useLab((s) => s.linkKind === "simulatore" && s.ready);
  const running = useLab((s) => s.running);
  if (!sim) return null;
  return <Button size="xs" variant="outline" className="self-start" onClick={pressSimButton}>{t("pressSim", { running: running ? "yes" : "no" })}</Button>;
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
    <Collapsible open={open} onOpenChange={setOpen} className="py-1">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted/60 p-1" aria-hidden><ComponentThumb type={s.type} options={s.options} className="size-full" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{sensorLabel(s)}</span>
              {issues.some((i) => i.level === "error") && <TriangleExclamationPoint className="size-3.5 shrink-0 text-destructive" aria-hidden />}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              <span className="font-mono">{def.pins.map((p) => `${p.role.split(" ")[0]} ${p.def <= 1 && p.fixed ? `D${p.def}` : pinName(s.pins[p.key])}`).join(" · ")}</span>
              {isSlot(s.type) && !def.events && <span className="tabular"> · {t("every", { interval: s.interval >= 1000 ? `${(s.interval / 1000).toLocaleString(intlLocale)} s` : `${s.interval} ms` })}</span>}
              {def.events && <span> · {t("events")}</span>}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
        </CollapsibleTrigger>
        <Button size="icon-sm" variant="ghost" aria-label={t("removeNamed", { name: sensorLabel(s) })} disabled={running} className="text-muted-foreground hover:text-destructive"
          onClick={async () => { if (await confirm({ title: t("removeTitle", { name: sensorLabel(s) }), action: t("remove"), destructive: true })) removeSensor(s.id); }}>
          <Trash />
        </Button>
      </div>
      <CollapsibleContent className="flex flex-col gap-3 pt-2 pb-3 sm:pl-[3.25rem]">
        {issues.map((i, k) => <p key={k} className={cn("text-xs", i.level === "error" ? "text-destructive" : "text-warning")}>{i.text}</p>)}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("name")} htmlFor={`${s.id}-label`}>
            <OptionField id={`${s.id}-label`} p={{ key: "label", label: t("name"), type: "text", value: "" }} value={s.label ?? def.short} disabled={running}
              onChange={(v) => updateSensor(s.id, { label: String(v) })} />
          </Field>
          {isSlot(s.type) && !def.events && (
            <Field label={t("interval")} htmlFor={`${s.id}-int`}>
              <OptionField key={`int-${s.interval}`} id={`${s.id}-int`} unit="ms" p={{ key: "interval", label: "", value: s.interval, min: minI, step: 10 }} value={s.interval} disabled={running}
                onChange={(v) => updateSensor(s.id, { interval: Math.max(minI, Number(v)) })} />
            </Field>
          )}
          {def.pins.filter((spec) => spec.fixed).length > 0 && (
            <Field label={t("fixedPins")} htmlFor={`${s.id}-pin-fixed`} hint={def.pins.find((spec) => spec.fixed && spec.note)?.note}>
              <p id={`${s.id}-pin-fixed`} className="flex h-8 items-center font-mono text-xs font-medium">
                {def.pins.filter((spec) => spec.fixed).map((spec) => spec.role.includes("D") ? spec.role : `${spec.role} ${pinName(spec.def)}`).join(" · ")}
              </p>
            </Field>
          )}
          {def.pins.filter((spec) => !spec.fixed).map((spec) => (
            <Field key={spec.key} label={spec.role} htmlFor={`${s.id}-pin-${spec.key}`} hint={spec.note}>
              <Select value={s.pins[spec.key] != null ? String(s.pins[spec.key]) : null} disabled={running}
                onValueChange={(v) => v != null && updateSensor(s.id, { pins: { ...s.pins, [spec.key]: Number(v) } })}
                items={Object.fromEntries(pinsFor(spec.kind).map((p) => [String(p), pinName(p)]))}>
                <SelectTrigger id={`${s.id}-pin-${spec.key}`} size="sm" className="w-full min-w-0 font-mono"><SelectValue placeholder={<span className="font-sans text-muted-foreground">{t("choosePin")}</span>} /></SelectTrigger>
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
            </Field>
          ))}
          {basic.map((p) => (
            <Field key={p.key} label={p.label} wide={wideSelect(p)} htmlFor={`${s.id}-${p.key}`}>
              <OptionField key={`${p.key}-${s.options[p.key]}`} id={`${s.id}-${p.key}`} p={p} unit={p.unit} value={s.options[p.key]} disabled={running}
                onChange={(v) => updateSensor(s.id, { options: { [p.key]: v } })} />
            </Field>
          ))}
        </div>
        {s.type === "button" && <ButtonHint />}
        {!!advanced.length && (
          <Collapsible open={adv} onOpenChange={setAdv}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("size-3.5 transition-transform", !adv && "-rotate-90")} /> {t("advanced")}
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 pt-3 sm:grid-cols-2">
              {advanced.map((p) => (
                <Field key={p.key} label={p.label} wide={wideSelect(p)} htmlFor={`${s.id}-${p.key}`}>
                  <OptionField key={`${p.key}-${s.options[p.key]}`} id={`${s.id}-${p.key}`} p={p} unit={p.unit} value={s.options[p.key]} disabled={running}
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

const fold = (str: string) => str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Le grandezze che un componente misura, con simbolo e unità (per l'anteprima del catalogo). */
function measuredOf(type: SensorType) {
  const def = SENSORS[type];
  return def.quantities(defaultOptions(type)).filter((q) => !q.raw && !q.hidden).map((q) => {
    const meta = QUANTITIES[q.key.replace(/_\d+$/, "")];
    return { key: q.key, sym: q.sym ?? meta?.sym ?? q.key, name: q.name ?? meta?.name ?? "", unit: q.unit ?? meta?.unit ?? "" };
  });
}

/** Una riga dell'elenco: immagine, nome, che cosa misura; a destra «aggiunto» o il motivo per cui non si può. */
function PickerRow({ type, count, disabled, active, selected, selecting, onPick, onToggle, onFocus, id }: {
  type: SensorType; count: number; disabled: boolean; active: boolean; selected: boolean; selecting: boolean;
  onPick: () => void; onToggle: () => void; onFocus: () => void; id: string;
}) {
  const t = useTranslations("rig.editor");
  const def = SENSORS[type];
  return (
    <li role="option" id={id} aria-selected={active} aria-checked={selected} aria-disabled={disabled}
      onMouseMove={onFocus} onClick={() => { if (disabled) return; if (selecting) onToggle(); else onPick(); }}
      className={cn("group/row flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 select-none",
        active && "bg-foreground/[0.06]", disabled && "cursor-default opacity-50")}>
      {/* casella per scegliere più componenti: compare passando sopra, sempre visibile mentre se ne scelgono */}
      <span role="checkbox" aria-checked={selected} aria-label={t("pickerSelectOne", { name: def.title })} tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
        className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border transition-opacity",
          selected ? "border-foreground bg-foreground text-background" : "border-foreground/30 bg-background",
          !selected && !selecting && "opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-100")}>
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/70 p-1" aria-hidden>
        <ComponentThumb type={type} className="size-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{def.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{def.measures}</span>
      </span>
      {count > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular" title={t("alreadyIn")}>
          <Check className="size-3.5" aria-hidden />{count > 1 ? `×${count}` : t("pickerAdded")}
        </span>
      )}
    </li>
  );
}

/** Anteprima del componente scelto con la tastiera o il mouse: immagine grande, descrizione, grandezze, pin. */
function PickerDetail({ type, disabled, why, onPick, selecting, selected }: { type: SensorType; disabled: boolean; why?: string; onPick: () => void; selecting?: boolean; selected?: boolean }) {
  const t = useTranslations("rig.editor");
  const def = SENSORS[type];
  const measured = measuredOf(type);
  return (
    <div className="flex h-full flex-col">
      <div className="grid aspect-[4/3] place-items-center border-b bg-muted/40 p-8" aria-hidden>
        <ComponentThumb type={type} className="size-full max-h-36" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-semibold">{def.title}</h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{def.description}</p>
        </div>
        {measured.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("pickerMeasures")}</p>
            <ul className="flex flex-col divide-y text-[13px]">
              {measured.map((q) => (
                <li key={q.key} className="flex items-baseline gap-2 py-1">
                  <span className="min-w-10 shrink-0 pr-1 font-medium whitespace-nowrap italic"><Sym>{q.sym}</Sym></span>
                  <span className="min-w-0 flex-1 truncate">{q.name}</span>
                  {q.unit && <span className="shrink-0 text-muted-foreground">{q.unit}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("pickerPins")}</p>
          {def.phone ? <p className="text-[13px]">{t("onPhone")}</p> : def.pins.length ? (
            <ul className="flex flex-col divide-y text-[13px]">
              {def.pins.map((p) => (
                <li key={p.key} className="flex items-baseline gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate">{p.role}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.kind === "analog" ? "A0–A5" : t("digitalPin")}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted-foreground">—</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t p-4">
        {disabled && why && <p className="text-xs text-muted-foreground">{why}</p>}
        {selecting
          ? <Button variant="outline" disabled={disabled && !selected} onClick={onPick}>{selected ? t("pickerUnselect") : <><Plus /> {t("pickerSelectAdd")}</>}</Button>
          : <Button variant="brand" disabled={disabled} onClick={onPick}><Plus /> {t("pickerAdd")}</Button>}
      </div>
    </div>
  );
}

/**
 * Il catalogo dei componenti come una tavolozza di comandi: ricerca in alto, gruppi a sinistra
 * (argomenti dentro «Sensori»), elenco al centro con la tastiera (↑ ↓, Invio), anteprima a destra.
 * Sul telefono: gruppi in una riga di filtri, elenco a tutta larghezza, un tocco aggiunge.
 */
export function ComponentPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("rig.editor");
  const rig = useLab((s) => s.rig);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ComponentGroup | "all">("all");
  const [tag, setTag] = useState<ComponentTag | "all">("all");
  const [activeType, setActiveType] = useState<SensorType | null>(null);
  const [sel, setSel] = useState<SensorType[]>([]);
  const listRef = useRef<HTMLUListElement>(null);
  const selecting = sel.length > 0;
  // il progetto come sarebbe con i componenti scelti: così si vede subito che cosa non ci sta più
  let planned = rig.sensors;
  for (const type of sel) { const plan = checkAdd(planned, type); if (plan.ok) planned = plan.sensors; }
  const nArduino = planned.filter((x) => isSlot(x.type) && !SENSORS[x.type].phone).length;
  const count = (type: SensorType) => rig.sensors.filter((s) => s.type === type).length;
  const state = (type: SensorType): [boolean, string?] => {
    if (sel.includes(type)) return [false];
    const def = SENSORS[type];
    const n = planned.filter((s) => s.type === type).length;
    if (n >= def.max) return [true, def.max === 1 ? t("maxOne") : t("maxN", { n: def.max })];
    if (def.phone && planned.some((s) => !SENSORS[s.type].phone)) return [true, t("notWithArduino")];
    if (!def.phone && planned.some((s) => SENSORS[s.type].phone)) return [true, t("notWithPhone")];
    if (def.link && planned.some((s) => SENSORS[s.type].link)) return [true, t("oneBt")];
    if (isSlot(type) && !def.phone && nArduino >= MAX_ARDUINO) return [true, t("maxSensors", { n: MAX_ARDUINO })];
    // pin, bus I2C e posto sulla breadboard: se non c'è modo di montarlo davvero, non si aggiunge
    const plan = checkAdd(planned, type);
    if (!plan.ok) return [true, plan.error];
    return [false];
  };
  const toggle = (type: SensorType) => setSel((cur) => (cur.includes(type) ? cur.filter((x) => x !== type) : state(type)[0] ? cur : [...cur, type]));
  // telefono e Arduino non si mescolano: con componenti di Arduino il gruppo Telefono non c'è, e viceversa
  const hasPhone = planned.some((x) => SENSORS[x.type].phone), hasArduino = planned.some((x) => !SENSORS[x.type].phone);
  const groupShown = (g: ComponentGroup) => (g === "phone" ? !hasArduino : !hasPhone);
  const groups = GROUPS.filter(([g]) => groupShown(g));
  const q = fold(query.trim());
  const groupLabel = (g: ComponentGroup) => GROUPS.find(([id]) => id === g)?.[1] ?? "";
  const matches = (type: SensorType) => {
    if (!q) return true;
    const d = SENSORS[type];
    const hay = fold([d.title, d.short, d.measures, d.description, COMPONENT_KEYWORDS[type], groupLabel(groupOf(type)), ...COMPONENT_TAGS[type].map((k) => TAGS.find(([id]) => id === k)?.[1] ?? "")].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  const searched = COMPONENTS.filter(matches);
  const list = searched.filter((type) => {
    const g = groupOf(type);
    if (!groupShown(g)) return false;
    if (group !== "all" && g !== group) return false;
    // «Tutti» senza ricerca: i componenti di Arduino; il telefono ha il suo gruppo
    if (group === "all" && !q && g === "phone" && !hasPhone) return false;
    if (group === "sensor" && tag !== "all" && !COMPONENT_TAGS[type].includes(tag)) return false;
    return true;
  });
  const sections = groups.map(([g, label]) => ({ g, label, items: list.filter((type) => groupOf(type) === g) })).filter((s) => s.items.length);
  const flat = sections.flatMap((s) => s.items);
  const active = activeType && flat.includes(activeType) ? activeType : flat[0] ?? null;
  const pick = (type: SensorType) => { if (state(type)[0]) return; addSensor(type); change(false); };
  const addSelected = () => { if (!sel.length) return; addSensors(sel); change(false); };
  const change = (o: boolean) => { onOpenChange(o); if (!o) { setQuery(""); setGroup("all"); setTag("all"); setActiveType(null); setSel([]); } };
  const groupCount = (g: ComponentGroup | "all") => searched.filter((type) => groupShown(groupOf(type)) && (g === "all" ? q || hasPhone || groupOf(type) !== "phone" : groupOf(type) === g)).length;
  const optId = (type: SensorType) => `pick-${type}`;
  const move = (d: number) => {
    if (!flat.length) return;
    const i = active ? flat.indexOf(active) : -1;
    const next = flat[(i + d + flat.length) % flat.length];
    setActiveType(next);
    document.getElementById(optId(next))?.scrollIntoView({ block: "nearest" });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && e.shiftKey && active) { e.preventDefault(); toggle(active); }
    else if (e.key === "Enter" && selecting) { e.preventDefault(); addSelected(); }
    else if (e.key === "Enter" && active) { e.preventDefault(); pick(active); }
  };
  const railItem = (id: ComponentGroup | "all", label: string) => (
    <button key={id} type="button" onClick={() => { setGroup(id); setTag("all"); setActiveType(null); }} aria-pressed={group === id}
      className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
        group === id ? "bg-foreground/[0.06] font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground tabular">{groupCount(id) || ""}</span>
    </button>
  );
  const chip = (id: string, label: string, on: boolean, onClick: () => void) => (
    <button key={id} type="button" onClick={onClick} aria-pressed={on}
      className={cn("h-7 shrink-0 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
        on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {label}
    </button>
  );
  const [activeDisabled, activeWhy] = active ? state(active) : [true];
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent showCloseButton={false} className="flex h-[min(42rem,92dvh)] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(60rem,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">{t("pickerTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("pickerDescription")}</DialogDescription>
        {/* ricerca */}
        <div className="flex items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input autoFocus={!isPhoneWidth()} value={query} onKeyDown={onKey}
            onChange={(e) => { setQuery(e.target.value); setActiveType(null); }}
            placeholder={t("searchPlaceholder")} aria-label={t("searchAria")}
            role="combobox" aria-expanded aria-controls="picker-list" aria-activedescendant={active ? optId(active) : undefined}
            autoComplete="off" spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          {query && (
            <button type="button" aria-label={t("clearSearch")} onClick={() => setQuery("")} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          )}
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label={t("close")} />}><X /></DialogClose>
        </div>
        {/* gruppi: una riga di filtri sul telefono */}
        <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none] md:hidden" role="group" aria-label={t("groupAria")}>
          {chip("all", t("all"), group === "all", () => { setGroup("all"); setTag("all"); })}
          {groups.map(([id, label]) => chip(id, label, group === id, () => { setGroup(id); setTag("all"); }))}
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[13rem_minmax(0,1fr)_17rem]">
          {/* gruppi e argomenti */}
          <nav className="hidden min-h-0 flex-col gap-0.5 overflow-y-auto border-r p-2 md:flex" aria-label={t("groupAria")}>
            {railItem("all", t("all"))}
            {groups.map(([id, label]) => (
              <Fragment key={id}>
                {railItem(id, label)}
                {id === "sensor" && group === "sensor" && (
                  <div className="mb-1 ml-2 flex flex-col gap-0.5 border-l pl-2" role="group" aria-label={t("tagAria")}>
                    {[["all", t("anyTag")] as const, ...TAGS].map(([tid, label]) => (
                      <button key={tid} type="button" onClick={() => { setTag(tid); setActiveType(null); }} aria-pressed={tag === tid}
                        className={cn("rounded-md px-2 py-1 text-left text-[13px] leading-snug transition-colors",
                          tag === tid ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </Fragment>
            ))}
          </nav>
          {/* elenco */}
          <div className="min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-2">
            {flat.length ? (
              <ul ref={listRef} id="picker-list" role="listbox" aria-label={t("pickerTitle")} className="flex flex-col">
                {sections.map((s, si) => (
                  <Fragment key={s.g}>
                    {(group === "all" || q) && (
                      <li role="presentation" className={cn("px-2 pb-1 text-xs font-medium text-muted-foreground", si > 0 ? "pt-4" : "pt-1")}>{s.label}</li>
                    )}
                    {s.items.map((type) => (
                      <PickerRow key={type} id={optId(type)} type={type} count={count(type)} disabled={state(type)[0]} selected={sel.includes(type)} selecting={selecting} onToggle={() => toggle(type)}
                        active={type === active} onFocus={() => setActiveType(type)} onPick={() => pick(type)} />
                    ))}
                  </Fragment>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">{t("noneFound", { hasQuery: q ? "yes" : "no", query: query.trim(), inGroup: group !== "all" ? "yes" : "no" })}</p>
            )}
          </div>
          {/* anteprima */}
          <aside className="hidden min-h-0 border-l md:block" aria-live="polite">
            {active && <PickerDetail type={active} disabled={!!activeDisabled} why={activeWhy} selecting={selecting} selected={sel.includes(active)} onPick={() => (selecting ? toggle(active) : pick(active))} />}
          </aside>
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          {selecting ? (
            <>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t("pickerSelected", { n: sel.length })}</span>
              <Button size="sm" variant="ghost" onClick={() => setSel([])}>{t("pickerClear")}</Button>
              <Button size="sm" variant="brand" onClick={addSelected}><Plus /> {t("pickerAddN", { n: sel.length })}</Button>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate">{t("maxNote", { n: MAX_ARDUINO })}</span>
              <span className="hidden shrink-0 items-center gap-3 md:flex">
                <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> {t("pickerMove")}</span>
                <span><kbd className="font-sans">⇧↵</kbd> {t("pickerSelectKey")}</span>
                <span><kbd className="font-sans">↵</kbd> {t("pickerAdd")}</span>
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RigEditor() {
  const t = useTranslations("rig.editor");
  const rig = useLab((s) => s.rig);
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
      {!custom && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="mr-auto">{t("componentsOf", { title: info.title })}</span>
            <Button size="xs" variant="outline" disabled={running} onClick={() => newRig({ copy: true })} title={t("copyTitle")}><CopyPlus /> {t("copy")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("forkHint")}</p>
        </div>
      )}

      {/* un progetto nuovo e vuoto non è un errore: niente avvisi finché non c'è almeno un componente */}
      {!!rig.sensors.length && issues.map((i, k) => (
        <p key={k} className={cn("flex gap-1.5 text-xs text-pretty", i.level === "error" ? "text-destructive" : "text-warning")}>
          <TriangleExclamationPoint className="mt-px size-3.5 shrink-0" aria-hidden />{i.text}
        </p>
      ))}

      {!!rig.sensors.length && (
        <div className="flex flex-col divide-y divide-border border-y">
          {rig.sensors.map((s) => <SensorCard key={s.id} s={s} defaultOpen={rig.sensors.length === 1 || custom} />)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={running} onClick={() => setPicker(true)} className="flex-1"><Plus /> {t("add")}</Button>
        {!!outs.length && (
          <Button variant="ghost" disabled={running || !linked} onClick={() => void testOutputs()} title={linked ? t("testTitle") : t("connectFirst")}>{t("test")}</Button>
        )}
      </div>
      <ComponentPicker open={picker} onOpenChange={setPicker} />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium hover:text-foreground">{t("quantities")}</summary>
        <p className="pt-1.5">
          {inputs.length ? inputs.map((s, i) => (
            <span key={s.id}>
              {i > 0 && " · "}{sensorLabel(s)}:{" "}
              {SENSORS[s.type].quantities(s.options).filter((q) => !q.hidden && !q.raw).map((q, k) => (
                <span key={q.key}>{k > 0 && ", "}<Sym>{q.sym ?? QUANTITIES[q.key]?.sym ?? q.key}</Sym></span>
              ))}
            </span>
          )) : "—"}
        </p>
      </details>
    </div>
  );
}
