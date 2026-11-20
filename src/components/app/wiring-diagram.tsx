"use client";
// La guida ai collegamenti, unica per la scheda «Collegamenti» e per il capitolo della Guida:
// • lo schema, «realistico» (Arduino, breadboard e moduli come sono davvero) o «schema» (compatto);
// • Bluetooth, scheda SD e pulsante sono componenti come gli altri: entrano nello schema e nei passi;
// • l'occorrente, contato dallo schema stesso (moduli, resistenze, ponticelli, breadboard);
// • i passi, uno per componente: dove infilarlo, i fili da foro a pin, le note pratiche.

import { useState } from "react";
import { Bluetooth, BluetoothSearching, Check, Maximize2, MemoryStick, Plus, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { btOf, type SensorInstance } from "@/lib/sensors/rig";
import { SENSORS, type SensorType } from "@/lib/sensors/catalog";
import { useLab, bluetoothSetup, addSensor } from "@/lib/lab-store";
import { prefs, isPhoneWidth } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { GlideNav } from "./glide-nav";
import { BoardDiagram, ComponentThumb, boardPlan, ardName, type StepGroup } from "./board-diagram";
import { RigDiagram, buildModules, resistorsOf, OHMS, BAND_NAMES, type BtModule, type Mod, type ModRow } from "./rig-diagram";
import { SdHowTo } from "./sd-controls";

type Style = "real" | "schema";
type BtKind = "hc06" | "ble";

const RED = "#dc2626", BLK = "#27272a";
const connName = (c: "5V" | "GND" | number) => (typeof c === "number" ? ardName(c) : c);
/** Il componente in più di un piedino, a parole (schema compatto). */
const viaPart = (r: ModRow) =>
  r.via === "divider" ? "(con il partitore 1 kΩ + 2 kΩ)"
  : r.via === "series" ? `(attraverso una resistenza da ${OHMS[r.res ?? "220"]})`
  : r.via === "pullup" ? `(più ${OHMS[r.res ?? "10k"]} tra il piedino e 5V)`
  : undefined;

// ---------------------------------------------------------------------------
// Occorrente
// ---------------------------------------------------------------------------
function Parts({ mods, count, nCols, bt, sd }: { mods: Mod[]; count: { red: number; black: number; signal: number } | null; nCols: number; bt: BtModule; sd: boolean }) {
  const items: { qty: number; name: string; note?: string; thumb?: SensorType | "hc06" | "ble" }[] = [];
  items.push({ qty: 1, name: "Arduino Uno", note: "con il cavo USB" });
  items.push({ qty: 1, name: nCols > 30 ? "Breadboard da 830 fori" : "Breadboard da 400 fori", note: nCols > 30 ? "servono più di 30 colonne" : undefined });
  const byTitle = new Map<string, { qty: number; kind: string }>();
  for (const m of mods) {
    const name = m.title.includes(" · ") ? m.title.split(" · ").slice(1).join(" · ") : m.title;
    const e = byTitle.get(name);
    if (e) e.qty++; else byTitle.set(name, { qty: 1, kind: m.kind });
  }
  for (const [name, { qty, kind }] of byTitle) items.push({ qty, name, thumb: kind as SensorType });
  const res = resistorsOf(mods);
  for (const v of ["10k", "4k7", "2k", "1k", "220", "100"] as const)
    if (res[v]) items.push({ qty: res[v], name: `Resistenz${res[v] > 1 ? "e" : "a"} da ${OHMS[v]}`, note: BAND_NAMES[v] });
  if (count) items.push({ qty: count.red + count.black + count.signal, name: "Ponticelli", note: `${count.red} rossi, ${count.black} neri, ${count.signal} colorati` });
  if (sd) items.push({ qty: 1, name: "Scheda microSD", note: "FAT32, fino a 32 GB" });
  if (bt || sd) items.push({ qty: 1, name: "Power bank", note: "per alimentare Arduino senza computer (o una pila da 9 V nel jack)" });
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
  return <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground marker:text-muted-foreground/50">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

/** Il blocco in più del Bluetooth: quale modulo, configurarlo, collegarsi. */
export function BluetoothHowTo({ kind }: { kind: BtKind }) {
  const canSetup = useLab((s) => s.linkKind === "arduino" && s.ready && s.transport === "serial");
  const running = useLab((s) => s.running);
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-md bg-muted/50 p-2.5">
      <p><b className="font-semibold">Dove funziona.</b>{" "}
        {kind === "ble"
          ? "Chrome su computer e Android; su iPhone e iPad nel browser gratuito Bluefy. Non va associato: si sceglie dall'app."
          : "Chrome su Android (non su iPhone). Va associato prima nelle impostazioni Bluetooth del telefono, PIN 1234."}
      </p>
      <p><b className="font-semibold">Configurazione, una volta sola.</b> Con Arduino collegato via USB, premi «Configura»: il modulo prende il nome «MosaicusNeo» e la velocità di 115200 baud.</p>
      <p><b className="font-semibold">Per misurare.</b>{" "}
        {kind === "ble" ? "Arduino sul power bank, poi «Collega» → menu ▾ → «Bluetooth LE»." : "Arduino sul power bank, poi «Collega via Bluetooth»."}
      </p>
      {canSetup ? (
        <Button size="sm" variant="outline" className="self-start" disabled={running} onClick={() => void bluetoothSetup(kind)}>
          <Bluetooth /> Configura {kind === "ble" ? "il modulo BLE" : "l'HC-06"}
        </Button>
      ) : (
        <p className="text-muted-foreground">Il pulsante «Configura» compare qui quando Arduino è collegato con il cavo USB.</p>
      )}
    </div>
  );
}

function Steps({ sensors, bt, style }: { sensors: SensorInstance[]; bt: BtModule; style: Style }) {
  const plan = boardPlan(sensors, bt);
  if (!plan) return null;
  const real = style === "real";
  const groups = plan.groups;
  const modGroups = groups.filter((g) => g.mod);
  let n = 0;
  const wiresOf = (g: StepGroup) => real
    ? g.wires
    : g.mod!.rows.map((r) => ({ color: r.conn === "5V" ? RED : r.conn === "GND" ? BLK : g.color, from: r.label, to: connName(r.conn), dashed: r.dashed, part: viaPart(r) }));
  return (
    <ol className="flex flex-col gap-2">
      <StepCard n={++n} title={real ? "Alimentazione" : "5V e GND"} color={RED}
        place={real ? groups[0].place : "Ogni componente prende 5V e GND da Arduino: con la breadboard, attraverso i binari + e −."}>
        {real && <ul className="flex flex-col gap-1">{groups[0].wires.map((w, k) => <WireLine key={k} {...w} />)}</ul>}
        <Notes items={["Collega tutto con Arduino staccato dal computer."]} />
      </StepCard>
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
      <StepCard n={++n} title="Controllo finale" color="#16a34a">
        <ul className="flex flex-col gap-1">
          {[
            "Tutti i GND sono collegati insieme.",
            "Nessun filo va direttamente da 5V a GND.",
            "Ogni filo colorato arriva al pin indicato nella scheda Componenti.",
            ...(bt ? ["Durante il caricamento del firmware il filo su D0 è staccato."] : []),
          ].map((t) => <li key={t} className="flex gap-1.5"><Check className="mt-px size-3.5 shrink-0 text-success" />{t}</li>)}
        </ul>
        <p className="text-muted-foreground">Poi collega Arduino al computer: il LED «ON» si accende.</p>
      </StepCard>
    </ol>
  );
}

// ---------------------------------------------------------------------------
// La guida completa
// ---------------------------------------------------------------------------
/** sensors: i componenti da collegare; editable: è il progetto aperto (si possono aggiungere Bluetooth e scheda SD da qui) */
export function WiringGuide({ sensors: all, editable = false }: { sensors: SensorInstance[]; editable?: boolean }) {
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
        Aggiungi un componente per vedere come collegarlo.
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
          <GlideNav label="Tipo di schema" value={style} size="sm"
            items={[{ id: "real", content: "Realistico", onSelect: () => setStyle("real") }, { id: "schema", content: "Schema", onSelect: () => setStyle("schema") }]} />
          <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Schema a tutto schermo" onClick={() => setBig(true)}><Maximize2 /></Button>
        </div>
        <button type="button" onClick={() => setBig(true)} className="block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background p-2 text-left" aria-label="Schema a tutto schermo">
          <div key={`${style}${bt}`} className="mz-enter">{draw("h-auto w-full")}</div>
        </button>
        <p className="text-xs text-muted-foreground">Rosso 5V · nero GND · un colore per componente · tratteggio = facoltativo.{style === "real" ? " Colonne 1, 2, 3… e righe a–j come sulla breadboard." : ""}</p>
        {editable && !bt && !sd && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="mr-1">Senza cavo:</span>
            <Button size="xs" variant="outline" disabled={running} onClick={() => addSensor("hc06")}><Plus /><Bluetooth /> HC-06</Button>
            <Button size="xs" variant="outline" disabled={running} onClick={() => addSensor("ble")}><Plus /><BluetoothSearching /> Bluetooth LE</Button>
            <Button size="xs" variant="outline" disabled={running} onClick={() => addSensor("sd")}><Plus /><MemoryStick /> Scheda SD</Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">Occorrente</h4>
        <Parts mods={mods} count={style === "real" && plan ? plan.count : null} nCols={plan?.nCols ?? 30} bt={bt} sd={sd} />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">Passo passo</h4>
        <Steps sensors={sensors} bt={bt} style={style} />
      </section>

      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="flex h-[92svh] max-h-none flex-col gap-3 p-4 sm:max-w-[min(96vw,1400px)]">
          <DialogHeader>
            <DialogTitle>Schema dei collegamenti</DialogTitle>
            <DialogDescription>Rosso 5V, nero GND. Sul telefono scorri e ingrandisci con due dita.</DialogDescription>
          </DialogHeader>
          <div className={cn("min-h-0 flex-1 overflow-auto rounded-lg border bg-background p-2")}>
            {draw("h-auto min-w-[900px] w-full")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
