"use client";
// L'elenco dei lab: i miei progetti, gli esperimenti pronti (per argomento), gli strumenti.
// Sta nella barra laterale shadcn (fluttuante sul computer, cassetto dal basso sul telefono):
// ogni sezione si chiude e si riapre, e lo stato resta salvato.

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Copy, Ellipsis, Pencil, Plus, Search, Trash, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { PRESETS, PRESET_TOPICS, COLLAPSED_TOPICS, INSTRUMENTS } from "@/lib/sensors/presets";
import { useLab, selectLab, newRig, rigSummary, renameRigById, duplicateRig, deleteRig } from "@/lib/lab-store";
import type { Rig } from "@/lib/sensors/rig";
import type { Tone } from "@/lib/sensors/types";
import { confirm } from "@/lib/confirm";
import { GithubMark } from "./github-mark";
import { REPO_URL, ISSUES_URL } from "@/lib/links";
import { prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { toneBg } from "./tone";

/** Dopo la scelta: sul telefono il cassetto si chiude. */
function useClose() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => { if (isMobile) setOpenMobile(false); };
}

interface Entry { id: string; title: string; subtitle: string; icon: LucideIcon; tone: Tone; menu?: React.ReactNode }

function Item({ id, title, subtitle, icon: Icon, tone, menu }: Entry) {
  const labId = useLab((s) => s.labId);
  const running = useLab((s) => s.running);
  const close = useClose();
  const active = id === labId;
  const live = active && running;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton size="lg" isActive={active} disabled={running && !active} aria-current={active ? "true" : undefined}
        title={running && !active ? "Ferma la misura per cambiare lab" : undefined}
        onClick={() => { selectLab(id); close(); }}
        className="gap-2.5 data-active:bg-brand/8 data-active:ring-1 data-active:ring-brand/30 data-active:ring-inset">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-foreground", toneBg[tone])}><Icon /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-sm font-semibold", active && "text-brand")}>{title}</span>
            {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" title="Misura in corso" />}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">{subtitle}</span>
        </span>
      </SidebarMenuButton>
      {menu}
    </SidebarMenuItem>
  );
}

/** Menu «⋯» di un progetto: rinomina, duplica, elimina. */
function RigMenu({ rig }: { rig: Rig }) {
  const running = useLab((s) => s.running);
  const isOpen = useLab((s) => s.labId === rig.id);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(rig.name);
  const busy = running && isOpen;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuAction showOnHover aria-label={`Azioni per «${rig.name}»`} className="top-1/2! -translate-y-1/2 pointer-coarse:opacity-100" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-48">
          <DropdownMenuItem onClick={() => { setName(rig.name); setRenaming(true); }}><Pencil /> Rinomina</DropdownMenuItem>
          <DropdownMenuItem disabled={running} onClick={() => duplicateRig(rig.id)}><Copy /> Duplica</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy}
            onClick={async () => { if (await confirm({ title: `Eliminare «${rig.name}»?`, description: "Le misure restano nel Quaderno.", action: "Elimina", destructive: true })) deleteRig(rig.id); }}>
            <Trash /> Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rinomina il progetto</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); renameRigById(rig.id, name); setRenaming(false); }} className="flex flex-col gap-4">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome del progetto" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>Annulla</Button>
              <Button type="submit">Salva</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Un gruppo della barra che si chiude e si riapre (lo stato resta salvato). Con la ricerca è sempre aperto. */
function Section({ id, title, forceOpen, children, defaultOpen = true }: { id: string; title: string; forceOpen?: boolean; children: React.ReactNode; defaultOpen?: boolean }) {
  const key = `mosaicus.side.${id}`;
  const [stored, setStored] = useState(() => prefs.get<boolean>(key, defaultOpen));
  const open = forceOpen || stored;
  const setOpen = (o: boolean) => { if (forceOpen) return; setStored(o); prefs.set(key, o); };
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel render={<CollapsibleTrigger />}
          className="cursor-pointer gap-1 text-[0.7rem] font-semibold tracking-wider uppercase hover:text-sidebar-foreground">
          <span className="flex-1 truncate text-left">{title}</span>
          <ChevronDown className={cn("transition-transform duration-200", !open && "-rotate-90")} />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Intestazione con la ricerca e i gruppi dei lab (SidebarHeader + SidebarContent). */
export function LabPicker() {
  const customRigs = useLab((s) => s.customRigs);
  const running = useLab((s) => s.running);
  const close = useClose();
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const match = (...parts: string[]) => !q || q.split(/\s+/).every((w) => fold(parts.join(" ")).includes(w));
  const projects = customRigs.filter((r) => match(r.name, rigSummary(r), "progetto"));
  const topics = PRESET_TOPICS.map((topic) => ({ topic, list: PRESETS.filter((p) => p.topic === topic && match(p.title, p.subtitle, p.topic)) })).filter((t) => t.list.length);
  const tools = INSTRUMENTS.filter((i) => match(i.title, i.subtitle, "strumento"));
  const searching = !!q;
  const none = searching && !projects.length && !topics.length && !tools.length;
  return (
    <>
      <SidebarHeader className="gap-2 pb-1">
        <p className="px-2 pt-1 text-sm font-semibold">Lab</p>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder="Cerca un lab" aria-label="Cerca un lab" className="pr-7 pl-8" />
          {query && (
            <button type="button" aria-label="Cancella la ricerca" onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Lab" className="flex flex-col">
          {(!searching || projects.length > 0) && (
            <Section id="projects" title="I miei progetti" forceOpen={searching}>
              <SidebarMenu className="gap-0.5">
                {projects.map((r) => (
                  <Item key={r.id} id={r.id} title={r.name} subtitle={rigSummary(r)} icon={Wrench} tone="saffron" menu={<RigMenu rig={r} />} />
                ))}
                {!searching && (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled={running} onClick={() => { newRig(); close(); }} className="text-muted-foreground">
                      <Plus /> <span>Nuovo progetto</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </Section>
          )}
          {topics.map(({ topic, list }) => (
            <Section key={topic} id={`topic-${topic}`} title={topic === "Telefono" ? "Telefono, senza Arduino" : topic}
              forceOpen={searching} defaultOpen={!COLLAPSED_TOPICS.includes(topic)}>
              <SidebarMenu className="gap-0.5">{list.map((p) => <Item key={p.id} id={p.id} title={p.title} subtitle={p.subtitle} icon={p.icon} tone={p.tone} />)}</SidebarMenu>
            </Section>
          ))}
          {tools.length > 0 && (
            <Section id="tools" title="Strumenti" forceOpen={searching}>
              <SidebarMenu className="gap-0.5">{tools.map((i) => <Item key={i.id} id={i.id} title={i.title} subtitle={i.subtitle} icon={i.icon} tone={i.tone} />)}</SidebarMenu>
            </Section>
          )}
          {none && <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nessun lab per «{query.trim()}».</p>}
        </nav>
      </SidebarContent>
    </>
  );
}

/** Link in fondo alla barra. */
export function LabLinks() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 text-xs text-muted-foreground">
      <a href={REPO_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:text-foreground"><GithubMark className="size-3.5" /> GitHub</a>
      <a href={ISSUES_URL} target="_blank" rel="noopener" className="hover:text-foreground" title="Segnala un problema su GitHub">Segnalazioni</a>
      <a href="/privacy" target="_blank" rel="noopener" className="hover:text-foreground">Privacy</a>
    </div>
  );
}
