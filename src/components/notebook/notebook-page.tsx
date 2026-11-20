"use client";
// Quaderno: tutte le misure salvate, da cercare, filtrare, riaprire o mandare a Elaborazione.

import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, ChartLine, CloudCheck, CloudUpload, Combine, Cpu, Ellipsis, FileSpreadsheet, FileText, FlaskConical, FolderOpen, MemoryStick, Pencil, Search, Trash, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useLab, labInfo, openSession, removeSession, renameSession, sendSessionToElab, exportSession, goElab, showPage, combineSessions, canCombine, type SessionSummary,
} from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { useCloud } from "@/lib/cloud/sync";
import { confirm } from "@/lib/confirm";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { toneBg } from "@/components/app/tone";
import { SdImportButton } from "@/components/app/sd-controls";
import { PageHeader, EmptyState } from "@/components/app/page-header";
import { t as tr, intlLocale, locale } from "@/i18n";

type Sort = "new" | "old" | "name" | "size";
const SORTS: Record<Sort, string> = { new: tr("workbench.notebook.sort.new"), old: tr("workbench.notebook.sort.old"), name: tr("workbench.notebook.sort.name"), size: tr("workbench.notebook.sort.size") };
type Src = "all" | "arduino" | "sd" | "sim";
const SOURCES: Record<Src, string> = { all: tr("workbench.notebook.source.all"), arduino: tr("workbench.notebook.source.arduino"), sd: tr("workbench.notebook.source.sd"), sim: tr("workbench.notebook.source.sim") };

const dayFmt = new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(intlLocale, { hour: "2-digit", minute: "2-digit" });

function dayLabel(ts: number) {
  const d = new Date(ts), today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return tr("workbench.notebook.today");
  if (diff === 1) return tr("workbench.notebook.yesterday");
  const s = dayFmt.format(d);
  return s[0].toUpperCase() + s.slice(1);
}

function duration(s: number) {
  if (s < 60) return `${fmtVal(s, s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m < 60 ? `${m} min${r ? ` ${r} s` : ""}` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function NotebookPage() {
  const t = useTranslations("workbench.notebook");
  const sessions = useLab((s) => s.sessions);
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("all");
  const [src, setSrc] = useState<Src>("all");
  const [sort, setSort] = useState<Sort>("new");
  const query = useDeferredValue(q.trim().toLowerCase());

  const labs = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions ?? []) m.set(s.labId, s.labTitle);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], locale));
  }, [sessions]);
  const labItems = useMemo(() => ({ all: t("allLabs"), ...Object.fromEntries(labs) }), [labs, t]);

  const list = useMemo(() => {
    const out = (sessions ?? []).filter((s) =>
      (lab === "all" || s.labId === lab) &&
      (src === "all" || src === (s.source === "simulatore" ? "sim" : s.source === "scheda SD" ? "sd" : "arduino")) &&
      (!query || `${s.name} ${s.labTitle} ${s.sensors.join(" ")}`.toLowerCase().includes(query)));
    const cmp: Record<Sort, (a: SessionSummary, b: SessionSummary) => number> = {
      new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created,
      name: (a, b) => a.name.localeCompare(b.name, locale), size: (a, b) => b.n - a.n,
    };
    return out.sort(cmp[sort]);
  }, [sessions, lab, src, query, sort]);

  // gruppi per giorno solo quando l'ordine è cronologico
  const groups = useMemo(() => {
    if (sort !== "new" && sort !== "old") return [{ label: "", items: list }];
    const g: { label: string; items: SessionSummary[] }[] = [];
    for (const s of list) {
      const label = dayLabel(s.created);
      if (g.at(-1)?.label !== label) g.push({ label, items: [] });
      g.at(-1)!.items.push(s);
    }
    return g;
  }, [list, sort]);

  const filtered = !!query || lab !== "all" || src !== "all";
  const reset = () => { setQ(""); setLab("all"); setSrc("all"); };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-3 sm:p-6">
      <PageHeader title={t("title")}
        subtitle={sessions?.length
          ? (filtered ? <>{t("filteredCount", { shown: list.length, total: sessions.length })} · <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={reset}>{t("showAll")}</button></> : t("count", { n: sessions.length }))
          : t("intro")}
        actions={<SdImportButton />} />
      {!!sessions?.length && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("searchAria")} className="bg-card pl-8" />
          </div>
          <Select value={lab} onValueChange={(v) => v && setLab(String(v))} items={labItems}>
            <SelectTrigger aria-label={t("filterLab")} className="bg-card sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(labItems).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={src} onValueChange={(v) => v && setSrc(v as Src)} items={SOURCES}>
            <SelectTrigger aria-label={t("filterSource")} className="bg-card sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)} items={SORTS}>
            <SelectTrigger aria-label={t("sortAria")} className="bg-card sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {sessions == null && <p className="px-1 text-sm text-muted-foreground">{t("loading")}</p>}

      {sessions?.length === 0 && (
        <EmptyState icon={BookOpen} title={t("emptyTitle")} body={t("emptyBody")}
          action={<Button variant="outline" size="sm" onClick={() => showPage("misura")}><FlaskConical /> {t("goMeasure")}</Button>} />
      )}

      {sessions && sessions.length > 0 && !list.length && (
        <EmptyState icon={Search} title={t("noMatch")}
          action={<Button size="sm" variant="outline" onClick={reset}><X /> {t("clearFilters")}</Button>} />
      )}

      {groups.map((g) => g.items.length > 0 && (
        <section key={g.label || "all"} className="flex flex-col gap-2">
          {g.label && <h3 className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</h3>}
          <ul className="flex flex-col gap-2">{g.items.map((s) => <SessionRow key={s.id} s={s} showDate={!g.label} />)}</ul>
        </section>
      ))}
    </div>
  );
}

function SessionRow({ s, showDate }: { s: SessionSummary; showDate: boolean }) {
  const t = useTranslations("workbench.notebook");
  const current = useLab((st) => st.session?.id === s.id);
  const running = useLab((st) => st.running);
  const signedIn = useCloud((st) => !!st.user);
  const boxes = useWorkbench((st) => st.boxes.filter((b) => b.sessionId === s.id).length);
  const lastBox = useWorkbench((st) => st.boxes.findLast((b) => b.sessionId === s.id)?.id);
  const info = labInfo(s.labId);
  const Icon = info.icon;
  const [renaming, setRenaming] = useState(false);
  const [combining, setCombining] = useState(false);
  const [name, setName] = useState(s.name);
  const when = showDate ? new Date(s.created).toLocaleString(intlLocale, { dateStyle: "medium", timeStyle: "short" }) : timeFmt.format(s.created);

  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center", current && "border-brand/40 bg-brand/5")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[info.tone])}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{s.name}</span>
            {current && <span className="shrink-0 rounded bg-brand/15 px-1.5 text-[0.65rem] font-semibold text-brand">{t("openTag")}</span>}
            {signedIn && s.cloud && (s.dirty
              ? <CloudUpload className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("toCloud")} />
              : <CloudCheck className="size-3.5 shrink-0 text-success" aria-label={t("inCloud")} />)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {s.name.startsWith(s.labTitle) ? "" : `${s.labTitle} · `}{when} · {duration(s.duration)} · {t("readings", { n: s.n })}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {s.source === "simulatore"
              ? <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">{t("simTag")}</span>
              : s.source === "scheda SD"
              ? <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground"><MemoryStick className="size-3" /> {t("sdTag")}</span>
              : s.source === "combined"
              ? <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground"><Combine className="size-3" /> {t("combinedTag")}</span>
              : <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground"><Cpu className="size-3" /> Arduino</span>}
            {s.sensors.map((x, i) => <span key={i} className="rounded border px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">{x}</span>)}
            {boxes > 0 && (
              <button type="button" onClick={() => goElab(lastBox)}
                className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand hover:bg-brand/15">
                <ChartLine className="size-3" /> {t("inElab", { n: boxes })}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:pl-2">
        <Button size="sm" variant="outline" disabled={running} onClick={() => void openSession(s.id)}><FolderOpen /> {t("open")}</Button>
        <Button size="sm" disabled={running} onClick={() => void sendSessionToElab(s.id)}>{t("analyze")} <ArrowRight /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("moreActions", { name: s.name })} />}><Ellipsis /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => { setName(s.name); setRenaming(true); }}><Pencil /> {t("rename")}</DropdownMenuItem>
            <DropdownMenuItem disabled={running || !canCombine(s)} onClick={() => setCombining(true)}><Combine /> {t("combine")}</DropdownMenuItem>
            <DropdownMenuItem disabled={running} onClick={() => void exportSession(s.id, "xlsx")}><FileSpreadsheet /> {t("exportExcel")}</DropdownMenuItem>
            <DropdownMenuItem disabled={running} onClick={() => void exportSession(s.id, "csv")}><FileText /> {t("exportCsv")}</DropdownMenuItem>
            <DropdownMenuItem disabled={running} onClick={() => void exportSession(s.id, "raw-csv")}><FileText /> {t("rawCsv")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={running && current}
              onClick={async () => {
                if (await confirm({ title: t("deleteTitle", { name: s.name }), description: t("deleteDesc"), action: t("delete"), destructive: true })) await removeSession(s.id);
              }}>
              <Trash /> {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CombineDialog s={s} open={combining} onOpenChange={setCombining} />
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("renameTitle")}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void renameSession(s.id, name); setRenaming(false); }} className="flex flex-col gap-4">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={t("nameAria")} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>{t("cancel")}</Button>
              <Button type="submit">{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** Combina questa misura con un'altra fatta nello stesso momento (un altro progetto, un altro Arduino). */
function CombineDialog({ s, open, onOpenChange }: { s: SessionSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("workbench.notebook");
  const sessions = useLab((st) => st.sessions);
  const end = (x: SessionSummary) => x.created + x.duration * 1000;
  // le altre misure dal vivo che si sovrappongono nel tempo, la più sovrapposta per prima
  const overlap = (x: SessionSummary) => Math.min(end(s), end(x)) - Math.max(s.created, x.created);
  const others = (sessions ?? []).filter((x) => x.id !== s.id && canCombine(x) && overlap(x) > 0).sort((a, b) => overlap(b) - overlap(a));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("combineTitle", { name: s.name })}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("combineIntro")}</p>
        {others.length ? (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-auto">
            {others.map((x) => (
              <li key={x.id}>
                <button type="button" className="flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => { onOpenChange(false); void combineSessions(s.id, x.id); }}>
                  <span className="font-medium">{x.name}</span>
                  <span className="text-xs text-muted-foreground">{x.labTitle} · {timeFmt.format(x.created)} · {t("overlap", { s: Math.round(overlap(x) / 1000) })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("combineNone")}</p>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
