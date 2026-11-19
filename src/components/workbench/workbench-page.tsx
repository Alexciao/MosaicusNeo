"use client";
// Elaborazione: i riquadri inviati da Misura, dal Quaderno o dagli strumenti, il più recente in cima.
// In alto: quanti sono, l'indice per saltare a uno, apri/chiudi tutti, l'export di quelli spuntati.

import { ArrowLeft, ChartLine, ChevronsDownUp, ChevronsUpDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkbench, exportCheckedBoxes } from "@/lib/workbench-store";
import { showPage } from "@/lib/lab-store";
import { BoxCard } from "./box-card";

export function WorkbenchPage() {
  const boxes = useWorkbench((s) => s.boxes);
  const loaded = useWorkbench((s) => s.loaded);
  const nChecked = boxes.filter((b) => b.checked).length;
  const all = boxes.length > 0 && boxes.every((b) => b.checked);
  const some = nChecked > 0 && !all;
  const allCollapsed = boxes.length > 0 && boxes.every((b) => b.collapsed);
  const list = [...boxes].reverse();
  const jump = (id: number) => {
    const b = useWorkbench.getState().boxes.find((x) => x.id === id);
    if (b?.collapsed) useWorkbench.getState().updateBox(id, { collapsed: false });
    useWorkbench.getState().focus(id);
  };
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-3 sm:p-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="mr-auto min-w-0">
            <h2 className="text-xl font-bold tracking-tight">Elaborazione</h2>
            <p className="text-sm text-muted-foreground">
              {boxes.length ? `${boxes.length} ${boxes.length === 1 ? "riquadro" : "riquadri"} · il più recente in cima` : "Analisi dei tratti di misura"}
            </p>
          </div>
          {!!boxes.length && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={all} indeterminate={some} onCheckedChange={() => useWorkbench.getState().setAllChecked(!all)} aria-label="Seleziona tutti i riquadri" />
                Tutti
              </label>
              <Button variant="outline" size="sm" onClick={() => useWorkbench.getState().setAllCollapsed(!allCollapsed)}>
                {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} {allCollapsed ? "Apri tutti" : "Chiudi tutti"}
              </Button>
              <Button size="sm" disabled={!nChecked} onClick={exportCheckedBoxes}><FileSpreadsheet /> Esporta in Excel{nChecked ? ` (${nChecked})` : ""}</Button>
            </>
          )}
        </div>
        {boxes.length > 1 && (
          <nav aria-label="Riquadri" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
            {list.map((b) => (
              <button key={b.id} type="button" onClick={() => jump(b.id)}
                className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
                <span className={b.checked ? "size-1.5 shrink-0 rounded-full bg-brand" : "size-1.5 shrink-0 rounded-full bg-muted-foreground/30"} />
                <span className="truncate">{b.title}</span>
                {!!b.analyses.length && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground tabular">{b.analyses.length}</span>}
              </button>
            ))}
          </nav>
        )}
      </Card>

      {loaded && !boxes.length && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-tone-lime text-tone-ink"><ChartLine className="size-7" /></span>
          <h3 className="text-lg font-semibold">Nessun riquadro</h3>
          <p className="max-w-md text-sm text-muted-foreground">In <b>Misura</b>, trascina su un grafico per scegliere un tratto e premi <b>Analizza il tratto</b>. Dal <b>Quaderno</b> puoi inviare una misura intera.</p>
          <Button variant="outline" onClick={() => showPage("misura")}><ArrowLeft /> Vai a Misura</Button>
        </Card>
      )}

      {list.map((b) => <BoxCard key={b.id} box={b} />)}
    </div>
  );
}
