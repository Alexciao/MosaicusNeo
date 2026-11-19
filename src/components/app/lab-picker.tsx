"use client";
// Elenco a sinistra: i miei progetti, gli esperimenti pronti (per argomento), gli strumenti.
// Ogni sezione si chiude e si riapre; lo stato resta salvato.

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Copy, Ellipsis, Pencil, Plus, Trash, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRESETS, PRESET_TOPICS, INSTRUMENTS } from "@/lib/sensors/presets";
import { useLab, selectLab, newRig, rigSummary, renameRigById, duplicateRig, deleteRig } from "@/lib/lab-store";
import type { Rig } from "@/lib/sensors/rig";
import type { Tone } from "@/lib/sensors/types";
import { confirm } from "@/lib/confirm";
import { prefs } from "@/lib/prefs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toneBg } from "./tone";

function Item({ id, title, subtitle, icon: Icon, tone, onPicked, badge, menu }: {
  id: string; title: string; subtitle: string; icon: LucideIcon; tone: Tone; onPicked?: () => void; badge?: string; menu?: React.ReactNode;
}) {
  const labId = useLab((s) => s.labId);
  const running = useLab((s) => s.running);
  const active = id === labId;
  return (
    <li className="group/item relative">
      <button type="button" disabled={running && !active} aria-current={active ? "true" : undefined}
        onClick={() => { selectLab(id); onPicked?.(); }}
        className={cn(
          // bordo sempre di 1 px (trasparente se non attivo) e niente contorno del browser: lo spessore non cambia mai
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ring-1 ring-transparent ring-inset outline-none transition-[background-color,box-shadow] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring",
          menu && "pr-9", active ? "bg-brand/8 ring-brand/30" : "hover:bg-muted")}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-foreground", toneBg[tone])}><Icon className="size-[1.15rem]" /></span>
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-center gap-1.5 truncate text-sm font-semibold", active && "text-brand")}>
            <span className="truncate">{title}</span>
            {badge && <span className="shrink-0 rounded bg-muted px-1 text-[0.6rem] font-medium text-muted-foreground">{badge}</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </button>
      {menu && <div className="absolute top-1/2 right-1.5 -translate-y-1/2">{menu}</div>}
    </li>
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
        <DropdownMenuTrigger render={
          <Button size="icon-xs" variant="ghost" aria-label={`Azioni per «${rig.name}»`}
            className="text-muted-foreground opacity-60 group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100" />
        }>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
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

function Section({ id, title, children, defaultOpen = true }: { id: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const key = `mosaicus.side.${id}`;
  const [open, setOpenState] = useState(() => prefs.get<boolean>(key, defaultOpen));
  const setOpen = (o: boolean) => { setOpenState(o); prefs.set(key, o); };
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/sec flex w-full items-center gap-1 rounded-md px-2 py-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent><div className="pt-1">{children}</div></CollapsibleContent>
    </Collapsible>
  );
}

export function LabPicker({ onPicked }: { onPicked?: () => void }) {
  const customRigs = useLab((s) => s.customRigs);
  const running = useLab((s) => s.running);
  return (
    <nav aria-label="Lab" className="flex flex-col gap-3">
      <Section id="projects" title="I miei progetti">
        {!!customRigs.length && (
          <ul className="flex flex-col gap-0.5">
            {customRigs.map((r) => (
              <Item key={r.id} id={r.id} title={r.name} subtitle={rigSummary(r)} icon={Wrench} tone="saffron" onPicked={onPicked} menu={<RigMenu rig={r} />} />
            ))}
          </ul>
        )}
        <Button variant="ghost" size="sm" className="mt-0.5 w-full justify-start text-muted-foreground" disabled={running} onClick={() => { newRig(); onPicked?.(); }}>
          <Plus /> Nuovo progetto
        </Button>
      </Section>
      {PRESET_TOPICS.map((topic) => {
        const list = PRESETS.filter((p) => p.topic === topic);
        if (!list.length) return null;
        return (
          <Section key={topic} id={`topic-${topic}`} title={topic}>
            <ul className="flex flex-col gap-0.5">{list.map((p) => <Item key={p.id} {...p} onPicked={onPicked} />)}</ul>
          </Section>
        );
      })}
      <Section id="tools" title="Strumenti">
        <ul className="flex flex-col gap-0.5">{INSTRUMENTS.map((i) => <Item key={i.id} {...i} onPicked={onPicked} />)}</ul>
      </Section>
    </nav>
  );
}
