"use client";
// La scheda SD come componente: «Prepara Arduino» (manda e salva la configurazione, prova la
// scheda) e «Importa dalla scheda» (i file LOGnnnnn.CSV entrano nel Quaderno), con i passi.

import { useRef } from "react";
import { CircleCheck, FolderInput, LoaderCircle, TriangleExclamationPoint, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, prepareSd, importSdFiles } from "@/lib/lab-store";
import { cn } from "@/lib/utils";

/** Bottone che apre la scelta dei file della scheda SD e li importa nel Quaderno. */
export function SdImportButton({ size = "sm", variant = "outline", className }: { size?: "sm" | "xs"; variant?: "outline" | "ghost"; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept=".csv,.CSV,text/csv,text/plain" multiple hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) void importSdFiles(files); }} />
      <Button size={size} variant={variant} className={className} onClick={() => input.current?.click()}><FolderInput /> Importa dalla scheda SD</Button>
    </>
  );
}

export function SdHowTo({ className }: { className?: string }) {
  const rig = useLab((s) => s.rig);
  const ready = useLab((s) => s.ready);
  const linkKind = useLab((s) => s.linkKind);
  const running = useLab((s) => s.running);
  const check = useLab((s) => s.sdCheck);
  const button = rig.sensors.some((s) => s.type === "button");
  const canPrep = ready && (linkKind === "arduino" || linkKind === "simulatore") && !running;
  return (
    <div className={cn("flex flex-col gap-2 rounded-md bg-muted/50 p-2.5 text-xs", className)}>
      <ol className="list-decimal space-y-1 pl-4">
        <li><b className="font-semibold">Prepara, una volta per progetto.</b> Arduino collegato con il cavo USB: «Prepara Arduino» gli manda sensori, pin e ritmi, li salva (restano anche da spento) e prova la scheda.</li>
        <li><b className="font-semibold">Registra.</b> Stacca il cavo e alimenta Arduino con un power bank o una pila da 9 V. {button
          ? "Premi il pulsante per iniziare, premilo di nuovo per fermare: ogni registrazione è un file nuovo."
          : "Registra da quando lo accendi a quando lo spegni (aggiungi un pulsante per decidere tu quando). I dati sono salvati ogni 2 secondi: staccando la corrente perdi al massimo gli ultimi istanti."}</li>
        <li><b className="font-semibold">Importa.</b> Metti la scheda nel computer (o nel telefono con un adattatore) e scegli i file LOG00001.CSV, LOG00002.CSV…: diventano misure del Quaderno, con le grandezze e i grafici di sempre.</li>
      </ol>
      <p className="text-muted-foreground">Se colleghi l&apos;app mentre Arduino registra, la registrazione si chiude e si misura come sempre.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canPrep || check?.state === "busy"} onClick={() => void prepareSd()}
          title={canPrep ? "Manda e salva la configurazione, poi prova la scheda" : "Collega prima Arduino con il cavo USB"}>
          {check?.state === "busy" ? <LoaderCircle className="animate-spin" /> : <Upload />} Prepara Arduino
        </Button>
        <SdImportButton />
      </div>
      {!canPrep && !running && <p className="text-muted-foreground">«Prepara Arduino» si attiva con Arduino collegato via cavo USB (firmware v1.5).</p>}
      {check && check.state !== "busy" && (
        <p className={cn("flex gap-1.5", check.state === "ok" ? "text-success" : "text-destructive")}>
          {check.state === "ok" ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <TriangleExclamationPoint className="mt-px size-3.5 shrink-0" />}
          {check.text}
        </p>
      )}
    </div>
  );
}
