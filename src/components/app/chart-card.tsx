"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowRight, ChevronDown, Download, FileSpreadsheet, FileText, Image as ImageIcon, MapPinned, Route, Maximize2, Scan, Send, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chart } from "@/lib/mosaicus/chart.js";
import {
  useLab, measureGroup, toggleView, currentExp, selectedRows, clearSelection, sendSelection, exportData,
  hideDragHint, showPage, type ExportKind,
} from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { fmtCell, fmtVal } from "@/lib/prefs";
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
  const expId = useLab((s) => s.expId);
  const visible = useLab((s) => s.visible);
  const rows = useLab((s) => s.rows);
  const viewId = useLab((s) => s.viewId);
  const lim = useLab((s) => s.lim);
  const dragHint = useLab((s) => s.dragHint);
  const { resolvedTheme } = useTheme();
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const key = `${expId}|${visible.join(",")}`;

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
    const exp = currentExp();
    const t = rows.map((r) => r.t);
    const rawColor = getComputedStyle(document.documentElement).getPropertyValue("--mz-raw").trim();
    for (const ch of measureGroup().charts) {
      const v = exp.views.find((w) => w.id === ch.viewId);
      if (!v) continue;
      ch.setData({
        series: [{ x: t, y: rows.map((r) => r[v.key]), label: v.sym, color: v.raw ? rawColor : undefined, mode: v.line ? "both" : "points" }],
        xLabel: exp.xLabel, yLabel: v.yLabel,
      });
    }
  }, [rows, key, resolvedTheme]);

  return (
    <div
      className={cn("flex flex-col overflow-hidden rounded-lg border bg-[var(--mz-chart-bg)]", lim ? "h-[72vh]" : "h-[clamp(320px,58vh,680px)]")}
      onPointerDownCapture={() => hideDragHint()}
    >
      {visible.map((id, i) => {
        const v = currentExp().views.find((w) => w.id === id);
        return (
          <div key={`${expId}-${id}`} className={cn("relative min-h-0 flex-1 border-l-[3px] transition-colors", id === viewId && visible.length > 1 ? "border-l-primary" : "border-l-transparent", i > 0 && "border-t")}
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

function SelectionTable() {
  const rows = useLab((s) => s.rows);
  const selection = useLab((s) => s.selection);
  void rows; void selection;
  const cols = currentExp().columns;
  const sel = selectedRows();
  const shown = sel.slice(0, 500);
  return (
    <>
      {sel.length > 500 && <p className="mb-2 text-xs text-muted-foreground">Mostro le prime 500 righe di {sel.length}: l&apos;export le contiene tutte.</p>}
      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>{cols.map((c) => <TableHead key={c.key} className="tabular">{c.head}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {shown.length ? shown.map((r, i) => (
              <TableRow key={i}>{cols.map((c) => <TableCell key={c.key} className="tabular">{fmtCell(r[c.key])}</TableCell>)}</TableRow>
            )) : (
              <TableRow><TableCell colSpan={cols.length} className="text-muted-foreground">Ancora nessun dato.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function SentSegments() {
  const sessionId = useLab((s) => s.session?.id);
  const boxes = useWorkbench((s) => s.boxes);
  const list = sessionId ? boxes.filter((b) => b.sessionId === sessionId) : [];
  if (!list.length) return <p className="text-sm text-muted-foreground">Ancora nessuno per questa misura.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="min-w-0"><b className="block truncate text-sm">{b.title}</b><small className="text-muted-foreground">{b.rows.length} punti · {b.analyses.length} analisi</small></span>
          <Button size="sm" variant="outline" onClick={() => { showPage("elab"); useWorkbench.getState().focus(b.id); }}>Apri <ArrowRight /></Button>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, count, children, defaultOpen = false }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-2">
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-1.5 text-sm font-semibold">
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
        {title}{count ? <span className="text-muted-foreground">({count})</span> : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-1">{open && children}</CollapsibleContent>
    </Collapsible>
  );
}

export function ChartCard() {
  const expId = useLab((s) => s.expId);
  const visible = useLab((s) => s.visible);
  const selection = useLab((s) => s.selection);
  const rows = useLab((s) => s.rows);
  const running = useLab((s) => s.running);
  const sessionId = useLab((s) => s.session?.id);
  const nSent = useWorkbench((s) => (sessionId ? s.boxes.filter((b) => b.sessionId === sessionId).length : 0));
  const exp = currentExp();
  void expId;
  const nSel = selection ? selectedRows().length : rows.length;
  const g = measureGroup();
  const doExport = (k: ExportKind) => void exportData(k);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Grafici da mostrare" className="flex flex-wrap gap-1">
          {exp.views.map((v) => (
            <Toggle key={v.id} size="sm" variant="outline" pressed={visible.includes(v.id)} onPressedChange={() => toggleView(v.id)}
              className={cn("aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary/90 hover:aria-pressed:text-primary-foreground", v.raw && "italic")}>
              {v.label}
            </Toggle>
          ))}
        </div>
        <div role="group" aria-label="Zoom sull'asse dei tempi" className="ml-auto flex gap-1">
          <Tip label="Ingrandisci (anche: pizzico, Ctrl + rotella)"><Button size="icon-sm" variant="outline" onClick={() => g.zoomCenter(0.6)} aria-label="Ingrandisci"><ZoomIn /></Button></Tip>
          <Tip label="Riduci"><Button size="icon-sm" variant="outline" onClick={() => g.zoomCenter(1 / 0.6)} aria-label="Riduci"><ZoomOut /></Button></Tip>
          <Tip label="Zoom sulla selezione"><Button size="icon-sm" variant="outline" aria-label="Zoom sulla selezione" onClick={() => { if (!g.zoomToSelection()) toast("Prima seleziona un tratto trascinando su un grafico."); }}><Scan /></Button></Tip>
          <Tip label="Mostra tutti i dati"><Button size="icon-sm" variant="outline" onClick={() => g.fitAll()} aria-label="Adatta"><Maximize2 /></Button></Tip>
        </div>
      </div>

      <ChartStack />

      <div className={cn("flex flex-wrap items-center gap-2 rounded-lg px-1 py-1 transition-colors", selection && !running && "bg-[var(--mz-sel)] px-2")}>
        <p className="text-sm">
          {!rows.length ? <>Collega e premi <b>Avvia</b>.</>
            : selection ? <><b className="tabular">{fmtVal(selection[0], 2)} – {fmtVal(selection[1], 2)} s</b> · {nSel} punti</>
              : <span className="text-muted-foreground">Trascina su un grafico per scegliere un tratto.</span>}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selection && <Button size="sm" variant="ghost" onClick={clearSelection}><X /> Annulla</Button>}
          <Button size="sm" disabled={!rows.length || running} onClick={() => void sendSelection()}>
            <Send /> {selection ? "Invia il tratto a Elaborazione" : "Invia tutta la misura"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={!rows.length} />}>
              <Download /> {selection ? "Esporta selezione" : "Esporta tutto"} <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => doExport("xlsx")}><FileSpreadsheet /> Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv-it")}><FileText /> CSV per Excel in italiano</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("csv")}><FileText /> CSV standard (Fogli Google, Python)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("png")}><ImageIcon /> Immagine dei grafici (.png)</DropdownMenuItem>
              {exp.map && (
                <>
                  <DropdownMenuItem onClick={() => doExport("gpx")}><Route /> Traccia GPX (Strava, Google Earth…)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => doExport("geojson")}><MapPinned /> GeoJSON (QGIS, geojson.io)</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">↔ trascina per scegliere un tratto · doppio clic per annullare · pizzico o Ctrl + rotella per lo zoom</p>

      <Section title="Dati selezionati"><SelectionTable /></Section>
      <Section title="Tratti inviati" count={nSent} defaultOpen><SentSegments /></Section>
    </Card>
  );
}
