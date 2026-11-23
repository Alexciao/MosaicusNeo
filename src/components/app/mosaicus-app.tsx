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
import { toast } from "@/lib/toast";
import { t as tr } from "@/i18n";
import { AppHeader } from "./app-header";
import { MeasurePage } from "./measure-page";
import { ConfirmHost } from "./confirm-host";
import { GuideDialog } from "./guide-dialog";
import { PrivacyDialog, openPrivacy } from "./privacy-dialog";
import { WorkbenchPage } from "@/components/workbench/workbench-page";
import { NotebookPage } from "@/components/notebook/notebook-page";
import { startCloud } from "@/lib/cloud/sync";
import { AppFooter } from "./app-footer";
import { ErrorBoundary } from "./error-boundary";
import { codeFromHash } from "@/lib/sensors/share";
import { openNewLab } from "./lab-share";

/** Barra in basso sul telefono: Lab apre l'elenco, Misura e Elaborazione cambiano pagina. */
function MobileNav() {
  const page = useLab((s) => s.page);
  const n = useWorkbench((s) => s.boxes.length);
  const t = useTranslations("app.nav");
  const item = (active: boolean, label: string, Icon: typeof FlaskConical, onClick: () => void, badge?: number) => (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={cn("relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium transition-colors select-none active:bg-foreground/[0.04]", active ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} /><span className="max-w-full truncate">{label}</span>
      {!!badge && <span className="absolute top-1 left-1/2 ml-2.5 min-w-4 rounded-[5px] bg-foreground px-1 text-center text-[10px] leading-4 font-medium text-background tabular">{badge}</span>}
    </button>
  );
  return (
    <nav aria-label={t("mobile")} className="mz-glass fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-md md:hidden">
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
    <div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-full border bg-screen p-1 pl-3 text-lime shadow-lg md:bottom-4">
      <button type="button" className="flex items-center gap-2 text-sm font-semibold" onClick={() => { showPage("misura"); selectLab("synth"); }} title={t("open")}>
        <Volume2 aria-hidden className="size-4" />
        {fmtVal(G.f, G.f < 100 ? 1 : 0)} Hz{G.two ? ` + ${fmtVal(G.f + G.df, 1)} Hz` : ""}
      </button>
      <Button size="icon-sm" variant="ghost" className="rounded-full text-lime hover:bg-white/10 hover:text-lime" onClick={() => stopGenerator()} aria-label={t("stop")}><Square className="fill-current" /></Button>
    </div>
  );
}

export function MosaicusApp() {
  const page = useLab((s) => s.page);
  const lab = page === "misura";
  // Le due pagine restano montate (si nasconde quella non attiva): cambiare pagina è istantaneo,
  // senza dissolvenza (lo si fa decine di volte al giorno), e i grafici non si ricostruiscono. Elaborazione si monta alla prima visita.
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
    // un link condiviso (#lab=NEO2…): si apre l'import con il codice già pronto, poi l'indirizzo torna pulito
    const openShared = () => {
      const code = codeFromHash(window.location.hash);
      if (!code) return;
      showPage("misura");
      openNewLab(code);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    openShared();
    window.addEventListener("hashchange", openShared);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // una versione nuova prende il posto della vecchia da sola (skipWaiting): se la pagina era già
      // servita da un service worker, lo si dice e si propone di ricaricare, senza farlo d'autorità
      // (potrebbe esserci una misura in corso)
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController) return;
        toast.info(tr("app.update.ready"), { duration: Infinity, action: { label: tr("app.update.reload"), onClick: () => location.reload() } });
      }, { once: true });
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline non disponibile */ });
    }
    return () => window.removeEventListener("hashchange", openShared);
  }, []);
  return (
    // nel Lab, da xl in su, l'app è alta quanto la finestra: non scorre lei ma ciascuna delle sue colonne
    <div className={cn("flex min-h-svh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0", lab && "xl:h-svh")}>
      <AppHeader />
      <main id="main" tabIndex={-1} className={cn("flex-1 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] outline-none", lab && "xl:min-h-0")}>
        <div hidden={!lab} className="xl:h-full"><ErrorBoundary where="misura"><MeasurePage /></ErrorBoundary></div>
        {seen.quaderno && <div hidden={page !== "quaderno"}><ErrorBoundary where="quaderno"><NotebookPage /></ErrorBoundary></div>}
        {seen.elab && <div hidden={page !== "elab"}><ErrorBoundary where="elab"><WorkbenchPage /></ErrorBoundary></div>}
      </main>
      {/* nel Lab, quando le colonne scorrono da sole, sta in fondo a quella centrale */}
      <AppFooter className={cn(lab && "xl:hidden")} />
      <MobileNav />
      <GenChip />
      <ConfirmHost />
      <ErrorBoundary where="dialogs">
        <GuideDialog />
        <PrivacyDialog />
      </ErrorBoundary>
    </div>
  );
}
