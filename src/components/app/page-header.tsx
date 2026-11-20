// Intestazione delle pagine (Quaderno, Elaborazione) e stato vuoto condiviso.

/** Contenitore comune delle pagine: stessa larghezza e stesso margine, così i titoli non saltano cambiando scheda. */
export const PAGE = "mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, className }: {
  title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-x-4 gap-y-3 px-1 pt-2", className)}>
      <div className="mr-auto min-w-0">
        <h2 className="text-xl leading-tight font-semibold tracking-[-0.015em]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, className }: {
  icon: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}>
      <Icon className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {body && <p className="max-w-sm text-sm text-pretty text-muted-foreground">{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
