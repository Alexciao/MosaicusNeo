"use client";
// L'elenco dei lab: i miei progetti, gli esperimenti pronti (per argomento), gli strumenti.
// Sta nella barra laterale shadcn (fluttuante sul computer, cassetto dal basso sul telefono):
// ogni sezione si chiude e si riapre, e lo stato resta salvato.

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Copy, Ellipsis, Palette, Pencil, Plus, Search, Trash, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { PRESETS, PRESET_TOPICS, PHONE_PRESETS, COLLAPSED_TOPICS, INSTRUMENTS, TOPIC_TONE } from "@/lib/sensors/presets";
import { DEFAULT_PROJECT_ICON, PROJECT_ICONS, PROJECT_TONES, isProjectIcon, projectIcon, projectTone, type ProjectIconKey } from "@/lib/sensors/project-look";
import { useLab, selectLab, newRig, rigSummary, renameRigById, duplicateRig, deleteRig, setRigLook } from "@/lib/lab-store";
import type { Rig } from "@/lib/sensors/rig";
import type { Tone } from "@/lib/sensors/types";
import { confirm } from "@/lib/confirm";
import { prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { toneDot, toneFg } from "./tone";

/** Dopo la scelta: sul telefono il cassetto si chiude. */
function useClose() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => { if (isMobile) setOpenMobile(false); };
}

interface Entry { id: string; title: string; icon: LucideIcon; tone: Tone; menu?: React.ReactNode }

function Item({ id, title, icon: Icon, tone, menu }: Entry) {
  const t = useTranslations("rig.picker");
  const labId = useLab((s) => s.labId);
  const running = useLab((s) => s.running);
  const close = useClose();
  const active = id === labId;
  const live = active && running;
  return (
    <SidebarMenuItem>
      {/* durante una misura le altre voci restano leggibili: al clic selectLab spiega che va fermata */}
      <SidebarMenuButton isActive={active} aria-current={active ? "true" : undefined}
        onClick={() => { if (!active) selectLab(id); if (active || !running) close(); }}
        className="h-8 gap-2.5 px-2 text-[13px] font-medium text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground active:bg-foreground/[0.06] data-active:bg-foreground/[0.06] data-active:font-medium data-active:text-foreground dark:font-normal dark:data-active:font-medium">
        <Icon className={cn("size-4!", toneFg[tone])} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {live && <span className="size-1.5 shrink-0 rounded-full bg-destructive" title={t("live")} aria-label={t("live")} />}
      </SidebarMenuButton>
      {menu}
    </SidebarMenuItem>
  );
}

/** Menu «⋯» di un progetto: rinomina, duplica, elimina. */
/** Menu di un progetto: rinomina, colore e icona, duplica, elimina. trigger: il pulsante che lo apre
 *  (di serie i «⋯» della barra dei lab; accanto al titolo del lab, una matita). */
export function RigMenu({ rig, trigger, side = "right" }: { rig: Rig; trigger?: React.ReactElement; side?: "right" | "bottom" }) {
  const t = useTranslations("rig.picker");
  const running = useLab((s) => s.running);
  const isOpen = useLab((s) => s.labId === rig.id);
  const [renaming, setRenaming] = useState(false);
  const [styling, setStyling] = useState(false);
  const [name, setName] = useState(rig.name);
  const busy = running && isOpen;
  return (
    <>
      <DropdownMenu>
        {trigger ? <DropdownMenuTrigger render={trigger} /> : (
          <DropdownMenuTrigger render={<SidebarMenuAction showOnHover aria-label={t("actionsFor", { name: rig.name })} className="top-1/2! -translate-y-1/2 pointer-coarse:opacity-100" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent side={side} align="start" className="w-48">
          <DropdownMenuItem onClick={() => { setName(rig.name); setRenaming(true); }}><Pencil /> {t("rename")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setStyling(true)}><Palette /> {t("customize")}</DropdownMenuItem>
          <DropdownMenuItem disabled={running} onClick={() => duplicateRig(rig.id)}><Copy /> {t("duplicate")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy}
            onClick={async () => { if (await confirm({ title: t("deleteTitle", { name: rig.name }), description: t("deleteDescription"), action: t("delete"), destructive: true })) deleteRig(rig.id); }}>
            <Trash /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("renameTitle")}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); renameRigById(rig.id, name); setRenaming(false); }} className="flex flex-col gap-4">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={t("projectName")} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>{t("cancel")}</Button>
              <Button type="submit">{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <LookDialog rig={rig} open={styling} onOpenChange={setStyling} />
    </>
  );
}

/** Colore e icona di un progetto: si applicano subito (anteprima dal vivo nella barra). */
function LookDialog({ rig, open, onOpenChange }: { rig: Rig; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("rig.picker");
  const tone = projectTone(rig);
  const iconKey: ProjectIconKey = isProjectIcon(rig.icon) ? rig.icon : DEFAULT_PROJECT_ICON;
  const Icon = PROJECT_ICONS[iconKey];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Icon className={cn("size-4 shrink-0", toneFg[tone])} aria-hidden />
            <span className="truncate">{rig.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <p id={`tone-${rig.id}`} className="text-xs font-medium text-muted-foreground">{t("color")}</p>
            <div className="flex gap-2" role="radiogroup" aria-labelledby={`tone-${rig.id}`}>
              {PROJECT_TONES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={c === tone} aria-label={t(`tones.${c}`)} title={t(`tones.${c}`)}
                  onClick={() => setRigLook(rig.id, { tone: c })}
                  className={cn("grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-popover transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    toneDot[c], c === tone && "ring-2 ring-foreground")}>
                  {c === tone && <Check className="size-3.5 text-white dark:text-zinc-950" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <p id={`icon-${rig.id}`} className="text-xs font-medium text-muted-foreground">{t("icon")}</p>
            <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-labelledby={`icon-${rig.id}`}>
              {(Object.entries(PROJECT_ICONS) as [ProjectIconKey, LucideIcon][]).map(([key, I]) => (
                <button key={key} type="button" role="radio" aria-checked={key === iconKey} aria-label={t(`icons.${key}`)} title={t(`icons.${key}`)}
                  onClick={() => setRigLook(rig.id, { icon: key })}
                  className={cn("grid aspect-square place-items-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
                    key === iconKey ? cn("bg-foreground/[0.07]", toneFg[tone]) : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
                  <I />
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <SidebarGroup className="px-2 py-1.5">
        <SidebarGroupLabel render={<CollapsibleTrigger />}
          className="group/label h-7 cursor-pointer gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <span className="flex-1 truncate text-left">{title}</span>
          <ChevronDown aria-hidden className={cn("size-3.5! opacity-0 transition-[opacity,rotate] duration-150 ease-out group-hover/label:opacity-100 group-focus-visible/label:opacity-100 pointer-coarse:opacity-100", !open && "-rotate-90 opacity-100")} />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Intestazione con la ricerca e i gruppi dei lab (SidebarHeader + SidebarContent). */

export function LabPicker() {
  const t = useTranslations("rig.picker");
  const customRigs = useLab((s) => s.customRigs);
  const running = useLab((s) => s.running);
  const close = useClose();
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const match = (...parts: string[]) => !q || q.split(/\s+/).every((w) => fold(parts.join(" ")).includes(w));
  const projects = customRigs.filter((r) => match(r.name, rigSummary(r), t("projectKeyword")));
  const topicTones: Tone[] = [TOPIC_TONE.kinematics, TOPIC_TONE.thermo, TOPIC_TONE.field];
  const topics = PRESET_TOPICS.map((topic, i) => ({ topic, tone: topicTones[i], list: PRESETS.filter((p) => p.topic === topic && match(p.title, p.subtitle, p.topic)) })).filter((g) => g.list.length);
  // strumenti: oscilloscopio, synth… e gli esperimenti con il solo telefono
  const tools = [...INSTRUMENTS, ...PHONE_PRESETS].filter((i) => match(i.title, i.subtitle, t("toolKeyword")));
  const searching = !!q;
  const none = searching && !projects.length && !topics.length && !tools.length;
  return (
    <>
      <SidebarHeader className="gap-2 pt-3 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder={t("search")} aria-label={t("search")} className="pr-7 pl-8" />
          {query && (
            <button type="button" aria-label={t("clearSearch")} onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("nav")} className="flex flex-col">
          {(!searching || projects.length > 0) && (
            <Section id="projects" title={t("projects")} forceOpen={searching}>
              <SidebarMenu className="gap-0.5">
                {projects.map((r) => (
                  <Item key={r.id} id={r.id} title={r.name} icon={projectIcon(r)} tone={projectTone(r)} menu={<RigMenu rig={r} />} />
                ))}
                {!searching && (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled={running} onClick={() => { newRig(); close(); }}
                      className="h-8 gap-2.5 px-2 text-[13px] font-medium text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground dark:font-normal">
                      <Plus className="size-4! text-muted-foreground" aria-hidden /> <span>{t("newProject")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </Section>
          )}
          {topics.map(({ topic, tone, list }) => (
            <Section key={topic} id={`topic-${topic}`} title={topic}
              forceOpen={searching} defaultOpen={!COLLAPSED_TOPICS.includes(topic)}>
              <SidebarMenu className="gap-0.5">{list.map((p) => <Item key={p.id} id={p.id} title={p.title} icon={p.icon} tone={tone} />)}</SidebarMenu>
            </Section>
          ))}
          {tools.length > 0 && (
            <Section id="tools" title={t("tools")} forceOpen={searching}>
              <SidebarMenu className="gap-0.5">{tools.map((i) => <Item key={i.id} id={i.id} title={i.title} icon={i.icon} tone={TOPIC_TONE.tools} />)}</SidebarMenu>
            </Section>
          )}
          {none && <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t("noResults", { query: query.trim() })}</p>}
        </nav>
      </SidebarContent>
    </>
  );
}
