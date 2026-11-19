"use client";
// Lo schema dei collegamenti, in due versioni: «realistico» (Arduino, breadboard e moduli come
// sono davvero, stile Tinkercad) e «schema» (compatto, più leggibile sul telefono). Sul telefono
// si può aprire a tutto schermo e scorrere.

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SensorInstance } from "@/lib/sensors/rig";
import { prefs, isPhoneWidth } from "@/lib/prefs";
import { GlideNav } from "./glide-nav";
import { BoardDiagram } from "./board-diagram";
import { RigDiagram, type BtModule } from "./rig-diagram";

type Style = "real" | "schema";

export function WiringDiagram({ sensors, bt = null }: { sensors: SensorInstance[]; bt?: BtModule }) {
  const [style, setStyleState] = useState<Style>(() => prefs.get<Style>("mosaicus.diagram", isPhoneWidth() ? "schema" : "real"));
  const setStyle = (s: Style) => { setStyleState(s); prefs.set("mosaicus.diagram", s); };
  const [big, setBig] = useState(false);
  if (!sensors.length && !bt) return null;
  const draw = (cls: string) => style === "real"
    ? <BoardDiagram sensors={sensors} bt={bt} className={cls} />
    : <RigDiagram sensors={sensors} bt={bt} className={`${cls} text-foreground [&_text]:fill-current`} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <GlideNav label="Tipo di schema" value={style} size="sm"
          items={[{ id: "real", content: "Realistico", onSelect: () => setStyle("real") }, { id: "schema", content: "Schema", onSelect: () => setStyle("schema") }]} />
        <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Ingrandisci lo schema" onClick={() => setBig(true)}><Maximize2 /></Button>
      </div>
      <button type="button" onClick={() => setBig(true)} className="block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-background p-2 text-left" aria-label="Ingrandisci lo schema">
        <div key={style} className="mz-enter">{draw("h-auto w-full")}</div>
      </button>
      <p className="text-xs text-muted-foreground">Rosso = 5V, nero = GND, un colore per sensore. Collega con Arduino staccato dal computer; tutti i GND insieme.</p>
      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="flex h-[92svh] max-h-none flex-col gap-3 p-4 sm:max-w-[min(96vw,1400px)]">
          <DialogHeader>
            <DialogTitle>Schema dei collegamenti</DialogTitle>
            <DialogDescription>Scorri e ingrandisci con le dita. Rosso = 5V, nero = GND.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background p-2">
            {draw("h-auto min-w-[900px] w-full")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
