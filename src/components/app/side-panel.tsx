"use client";

import { useEffect, useRef, useState } from "react";
import { Bluetooth, CloudCheck, CloudUpload, FolderOpen, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SENSORS, pinName } from "@/lib/sensors/catalog";
import { useLab, labInfo, needsArduino, openSession, removeSession, bluetoothSetup } from "@/lib/lab-store";
import { useCloud } from "@/lib/cloud/sync";
import { confirm } from "@/lib/confirm";
import { prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { PinMap, WiringBlocks } from "./wiring";
import { RigEditor } from "./rig-editor";

/** Collegamenti del montaggio: mappa dei pin, uno schema per sensore, Bluetooth facoltativo. */
function RigWiring() {
  const rig = useLab((s) => s.rig);
  const labId = useLab((s) => s.labId);
  const linkKind = useLab((s) => s.linkKind);
  const ready = useLab((s) => s.ready);
  const running = useLab((s) => s.running);
  const info = labInfo(labId);
  const blocks = rig.sensors.flatMap((s) => {
    const def = SENSORS[s.type];
    const pins = Object.fromEntries(def.pins.map((p) => [p.key, pinName(s.pins[p.key])]));
    return def.wiring(pins, s.options).map((b) => ({ ...b, title: rig.sensors.length > 1 ? `${b.title} · ${s.label?.trim() || def.short}` : b.title }));
  });
  return (
    <div className="flex flex-col gap-3">
      <PinMap rig={rig} />
      <WiringBlocks blocks={[...blocks, ...(info.preset?.tips ?? [])]} />
      {needsArduino(rig) && (
        <details className="rounded-lg border p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold"><Bluetooth className="size-4" /> Senza cavo: Bluetooth HC-06 (facoltativo)</summary>
          <div className="pt-2">
            <WiringBlocks blocks={[{ title: "HC-06", schematic: "hc06", text: "Con un power bank su Arduino e l'HC-06, il telefono Android si collega senza cavo: Chrome → «Collega via Bluetooth». Una volta sola, collegati via USB: «Configura HC-06» (nome «MosaicusNeo», 115200 baud), poi associa «MosaicusNeo» nelle impostazioni Bluetooth (PIN 1234). Mentre carichi il firmware, stacca il filo TXD da D0." }]} />
            {linkKind === "arduino" && ready && (
              <Button size="sm" variant="outline" className="mt-2" disabled={running} onClick={() => void bluetoothSetup()}>
                <Bluetooth /> Configura HC-06
              </Button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function Notebook() {
  const sessions = useLab((s) => s.sessions);
  const current = useLab((s) => s.session?.id);
  const signedIn = useCloud((s) => !!s.user);
  if (sessions == null) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (!sessions.length) return <p className="text-sm text-muted-foreground">Ancora nessuna misura. Le misure si salvano qui da sole quando premi «Ferma».</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {sessions.map((s) => (
        <li key={s.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", current === s.id && "border-primary/30 bg-primary/5")}>
          <div className="min-w-0 flex-1">
            <b className="flex items-center gap-1.5 truncate text-sm">
              <span className="truncate">{s.name}</span>
              {signedIn && s.cloud && (s.dirty
                ? <CloudUpload className="size-3.5 shrink-0 text-muted-foreground" aria-label="da salvare nel cloud" />
                : <CloudCheck className="size-3.5 shrink-0 text-success" aria-label="salvata nel cloud" />)}
            </b>
            <small className="block truncate text-xs text-muted-foreground">
              {s.labTitle} · {new Date(s.created).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · {s.n} letture
            </small>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label={`Apri ${s.name}`} title="Apri" onClick={() => void openSession(s.id)}><FolderOpen /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Elimina ${s.name}`} title="Elimina" className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Eliminare «${s.name}»?`, description: "La misura sparisce dal Quaderno. I tratti già inviati a Elaborazione restano.", action: "Elimina", destructive: true })) await removeSession(s.id);
            }}>
            <Trash />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function SerialMonitor() {
  const log = useLab((s) => s.serialLog);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Le righe grezze che arrivano da Arduino: il dato «com&apos;è», prima di ogni conversione. «D,slot,t,…» sono le letture dei sensori.</p>
      <pre ref={ref} className="h-72 overflow-auto rounded-lg bg-screen p-3 font-mono text-[0.72rem] leading-relaxed text-lime/90">
        {log.length ? log.join("\n") : "In attesa di dati…"}
      </pre>
    </div>
  );
}

export function SidePanel() {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const info = labInfo(labId);
  const ins = info.instrument;
  const tabs = (ins
    ? [["wiring", "Collegamenti"], ins.source !== "audio" ? ["serial", "Seriale"] : null]
    : [["sensors", `Sensori${rig.sensors.length ? ` (${rig.sensors.length})` : ""}`], ["wiring", "Collegamenti"], ["notebook", "Quaderno"], needsArduino(rig) ? ["serial", "Seriale"] : null]
  ).filter(Boolean) as [string, string][];
  const [tab, setTab] = useState(() => prefs.get("mosaicus.sideTab", "sensors"));
  const active = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  return (
    <Card className="gap-0 p-0">
      <Tabs value={active} onValueChange={(v) => { setTab(String(v)); prefs.set("mosaicus.sideTab", v); }}>
        <div className="border-b p-2">
          <TabsList className="w-full">
            {tabs.map(([id, label]) => <TabsTrigger key={id} value={id} className="text-xs">{label}</TabsTrigger>)}
          </TabsList>
        </div>
        <div className="p-4">
          <TabsContent value="sensors"><RigEditor /></TabsContent>
          <TabsContent value="wiring">{ins ? <WiringBlocks blocks={ins.wiring} /> : <RigWiring />}</TabsContent>
          <TabsContent value="notebook"><Notebook /></TabsContent>
          <TabsContent value="serial"><SerialMonitor /></TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
