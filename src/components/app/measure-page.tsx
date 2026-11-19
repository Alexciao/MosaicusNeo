"use client";

import { LayoutGrid, SlidersHorizontal, TriangleExclamationPoint, Plug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLab, labInfo, needsArduino, hasMap, openGuide, showWiring } from "@/lib/lab-store";
import { SENSORS, pinName } from "@/lib/sensors/catalog";
import { sensorLabel } from "@/lib/sensors/rig";
import { audioSupported } from "@/lib/mosaicus/audio.js";
import { cn } from "@/lib/utils";
import { LabPicker } from "./lab-picker";
import { RunCard } from "./run-card";
import { ChartCard } from "./chart-card";
import { MapCard } from "./map-card";
import { SidePanel } from "./side-panel";
import { RigEditor } from "./rig-editor";
import { ConnectionControls, canReachArduino } from "./connection-controls";
import { toneBg } from "./tone";
import { ScopePanel } from "@/components/instruments/scope-panel";
import { SynthPanel } from "@/components/instruments/synth-panel";

function SupportBanner() {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const info = labInfo(labId);
  if (info.instrument?.source === "audio") {
    if (audioSupported()) return null;
    return (
      <Alert variant="destructive"><TriangleExclamationPoint /><AlertTitle>Audio non disponibile</AlertTitle>
        <AlertDescription>Questo browser non supporta la Web Audio API: prova con Chrome, Edge, Firefox o Safari aggiornati.</AlertDescription></Alert>
    );
  }
  const arduino = info.instrument ? info.instrument.source === "arduino" && !info.instrument.optionalLink : needsArduino(rig);
  if (!arduino || canReachArduino()) return null;
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <Alert><TriangleExclamationPoint /><AlertTitle>Questo browser non parla con Arduino</AlertTitle>
      <AlertDescription>
        {ios
          ? "Safari non può collegarsi ad Arduino. Su iPhone e iPad apri MosaicusNeo nel browser gratuito Bluefy e usa un modulo Bluetooth LE (HM-10, AT-09, HC-08): vedi la «Guida». Il simulatore funziona comunque."
          : "Serve Chrome o Edge (computer o Android). Su Android ci si collega anche via Bluetooth, con un modulo HC-06 o BLE. Il simulatore funziona comunque."}
        <Button size="xs" variant="outline" className="mt-2" onClick={() => openGuide("field")}>Apri la guida</Button>
      </AlertDescription>
    </Alert>
  );
}

export function LabHeading({ onPick, onSensors }: { onPick: () => void; onSensors: () => void }) {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const modified = useLab((s) => s.modified);
  const info = labInfo(labId);
  const Icon = info.icon;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-tone-ink", toneBg[info.tone])}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{info.topic}</p>
          <h2 className="flex items-center gap-2 truncate text-xl font-bold tracking-tight">
            <span className="truncate">{info.title}</span>
            {modified && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-normal text-muted-foreground">personalizzato</span>}
          </h2>
          {info.kind !== "custom" && <p className="truncate text-sm text-muted-foreground">{info.subtitle}</p>}
        </div>
        <Button variant="outline" size="sm" className="lg:hidden" onClick={onPick}><LayoutGrid /> <span className="hidden sm:inline">Cambia lab</span></Button>
      </div>
      {!info.instrument && (
        <div className="flex flex-wrap items-center gap-1.5">
          {rig.sensors.map((s) => {
            const def = SENSORS[s.type];
            const SIcon = def.icon;
            return (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs">
                <SIcon className="size-3.5 text-muted-foreground" />
                <b className="font-medium">{sensorLabel(s)}</b>
                <span className="font-mono text-[0.68rem] text-muted-foreground">{def.pins.map((p) => pinName(s.pins[p.key])).join(" ")}</span>
              </span>
            );
          })}
          <Button variant="ghost" size="xs" onClick={onSensors} className="text-muted-foreground 2xl:hidden">
            <SlidersHorizontal /> {rig.sensors.length ? "Modifica sensori" : "Aggiungi sensori"}
          </Button>
          {!!rig.sensors.length && (
            <Button variant="ghost" size="xs" onClick={showWiring} className="text-muted-foreground">
              <Plug /> Come collegarli
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function MeasurePage() {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const labsOpen = useLab((s) => s.labsOpen);
  const rigOpen = useLab((s) => s.rigOpen);
  const info = labInfo(labId);
  const ins = info.instrument;
  const setLabs = (open: boolean) => useLab.setState({ labsOpen: open });
  const setRig = (open: boolean) => useLab.setState({ rigOpen: open });
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 p-3 sm:p-4 lg:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)_24rem]">
      <aside className="hidden lg:block">
        <Card className="sticky top-[4.5rem] max-h-[calc(100svh-5.5rem)] overflow-y-auto p-3">
          <LabPicker />
        </Card>
      </aside>

      <section className="flex min-w-0 flex-col gap-4">
        <LabHeading onPick={() => setLabs(true)} onSensors={() => setRig(true)} />
        {(ins ? ins.source === "arduino" : needsArduino(rig)) && <div className="lg:hidden"><ConnectionControls className="flex-wrap" /></div>}
        <SupportBanner />
        {ins?.kind === "scope" ? <ScopePanel key={ins.id} exp={ins} />
          : ins?.kind === "synth" ? <SynthPanel key={ins.id} exp={ins} />
            : !rig.sensors.length ? (
              <Card className="flex flex-col items-center gap-3 p-10 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-tone-saffron text-tone-ink"><SlidersHorizontal className="size-7" /></span>
                <h3 className="text-lg font-semibold">Un montaggio tutto tuo</h3>
                <p className="max-w-md text-sm text-muted-foreground">Scegli i sensori che hai collegato ad Arduino, anche più di uno insieme: l&apos;app ti mostra come collegarli, li legge con il ritmo giusto e li mette sugli stessi grafici.</p>
                <Button onClick={() => setRig(true)}>Aggiungi i sensori</Button>
              </Card>
            ) : (
              <>
                <RunCard />
                {hasMap(rig) && <MapCard />}
                <ChartCard />
              </>
            )}
      </section>

      <aside className="min-w-0 lg:col-start-2 2xl:col-start-3 2xl:row-start-1">
        <div className="2xl:sticky 2xl:top-[4.5rem]"><SidePanel /></div>
      </aside>

      <Sheet open={labsOpen} onOpenChange={setLabs}>
        <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
          <SheetHeader><SheetTitle>Scegli un lab</SheetTitle></SheetHeader>
          <div className="px-3 pb-6"><LabPicker onPicked={() => setLabs(false)} /></div>
        </SheetContent>
      </Sheet>
      <Sheet open={rigOpen} onOpenChange={setRig}>
        <SheetContent side="right" className="w-full overflow-x-hidden overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Sensori</SheetTitle></SheetHeader>
          <div className="px-4 pb-8"><RigEditor /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
