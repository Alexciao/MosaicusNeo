"use client";
// Elenco a sinistra: esperimenti pronti (per argomento), i miei montaggi di sensori, strumenti.

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Copy, Ellipsis, Pencil, Plus, Trash, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRESETS, PRESET_TOPICS, INSTRUMENTS } from "@/lib/sensors/presets";
import { useLab, selectLab, newRig, rigSummary, renameRigById, duplicateRig, deleteRig } from "@/lib/lab-store";
import type { Rig } from "@/lib/sensors/rig";
import type { Tone } from "@/lib/sensors/types";
import { confirm } from "@/lib/confirm";
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
        className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          menu && "pr-9", active ? "bg-brand/8 ring-1 ring-brand/30" : "hover:bg-muted")}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[tone])}><Icon className="size-[1.15rem]" /></span>
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

/** Menu «⋯» di un montaggio libero: rinomina, duplica, elimina. */
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
            className="text-muted-foreground opacity-60 group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100" />
        }>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => { setName(rig.name); setRenaming(true); }}><Pencil /> Rinomina</DropdownMenuItem>
          <DropdownMenuItem disabled={running} onClick={() => duplicateRig(rig.id)}><Copy /> Duplica</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy}
            onClick={async () => { if (await confirm({ title: `Eliminare il montaggio «${rig.name}»?`, description: "Le misure già fatte restano nel Quaderno.", action: "Elimina", destructive: true })) deleteRig(rig.id); }}>
            <Trash /> Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rinomina il montaggio</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); renameRigById(rig.id, name); setRenaming(false); }} className="flex flex-col gap-4">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome del montaggio" />
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

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1.5 px-2 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>
);

export function LabPicker({ onPicked }: { onPicked?: () => void }) {
  const customRigs = useLab((s) => s.customRigs);
  const running = useLab((s) => s.running);
  return (
    <nav aria-label="Lab" className="flex flex-col gap-4">
      {PRESET_TOPICS.map((topic) => {
        const list = PRESETS.filter((p) => p.topic === topic);
        if (!list.length) return null;
        return (
          <div key={topic}>
            <Heading>{topic}</Heading>
            <ul className="flex flex-col gap-0.5">{list.map((p) => <Item key={p.id} {...p} onPicked={onPicked} />)}</ul>
          </div>
        );
      })}
      <div>
        <Heading>I miei montaggi</Heading>
        <ul className="flex flex-col gap-0.5">
          {customRigs.map((r) => (
            <Item key={r.id} id={r.id} title={r.name} subtitle={rigSummary(r)} icon={Wrench} tone="saffron" onPicked={onPicked} menu={<RigMenu rig={r} />} />
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground" disabled={running} onClick={() => { newRig(); onPicked?.(); }}>
          <Plus /> Nuovo montaggio di sensori
        </Button>
      </div>
      <div>
        <Heading>Strumenti</Heading>
        <ul className="flex flex-col gap-0.5">{INSTRUMENTS.map((i) => <Item key={i.id} {...i} onPicked={onPicked} />)}</ul>
      </div>
    </nav>
  );
}
