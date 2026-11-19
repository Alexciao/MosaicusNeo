"use client";

import { EXPERIMENTS, TOPICS } from "@/lib/mosaicus/experiments";
import { useLab, selectExperiment } from "@/lib/lab-store";
import { cn } from "@/lib/utils";
import { toneBg } from "./tone";

export function LabPicker({ onPicked }: { onPicked?: () => void }) {
  const expId = useLab((s) => s.expId);
  const running = useLab((s) => s.running);
  return (
    <nav aria-label="Lab" className="flex flex-col gap-4">
      {TOPICS.map((topic) => {
        const list = EXPERIMENTS.filter((e) => e.topic === topic && !e.hidden);
        if (!list.length) return null;
        return (
          <div key={topic}>
            <h3 className="mb-1.5 px-2 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">{topic}</h3>
            <ul className="flex flex-col gap-0.5">
              {list.map((e) => {
                const active = e.id === expId;
                const Icon = e.icon;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={running && !active}
                      aria-current={active ? "true" : undefined}
                      onClick={() => { selectExperiment(e.id); onPicked?.(); }}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        active ? "bg-primary/8 ring-1 ring-primary/25" : "hover:bg-muted",
                      )}
                    >
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-tone-ink", toneBg[e.tone])}>
                        <Icon className="size-[1.15rem]" />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-semibold", active && "text-primary")}>{e.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{e.subtitle}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
