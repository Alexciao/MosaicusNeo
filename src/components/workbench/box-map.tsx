"use client";
// Mappa di un riquadro con le colonne di latitudine e longitudine: i punti si colorano con la
// grandezza sull'asse verticale (anche una colonna calcolata), il tratto selezionato è in evidenza.

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { colInfo, type Box } from "@/lib/workbench-store";
import { fmtNum } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Sym, plainSym } from "@/components/app/sym";
import { TrackMap, type MapPoint } from "@/components/app/track-map";

export function BoxMap({ box, rows, selection }: { box: Box; rows: Record<string, number>[]; selection: [number, number] | null }) {
  const t = useTranslations("workbench.map");
  const [open, setOpen] = useState(true);
  const cy = colInfo(box, box.yKey);
  const cols = [...box.columns, ...box.computed];
  const points: MapPoint[] = useMemo(() => rows
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => ({
      lat: r.lat, lon: r.lon, t: r[box.xKey], v: r[box.yKey],
      info: cols.filter((c) => c.key !== "lat" && c.key !== "lon" && Number.isFinite(r[c.key])).map((c) => [`${plainSym(c.sym)}${c.unit ? ` (${c.unit})` : ""}`, fmtNum(r[c.key], 3)] as [string, string]),
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, box.xKey, box.yKey, box.computed]);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold">
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} /> {t("title")}
        <span className="font-normal text-muted-foreground"><Sym>{t("color", { q: `${cy.sym}${cy.unit ? ` (${cy.unit})` : ""}` })}</Sym></span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {open && <TrackMap className="h-[clamp(260px,44vh,480px)]" points={points} label={cy.sym} unit={cy.unit}
          highlight={box.xKey === "t" ? selection : null} />}
      </CollapsibleContent>
    </Collapsible>
  );
}
