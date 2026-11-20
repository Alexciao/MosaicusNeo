// Intestazione delle pagine (Quaderno, Elaborazione) e stato vuoto condiviso.

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, className }: {
  title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-x-4 gap-y-3 px-1 pt-2", className)}>
      <div className="mr-auto min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
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
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-5" /></span>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {body && <p className="max-w-sm text-sm text-pretty text-muted-foreground">{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
