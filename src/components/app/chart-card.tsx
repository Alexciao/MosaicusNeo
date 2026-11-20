"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { ArrowRight, Binary, ChartLine, Check, ChevronDown, Download, Ellipsis, FileSpreadsheet, FileText, Image as ImageIcon, MapPinned, Maximize2, MoveHorizontal, Plus, Route, Scan, Table2, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "@/lib/toast";
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
import { Sym, plainSym } from "./sym";

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
  const t = useTranslations("app.chart");
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
      // linea con piccoli punti per tutte le serie dal vivo (i punti spariscono quando sono tanti)
      ch.setData({
        series: [{ x, y, label: v.sym, color: v.raw ? rawColor : undefined, mode: "both" }],
        xLabel: "t (s)", yLabel: v.yLabel,
      });
    }
  }, [rows, key, rig, resolvedTheme]);

  // grafico attivo della pila: titolo in inchiostro, gli altri attenuati (niente righe colorate)
  useEffect(() => {
    for (const ch of measureGroup().charts) ch.setActive(visible.length < 2 || ch.viewId === viewId);
  }, [viewId, key, visible.length]);

  const h = visible.length > 2 ? "h-[clamp(360px,64vh,760px)]" : "h-[clamp(300px,52vh,620px)]";
  return (
    <div className={cn("-mx-4 flex flex-col border-y bg-[var(--mz-chart-bg)]", lim ? "h-[72vh]" : h)} onPointerDownCapture={() => hideDragHint()}>
      {visible.map((id, i) => {
        const v = viewsOf(rig).find((w) => w.id === id);
        return (
          <div key={`${rig.id}-${id}`} className={cn("relative min-h-0 flex-1", i > 0 && "border-t")}
            style={{ flexGrow: i === visible.length - 1 ? 1.25 : 1 }}>
            <canvas ref={(el) => { if (el) canvases.current.set(id, el); else canvases.current.delete(id); }}
              aria-label={t("canvas", { name: plainSym(v?.label ?? id) })} className="absolute inset-y-0 right-3 left-3 h-full w-[calc(100%-1.5rem)] touch-none" style={{ cursor: "crosshair" }} />
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
  const t = useTranslations("app.chart");
  void rows;
  const cols = columnsOf();
  const sel = open ? selectedRows() : [];
  const shown = sel.slice(-500);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{selection ? t("dataSel") : t("dataAll")}</DialogTitle>
          <DialogDescription>
            {t("dataDesc", { n: sel.length, more: sel.length > 500 ? "true" : "false" })}
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
                <TableRow><TableCell colSpan={cols.length} className="text-muted-foreground">{t("noData")}</TableCell></TableRow>
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
  const t = useTranslations("app.chart");
  const views = viewsOf(rig);
  const physical = views.filter((v) => !v.raw), raw = views.filter((v) => v.raw);
  const map = hasMap(rig);
  const g = measureGroup();
  const doExport = (k: ExportKind) => void exportData(k);
  const sentId = useLab(sentBoxId);
  useWorkbench((s) => s.boxes.length);   // ridisegna se un riquadro viene eliminato
  const shown = views.filter((v) => visible.includes(v.id));
  const dragHint = useLab((s) => s.dragHint);

  return (
    <Card className="gap-0 p-4 pb-0">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="max-w-full" />}>
            <ChartLine />
            <span className="truncate">
              {shown.length ? shown.map((v, i) => <span key={v.id}>{i > 0 && ", "}<Sym>{v.sym}</Sym></span>) : t("chartsNone")}
            </span>
            <ChevronDown className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("quantities")}</DropdownMenuLabel>
              {physical.map((v) => (
                <DropdownMenuCheckboxItem key={v.id} checked={visible.includes(v.id)} onCheckedChange={() => toggleView(v.id)} closeOnClick={false}>
                  <Sym>{v.yLabel}</Sym>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            {!!raw.length && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("rawSensors")}</DropdownMenuLabel>
                  {raw.map((v) => (
                    <DropdownMenuCheckboxItem key={v.id} checked={visible.includes(v.id)} onCheckedChange={() => toggleView(v.id)} closeOnClick={false}>
                      <Sym>{v.yLabel}</Sym>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-0.5 text-muted-foreground">
          <div role="group" aria-label={t("zoomGroup")} className="flex items-center gap-0.5">
            <Tip label={t("zoomInTip")}><Button size="icon-sm" variant="ghost" onClick={() => g.zoomCenter(0.6)} aria-label={t("zoomIn")}><ZoomIn /></Button></Tip>
            <Tip label={t("zoomOut")}><Button size="icon-sm" variant="ghost" onClick={() => g.zoomCenter(1 / 0.6)} aria-label={t("zoomOut")}><ZoomOut /></Button></Tip>
            <Tip label={t("zoomSel")}><Button size="icon-sm" variant="ghost" aria-label={t("zoomSel")} onClick={() => { if (!g.zoomToSelection()) toast(t("noSel")); }}><Scan /></Button></Tip>
            <Tip label={t("fitTip")}><Button size="icon-sm" variant="ghost" onClick={() => g.fitAll()} aria-label={t("fit")}><Maximize2 /></Button></Tip>
          </div>
          <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />
          <Tip label={t("table")}><Button size="icon-sm" variant="ghost" aria-label={t("table")} disabled={!hasRows} onClick={() => setTable(true)}><Table2 /></Button></Tip>
          <DropdownMenu>
            <Tip label={selection ? t("exportSel") : t("exportAll")}>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("export")} disabled={!hasRows} />}><Download /></DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{selection ? t("exportSel") : t("exportAll")}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => doExport("xlsx")}><FileSpreadsheet /> {t("xlsx")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv-it")}><FileText /> {t("csvIt")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv")}><FileText /> {t("csv")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("png")}><ImageIcon /> {t("png")}</DropdownMenuItem>
                {map && <DropdownMenuItem onClick={() => doExport("gpx")}><Route /> {t("gpx")}</DropdownMenuItem>}
                {map && <DropdownMenuItem onClick={() => doExport("geojson")}><MapPinned /> {t("geojson")}</DropdownMenuItem>}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col gap-0.5">{t("raw")}<span className="font-normal text-muted-foreground">{t("rawHint")}</span></DropdownMenuLabel>
                <DropdownMenuItem onClick={() => doExport("raw-csv")}><Binary /> {t("rawCsv")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("raw-xlsx")}><Binary /> {t("rawXlsx")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ChartStack />

      <div className={cn("-mx-4 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 transition-colors", selection && !running && "bg-[var(--mz-sel)]")}>
        <p className="flex min-w-0 items-center gap-2 text-[13px]">
          {selection ? (
            <><span className="font-medium tabular">{fmtVal(selection[0], 2)} – {fmtVal(selection[1], 2)} s</span><span className="text-muted-foreground">{t("readings", { n: nSel })}</span></>
          ) : (
            <span className={cn("flex items-center gap-2 text-muted-foreground", dragHint && hasRows && "text-foreground")}>
              <MoveHorizontal className="size-4 shrink-0" aria-hidden />
              {hasRows ? t("selectHint") : t("emptyHint")}
            </span>
          )}
        </p>
        {hasRows && (
          <div className="ml-auto flex items-center gap-1">
            {selection && <Button size="sm" variant="ghost" onClick={clearSelection}><X /> {t("clear")}</Button>}
            {sentId != null ? (
              <Button size="sm" variant="outline" onClick={() => goElab(sentId)}>
                <Check className="text-success" /> {t("sent")} <ArrowRight />
              </Button>
            ) : (
              <>
                <Button size="sm" variant={selection ? "default" : "outline"} disabled={running} onClick={() => void sendSelection()}>
                  {selection ? t("analyzeSel") : t("analyzeAll")} <ArrowRight />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" disabled={running} aria-label={t("more")} />}><Ellipsis /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem onClick={() => void sendSelection({ open: false })}><Plus /> {t("addStay")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        )}
      </div>
      {table && <DataDialog open onOpenChange={setTable} />}
    </Card>
  );
}
