"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, ChartLine, FlaskConical } from "lucide-react";
import { LogoMark } from "./logo";
import { useLab, showPage, goHome, type Page } from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { ConnectionControls, ConnectionDrawer } from "./connection-controls";
import { GlideNav } from "./glide-nav";
import { GuideButton } from "./guide-dialog";
import { SettingsMenu } from "./settings-menu";

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
            {!!badge && <span key={badge} className="rounded-[5px] bg-foreground/[0.07] px-1.5 text-[11px] leading-[18px] font-medium text-muted-foreground tabular">{badge}</span>}
          </>
        ),
      }))} />
  );
}

export function AppHeader() {
  const t = useTranslations("app.header");
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      {/* a tutta larghezza: il marchio sta sul filo della barra dei lab, non spostato dal centraggio */}
      <div className="flex h-14 w-full items-center gap-3 px-3.5">
        <Link href="/" aria-label={t("home")}
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); goHome(); }}
          className="-mx-1.5 flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-opacity outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50">
          <LogoMark size={22} className="shrink-0 text-foreground" />
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">MosaicusNeo</h1>
        </Link>
        <div className="mx-1 hidden h-5 w-px bg-border md:block" />
        <NavTabs className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1">
          <ConnectionControls className="mr-2 hidden lg:flex" />
          <ConnectionDrawer className="mr-1 lg:hidden" />
          <GuideButton />
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}
