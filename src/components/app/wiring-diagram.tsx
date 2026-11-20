"use client";
// La guida ai collegamenti, unica per la scheda «Collegamenti» e per il capitolo della Guida:
// • lo schema, «realistico» (Arduino, breadboard e moduli come sono davvero) o «schema» (compatto);
// • Bluetooth, scheda SD e pulsante sono componenti come gli altri: entrano nello schema e nei passi;
// • l'occorrente, contato dallo schema stesso (moduli, resistenze, ponticelli, breadboard), con le figure;
// • i passi, uno per componente: dove infilarlo, i fili da foro a pin, le note pratiche;
//   si spuntano uno alla volta (lo stato resta salvato per quel montaggio);
// • lo schema a tutto schermo, con la legenda e i passi accanto.
// Ogni blocco è una sezione richiudibile (WiringSection), come i consigli degli strumenti.

import { useState } from "react";
import { ArrowRight, Bluetooth, BluetoothSearching, Check, ChevronDown, ListChecks, Maximize2, MemoryStick, Plus, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { btOf, type SensorInstance } from "@/lib/sensors/rig";
import { SENSORS, type SensorType } from "@/lib/sensors/catalog";
import { useLab, bluetoothSetup, addSensor } from "@/lib/lab-store";
import { prefs, isPhoneWidth } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { GlideNav } from "./glide-nav";
import { PanZoom } from "./pan-zoom";
import { BoardDiagram, ComponentThumb, boardPlan, ardName, type StepGroup } from "./board-diagram";
import { RigDiagram, buildModules, resistorsOf, OHMS, BAND_NAMES, type BtModule, type Conn, type Mod, type ModRow, type ResValue } from "./rig-diagram";
import { SdHowTo } from "./sd-controls";
import { PartThumb, type PartArt } from "./parts-art";
import { WiringSection, hashKey } from "./wiring-section";

type Style = "real" | "schema";
type BtKind = "hc06" | "ble";
type Thumb = SensorType | "hc06" | "ble";

const RED = "#dc2626", BLK = "#27272a", V33 = "#ea580c";
const connName = (c: Exclude<Conn, "NC">) => (typeof c === "number" ? ardName(c) : c === "3V3" ? "3.3V" : c);

// ---------------------------------------------------------------------------
// Occorrente
// ---------------------------------------------------------------------------
interface PartItem { qty: number; name: string; note?: string; thumb?: Thumb; art?: PartArt; value?: ResValue; counted?: boolean }

function useParts({ mods, count, nCols, boards, bt, sd }: { mods: Mod[]; count: { red: number; black: number; signal: number } | null; nCols: number; boards: number; bt: BtModule; sd: boolean }): PartItem[] {
  const t = useTranslations("rig.guide");
  const items: PartItem[] = [];
  items.push({ qty: 1, name: "Arduino Uno", note: t("withUsb"), art: "arduino" });
  if (boards > 1) items.push({ qty: boards, name: t("breadboards", { n: boards }), note: t("breadboardsNote"), art: "breadboard-xl", counted: true });
  else items.push({ qty: 1, name: nCols > 30 ? t("breadboard830") : t("breadboard400"), note: nCols > 30 ? t("moreColumns") : undefined, art: nCols > 30 ? "breadboard-xl" : "breadboard" });
  const byTitle = new Map<string, { qty: number; kind: string }>();
  for (const m of mods) {
    const name = m.title.includes(" · ") ? m.title.split(" · ").slice(1).join(" · ") : m.title;
    const e = byTitle.get(name);
    if (e) e.qty++; else byTitle.set(name, { qty: 1, kind: m.kind });
  }
  for (const [name, { qty, kind }] of byTitle) items.push({ qty, name, thumb: kind as SensorType });
  const res = resistorsOf(mods);
  for (const v of ["10k", "4k7", "2k", "1k", "220", "100"] as const)
    if (res[v]) items.push({ qty: res[v], name: t("resistors", { n: res[v], ohms: OHMS[v] }), note: BAND_NAMES[v], art: "resistor", value: v });
  if (count) items.push({ qty: count.red + count.black + count.signal, name: t("jumpers"), note: t("jumpersNote", count), art: "jumpers" });
  if (mods.some((m) => m.kind === "sps30")) items.push({ qty: 1, name: t("spsCable"), note: t("spsCableNote"), art: "jst" });
  if (sd) items.push({ qty: 1, name: t("microSd"), note: t("microSdNote"), art: "microsd" });
  if (bt || sd) items.push({ qty: 1, name: t("powerBank"), note: t("powerBankNote"), art: "powerbank" });
  return items;
}

function Parts({ items }: { items: PartItem[] }) {
  return (
    <ul className="grid gap-x-6 @lg:grid-cols-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3 py-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted/60 p-1" aria-hidden>
            {it.thumb ? <ComponentThumb type={it.thumb} className="size-full" /> : <PartThumb art={it.art ?? "jumpers"} value={it.value} className="size-full" />}
          </span>
          <span className="min-w-0 text-sm leading-snug">
            <span className="block font-medium text-pretty">
              {it.name}
              {it.qty > 1 && !it.counted && <span className="ml-1.5 font-normal text-muted-foreground tabular">×{it.qty}</span>}
            </span>
            {it.note && <span className="block text-xs text-pretty text-muted-foreground">{it.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Passi
// ---------------------------------------------------------------------------
interface WireData { color: string; from: string; to: string; part?: string; dashed?: boolean }
interface StepData {
  title: string; color: string; thumb?: Thumb; place?: string;
  wires: WireData[]; notes: string[]; extra?: "ble" | "hc06" | "sd"; checks?: string[]; foot?: string;
}

/** Il colore di un filo. Il nero del GND nel tema scuro diventa grigio, con un filo chiaro intorno: sennò sparisce. */
function Swatch({ color, dashed, className }: { color: string; dashed?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("h-1 w-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/25", color === BLK && "dark:bg-[#52525b]!", className)}
      style={dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 6px)` } : { background: color }} />
  );
}

const Pin = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-xs font-medium text-foreground">{children}</span>;

function WireLine({ color, from, to, part, dashed, compact }: WireData & { compact?: boolean }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", compact ? "py-1" : "py-2")}>
      <Swatch color={color} dashed={dashed} />
      <Pin>{from}</Pin>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <Pin>{to}</Pin>
      {part && <span className="text-xs text-muted-foreground">{part}</span>}
    </li>
  );
}

function Notes({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground marker:text-muted-foreground/50">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

/** Il blocco in più del Bluetooth: quale modulo, configurarlo, collegarsi. */
const bold = (c: React.ReactNode) => <b className="font-semibold">{c}</b>;

export function BluetoothHowTo({ kind }: { kind: BtKind }) {
  const t = useTranslations("rig.guide");
  const canSetup = useLab((s) => s.linkKind === "arduino" && s.ready && s.transport === "serial");
  const running = useLab((s) => s.running);
  return (
    <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
      <p>{t.rich("btWhere", { b: bold, detail: kind === "ble" ? t("btWhereBle") : t("btWhereHc06") })}</p>
      <p>{t.rich("btSetup", { b: bold })}</p>
      <p>{t.rich("btMeasure", { b: bold, detail: kind === "ble" ? t("btMeasureBle") : t("btMeasureHc06") })}</p>
      {canSetup ? (
        <Button size="sm" variant="outline" className="self-start" disabled={running} onClick={() => void bluetoothSetup(kind)}>
          <Bluetooth /> {kind === "ble" ? t("btConfigureBle") : t("btConfigureHc06")}
        </Button>
      ) : (
        <p className="text-muted-foreground">{t("btConfigureHint")}</p>
      )}
    </div>
  );
}

/** I passi come dati: servono alla lista da spuntare e al pannello accanto allo schema a tutto schermo. */
function useSteps(sensors: SensorInstance[], bt: BtModule, style: Style): StepData[] {
  const t = useTranslations("rig.guide");
  /** Il componente in più di un piedino, a parole (schema compatto). */
  const viaPart = (r: ModRow) =>
    r.via === "divider" ? t("viaDivider")
    : r.via === "series" ? t("viaSeries", { ohms: OHMS[r.res ?? "220"] })
    : r.via === "pullup" ? t("viaPullup", { ohms: OHMS[r.res ?? "10k"] })
    : undefined;
  const plan = sensors.length ? boardPlan(sensors, bt) : null;
  if (!plan) return [];
  const real = style === "real";
  const groups = plan.groups;
  const modGroups = groups.filter((g) => g.mod);
  // colonne dei bus (un pin di Arduino per più moduli): si montano dopo l'alimentazione
  const busGroups = real ? groups.slice(1).filter((g) => !g.mod) : [];
  const wiresOf = (g: StepGroup): WireData[] => real
    ? g.wires
    : g.mod!.rows.flatMap((r) => r.conn === "NC" ? [] : [{ color: r.conn === "5V" ? RED : r.conn === "3V3" ? V33 : r.conn === "GND" ? BLK : g.color, from: r.label, to: connName(r.conn), dashed: r.dashed, part: viaPart(r) }]);
  return [
    { title: real ? t("power") : t("power5vGnd"), color: RED, place: real ? groups[0].place : t("powerPlace"), wires: real ? groups[0].wires : [], notes: [t("unplugged")] },
    ...busGroups.map((g): StepData => ({ title: g.title, color: g.color, place: g.place, wires: g.wires, notes: [] })),
    ...modGroups.map((g): StepData => {
      const m = g.mod!;
      const extra = m.kind === "hc06" || m.kind === "ble" ? m.kind : m.kind === "sd" ? "sd" : undefined;
      return { title: g.title, color: g.color, thumb: m.kind as SensorType, place: real ? g.place : undefined, wires: wiresOf(g), notes: m.notes, extra };
    }),
    { title: t("finalCheck"), color: "#16a34a", wires: [], notes: [], checks: [t("checkGnd"), t("checkShort"), t("checkPins"), ...(bt ? [t("checkBt")] : [])], foot: t("finalNote") },
  ];
}

/** Passi fatti, salvati per questo montaggio (cambiando sensori, pin o tipo di schema si riparte da capo). */
function useDone(steps: StepData[], style: Style) {
  const sig = hashKey(style + steps.map((s) => s.title + s.wires.map((w) => w.from + w.to).join(",")).join("|"));
  const key = `mosaicus.steps.${sig}`;
  const [store, setStore] = useState(() => ({ sig, done: prefs.get<number[]>(key, []) }));
  if (store.sig !== sig) setStore({ sig, done: prefs.get<number[]>(key, []) });
  const done = new Set((store.sig === sig ? store.done : []).filter((i) => i < steps.length));
  const save = (next: Set<number>) => { const arr = [...next].sort((a, b) => a - b); setStore({ sig, done: arr }); prefs.set(key, arr); };
  const toggle = (i: number, on = !done.has(i)) => { const n = new Set(done); if (on) n.add(i); else n.delete(i); save(n); };
  const reset = () => save(new Set());
  const current = steps.findIndex((_, i) => !done.has(i));
  return { done, toggle, reset, current };
}
type DoneState = ReturnType<typeof useDone>;

function StepBody({ s }: { s: StepData }) {
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
      {s.place && <p className="text-pretty text-muted-foreground">{s.place}</p>}
      {!!s.wires.length && <ul className="flex flex-col divide-y divide-border">{s.wires.map((w, k) => <WireLine key={k} {...w} />)}</ul>}
      <Notes items={s.notes} />
      {(s.extra === "ble" || s.extra === "hc06") && <BluetoothHowTo kind={s.extra} />}
      {s.extra === "sd" && <SdHowTo />}
      {s.checks && (
        <ul className="flex flex-col gap-1.5">
          {s.checks.map((line) => <li key={line} className="flex gap-2"><Check className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />{line}</li>)}
        </ul>
      )}
      {s.foot && <p className="text-muted-foreground">{s.foot}</p>}
    </div>
  );
}

/** Il cerchio del passo: il numero, o la spunta quando è fatto. Area da toccare di 40 px. */
function StepCheck({ n, current, done, label, onClick }: { n: number; current: boolean; done: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={done} aria-label={label} title={label}
      className="group/chk -m-2 grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <span className={cn("grid size-6 place-items-center rounded-full text-xs font-medium tabular transition-[background-color,color,transform] duration-150 group-active/chk:scale-90",
        done ? "bg-foreground/[0.08] text-foreground" : current ? "bg-foreground text-background" : "text-muted-foreground ring-1 ring-border ring-inset group-hover/chk:text-foreground")}>
        {done ? <Check className="size-3.5" strokeWidth={2.5} /> : n}
      </span>
    </button>
  );
}

function StepsChecklist({ steps, state }: { steps: StepData[]; state: DoneState }) {
  const t = useTranslations("rig.guide");
  const { done, toggle, reset, current } = state;
  // aperto: di solito il passo corrente; un clic sull'intestazione apre (o chiude) un altro passo
  const [open, setOpen] = useState<number | null | "auto">("auto");
  const isOpen = (i: number) => (open === "auto" ? i === current : open === i);
  const total = steps.length, nDone = done.size;
  const progress = t("stepsProgress", { done: nDone, total });
  return (
    <div className="flex flex-col gap-2">
      {nDone > 0 && (
        <div className="flex h-7 items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={nDone} aria-label={progress}>
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out" style={{ width: `${total ? (nDone / total) * 100 : 0}%` }} />
          </div>
          <Button size="xs" variant="ghost" className="-mr-2 text-muted-foreground" onClick={() => { reset(); setOpen("auto"); }}><RotateCcw /> {t("stepsReset")}</Button>
        </div>
      )}
      {current === -1 && (
        <p className="flex items-start gap-2 py-1 text-sm text-pretty"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t("allDone")}</p>
      )}
      <ol className="flex flex-col gap-0.5">
        {steps.map((s, i) => {
          const isDone = done.has(i), cur = i === current, exp = isOpen(i);
          const summary = s.wires.length ? t("stepWires", { n: s.wires.length }) : undefined;
          return (
            <li key={i} className={cn("rounded-lg transition-colors duration-200", exp && "bg-foreground/[0.03]")}>
              <div className="flex items-center gap-2.5 py-1 pr-1 pl-2.5">
                <StepCheck n={i + 1} current={cur} done={isDone} label={isDone ? t("stepUndo") : t("stepMark")} onClick={() => toggle(i)} />
                <button type="button" onClick={() => setOpen(exp ? null : i)} aria-expanded={exp}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  {s.wires.length > 0 && <Swatch color={s.color} className="h-3 w-[3px]" />}
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", isDone && "text-muted-foreground line-through decoration-foreground/25")}>{s.title}</span>
                  {!exp && summary && <span className="shrink-0 text-xs text-muted-foreground tabular">{summary}</span>}
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", !exp && "-rotate-90")} aria-hidden />
                </button>
              </div>
              {exp && (
                <div className="flex gap-3 pr-3 pb-3 pl-2.5">
                  {s.thumb && <span className="mt-1 hidden size-10 shrink-0 place-items-center rounded-md bg-muted/60 p-1 sm:grid" aria-hidden><ComponentThumb type={s.thumb} className="size-full" /></span>}
                  <div className={cn("flex min-w-0 flex-1 flex-col gap-3", !s.thumb && "sm:pl-[2.125rem]")}>
                    <StepBody s={s} />
                    <div className="flex">
                      {isDone
                        ? <Button size="sm" variant="ghost" className="-ml-2 text-muted-foreground" onClick={() => toggle(i, false)}><RotateCcw /> {t("stepUndo")}</Button>
                        : <Button size="sm" variant="outline" onClick={() => { toggle(i, true); setOpen("auto"); }}>
                          <Check /> {i === total - 1 ? t("stepFinish") : t("stepDone")}
                        </Button>}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** I passi in breve, accanto allo schema a tutto schermo: i fili solo per il passo corrente. */
function StepsCompact({ steps, state }: { steps: StepData[]; state: DoneState }) {
  const t = useTranslations("rig.guide");
  const { done, toggle, current } = state;
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((s, i) => {
        const isDone = done.has(i), cur = i === current;
        return (
          <li key={i} className={cn("rounded-lg px-2.5 py-1", cur && "bg-foreground/[0.04]")}>
            <div className="flex items-center gap-2.5">
              <StepCheck n={i + 1} current={cur} done={isDone} label={isDone ? t("stepUndo") : t("stepMark")} onClick={() => toggle(i)} />
              <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", isDone && "text-muted-foreground line-through decoration-foreground/25")}>{s.title}</span>
            </div>
            {cur && !!s.wires.length && <ul className="mt-0.5 mb-1 flex flex-col divide-y divide-border pl-[2.125rem]">{s.wires.map((w, k) => <WireLine key={k} {...w} compact />)}</ul>}
          </li>
        );
      })}
    </ol>
  );
}

function Legend({ real, boards }: { real: boolean; boards: number }) {
  const t = useTranslations("rig.guide");
  const item = (style: React.CSSProperties, label: string, gnd = false) => (
    <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn("h-1 w-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/25", gnd && "dark:bg-[#52525b]!")} style={style} />{label}</span>
  );
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        {item({ background: RED }, t("legend5v"))}
        {item({ background: BLK }, t("legendGnd"), true)}
        {item({ background: "linear-gradient(90deg, #2563eb 0 33%, #db2777 33% 66%, #16a34a 66%)" }, t("legendSignal"))}
        {item({ backgroundImage: "repeating-linear-gradient(90deg, #71717a 0 4px, transparent 4px 6px)" }, t("legendOptional"))}
      </div>
      {real && <p className="text-pretty">{t("legendReal")}{boards > 1 ? ` ${t("legendBoards")}` : ""}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La guida completa
// ---------------------------------------------------------------------------
/** sensors: i componenti da collegare; editable: è il progetto aperto (si possono aggiungere Bluetooth e scheda SD da qui) */
export function WiringGuide({ sensors: all, editable = false }: { sensors: SensorInstance[]; editable?: boolean }) {
  const t = useTranslations("rig.guide");
  const sensors = all.filter((s) => !SENSORS[s.type].phone);     // il telefono non si collega
  const [style, setStyleState] = useState<Style>(() => prefs.get<Style>("mosaicus.diagram", isPhoneWidth() ? "schema" : "real"));
  const setStyle = (s: Style) => { setStyleState(s); prefs.set("mosaicus.diagram", s); };
  const bt: BtModule = btOf(sensors);
  const sd = sensors.some((s) => s.type === "sd");
  const running = useLab((s) => s.running);
  const [big, setBig] = useState(false);
  const [panel, setPanelState] = useState(() => prefs.get<boolean>("mosaicus.wiring.fsPanel", true));
  const setPanel = (v: boolean) => { setPanelState(v); prefs.set("mosaicus.wiring.fsPanel", v); };
  const plan = sensors.length ? boardPlan(sensors, bt) : null;
  const mods = sensors.length ? buildModules(sensors, bt) : [];
  const parts = useParts({ mods, count: style === "real" && plan ? plan.count : null, nCols: plan?.nCols ?? 30, boards: plan?.boards ?? 1, bt, sd });
  const steps = useSteps(sensors, bt, style);
  const state = useDone(steps, style);
  if (!sensors.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
    );
  }
  const draw = (cls: string) => style === "real"
    ? <BoardDiagram sensors={sensors} bt={bt} className={cls} />
    : <RigDiagram sensors={sensors} bt={bt} className={`${cls} text-foreground [&_text]:fill-current`} />;
  const styleNav = (
    <GlideNav label={t("styleLabel")} value={style} size="sm"
      items={[{ id: "real", content: t("styleReal"), onSelect: () => setStyle("real") }, { id: "schema", content: t("styleSchema"), onSelect: () => setStyle("schema") }]} />
  );
  const stepsMeta = t("stepsMeta", { done: state.done.size, total: steps.length });
  return (
    <div className="@container flex flex-col">
      <WiringSection id="diagram" title={t("diagram")}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {styleNav}
            <Button size="sm" variant="ghost" className="-mr-2 ml-auto text-muted-foreground" onClick={() => setBig(true)}><Maximize2 /> {t("fullscreenShort")}</Button>
          </div>
          <button type="button" onClick={() => setBig(true)} aria-label={t("fullscreen")}
            className="group/dia relative block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <div key={`${style}${bt}`} className="mz-enter">{draw("h-auto w-full")}</div>
            <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/dia:opacity-100 group-focus-visible/dia:opacity-100 pointer-coarse:opacity-100">
              <Maximize2 className="size-3" /> {t("expandHint")}
            </span>
          </button>
          <Legend real={style === "real"} boards={plan?.boards ?? 1} />
          {plan && !plan.fits && <p role="alert" className="text-sm text-pretty text-destructive">{t("tooBig")}</p>}
          {editable && !bt && !sd && (
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={running} />}>
                  <Plus /> {t("addModule")} <ChevronDown className="text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuItem className="items-start" onClick={() => addSensor("hc06")}>
                    <Bluetooth className="mt-0.5" />
                    <span className="flex flex-col"><span>HC-06</span><span className="text-xs text-muted-foreground">{t("moduleHc06")}</span></span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="items-start" onClick={() => addSensor("ble")}>
                    <BluetoothSearching className="mt-0.5" />
                    <span className="flex flex-col"><span>Bluetooth LE</span><span className="text-xs text-muted-foreground">{t("moduleBle")}</span></span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="items-start" onClick={() => addSensor("sd")}>
                    <MemoryStick className="mt-0.5" />
                    <span className="flex flex-col"><span>{t("sdCard")}</span><span className="text-xs text-muted-foreground">{t("moduleSd")}</span></span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-xs text-pretty text-muted-foreground">{t("noCable")}</span>
            </div>
          )}
        </div>
      </WiringSection>

      <WiringSection id="parts" title={t("parts")} meta={t("partsCount", { n: parts.length })}>
        <Parts items={parts} />
      </WiringSection>

      <WiringSection id="steps" title={t("steps")} meta={stepsMeta}>
        <StepsChecklist steps={steps} state={state} />
      </WiringSection>

      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent showCloseButton={false}
          className="flex h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 sm:h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-semibold">{t("dialogTitle")}</DialogTitle>
              <DialogDescription className="hidden truncate text-[13px] sm:block">{t("dialogDescription")}</DialogDescription>
            </div>
            {styleNav}
            <Button size="sm" variant="ghost" className="hidden lg:inline-flex" aria-pressed={panel} onClick={() => setPanel(!panel)}>
              <ListChecks /> {panel ? t("hideSteps") : t("showSteps")}
            </Button>
            <DialogClose render={<Button size="icon-sm" variant="ghost" aria-label={t("close")} />}><X /></DialogClose>
          </div>
          <div className="flex min-h-0 flex-1">
            <PanZoom bare autoFocus className="min-h-0 flex-1" key={`${style}${bt}`}>
              {draw("block h-auto w-full")}
            </PanZoom>
            {panel && (
              <aside className="hidden w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l bg-card p-4 lg:flex">
                <section className="flex flex-col gap-2">
                  <h3 className="text-[13px] font-semibold">{t("legendTitle")}</h3>
                  <Legend real={style === "real"} boards={plan?.boards ?? 1} />
                </section>
                <section className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold">{t("steps")}</h3>
                    <span className="text-[13px] text-muted-foreground tabular">{stepsMeta}</span>
                  </div>
                  <StepsCompact steps={steps} state={state} />
                </section>
              </aside>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
