"use client";

import { ArrowLeft, ChartLine, FileSpreadsheet, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkbench, exportCheckedBoxes } from "@/lib/workbench-store";
import { showPage } from "@/lib/lab-store";
import { BoxCard } from "./box-card";

export function WorkbenchPage() {
  const boxes = useWorkbench((s) => s.boxes);
  const loaded = useWorkbench((s) => s.loaded);
  const nChecked = boxes.filter((b) => b.checked).length;
  const all = boxes.length > 0 && boxes.every((b) => b.checked);
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-3 sm:p-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Button size="sm" variant="ghost" className="-ml-2 mb-1" onClick={() => showPage("misura")}><ArrowLeft /> Torna alla misura</Button>
          <h2 className="text-xl font-bold tracking-tight">Elaborazione</h2>
          <p className="text-sm text-muted-foreground">Ogni riquadro è un tratto inviato da Misura. Spunta quelli da esportare.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!boxes.length} onClick={() => useWorkbench.getState().setAllChecked(!all)}>
            <ListChecks /> {all ? "Togli tutte le spunte" : "Spunta tutti"}
          </Button>
          <Button disabled={!nChecked} onClick={exportCheckedBoxes}><FileSpreadsheet /> Esporta in Excel ({nChecked})</Button>
        </div>
      </Card>

      {loaded && !boxes.length && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-tone-lime text-tone-ink"><ChartLine className="size-7" /></span>
          <h3 className="text-lg font-semibold">Qui arrivano i tratti che salvi</h3>
          <p className="max-w-md text-sm text-muted-foreground">In <b>Misura</b>: trascina su un grafico per scegliere un tratto, poi <b>Invia a Elaborazione</b>. Anche l&apos;oscilloscopio può inviare forme d&apos;onda e spettri.</p>
          <Button variant="outline" onClick={() => showPage("misura")}><ArrowLeft /> Vai a Misura</Button>
        </Card>
      )}

      {boxes.map((b) => <BoxCard key={b.id} box={b} />)}
    </div>
  );
}
