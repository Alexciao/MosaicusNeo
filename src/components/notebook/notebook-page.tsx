"use client";
// Quaderno: tutte le misure salvate, da cercare, filtrare, riaprire o mandare a Elaborazione.

import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, ChartLine, CloudCheck, CloudUpload, Cpu, Ellipsis, FileSpreadsheet, FileText, FlaskConical, FolderOpen, MemoryStick, Pencil, Search, Trash, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useLab, labInfo, openSession, removeSession, renameSession, sendSessionToElab, exportSession, goElab, showPage, type SessionSummary,
} from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { useCloud } from "@/lib/cloud/sync";
import { confirm } from "@/lib/confirm";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { toneBg } from "@/components/app/tone";
import { SdImportButton } from "@/components/app/sd-controls";

type Sort = "new" | "old" | "name" | "size";
const SORTS: Record<Sort, string> = { new: "Più recenti", old: "Più vecchie", name: "Nome (A–Z)", size: "Più letture" };
type Src = "all" | "arduino" | "sd" | "sim";
const SOURCES: Record<Src, string> = { all: "Tutte le sorgenti", arduino: "Arduino dal vivo", sd: "Scheda SD", sim: "Simulatore" };

const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

function dayLabel(ts: number) {
  const d = new Date(ts), today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Ieri";
  const s = dayFmt.format(d);
  return s[0].toUpperCase() + s.slice(1);
}

function duration(s: number) {
  if (s < 60) return `${fmtVal(s, s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m < 60 ? `${m} min${r ? ` ${r} s` : ""}` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function NotebookPage() {
  const sessions = useLab((s) => s.sessions);
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("all");
  const [src, setSrc] = useState<Src>("all");
  const [sort, setSort] = useState<Sort>("new");
  const query = useDeferredValue(q.trim().toLowerCase());

  const labs = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions ?? []) m.set(s.labId, s.labTitle);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [sessions]);
  const labItems = useMemo(() => ({ all: "Tutti i lab", ...Object.fromEntries(labs) }), [labs]);

  const list = useMemo(() => {
    const out = (sessions ?? []).filter((s) =>
      (lab === "all" || s.labId === lab) &&
      (src === "all" || src === (s.source === "simulatore" ? "sim" : s.source === "scheda SD" ? "sd" : "arduino")) &&
      (!query || `${s.name} ${s.labTitle} ${s.sensors.join(" ")}`.toLowerCase().includes(query)));
    const cmp: Record<Sort, (a: SessionSummary, b: SessionSummary) => number> = {
      new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created,
      name: (a, b) => a.name.localeCompare(b.name, "it"), size: (a, b) => b.n - a.n,
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
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-3 sm:p-4">
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="mr-auto">
            <h2 className="text-xl font-bold tracking-tight">Quaderno</h2>
            <p className="text-sm text-muted-foreground">
              Le misure si salvano qui quando premi «Ferma». Le registrazioni della scheda SD si importano da qui.
            </p>
          </div>
          <SdImportButton />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, lab o sensore" aria-label="Cerca nel Quaderno" className="pl-8" />
          </div>
          <Select value={lab} onValueChange={(v) => v && setLab(String(v))} items={labItems}>
            <SelectTrigger aria-label="Filtra per lab" className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(labItems).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={src} onValueChange={(v) => v && setSrc(v as Src)} items={SOURCES}>
            <SelectTrigger aria-label="Filtra per sorgente" className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)} items={SORTS}>
            <SelectTrigger aria-label="Ordina" className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SORTS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {sessions && sessions.length > 0 && (
          <p className="-mt-1 text-xs text-muted-foreground">
            {filtered ? <>{list.length} di {sessions.length} misure · <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={reset}>mostra tutte</button></> : <>{sessions.length} {sessions.length === 1 ? "misura" : "misure"}</>}
          </p>
        )}
      </Card>

      {sessions == null && <p className="px-1 text-sm text-muted-foreground">Caricamento…</p>}

      {sessions?.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-tone-sky text-tone-ink"><BookOpen className="size-7" /></span>
          <h3 className="text-lg font-semibold">Nessuna misura salvata</h3>
          <p className="max-w-md text-sm text-muted-foreground">Avvia una misura e premi «Ferma»: la trovi qui con data, sensori e letture.</p>
          <Button variant="outline" onClick={() => showPage("misura")}><FlaskConical /> Vai a Misura</Button>
        </Card>
      )}

      {sessions && sessions.length > 0 && !list.length && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-sm text-muted-foreground">Nessuna misura corrisponde ai filtri.</p>
          <Button size="sm" variant="outline" onClick={reset}><X /> Togli i filtri</Button>
        </Card>
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
  const current = useLab((st) => st.session?.id === s.id);
  const running = useLab((st) => st.running);
  const signedIn = useCloud((st) => !!st.user);
  const boxes = useWorkbench((st) => st.boxes.filter((b) => b.sessionId === s.id).length);
  const lastBox = useWorkbench((st) => st.boxes.findLast((b) => b.sessionId === s.id)?.id);
  const info = labInfo(s.labId);
  const Icon = info.icon;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(s.name);
  const when = showDate ? new Date(s.created).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }) : timeFmt.format(s.created);

  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center", current && "border-brand/40 bg-brand/5")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[info.tone])}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{s.name}</span>
            {current && <span className="shrink-0 rounded bg-brand/15 px-1.5 text-[0.65rem] font-semibold text-brand">aperta</span>}
            {signedIn && s.cloud && (s.dirty
              ? <CloudUpload className="size-3.5 shrink-0 text-muted-foreground" aria-label="da salvare nel cloud" />
              : <CloudCheck className="size-3.5 shrink-0 text-success" aria-label="salvata nel cloud" />)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {s.labTitle} · {when} · {duration(s.duration)} · {s.n.toLocaleString("it-IT")} letture
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {s.source === "simulatore"
              ? <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">simulatore</span>
              : s.source === "scheda SD"
              ? <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground"><MemoryStick className="size-3" /> scheda SD</span>
              : <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground"><Cpu className="size-3" /> Arduino</span>}
            {s.sensors.map((x, i) => <span key={i} className="rounded border px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">{x}</span>)}
            {boxes > 0 && (
              <button type="button" onClick={() => goElab(lastBox)}
                className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand hover:bg-brand/15">
                <ChartLine className="size-3" /> {boxes === 1 ? "1 tratto" : `${boxes} tratti`} in Elaborazione
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:pl-2">
        <Button size="sm" variant="outline" disabled={running} onClick={() => void openSession(s.id)}><FolderOpen /> Apri</Button>
        <Button size="sm" disabled={running} onClick={() => void sendSessionToElab(s.id)}>Analizza <ArrowRight /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Altre azioni per «${s.name}»`} />}><Ellipsis /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => { setName(s.name); setRenaming(true); }}><Pencil /> Rinomina</DropdownMenuItem>
            <DropdownMenuItem disabled={running} onClick={() => void exportSession(s.id, "xlsx")}><FileSpreadsheet /> Esporta in Excel</DropdownMenuItem>
            <DropdownMenuItem disabled={running} onClick={() => void exportSession(s.id, "csv")}><FileText /> Esporta CSV</DropdownMenuItem>
            <DropdownMenuItem disabled={running} onClick={() => void exportSession(s.id, "raw-csv")}><FileText /> Dati grezzi (CSV)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={running && current}
              onClick={async () => {
                if (await confirm({ title: `Eliminare «${s.name}»?`, description: "I tratti già in Elaborazione restano.", action: "Elimina", destructive: true })) await removeSession(s.id);
              }}>
              <Trash /> Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rinomina la misura</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void renameSession(s.id, name); setRenaming(false); }} className="flex flex-col gap-4">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome della misura" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>Annulla</Button>
              <Button type="submit">Salva</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
