"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { LanguageMenu } from "./language-menu";
import { APP_VERSION } from "@/lib/version";

export function NavTabs({ className }: { className?: string }) {
  const page = useLab((s) => s.page);
  const n = useWorkbench((s) => s.boxes.length);
  const t = useTranslations("app.nav");
  const items: [Page, string, typeof FlaskConical, number?][] = [
    ["misura", t("misura"), FlaskConical],
    ["quaderno", t("quaderno"), BookOpen],
    ["elab", t("elab"), ChartLine, n],
  ];
  return (
    <GlideNav label={t("pages")} value={page} className={className}
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
  const t = useTranslations("app.appearance");
  const Icon = resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("label")} />} />}>
          <Icon />
        </TooltipTrigger>
        <TooltipContent>{t("label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem closeOnClick value="light"><Sun /> {t("light")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="dark"><Moon /> {t("dark")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem closeOnClick value="system"><Monitor /> {t("system")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={lim} onCheckedChange={(v) => setLim(!!v)} className="items-start">
          <Presentation className="mt-0.5" />
          <span className="flex flex-col">
            {t("lim")}
            <span className="text-xs text-muted-foreground">{t("limHint")}</span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={REPO_URL} target="_blank" rel="noopener" />}><GithubMark /> {t("source")}</DropdownMenuItem>
        <DropdownMenuItem render={<a href={ISSUES_URL} target="_blank" rel="noopener" />}><Bug /> {t("report")}</DropdownMenuItem>
        <DropdownMenuItem onClick={openPrivacy}><ShieldCheck /> {t("privacy")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-muted-foreground tabular">MosaicusNeo v{APP_VERSION}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const t = useTranslations("app.header");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" aria-label={t("home")}
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); goHome(); }}
          className="-mx-1.5 flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-opacity outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50">
          <img src="/icons/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <h1 className="text-[0.95rem] font-semibold tracking-tight">Mosaicus<span className="text-brand">Neo</span></h1>
        </Link>
        <div className="mx-2 hidden h-5 w-px bg-border md:block" />
        <NavTabs className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1">
          <ConnectionControls className="mr-1.5 hidden lg:flex" />
          <GuideButton />
          <LanguageMenu />
          <AppearanceMenu />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
