"use client";

import { useTranslations } from "next-intl";
import { Cable, LayoutGrid, Plus, SlidersHorizontal, TriangleExclamationPoint } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar";
import { useLab, labInfo, needsArduino, hasMap, openGuide, showWiring, setLabsSidebar, setSideTab, addSensor } from "@/lib/lab-store";
import { SENSORS, pinName, type SensorType } from "@/lib/sensors/catalog";
import { sensorLabel, isPhoneRig, type SensorInstance } from "@/lib/sensors/rig";
import { audioSupported } from "@/lib/mosaicus/audio.js";
import { LabPicker } from "./lab-picker";
import { ResponsivePanel } from "./responsive-panel";
import { RunCard } from "./run-card";
import { ChartCard } from "./chart-card";
import { MapCard } from "./map-card";
import { SidePanel } from "./side-panel";
import { RigEditor } from "./rig-editor";
import { ConnectionControls, canReachArduino } from "./connection-controls";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScopePanel } from "@/components/instruments/scope-panel";
import { SynthPanel } from "@/components/instruments/synth-panel";

function SupportBanner() {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const t = useTranslations("app.measure");
  const info = labInfo(labId);
  if (info.instrument?.source === "audio") {
    if (audioSupported()) return null;
    return (
      <Alert variant="destructive"><TriangleExclamationPoint /><AlertTitle>{t("audioTitle")}</AlertTitle>
        <AlertDescription>{t("audioDesc")}</AlertDescription></Alert>
    );
  }
  const arduino = info.instrument ? info.instrument.source === "arduino" && !info.instrument.optionalLink : needsArduino(rig);
  if (!arduino || canReachArduino()) return null;
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return (
    <Alert><TriangleExclamationPoint /><AlertTitle>{t("noArduinoTitle")}</AlertTitle>
      <AlertDescription>
        {ios
          ? t("noArduinoIos")
          : t("noArduinoOther")}
        <Button size="xs" variant="outline" className="mt-2" onClick={() => openGuide("field")}>{t("openGuide")}</Button>
      </AlertDescription>
    </Alert>
  );
}

/** I pin di un componente, in breve: «TRIG D12 · ECHO D11» (il nome del piedino solo se è una sigla). */
function pinsText(s: SensorInstance) {
  return SENSORS[s.type].pins.map((p) => {
    const v = s.pins[p.key];
    const pin = typeof v === "number" ? pinName(v) : "—";
    return /^[A-Z0-9]{2,5}$/.test(p.role) ? `${p.role} ${pin}` : pin;
  }).join(" · ");
}

export function LabHeading({ onPick, onSensors }: { onPick: () => void; onSensors: () => void }) {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const modified = useLab((s) => s.modified);
  const t = useTranslations("app.measure");
  const info = labInfo(labId);
  // esperimenti pronti col solo telefono: niente da collegare né da cambiare, solo come si usano
  const phoneLab = info.kind === "preset" && isPhoneRig(rig);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-9 items-center gap-2">
        <SidebarTrigger className="-ml-1.5 hidden text-muted-foreground lg:inline-flex" title={t("toggleLabs")} />
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-xl leading-tight font-semibold tracking-[-0.015em]">
          <span className="truncate">{info.title}</span>
          {modified && <span className="shrink-0 text-[13px] font-normal tracking-normal text-muted-foreground">{t("custom")}</span>}
        </h2>
        <Button variant="outline" size="sm" className="hidden md:inline-flex lg:hidden" onClick={onPick}><LayoutGrid /> {t("changeLab")}</Button>
      </div>
      {!info.instrument && (
        <div className="flex items-center gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-x-4 overflow-x-auto text-[13px] whitespace-nowrap text-muted-foreground [scrollbar-width:none]" aria-label={t("components")}>
            {rig.sensors.map((s) => (
              <span key={s.id} className="shrink-0">
                <span className="text-foreground">{sensorLabel(s)}</span>
                {SENSORS[s.type].pins.length > 0 && !SENSORS[s.type].phone && <span className="ml-1.5 font-mono text-xs">{pinsText(s)}</span>}
              </span>
            ))}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {!phoneLab && (
              <Button variant="outline" size="sm" onClick={onSensors} className="2xl:hidden" aria-label={rig.sensors.length ? t("editComponents") : t("addComponents")}>
                {rig.sensors.length ? <SlidersHorizontal /> : <Plus />}
                <span className="hidden sm:inline">{rig.sensors.length ? t("editComponents") : t("addComponents")}</span>
              </Button>
            )}
            {!!rig.sensors.length && (
              <Button variant="outline" size="sm" onClick={showWiring} className="2xl:hidden" aria-label={phoneLab ? t("howToUse") : t("howToWire")}>
                <Cable />
                <span className="hidden sm:inline">{phoneLab ? t("howToUse") : t("howToWire")}</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** I componenti più usati, da aggiungere con un clic quando il progetto è vuoto. */
const QUICK: SensorType[] = ["sonar", "ntc", "dht", "ldr", "button", "imu"];

function QuickPick({ onAll }: { onAll: () => void }) {
  const t = useTranslations("app.measure");
  const running = useLab((s) => s.running);
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="px-5 pt-5 pb-4">
        <h3 className="text-base font-semibold">{t("noComponents")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("quickPickHint")}</p>
      </div>
      <ul className="grid grid-cols-1 gap-px border-t bg-border min-[480px]:grid-cols-2 lg:grid-cols-3">
        {QUICK.map((type) => {
          const def = SENSORS[type];
          const SIcon = def.icon;
          return (
            <li key={type} className="bg-card">
              <button type="button" disabled={running} onClick={() => addSensor(type)}
                className="group/q flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 disabled:opacity-50">
                <SIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{def.short}</span>
                  <span className="block truncate text-xs text-muted-foreground">{def.measures}</span>
                </span>
                <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/q:opacity-100 group-focus-visible/q:opacity-100" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onAll}>{t("allComponents")}</Button>
      </div>
    </section>
  );
}

export function MeasurePage() {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const labsOpen = useLab((s) => s.labsOpen);
  const rigOpen = useLab((s) => s.rigOpen);
  const t = useTranslations("app.measure");
  const info = labInfo(labId);
  const ins = info.instrument;
  const setLabs = (open: boolean) => useLab.setState({ labsOpen: open });
  const setRig = (open: boolean) => useLab.setState({ rigOpen: open });
  // sul computer la barra dei lab resta aperta o chiusa come l'hai lasciata
  const side = useLab((s) => s.labsSidebar);
  // sugli schermi larghi l'elenco dei componenti è già nella colonna a destra: si apre lì
  const wide = !useIsMobile(1536);
  const editComponents = () => {
    if (!wide) { setRig(true); return; }
    setSideTab("sensors");
    requestAnimationFrame(() => document.getElementById("side-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <SidebarProvider open={side} onOpenChange={setLabsSidebar} openMobile={labsOpen} onOpenMobileChange={setLabs} className="min-h-0">
      {/* barra a filo, sotto l'intestazione (alta 3,5 rem); sotto lg diventa un cassetto dal basso */}
      <Sidebar variant="sidebar" style={{ top: "3.5rem", height: "calc(100svh - 3.5rem)" }}>
        <LabPicker />
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-transparent">
        <div className="mx-auto grid w-full max-w-[1600px] gap-4 p-3 sm:p-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="flex min-w-0 flex-col gap-4">
            <LabHeading onPick={() => setLabs(true)} onSensors={editComponents} />
            {ins && <ConnectionControls className="flex-wrap empty:hidden lg:hidden" />}
            <SupportBanner />
            {ins?.kind === "scope" ? <ScopePanel key={ins.id} exp={ins} />
              : ins?.kind === "synth" ? <SynthPanel key={ins.id} exp={ins} />
                : !rig.sensors.length ? <QuickPick onAll={editComponents} /> : (
                  <>
                    <RunCard />
                    {hasMap(rig) && <MapCard />}
                    <ChartCard />
                  </>
                )}
          </section>

          <aside className="min-w-0 2xl:col-start-2 2xl:row-start-1">
            <div className="2xl:sticky 2xl:top-[4.5rem]"><SidePanel /></div>
          </aside>
        </div>
      </SidebarInset>

      <ResponsivePanel open={rigOpen} onOpenChange={setRig} title={t("components")}>
        <RigEditor />
      </ResponsivePanel>
    </SidebarProvider>
  );
}
