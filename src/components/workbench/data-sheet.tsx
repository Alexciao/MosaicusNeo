"use client";
// Foglio dei dati di un riquadro: colonne affiancate, assi scelti dall'intestazione,
// nuove colonne calcolate con una formula e anteprima mentre la scrivi.

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { compile } from "@/lib/mosaicus/formula.js";
import { quantityOf } from "@/lib/sensors/quantities";
import { useWorkbench, axisLabel, type Box } from "@/lib/workbench-store";
import { confirm } from "@/lib/confirm";
import { fmtCell } from "@/lib/prefs";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Sym } from "@/components/app/sym";

const MAX_ROWS = 2000;

export function DataSheet({ box, rows, errors }: { box: Box; rows: Record<string, number>[]; errors: Record<string, string> }) {
  const t = useTranslations("workbench.sheet");
  const updateBox = useWorkbench((s) => s.updateBox);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ sym: string; unit: string; formula: string } | null>(null);
  const cols = [...box.columns, ...box.computed];
  const isComp = (key: string) => box.computed.some((c) => c.key === key);
  const shown = rows.slice(0, MAX_ROWS);

  const preview = useMemo(() => {
    if (!pending) return null;
    if (!pending.formula.trim()) return { err: t("formulaEmpty"), vals: null as number[] | null };
    try {
      const { fn } = compile(pending.formula, cols.map((c) => c.key));
      return { err: "", vals: shown.map((r) => fn(r)) };
    } catch (e) { return { err: (e as Error).message, vals: null }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, rows, box.computed]);
  const [addErr, setAddErr] = useState("");

  const setAxis = (ax: "x" | "y", key: string) => updateBox(box.id, ax === "x" ? { xKey: key } : { yKey: key });
  const add = () => {
    if (!pending) return;
    const existing = cols.map((c) => c.key);
    const sym = pending.sym.trim();
    if (!sym) { setAddErr(t("symEmpty")); return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sym)) { setAddErr(t("symInvalid")); return; }
    if (existing.includes(sym)) { setAddErr(t("exists", { sym })); return; }
    try { compile(pending.formula, existing); } catch (e) { setAddErr((e as Error).message); return; }
    updateBox(box.id, (b) => ({ computed: [...b.computed, { key: sym, sym, unit: pending.unit.trim(), formula: pending.formula.trim() }] }));
    setPending(null); setAddErr("");
    toast.success(t("added", { sym }));
  };
  const remove = async (key: string) => {
    const c = box.computed.find((k) => k.key === key);
    if (!c || !(await confirm({ title: t("deleteTitle", { sym: c.sym, formula: c.formula }), action: t("deleteAction"), destructive: true }))) return;
    updateBox(box.id, (b) => ({
      computed: b.computed.filter((k) => k.key !== key),
      xKey: b.xKey === key ? "t" : b.xKey,
      yKey: b.yKey === key ? b.columns.find((k) => k.key !== "t")?.key || "t" : b.yKey,
    }));
  };
  const axBtn = (ax: "x" | "y", key: string) => {
    const on = (ax === "x" ? box.xKey : box.yKey) === key;
    return (
      <button type="button" onClick={() => setAxis(ax, key)} title={ax === "x" ? t("toX") : t("toY")}
        className={cn("grid size-6 place-items-center rounded border text-xs font-bold transition-colors", on ? (ax === "x" ? "border-sky-500 bg-sky-500 text-white" : "border-primary bg-primary text-primary-foreground") : "hover:bg-muted")}>
        {ax}
      </button>
    );
  };
  const cellCls = (key: string) => cn("px-3 py-1 text-right tabular whitespace-nowrap", (key === box.xKey || key === box.yKey) && "bg-foreground/[0.04]");

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold">
        <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} /> {t("title")}
        <span className="font-normal text-muted-foreground">{t("counts", { rows: rows.length, cols: cols.length })}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {open && (
          <>
            <p className="mb-2 text-xs text-muted-foreground">{t.rich("hint", { b: (c) => <b>{c}</b>, code: (c) => <code className="rounded bg-muted px-1">{c}</code> })}</p>
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} className={cn("min-w-28 px-3 py-2 text-right align-top font-medium", (c.key === box.xKey || c.key === box.yKey) && "bg-foreground/[0.04]")}>
                        <div className="font-semibold"><Sym>{axisLabel(c)}</Sym></div>
                        <div className="truncate text-[0.7rem] font-normal text-muted-foreground" title={isComp(c.key) ? t("formula") : undefined}>
                          {isComp(c.key) ? `= ${box.computed.find((k) => k.key === c.key)!.formula}` : (c as { name?: string }).name || quantityOf(c.key)?.name || t("measured")}
                        </div>
                        <div className="mt-1 flex justify-end gap-1">
                          {axBtn("x", c.key)}{axBtn("y", c.key)}
                          {isComp(c.key) && <button type="button" onClick={() => void remove(c.key)} title={t("deleteColumn")} className="grid size-6 place-items-center rounded border text-muted-foreground hover:text-destructive"><X className="size-3" /></button>}
                        </div>
                        {errors[c.key] && <div className="mt-1 text-left text-[0.7rem] font-normal text-destructive">{errors[c.key]}</div>}
                      </th>
                    ))}
                    <th className="min-w-52 px-3 py-2 text-left align-top font-medium">
                      {pending ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1.5">
                            <Input autoFocus placeholder={t("symPh")} value={pending.sym} onChange={(e) => setPending({ ...pending, sym: e.target.value })} aria-label={t("symAria")} className="h-7 text-xs" />
                            <Input placeholder={t("unitPh")} value={pending.unit} onChange={(e) => setPending({ ...pending, unit: e.target.value })} aria-label={t("unitAria")} className="h-7 w-20 text-xs" />
                          </div>
                          <Input placeholder={t("formulaPh")} value={pending.formula} onChange={(e) => setPending({ ...pending, formula: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} aria-label={t("formulaAria")} className="h-7 font-mono text-xs" />
                          {(addErr || preview?.err) && <p className="text-[0.7rem] font-normal text-destructive">{addErr || preview?.err}</p>}
                          <div className="flex gap-1.5">
                            <Button size="xs" onClick={add}><Check /> {t("add")}</Button>
                            <Button size="xs" variant="ghost" onClick={() => { setPending(null); setAddErr(""); }}>{t("cancel")}</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setPending({ sym: "", unit: "", formula: "" })}><Plus /> {t("newColumn")}</Button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i} className="border-t">
                      {cols.map((c) => <td key={c.key} className={cellCls(c.key)}>{fmtCell(r[c.key])}</td>)}
                      <td className="px-3 py-1 text-right tabular text-muted-foreground">{preview?.vals ? fmtCell(preview.vals[i]) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > MAX_ROWS && <p className="mt-2 text-xs text-muted-foreground">{t("truncated", { max: MAX_ROWS, n: rows.length })}</p>}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
