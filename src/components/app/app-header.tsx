"use client";

import { useTheme } from "next-themes";
import { ChartLine, FlaskConical, Monitor, Moon, Presentation, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLab, showPage, setLim, type Page } from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { cn } from "@/lib/utils";
import { ConnectionControls } from "./connection-controls";
import { GuideButton } from "./guide-dialog";
import { AccountMenu } from "./account-menu";
import { APP_VERSION } from "@/lib/version";

export function NavTabs({ className }: { className?: string }) {
  const page = useLab((s) => s.page);
  const n = useWorkbench((s) => s.boxes.length);
  const item = (id: Page, label: string, Icon: typeof FlaskConical, badge?: number) => (
    <button
      type="button"
      onClick={() => showPage(id)}
      aria-current={page === id ? "page" : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors",
        page === id ? "bg-background text-foreground shadow-sm ring-1 ring-border dark:bg-secondary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
      {!!badge && <span className="rounded-full bg-brand/10 px-1.5 text-xs font-semibold text-brand tabular">{badge}</span>}
    </button>
  );
  return (
    <nav aria-label="Pagine" className={cn("flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}>
      {item("misura", "Misura", FlaskConical)}
      {item("elab", "Elaborazione", ChartLine, n)}
    </nav>
  );
}

function AppearanceMenu() {
  const { theme = "system", resolvedTheme, setTheme } = useTheme();
  const lim = useLab((s) => s.lim);
  const Icon = resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Aspetto" />} />}>
          <Icon />
        </TooltipTrigger>
        <TooltipContent>Aspetto</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem closeOnClick value="light"><Sun /> Chiaro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="dark"><Moon /> Scuro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="system"><Monitor /> Sistema</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={lim} onCheckedChange={(v) => setLim(!!v)}>
          <Presentation /> Modalità LIM
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/icons/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="text-[0.95rem] font-semibold tracking-tight">Mosaicus<span className="text-brand">Neo</span></h1>
            <span className="hidden text-xs text-muted-foreground sm:inline">v{APP_VERSION}</span>
          </div>
        </div>
        <div className="mx-1 hidden h-5 w-px bg-border md:block" />
        <NavTabs className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 hidden lg:flex"><ConnectionControls /></div>
          <GuideButton />
          <AppearanceMenu />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
