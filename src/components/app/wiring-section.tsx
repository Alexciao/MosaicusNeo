"use client";
// Sezione richiudibile della scheda «Collegamenti»: una riga semplice (titolo, riepilogo a destra,
// freccia), separata dalla precedente da un filo. Niente riquadri: il contenitore è la scheda.
// Aperta o chiusa resta come l'hai lasciata (preferenza locale).

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** icon: mostrata solo per gli avvisi e i consigli (dice di che blocco si tratta), non per le sezioni normali. */
export function WiringSection({ id, icon: Icon, title, meta, tone = "default", defaultOpen = true, className, children }: {
  id: string; icon?: LucideIcon; title: React.ReactNode; meta?: React.ReactNode;
  tone?: "default" | "warn" | "tip"; defaultOpen?: boolean; className?: string; children: React.ReactNode;
}) {
  const key = `mosaicus.wiring.${id}`;
  const [open, setOpenState] = useState(() => prefs.get<boolean>(key, defaultOpen));
  const setOpen = (o: boolean) => { setOpenState(o); prefs.set(key, o); };
  const showIcon = Icon && tone !== "default";
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("border-t border-border first:border-t-0", className)}>
      <CollapsibleTrigger
        className="group/sec flex h-11 w-full items-center gap-2 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50">
        {showIcon && <Icon className={cn("size-4 shrink-0", tone === "warn" ? "text-destructive" : "text-tone-saffron-fg")} aria-hidden />}
        <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", tone === "warn" && "text-destructive")}>{title}</span>
        {meta != null && <span className="shrink-0 text-[13px] text-muted-foreground tabular">{meta}</span>}
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover/sec:text-foreground", !open && "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Chiave corta e stabile per un testo (per salvare lo stato di una sezione o dei passi). */
export function hashKey(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
