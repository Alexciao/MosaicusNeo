"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, ChartLine, FlaskConical, LayoutGrid, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, boot, showPage, selectLab } from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { generatorState, onGeneratorChange, stopGenerator } from "@/lib/mosaicus/synth-engine.js";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";
import { MeasurePage } from "./measure-page";
import { ConfirmHost } from "./confirm-host";
import { GuideDialog } from "./guide-dialog";
import { PrivacyDialog, openPrivacy } from "./privacy-dialog";
import { WorkbenchPage } from "@/components/workbench/workbench-page";
import { NotebookPage } from "@/components/notebook/notebook-page";
import { startCloud } from "@/lib/cloud/sync";
import { GithubMark } from "./github-mark";
import { REPO_URL, ISSUES_URL } from "@/lib/links";

/** Barra in basso sul telefono: Lab apre l'elenco, Misura e Elaborazione cambiano pagina. */
function MobileNav() {
  const page = useLab((s) => s.page);
  const n = useWorkbench((s) => s.boxes.length);
  const t = useTranslations("app.nav");
  const item = (active: boolean, label: string, Icon: typeof FlaskConical, onClick: () => void, badge?: number) => (
    <button type="button" onClick={onClick} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-5" />{label}
      {!!badge && <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-primary px-1.5 text-[0.6rem] font-semibold text-primary-foreground">{badge}</span>}
    </button>
  );
  return (
    <nav aria-label={t("mobile")} className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {item(false, t("labs"), LayoutGrid, () => { showPage("misura"); useLab.setState({ labsOpen: true }); })}
      {item(page === "misura", t("misura"), FlaskConical, () => showPage("misura"))}
      {item(page === "quaderno", t("quaderno"), BookOpen, () => showPage("quaderno"))}
      {item(page === "elab", t("elab"), ChartLine, () => showPage("elab"), n)}
    </nav>
  );
}

/** Spia del synth acceso, visibile nelle altre pagine (il suono continua). */
function GenChip() {
  const [, setTick] = useState(0);
  const labId = useLab((s) => s.labId);
  const page = useLab((s) => s.page);
  const t = useTranslations("app.genChip");
  useEffect(() => { const off = onGeneratorChange(() => setTick((x) => x + 1)); return () => { off(); }; }, []);
  const G = generatorState();
  if (!G.on || (labId === "synth" && page === "misura")) return null;
  return (
    <div className="fixed right-4 bottom-20 z-40 flex items-center gap-1 rounded-full border bg-screen p-1 pl-3 text-lime shadow-lg md:bottom-4">
      <button type="button" className="flex items-center gap-2 text-sm font-semibold" onClick={() => { showPage("misura"); selectLab("synth"); }} title={t("open")}>
        <Volume2 className="size-4" />
        {fmtVal(G.f, G.f < 100 ? 1 : 0)} Hz{G.two ? ` + ${fmtVal(G.f + G.df, 1)} Hz` : ""}
      </button>
      <Button size="icon-sm" variant="ghost" className="rounded-full text-lime hover:bg-white/10 hover:text-lime" onClick={() => stopGenerator()} aria-label={t("stop")}><Square className="fill-current" /></Button>
    </div>
  );
}

export function MosaicusApp() {
  const page = useLab((s) => s.page);
  const t = useTranslations("app.footer");
  // Le due pagine restano montate (si nasconde quella non attiva): cambiare pagina è istantaneo
  // e i grafici non si ricostruiscono. Elaborazione si monta alla prima visita.
  const [seen, setSeen] = useState<Record<string, boolean>>({ [page]: true });
  if (!seen[page]) setSeen({ ...seen, [page]: true });
  useEffect(() => {
    startCloud();
    // /privacy porta qui: l'informativa si apre dentro l'app
    if (new URLSearchParams(window.location.search).has("privacy")) {
      openPrivacy();
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    void boot();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline non disponibile */ });
    }
  }, []);
  return (
    <div className="flex min-h-svh flex-col pb-16 md:pb-0">
      <AppHeader />
      <main className="flex-1">
        <div hidden={page !== "misura"} className="mz-enter"><MeasurePage /></div>
        {seen.quaderno && <div hidden={page !== "quaderno"} className="mz-enter"><NotebookPage /></div>}
        {seen.elab && <div hidden={page !== "elab"} className="mz-enter"><WorkbenchPage /></div>}
      </main>
      <footer className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-muted-foreground">
        <span>{t("credits")}</span>
        <span className="flex items-center gap-4">
          <a className="inline-flex items-center gap-1 transition-colors hover:text-foreground" href={REPO_URL} target="_blank" rel="noopener"><GithubMark className="size-3" />GitHub</a>
          <a className="transition-colors hover:text-foreground" href={ISSUES_URL} target="_blank" rel="noopener">{t("report")}</a>
          <button type="button" className="transition-colors hover:text-foreground" onClick={openPrivacy}>{t("privacy")}</button>
        </span>
      </footer>
      <MobileNav />
      <GenChip />
      <ConfirmHost />
      <GuideDialog />
      <PrivacyDialog />
    </div>
  );
}
