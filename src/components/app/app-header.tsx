"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { BookOpen, Bug, ChartLine, FlaskConical, Monitor, Moon, Presentation, ShieldCheck, Sun } from "lucide-react";
import { GithubMark } from "./github-mark";
import { REPO_URL, ISSUES_URL } from "@/lib/links";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLab, showPage, goHome, setLim, type Page } from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { cn } from "@/lib/utils";
import { ConnectionControls } from "./connection-controls";
import { GlideNav } from "./glide-nav";
import { GuideButton } from "./guide-dialog";
import { openPrivacy } from "./privacy-dialog";
import { AccountMenu } from "./account-menu";
import { APP_VERSION } from "@/lib/version";

export function NavTabs({ className }: { className?: string }) {
  const page = useLab((s) => s.page);
  const n = useWorkbench((s) => s.boxes.length);
  const nSessions = useLab((s) => s.sessions?.length ?? 0);
  const items: [Page, string, typeof FlaskConical, number?][] = [
    ["misura", "Misura", FlaskConical],
    ["quaderno", "Quaderno", BookOpen, nSessions],
    ["elab", "Elaborazione", ChartLine, n],
  ];
  return (
    <GlideNav label="Pagine" value={page} className={className}
      items={items.map(([id, label, Icon, badge]) => ({
        id,
        onSelect: () => showPage(id),
        content: (
          <>
            <Icon className="size-4" />
            {label}
            {!!badge && <span key={badge} className={cn("animate-in rounded-full px-1.5 text-xs font-semibold tabular duration-300 zoom-in-75", id === "elab" ? "bg-brand/10 text-brand" : "bg-foreground/5 text-muted-foreground")}>{badge}</span>}
          </>
        ),
      }))} />
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
        <DropdownMenuCheckboxItem checked={lim} onCheckedChange={(v) => setLim(!!v)} className="items-start">
          <Presentation className="mt-0.5" />
          <span className="flex flex-col">
            Modalità LIM
            <span className="text-xs text-muted-foreground">Testi più grandi, grafici più leggeri. Per LIM e PC lenti.</span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={REPO_URL} target="_blank" rel="noopener" />}><GithubMark /> Codice sorgente su GitHub</DropdownMenuItem>
        <DropdownMenuItem render={<a href={ISSUES_URL} target="_blank" rel="noopener" />}><Bug /> Segnala un problema</DropdownMenuItem>
        <DropdownMenuItem onClick={openPrivacy}><ShieldCheck /> Informativa sulla privacy</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  // sul computer, in Misura con la barra dei lab aperta, l'account sta in fondo alla barra
  const inSidebar = useLab((s) => s.page === "misura" && s.labsSidebar);
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" aria-label="MosaicusNeo, pagina iniziale"
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); goHome(); }}
          className="-mx-1.5 flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-opacity outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50">
          <img src="/icons/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="text-[0.95rem] font-semibold tracking-tight">Mosaicus<span className="text-brand">Neo</span></h1>
            <span className="hidden text-xs text-muted-foreground sm:inline">v{APP_VERSION}</span>
          </div>
        </Link>
        <div className="mx-1 hidden h-5 w-px bg-border md:block" />
        <NavTabs className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 hidden lg:flex"><ConnectionControls /></div>
          <GuideButton />
          <AppearanceMenu />
          <AccountMenu className={inSidebar ? "lg:hidden" : undefined} />
        </div>
      </div>
    </header>
  );
}
