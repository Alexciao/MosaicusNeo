"use client";

import { Crosshair, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLab, start, stop, zeroPosition, setSessionName, commitSessionName, currentExp } from "@/lib/lab-store";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";

function Readouts() {
  const rows = useLab((s) => s.rows);
  const exp = currentExp();
  const last = (key: string) => {
    for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (typeof v === "number" && Number.isFinite(v)) return v; }
    return NaN;
  };
  const tEnd = rows.length ? rows[rows.length - 1].t : 0;
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {exp.readouts.map((r, i) => (
        <div key={r.key} className={cn("min-w-28 rounded-lg border px-3 py-1.5", i === 0 ? "border-primary/25 bg-primary/5" : "bg-muted/50")}>
          <p className="text-[0.7rem] font-medium text-muted-foreground">{r.label}</p>
          <p className="tabular leading-tight">
            <b className={cn("font-semibold tracking-tight", i === 0 ? "text-2xl text-primary" : "text-lg")}>{fmtVal(last(r.key), r.digits)}</b>
            <span className="ml-1 text-xs text-muted-foreground">{r.unit}</span>
          </p>
        </div>
      ))}
      <div className="min-w-24 rounded-lg border border-dashed px-3 py-1.5">
        <p className="text-[0.7rem] font-medium text-muted-foreground">Tempo · punti</p>
        <p className="tabular leading-tight"><b className="text-lg font-bold">{fmtVal(tEnd, 1)}</b><span className="ml-1 text-xs text-muted-foreground">s · {rows.length}</span></p>
      </div>
    </div>
  );
}

export function RunCard() {
  const ready = useLab((s) => s.ready);
  const running = useLab((s) => s.running);
  const name = useLab((s) => s.sessionName);
  const exp = currentExp();
  return (
    <Card className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button size="lg" variant="destructive" className="min-w-28" onClick={() => void stop()}><Square className="fill-current" /> Ferma</Button>
        ) : (
          <Button size="lg" className="min-w-28" disabled={!ready} onClick={() => void start()}><Play className="fill-current" /> Avvia</Button>
        )}
        {exp.lineType === "S" && (
          <Button variant="outline" size="lg" onClick={zeroPosition} title="Imposta come origine la posizione attuale"><Crosshair /> Azzera</Button>
        )}
        <Input
          value={name}
          onChange={(e) => setSessionName(e.target.value)}
          onBlur={() => void commitSessionName()}
          placeholder="Nome della misura (es. Gruppo 3 – piano inclinato)"
          aria-label="Nome della misura"
          className="h-9 min-w-56 flex-1"
        />
      </div>
      <div className="xl:ml-auto"><Readouts /></div>
    </Card>
  );
}
