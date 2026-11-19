"use client";

import { useEffect, useState } from "react";
import { ChartLine, FlaskConical, LayoutGrid, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, boot, showPage, selectLab } from "@/lib/lab-store";
import { useWorkbench } from "@/lib/workbench-store";
import { generatorState, onGeneratorChange, stopGenerator } from "@/lib/mosaicus/synth-engine.js";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";
import { MeasurePage } from "./measure-page";
import { ConfirmHost } from "./confirm-host";
import { WorkbenchPage } from "@/components/workbench/workbench-page";
import { startCloud } from "@/lib/cloud/sync";

/** Barra in basso sul telefono: Lab apre l'elenco, Misura e Elaborazione cambiano pagina. */
function MobileNav() {
  const page = useLab((s) => s.page);
  const n = useWorkbench((s) => s.boxes.length);
  const item = (active: boolean, label: string, Icon: typeof FlaskConical, onClick: () => void, badge?: number) => (
    <button type="button" onClick={onClick} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-5" />{label}
      {!!badge && <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-primary px-1.5 text-[0.6rem] font-semibold text-primary-foreground">{badge}</span>}
    </button>
  );
  return (
    <nav aria-label="Navigazione" className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {item(false, "Lab", LayoutGrid, () => { showPage("misura"); useLab.setState({ labsOpen: true }); })}
      {item(page === "misura", "Misura", FlaskConical, () => showPage("misura"))}
      {item(page === "elab", "Elaborazione", ChartLine, () => showPage("elab"), n)}
    </nav>
  );
}

/** Spia del synth acceso, visibile nelle altre pagine (il suono continua). */
function GenChip() {
  const [, setTick] = useState(0);
  const labId = useLab((s) => s.labId);
  const page = useLab((s) => s.page);
  useEffect(() => { const off = onGeneratorChange(() => setTick((t) => t + 1)); return () => { off(); }; }, []);
  const G = generatorState();
  if (!G.on || (labId === "synth" && page === "misura")) return null;
  return (
    <div className="fixed right-4 bottom-20 z-40 flex items-center gap-1 rounded-full border bg-screen p-1 pl-3 text-lime shadow-lg md:bottom-4">
      <button type="button" className="flex items-center gap-2 text-sm font-semibold" onClick={() => { showPage("misura"); selectLab("synth"); }} title="Apri il synth">
        <Volume2 className="size-4" />
        {fmtVal(G.f, G.f < 100 ? 1 : 0)} Hz{G.two ? ` + ${fmtVal(G.f + G.df, 1)} Hz` : ""}
      </button>
      <Button size="icon-sm" variant="ghost" className="rounded-full text-lime hover:bg-white/10 hover:text-lime" onClick={() => stopGenerator()} aria-label="Spegni il synth"><Square className="fill-current" /></Button>
    </div>
  );
}

export function MosaicusApp() {
  const page = useLab((s) => s.page);
  useEffect(() => {
    startCloud();
    void boot();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline non disponibile */ });
    }
  }, []);
  return (
    <div className="flex min-h-svh flex-col pb-16 md:pb-0">
      <AppHeader />
      <main className="flex-1">{page === "elab" ? <WorkbenchPage /> : <MeasurePage />}</main>
      <footer className="hidden px-4 py-6 text-center text-xs text-muted-foreground md:block">
        MosaicusNeo · basato su Mosaicus di Ermes Ferdinando Rosi · software libero con licenza MIT ·{" "}
        <a className="underline" href="https://github.com/Alexciao/MosaicusNeo" target="_blank" rel="noopener">codice sorgente</a>
      </footer>
      <MobileNav />
      <GenChip />
      <ConfirmHost />
    </div>
  );
}
