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
import { RigEditor } from "./rig-editor";
import { useIsMobile } from "@/hooks/use-mobile";

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
    <div className="flex flex-col gap-4">
      <WiringGuide editable sensors={rig.sensors.filter((s) => !SENSORS[s.type].phone)} />
      {!!info.preset?.tips?.length && <WiringBlocks blocks={info.preset.tips} />}
    </div>
  );
}

function SerialMonitor() {
  const t = useTranslations("rig.side");
  const log = useLab((s) => s.serialLog);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("serialHint")}</p>
      <pre ref={ref} className="h-72 overflow-auto rounded-lg bg-screen p-3 font-mono text-[0.72rem] leading-relaxed text-lime/90">
        {log.length ? log.join("\n") : t("serialWaiting")}
      </pre>
    </div>
  );
}

export function SidePanel() {
  const t = useTranslations("rig.side.tabs");
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const info = labInfo(labId);
  const ins = info.instrument;
  const wide = !useIsMobile(1536);
  const tabs = (ins
    ? [["wiring", t("wiring")], ins.source !== "audio" ? ["serial", t("serial")] : null]
    // i componenti si modificano qui solo sugli schermi larghi: altrove c'è «Modifica componenti» sopra la misura
    : [wide ? ["sensors", rig.sensors.length ? t("componentsCount", { n: rig.sensors.length }) : t("components")] : null, ["wiring", t("wiring")], needsArduino(rig) ? ["serial", t("serial")] : null]
  ).filter(Boolean) as [string, string][];
  const tab = useLab((s) => s.sideTab);
  const active = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  return (
    <Card id="side-panel" className="scroll-mt-20 gap-0 p-0">
      <Tabs value={active} onValueChange={(v) => setSideTab(String(v))}>
        <div className="border-b p-2">
          <TabsList className="w-full">
            {tabs.map(([id, label]) => <TabsTrigger key={id} value={id} className="text-xs">{label}</TabsTrigger>)}
          </TabsList>
        </div>
        <div className="p-4">
          <TabsContent value="sensors"><RigEditor /></TabsContent>
          <TabsContent value="wiring">{ins ? <WiringBlocks blocks={ins.wiring} /> : <RigWiring />}</TabsContent>
          <TabsContent value="serial"><SerialMonitor /></TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
