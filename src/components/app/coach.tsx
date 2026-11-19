"use client";
// Percorso guidato: una striscia sopra il grafico dice qual è il prossimo gesto.
// 1 scegli il lab · 2 sorgente · 3 Avvia · 4 Ferma · 5 scegli un tratto · 6 invia e vai a Elaborazione.

import { ArrowRight, Cpu, Send, Smartphone, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, guideStep, connect, sendSelection, goElab, currentExp } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { deviceSupport } from "./connection-controls";

const STEPS = 6;
const GUIDE = {
  link: { n: 2, text: "Scegli da dove arrivano i dati" },
  wait: { n: 2, text: "Collegamento in corso…" },
  start: { n: 3, text: "Premi «Avvia»" },
  stop: { n: 4, text: "Premi «Ferma» quando vuoi" },
  pick: { n: 5, text: "Trascina sul grafico per scegliere un tratto" },
  send: { n: 6, text: "Invia il tratto a Elaborazione" },
  go: { n: 6, text: "Tratto inviato!" },
} as const;

export function Coach() {
  const step = useLab(guideStep);
  if (!step) return null;
  const { n, text } = GUIDE[step];
  const phone = currentExp().source === "phone";
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-2.5 shadow-xs">
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-all", i + 1 < n ? "w-3 bg-primary/50" : i + 1 === n ? "w-6 bg-primary" : "w-3 bg-foreground/15")} />
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
        {text}
      </p>
      <div className="ml-auto flex flex-wrap gap-2">
        {step === "link" && (
          <>
            <Button size="sm" disabled={!deviceSupport()} onClick={() => void connect("device")}>
              {phone ? <Smartphone /> : <Usb />} {phone ? "Attiva sensori del telefono" : "Collega Arduino"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void connect("sim")}><Cpu /> Simulatore</Button>
          </>
        )}
        {step === "send" && <Button size="sm" onClick={() => void sendSelection()}><Send /> Invia a Elaborazione</Button>}
        {step === "go" && <Button size="sm" onClick={goElab}>Vai a Elaborazione <ArrowRight /></Button>}
      </div>
    </div>
  );
}
