"use client";
// Elenco a sinistra: esperimenti pronti (per argomento), i miei montaggi di sensori, strumenti.

import type { LucideIcon } from "lucide-react";
import { Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRESETS, PRESET_TOPICS, INSTRUMENTS } from "@/lib/sensors/presets";
import { useLab, selectLab, newRig, rigSummary } from "@/lib/lab-store";
import type { Tone } from "@/lib/sensors/types";
import { cn } from "@/lib/utils";
import { toneBg } from "./tone";

function Item({ id, title, subtitle, icon: Icon, tone, onPicked, badge }: { id: string; title: string; subtitle: string; icon: LucideIcon; tone: Tone; onPicked?: () => void; badge?: string }) {
  const labId = useLab((s) => s.labId);
  const running = useLab((s) => s.running);
  const active = id === labId;
  return (
    <li>
      <button type="button" disabled={running && !active} aria-current={active ? "true" : undefined}
        onClick={() => { selectLab(id); onPicked?.(); }}
        className={cn("group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          active ? "bg-primary/8 ring-1 ring-primary/25" : "hover:bg-muted")}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[tone])}><Icon className="size-[1.15rem]" /></span>
        <span className="min-w-0 flex-1">
          <span className={cn("flex items-center gap-1.5 truncate text-sm font-semibold", active && "text-primary")}>
            <span className="truncate">{title}</span>
            {badge && <span className="shrink-0 rounded bg-muted px-1 text-[0.6rem] font-medium text-muted-foreground">{badge}</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </button>
    </li>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1.5 px-2 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>
);

export function LabPicker({ onPicked }: { onPicked?: () => void }) {
  const customRigs = useLab((s) => s.customRigs);
  const running = useLab((s) => s.running);
  const presets = PRESETS;
  return (
    <nav aria-label="Lab" className="flex flex-col gap-4">
      {PRESET_TOPICS.map((topic) => {
        const list = presets.filter((p) => p.topic === topic);
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
          {customRigs.map((r) => <Item key={r.id} id={r.id} title={r.name} subtitle={rigSummary(r)} icon={Wrench} tone="saffron" onPicked={onPicked} />)}
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
