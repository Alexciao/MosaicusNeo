"use client";
// La guida ai collegamenti, unica per la scheda «Collegamenti» e per il capitolo della Guida:
// • lo schema, «realistico» (Arduino, breadboard e moduli come sono davvero) o «schema» (compatto);
// • Bluetooth, scheda SD e pulsante sono componenti come gli altri: entrano nello schema e nei passi;
// • l'occorrente, contato dallo schema stesso (moduli, resistenze, ponticelli, breadboard);
// • i passi, uno per componente: dove infilarlo, i fili da foro a pin, le note pratiche.

import { useState } from "react";
import { Bluetooth, BluetoothSearching, Check, Maximize2, MemoryStick, Plus, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btOf, type SensorInstance } from "@/lib/sensors/rig";
import { SENSORS, type SensorType } from "@/lib/sensors/catalog";
import { useLab, bluetoothSetup, addSensor } from "@/lib/lab-store";
import { prefs, isPhoneWidth } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { GlideNav } from "./glide-nav";
import { BoardDiagram, ComponentThumb, boardPlan, ardName, type StepGroup } from "./board-diagram";
import { RigDiagram, buildModules, resistorsOf, OHMS, BAND_NAMES, type BtModule, type Conn, type Mod, type ModRow } from "./rig-diagram";
import { SdHowTo } from "./sd-controls";

type Style = "real" | "schema";
type BtKind = "hc06" | "ble";

const RED = "#dc2626", BLK = "#27272a", V33 = "#ea580c";
const connName = (c: Exclude<Conn, "NC">) => (typeof c === "number" ? ardName(c) : c === "3V3" ? "3.3V" : c);

// ---------------------------------------------------------------------------
// Occorrente
// ---------------------------------------------------------------------------
function Parts({ mods, count, nCols, boards, bt, sd }: { mods: Mod[]; count: { red: number; black: number; signal: number } | null; nCols: number; boards: number; bt: BtModule; sd: boolean }) {
  const t = useTranslations("rig.guide");
  const items: { qty: number; name: string; note?: string; thumb?: SensorType | "hc06" | "ble" }[] = [];
  items.push({ qty: 1, name: "Arduino Uno", note: t("withUsb") });
  if (boards > 1) items.push({ qty: boards, name: t("breadboards", { n: boards }), note: t("breadboardsNote") });
  else items.push({ qty: 1, name: nCols > 30 ? t("breadboard830") : t("breadboard400"), note: nCols > 30 ? t("moreColumns") : undefined });
  const byTitle = new Map<string, { qty: number; kind: string }>();
  for (const m of mods) {
    const name = m.title.includes(" · ") ? m.title.split(" · ").slice(1).join(" · ") : m.title;
    const e = byTitle.get(name);
    if (e) e.qty++; else byTitle.set(name, { qty: 1, kind: m.kind });
  }
  for (const [name, { qty, kind }] of byTitle) items.push({ qty, name, thumb: kind as SensorType });
  const res = resistorsOf(mods);
  for (const v of ["10k", "4k7", "2k", "1k", "220", "100"] as const)
    if (res[v]) items.push({ qty: res[v], name: t("resistors", { n: res[v], ohms: OHMS[v] }), note: BAND_NAMES[v] });
  if (count) items.push({ qty: count.red + count.black + count.signal, name: t("jumpers"), note: t("jumpersNote", count) });
  if (mods.some((m) => m.kind === "sps30")) items.push({ qty: 1, name: t("spsCable"), note: t("spsCableNote") });
  if (sd) items.push({ qty: 1, name: t("microSd"), note: t("microSdNote") });
  if (bt || sd) items.push({ qty: 1, name: t("powerBank"), note: t("powerBankNote") });
  return (
    <ul className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted p-0.5">
            {it.thumb ? <ComponentThumb type={it.thumb} className="size-full" /> : <span className="text-xs font-semibold text-muted-foreground tabular">{it.qty}×</span>}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{it.thumb && it.qty > 1 ? `${it.qty}× ` : ""}{it.name}</span>
            {it.note && <span className="block text-xs text-muted-foreground">{it.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Passi
// ---------------------------------------------------------------------------
function WireLine({ color, from, to, part, dashed }: { color: string; from: string; to: string; part?: string; dashed?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="h-1 w-4 shrink-0 rounded-full"
        style={dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 6px)` } : { background: color }} />
      <span className="font-mono font-semibold">{from}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-mono font-semibold">{to}</span>
      {part && <span className="text-muted-foreground">{part}</span>}
    </li>
  );
}

function StepCard({ n, title, color, thumb, place, children }: { n: number; title: string; color: string; thumb?: SensorType | "hc06" | "ble"; place?: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border p-3">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{n}</span>
        {thumb && <span className="hidden size-11 place-items-center rounded-md bg-muted p-1 sm:grid"><ComponentThumb type={thumb} className="size-full" /></span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        <p className="text-sm font-semibold">{title}</p>
        {place && <p className="text-muted-foreground">{place}</p>}
        {children}
      </div>
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
    <div className="mt-1 flex flex-col gap-2 rounded-md bg-muted/50 p-2.5">
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

function Steps({ sensors, bt, style }: { sensors: SensorInstance[]; bt: BtModule; style: Style }) {
  const t = useTranslations("rig.guide");
  /** Il componente in più di un piedino, a parole (schema compatto). */
  const viaPart = (r: ModRow) =>
    r.via === "divider" ? t("viaDivider")
    : r.via === "series" ? t("viaSeries", { ohms: OHMS[r.res ?? "220"] })
    : r.via === "pullup" ? t("viaPullup", { ohms: OHMS[r.res ?? "10k"] })
    : undefined;
  const plan = boardPlan(sensors, bt);
  if (!plan) return null;
  const real = style === "real";
  const groups = plan.groups;
  const modGroups = groups.filter((g) => g.mod);
  // colonne dei bus (un pin di Arduino per più moduli): si montano dopo l'alimentazione
  const busGroups = real ? groups.slice(1).filter((g) => !g.mod) : [];
  let n = 0;
  const wiresOf = (g: StepGroup) => real
    ? g.wires
    : g.mod!.rows.flatMap((r) => r.conn === "NC" ? [] : [{ color: r.conn === "5V" ? RED : r.conn === "3V3" ? V33 : r.conn === "GND" ? BLK : g.color, from: r.label, to: connName(r.conn), dashed: r.dashed, part: viaPart(r) }]);
  return (
    <ol className="flex flex-col gap-2">
      <StepCard n={++n} title={real ? t("power") : t("power5vGnd")} color={RED}
        place={real ? groups[0].place : t("powerPlace")}>
        {real && <ul className="flex flex-col gap-1">{groups[0].wires.map((w, k) => <WireLine key={k} {...w} />)}</ul>}
        <Notes items={[t("unplugged")]} />
      </StepCard>
      {busGroups.map((g, i) => (
        <StepCard key={`bus${i}`} n={++n} title={g.title} color={g.color} place={g.place}>
          <ul className="flex flex-col gap-1">{g.wires.map((w, k) => <WireLine key={k} {...w} />)}</ul>
        </StepCard>
      ))}
      {modGroups.map((g, i) => {
        const m = g.mod!;
        const isBt = m.kind === "hc06" || m.kind === "ble";
        return (
          <StepCard key={i} n={++n} title={g.title} color={g.color} thumb={m.kind as SensorType} place={real ? g.place : undefined}>
            <ul className="flex flex-col gap-1">{wiresOf(g).map((w, k) => <WireLine key={k} {...w} />)}</ul>
            <Notes items={m.notes} />
            {isBt && <BluetoothHowTo kind={m.kind as BtKind} />}
            {m.kind === "sd" && <SdHowTo />}
          </StepCard>
        );
      })}
      <StepCard n={++n} title={t("finalCheck")} color="#16a34a">
        <ul className="flex flex-col gap-1">
          {[
            t("checkGnd"),
            t("checkShort"),
            t("checkPins"),
            ...(bt ? [t("checkBt")] : []),
          ].map((line) => <li key={line} className="flex gap-1.5"><Check className="mt-px size-3.5 shrink-0 text-success" />{line}</li>)}
        </ul>
        <p className="text-muted-foreground">{t("finalNote")}</p>
      </StepCard>
    </ol>
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
  if (!sensors.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <Unplug className="size-5" />
        {t("empty")}
      </div>
    );
  }
  const mods = buildModules(sensors, bt);
  const plan = boardPlan(sensors, bt);
  const draw = (cls: string) => style === "real"
    ? <BoardDiagram sensors={sensors} bt={bt} className={cls} />
    : <RigDiagram sensors={sensors} bt={bt} className={`${cls} text-foreground [&_text]:fill-current`} />;
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GlideNav label={t("styleLabel")} value={style} size="sm"
            items={[{ id: "real", content: t("styleReal"), onSelect: () => setStyle("real") }, { id: "schema", content: t("styleSchema"), onSelect: () => setStyle("schema") }]} />
          <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={t("fullscreen")} onClick={() => setBig(true)}><Maximize2 /></Button>
        </div>
        <button type="button" onClick={() => setBig(true)} className="block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background p-2 text-left" aria-label={t("fullscreen")}>
          <div key={`${style}${bt}`} className="mz-enter">{draw("h-auto w-full")}</div>
        </button>
        <p className="text-xs text-muted-foreground">{t("legend")}{style === "real" ? ` ${t("legendReal")}` : ""}{style === "real" && plan && plan.boards > 1 ? ` ${t("legendBoards")}` : ""}</p>
        {plan && !plan.fits && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{t("tooBig")}</p>}
        {editable && !bt && !sd && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="mr-1">{t("noCable")}</span>
            <Button size="xs" variant="outline" disabled={running} onClick={() => addSensor("hc06")}><Plus /><Bluetooth /> HC-06</Button>
            <Button size="xs" variant="outline" disabled={running} onClick={() => addSensor("ble")}><Plus /><BluetoothSearching /> Bluetooth LE</Button>
            <Button size="xs" variant="outline" disabled={running} onClick={() => addSensor("sd")}><Plus /><MemoryStick /> {t("sdCard")}</Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{t("parts")}</h4>
        <Parts mods={mods} count={style === "real" && plan ? plan.count : null} nCols={plan?.nCols ?? 30} boards={plan?.boards ?? 1} bt={bt} sd={sd} />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{t("steps")}</h4>
        <Steps sensors={sensors} bt={bt} style={style} />
      </section>

      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="flex h-[92svh] max-h-none flex-col gap-3 p-4 sm:max-w-[min(96vw,1400px)]">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className={cn("min-h-0 flex-1 overflow-auto rounded-lg border bg-background p-2")}>
            {draw("h-auto min-w-[900px] w-full")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
