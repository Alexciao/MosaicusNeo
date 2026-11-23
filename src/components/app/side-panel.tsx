"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLab, labInfo, needsArduino, setSideTab } from "@/lib/lab-store";
import { WiringBlocks } from "./wiring";
import { WiringGuide } from "./wiring-diagram";
import { SENSORS } from "@/lib/sensors/catalog";
import { isPhoneRig } from "@/lib/sensors/rig";
import { PANEL_ID } from "@/lib/lab-panel";
import { RigEditor } from "./rig-editor";
import { cn } from "@/lib/utils";

/** Collegamenti del progetto: schema, occorrente e passi; i consigli dell'esperimento in fondo. */
function RigWiring() {
  const rig = useLab((s) => s.rig);
  const labId = useLab((s) => s.labId);
  const info = labInfo(labId);
  // sensori del telefono: niente da collegare, solo come si usano
  if (isPhoneRig(rig)) {
    const blocks = rig.sensors.flatMap((s) => SENSORS[s.type].wiring({}, s.options));
    const seen = new Set<string>();
    return <WiringBlocks blocks={[...blocks.filter((b) => !seen.has(b.title) && seen.add(b.title)), ...(info.preset?.tips ?? [])]} />;
  }
  return (
    <div className="flex flex-col">
      <WiringGuide editable sensors={rig.sensors.filter((s) => !SENSORS[s.type].phone)} />
      {!!info.preset?.tips?.length && <div className="border-t"><WiringBlocks blocks={info.preset.tips} /></div>}
    </div>
  );
}

function SerialMonitor() {
  const t = useTranslations("rig.side");
  const log = useLab((s) => s.serialLog);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="flex flex-col gap-2 xl:h-full">
      <p className="text-xs text-muted-foreground">{t("serialHint")}</p>
      <pre ref={ref} className={cn("h-72 overflow-auto overscroll-contain rounded-lg bg-screen p-3 font-mono text-xs leading-relaxed font-normal xl:h-auto xl:min-h-40 xl:flex-1", log.length ? "text-lime/80" : "text-lime/40")}>
        {log.length ? log.join("\n") : t("serialWaiting")}
      </pre>
    </div>
  );
}

/** Una scheda del pannello: quando è agganciato a destra scorre da sola, sotto le linguette. */
const PANE = "xl:relative xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-width:thin]";

export function SidePanel() {
  const t = useTranslations("rig.side.tabs");
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const info = labInfo(labId);
  const ins = info.instrument;
  const tabs = (ins
    ? [["wiring", t("wiring")], ins.source !== "audio" ? ["serial", t("serial")] : null]
    // i componenti si modificano qui solo sugli schermi larghi: altrove c'è «Modifica componenti» sopra la misura
    : [["sensors", <>{t("components")}{!!rig.sensors.length && <span className="ml-1 text-muted-foreground tabular">{rig.sensors.length}</span>}</>], ["wiring", t("wiring")], needsArduino(rig) ? ["serial", t("serial")] : null]
  ).filter(Boolean) as [string, React.ReactNode][];
  const tab = useLab((s) => s.sideTab);
  const active = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  return (
    <Card id={PANEL_ID} className="scroll-mt-20 gap-0 p-0 xl:h-full xl:rounded-none xl:border-0 xl:border-l xl:border-sidebar-border xl:bg-sidebar xl:text-sidebar-foreground xl:shadow-none">
      <Tabs value={active} onValueChange={(v) => setSideTab(String(v))} className="xl:min-h-0 xl:flex-1 xl:gap-0">
        <div className="shrink-0 border-b p-2">
          <TabsList className="w-full">
            {tabs.map(([id, label]) => <TabsTrigger key={id} value={id} className="text-[13px]">{label}</TabsTrigger>)}
          </TabsList>
        </div>
        <TabsContent value="sensors" className={cn("p-4", PANE)}><RigEditor /></TabsContent>
        {/* le sezioni dei collegamenti sono righe con il filo sopra: margine in alto ridotto */}
        <TabsContent value="wiring" className={cn("px-4 py-1", PANE)}>{ins ? <WiringBlocks blocks={ins.wiring} /> : <RigWiring />}</TabsContent>
        <TabsContent value="serial" className={cn("p-4", PANE)}><SerialMonitor /></TabsContent>
      </Tabs>
    </Card>
  );
}
