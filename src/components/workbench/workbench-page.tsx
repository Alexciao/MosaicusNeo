"use client";
// Elaborazione: i riquadri inviati da Misura, dal Quaderno o dagli strumenti, il più recente in cima.
// In alto: quanti sono, l'indice per saltare a uno, apri/chiudi tutti, l'export di quelli spuntati.

import { ArrowLeft, ChartLine, ChevronsDownUp, ChevronsUpDown, FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkbench, exportCheckedBoxes } from "@/lib/workbench-store";
import { showPage } from "@/lib/lab-store";
import { BoxCard } from "./box-card";
import { PageHeader, EmptyState } from "@/components/app/page-header";

export function WorkbenchPage() {
  const t = useTranslations("workbench.page");
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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-3 sm:p-6">
      <PageHeader title={t("title")}
        subtitle={boxes.length ? t("count", { n: boxes.length }) : t("subtitleEmpty")}
        actions={!!boxes.length && (
          <>
            {boxes.length > 1 && (
              <label className="mr-1 flex items-center gap-2 text-sm">
                <Checkbox checked={all} indeterminate={some} onCheckedChange={() => useWorkbench.getState().setAllChecked(!all)} aria-label={t("selectAll")} />
                {t("all")}
              </label>
            )}
            <Button variant="outline" size="sm" onClick={() => useWorkbench.getState().setAllCollapsed(!allCollapsed)}>
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} {allCollapsed ? t("expandAll") : t("collapseAll")}
            </Button>
            <Button size="sm" disabled={boxes.length > 1 && !nChecked}
              onClick={() => { if (boxes.length === 1) useWorkbench.getState().setAllChecked(true); exportCheckedBoxes(); }}>
              <FileSpreadsheet /> {boxes.length > 1 ? t("exportExcel", { n: nChecked }) : t("exportOne")}
            </Button>
          </>
        )} />
      {boxes.length > 1 && (
        <nav aria-label={t("nav")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
          {list.map((b) => (
            <button key={b.id} type="button" onClick={() => jump(b.id)}
              className="flex max-w-56 shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs transition-colors hover:bg-muted">
              <span className={b.checked ? "size-1.5 shrink-0 rounded-full bg-brand" : "size-1.5 shrink-0 rounded-full bg-muted-foreground/30"} />
              <span className="truncate">{b.title}</span>
              {!!b.analyses.length && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground tabular">{b.analyses.length}</span>}
            </button>
          ))}
        </nav>
      )}

      {loaded && !boxes.length && (
        <EmptyState icon={ChartLine} title={t("emptyTitle")} body={t("emptyBody")}
          action={<Button variant="outline" size="sm" onClick={() => showPage("misura")}><ArrowLeft /> {t("goMeasure")}</Button>} />
      )}

      {list.map((b) => <BoxCard key={b.id} box={b} />)}
    </div>
  );
}
