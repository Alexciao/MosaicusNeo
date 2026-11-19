"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowRight, Binary, ChartLine, Check, ChevronDown, Download, Plus, FileSpreadsheet, FileText, Image as ImageIcon, MapPinned, Maximize2, Route, Scan, Table2, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chart } from "@/lib/mosaicus/chart.js";
import {
  useLab, measureGroup, toggleView, viewsOf, columnsOf, hasMap, selectedRows, clearSelection, sendSelection, exportData, sentBoxId, goElab,
  hideDragHint, type ExportKind,
} from "@/lib/lab-store";
import { fmtCell, fmtVal } from "@/lib/prefs";
import { useWorkbench } from "@/lib/workbench-store";
import { cn } from "@/lib/utils";

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ChartStack() {
  const rig = useLab((s) => s.rig);
  const visible = useLab((s) => s.visible);
  const rows = useLab((s) => s.rows);
  const viewId = useLab((s) => s.viewId);
  const lim = useLab((s) => s.lim);
  const dragHint = useLab((s) => s.dragHint);
  const { resolvedTheme } = useTheme();
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const key = `${rig.id}|${visible.join(",")}`;

  useLayoutEffect(() => {
    const g = measureGroup();
    g.clear();
    visible.forEach((id, i) => {
      const cv = canvases.current.get(id);
      if (!cv) return;
      const ch = g.add(new Chart(cv, { compact: i < visible.length - 1 }));
      ch.viewId = id;
    });
    return () => g.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const views = viewsOf(rig);
    const rawColor = getComputedStyle(document.documentElement).getPropertyValue("--mz-raw").trim();
    for (const ch of measureGroup().charts) {
      const v = views.find((w) => w.id === ch.viewId);
      if (!v) continue;
      // ogni sensore ha il suo ritmo: nel grafico vanno solo le righe con questa grandezza
      const x: number[] = [], y: number[] = [];
      for (const r of rows) { const val = r[v.key]; if (typeof val === "number" && Number.isFinite(val)) { x.push(r.t); y.push(val); } }
      ch.setData({
        series: [{ x, y, label: v.sym, color: v.raw ? rawColor : undefined, mode: v.line ? "both" : "points" }],
        xLabel: "t (s)", yLabel: v.yLabel,
      });
    }
  }, [rows, key, rig, resolvedTheme]);

  const h = visible.length > 2 ? "h-[clamp(360px,64vh,760px)]" : "h-[clamp(300px,52vh,620px)]";
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border bg-[var(--mz-chart-bg)]", lim ? "h-[72vh]" : h)} onPointerDownCapture={() => hideDragHint()}>
      {visible.map((id, i) => {
        const v = viewsOf(rig).find((w) => w.id === id);
        return (
          <div key={`${rig.id}-${id}`} className={cn("relative min-h-0 flex-1 border-l-[3px] transition-colors", id === viewId && visible.length > 1 ? "border-l-brand" : "border-l-transparent", i > 0 && "border-t")}
            style={{ flexGrow: i === visible.length - 1 ? 1.25 : 1 }}>
            <canvas ref={(el) => { if (el) canvases.current.set(id, el); else canvases.current.delete(id); }}
              aria-label={`Grafico ${v?.label ?? id}`} className="absolute inset-0 size-full touch-none" style={{ cursor: "crosshair" }} />
            {i === 0 && dragHint && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-2">
                <span className="mz-drag-hand text-3xl">👆</span>
                <span className="rounded-full bg-foreground/80 px-3 py-1 text-xs font-medium text-background">trascina per scegliere un tratto</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Letture nell'intervallo [a, b] (senza creare array: si ricalcola a ogni lettura). */
function countIn(rows: { t: number }[], [a, b]: [number, number]) {
  let n = 0;
  for (const r of rows) if (r.t >= a && r.t <= b) n++;
  return n;
}

/** Tabella dei dati (selezione o tutta la misura), in una finestra. */
function DataDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rows = useLab((s) => s.rows);
  const selection = useLab((s) => s.selection);
  void rows;
  const cols = columnsOf();
  const sel = open ? selectedRows() : [];
  const shown = sel.slice(-500);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Dati {selection ? "del tratto selezionato" : "della misura"}</DialogTitle>
          <DialogDescription>
            {sel.length} letture{sel.length > 500 ? " · qui le ultime 500, l'export le contiene tutte" : ""}. Ogni riga è la lettura di un solo sensore: le altre colonne restano vuote.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>{cols.map((c) => <TableHead key={c.key} className="tabular whitespace-nowrap">{c.head}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {shown.length ? shown.map((r, i) => (
                <TableRow key={i}>{cols.map((c) => <TableCell key={c.key} className="tabular">{c.key in r ? fmtCell(r[c.key]) : ""}</TableCell>)}</TableRow>
              )) : (
                <TableRow><TableCell colSpan={cols.length} className="text-muted-foreground">Ancora nessun dato.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChartCard() {
  const rig = useLab((s) => s.rig);
  const visible = useLab((s) => s.visible);
  const selection = useLab((s) => s.selection);
  const hasRows = useLab((s) => s.rows.length > 0);
  const nSel = useLab((s) => (s.selection ? countIn(s.rows, s.selection) : s.rows.length));
  const running = useLab((s) => s.running);
  const [table, setTable] = useState(false);
  const views = viewsOf(rig);
  const physical = views.filter((v) => !v.raw), raw = views.filter((v) => v.raw);
  const map = hasMap(rig);
  const g = measureGroup();
  const doExport = (k: ExportKind) => void exportData(k);
  const sentId = useLab(sentBoxId);
  useWorkbench((s) => s.boxes.length);   // ridisegna se un riquadro viene eliminato
  const shownNames = views.filter((v) => visible.includes(v.id)).map((v) => v.sym).join(", ");

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="max-w-full" />}>
            <ChartLine /> <span className="truncate">Grafici: {shownNames}</span> <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Grandezze</DropdownMenuLabel>
              {physical.map((v) => (
                <DropdownMenuCheckboxItem key={v.id} checked={visible.includes(v.id)} onCheckedChange={() => toggleView(v.id)} closeOnClick={false}>
                  {v.yLabel}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            {!!raw.length && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Dati grezzi dei sensori</DropdownMenuLabel>
                  {raw.map((v) => (
                    <DropdownMenuCheckboxItem key={v.id} checked={visible.includes(v.id)} onCheckedChange={() => toggleView(v.id)} closeOnClick={false}>
                      {v.yLabel}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-1">
          <div role="group" aria-label="Zoom sull'asse dei tempi" className="flex rounded-lg border">
            <Tip label="Ingrandisci · anche pizzico o Ctrl + rotella"><Button size="icon-sm" variant="ghost" onClick={() => g.zoomCenter(0.6)} aria-label="Ingrandisci"><ZoomIn /></Button></Tip>
            <Tip label="Riduci"><Button size="icon-sm" variant="ghost" onClick={() => g.zoomCenter(1 / 0.6)} aria-label="Riduci"><ZoomOut /></Button></Tip>
            <Tip label="Zoom sulla selezione"><Button size="icon-sm" variant="ghost" aria-label="Zoom sulla selezione" onClick={() => { if (!g.zoomToSelection()) toast("Nessun tratto selezionato. Trascina su un grafico per sceglierne uno."); }}><Scan /></Button></Tip>
            <Tip label="Mostra tutti i dati"><Button size="icon-sm" variant="ghost" onClick={() => g.fitAll()} aria-label="Adatta"><Maximize2 /></Button></Tip>
          </div>
          <Tip label="Tabella dei dati"><Button size="icon-sm" variant="outline" aria-label="Tabella dei dati" disabled={!hasRows} onClick={() => setTable(true)}><Table2 /></Button></Tip>
          <DropdownMenu>
            <Tip label={selection ? "Esporta la selezione" : "Esporta tutta la misura"}>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label="Esporta" disabled={!hasRows} />}><Download /></DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{selection ? "Esporta la selezione" : "Esporta tutta la misura"}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => doExport("xlsx")}><FileSpreadsheet /> Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv-it")}><FileText /> CSV per Excel in italiano</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv")}><FileText /> CSV standard (Fogli Google, Python)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("png")}><ImageIcon /> Immagine dei grafici (.png)</DropdownMenuItem>
                {map && <DropdownMenuItem onClick={() => doExport("gpx")}><Route /> Traccia GPX</DropdownMenuItem>}
                {map && <DropdownMenuItem onClick={() => doExport("geojson")}><MapPinned /> GeoJSON</DropdownMenuItem>}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-0.5">Dati grezzi di Arduino<span className="font-normal text-muted-foreground">Una riga per lettura, valori non convertiti</span></DropdownMenuLabel>
                <DropdownMenuItem onClick={() => doExport("raw-csv")}><Binary /> CSV grezzo (.csv)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("raw-xlsx")}><Binary /> Excel grezzo (.xlsx)</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ChartStack />

      {hasRows && (
        <div className={cn("flex flex-wrap items-center gap-2 rounded-lg px-1 transition-colors", selection && !running && "bg-[var(--mz-sel)] px-2 py-1")}>
          <p className="text-sm">
            {selection ? <><b className="tabular">{fmtVal(selection[0], 2)} – {fmtVal(selection[1], 2)} s</b> · {nSel} letture</>
              : <span className="text-muted-foreground">Trascina su un grafico per scegliere un tratto · doppio clic per annullare</span>}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {selection && <Button size="sm" variant="ghost" onClick={clearSelection}><X /> Annulla</Button>}
            {sentId != null ? (
              <Button size="sm" variant="outline" onClick={() => goElab(sentId)}>
                <Check className="text-brand" /> Già in Elaborazione · Apri <ArrowRight />
              </Button>
            ) : (
              <div className="flex">
                <Button size="sm" variant={selection ? "default" : "outline"} disabled={running} className="rounded-r-none" onClick={() => void sendSelection()}>
                  {selection ? "Analizza il tratto" : "Analizza tutta la misura"} <ArrowRight />
                </Button>
                <Tip label="Aggiungi a Elaborazione e resta qui">
                  <Button size="icon-sm" variant={selection ? "default" : "outline"} disabled={running} aria-label="Aggiungi a Elaborazione senza aprirla"
                    className={cn("rounded-l-none", selection ? "border-l border-l-primary-foreground/15" : "border-l-0")} onClick={() => void sendSelection({ open: false })}>
                    <Plus />
                  </Button>
                </Tip>
              </div>
            )}
          </div>
        </div>
      )}
      {table && <DataDialog open onOpenChange={setTable} />}
    </Card>
  );
}
