"use client";
// La scheda della misura: il prossimo gesto (collega → avvia → ferma) e le letture in evidenza.

import { LiveChips, DeviceMirror } from "./device-status";
import { Cpu, Crosshair, LoaderCircle, Pencil, Play, Square, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useLab, start, stop, zeroPosition, showWiring, setSessionName, commitSessionName, readoutsOf, canStart, rigHas, guideStep, connect,
} from "@/lib/lab-store";
import { sensorLabel } from "@/lib/sensors/rig";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { ConnectButton } from "./connection-controls";

function Readouts() {
  const rows = useLab((s) => s.rows);
  const rig = useLab((s) => s.rig);
  const readouts = readoutsOf();
  // stesso nome per due sensori (es. due temperature): aggiungo il nome del sensore
  const dup = (name: string) => readouts.filter((r) => r.name === name).length > 1;
  const label = (r: (typeof readouts)[number]) => {
    const s = rig.sensors.find((x) => x.id === r.sensorId);
    const n = r.name.charAt(0).toUpperCase() + r.name.slice(1);
    return dup(r.name) && s ? `${n} · ${sensorLabel(s)}` : n;
  };
  const last = (key: string) => {
    for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (typeof v === "number" && Number.isFinite(v)) return v; }
    return NaN;
  };
  const tEnd = rows.length ? rows[rows.length - 1].t : 0;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap">
      {readouts.map((r) => (
        <div key={r.key} className="min-w-0">
          <p className="truncate text-xs text-muted-foreground" title={label(r)}>{label(r)}</p>
          <p className="tabular leading-none">
            <b className="text-2xl font-semibold tracking-tight">{fmtVal(last(r.key), r.digits)}</b>
            <span className="ml-1 text-sm text-muted-foreground">{r.unit}</span>
          </p>
        </div>
      ))}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Tempo</p>
        <p className="tabular leading-none"><b className="text-2xl font-semibold tracking-tight">{fmtVal(tEnd, 1)}</b><span className="ml-1 text-sm text-muted-foreground">s</span></p>
      </div>
    </div>
  );
}

export function RunCard() {
  const running = useLab((s) => s.running);
  const name = useLab((s) => s.sessionName);
  const startable = useLab(canStart);
  const step = useLab(guideStep);
  const sonar = useLab((s) => rigHas(["sonar"], s.rig));
  return (
    <Card className="gap-4 p-4">
      <label className="flex items-center gap-2 text-muted-foreground">
        <Pencil className="size-3.5 shrink-0" />
        <input value={name} onChange={(e) => setSessionName(e.target.value)} onBlur={() => void commitSessionName()}
          placeholder="Nome della misura, es. Gruppo 3 · piano inclinato" aria-label="Nome della misura"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground" />
      </label>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {step === "link" ? (
            <>
              <ConnectButton size="lg" />
              <Button size="lg" variant="outline" onClick={() => void connect("sim")}><Cpu /> Simulatore</Button>
              <Button size="lg" variant="ghost" className="text-muted-foreground" onClick={showWiring}><Plug /> Schema dei collegamenti</Button>
            </>
          ) : step === "wait" ? (
            <Button size="lg" variant="outline" disabled><LoaderCircle className="animate-spin" /> Collegamento…</Button>
          ) : running ? (
            <Button size="lg" variant="destructive" className="min-w-32" onClick={() => void stop()}><Square className="fill-current" /> Ferma</Button>
          ) : (
            <Button size="lg" className="min-w-32" disabled={!startable} onClick={() => void start()}><Play className="fill-current" /> Avvia</Button>
          )}
          {sonar && step !== "link" && step !== "wait" && (
            <Button size="icon-lg" variant="outline" onClick={zeroPosition} title="Usa la posizione attuale come origine" aria-label="Azzera la posizione"><Crosshair /></Button>
          )}
        </div>
        <div className={cn("min-w-0 flex-1 md:border-l md:pl-5", step === "link" && "opacity-50")}><Readouts /></div>
      </div>
      <LiveChips />
      <DeviceMirror />
    </Card>
  );
}
