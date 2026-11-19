"use client";

import { LayoutGrid, TriangleExclamationPoint } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLab, currentExp } from "@/lib/lab-store";
import { audioSupported } from "@/lib/mosaicus/audio.js";
import { cn } from "@/lib/utils";
import { LabPicker } from "./lab-picker";
import { Coach } from "./coach";
import { RunCard } from "./run-card";
import { ChartCard } from "./chart-card";
import { SidePanel } from "./side-panel";
import { ConnectionControls, deviceSupport } from "./connection-controls";
import { toneBg } from "./tone";
import { ScopePanel } from "@/components/instruments/scope-panel";
import { SynthPanel } from "@/components/instruments/synth-panel";

function SupportBanner() {
  const exp = currentExp();
  if (exp.source === "audio") {
    if (audioSupported()) return null;
    return (
      <Alert variant="destructive"><TriangleExclamationPoint /><AlertTitle>Audio non disponibile</AlertTitle>
        <AlertDescription>Questo browser non supporta la Web Audio API: prova con Chrome, Edge, Firefox o Safari aggiornati.</AlertDescription></Alert>
    );
  }
  if (deviceSupport() || exp.optionalLink) return null;
  const phone = exp.source === "phone";
  return (
    <Alert><TriangleExclamationPoint /><AlertTitle>{phone ? "Sensori non raggiungibili da questo browser" : "Questo browser non parla con Arduino"}</AlertTitle>
      <AlertDescription>
        {phone
          ? "Apri Mosaicus sul telefono con Chrome (Android) o Safari (iPhone). Il simulatore funziona comunque."
          : "Serve Chrome o Edge su computer (Web Serial API). Su questo dispositivo puoi usare i lab con i sensori del telefono, gli strumenti audio e il simulatore."}
      </AlertDescription>
    </Alert>
  );
}

export function LabHeading({ onPick }: { onPick: () => void }) {
  const exp = currentExp();
  const Icon = exp.icon;
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-tone-ink", toneBg[exp.tone])}><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{exp.topic}</p>
        <h2 className="truncate text-xl font-bold tracking-tight">{exp.title}</h2>
        <p className="truncate text-sm text-muted-foreground">{exp.subtitle}</p>
      </div>
      <Button variant="outline" size="sm" className="lg:hidden" onClick={onPick}><LayoutGrid /> Cambia lab</Button>
    </div>
  );
}

export function MeasurePage() {
  const expId = useLab((s) => s.expId);
  const labsOpen = useLab((s) => s.labsOpen);
  const exp = currentExp();
  void expId;
  const setLabs = (open: boolean) => useLab.setState({ labsOpen: open });
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 p-3 sm:p-4 lg:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
      <aside className="hidden lg:block">
        <Card className="sticky top-[4.5rem] max-h-[calc(100svh-5.5rem)] overflow-y-auto p-3">
          <LabPicker />
        </Card>
      </aside>

      <section className="flex min-w-0 flex-col gap-4">
        <LabHeading onPick={() => setLabs(true)} />
        <div className="lg:hidden"><ConnectionControls className="flex-wrap" /></div>
        <SupportBanner />
        {exp.kind === "scope" ? <ScopePanel key={exp.id} exp={exp} />
          : exp.kind === "synth" ? <SynthPanel key={exp.id} exp={exp} />
            : (
              <>
                <Coach />
                <RunCard />
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
    </div>
  );
}
