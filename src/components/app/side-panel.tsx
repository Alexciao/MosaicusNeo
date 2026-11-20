"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, BookOpen, CloudCheck, CloudUpload, FolderOpen, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLab, labInfo, needsArduino, openSession, removeSession, showPage, setSideTab } from "@/lib/lab-store";
import { useCloud } from "@/lib/cloud/sync";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { WiringBlocks } from "./wiring";
import { WiringGuide } from "./wiring-diagram";
import { SENSORS } from "@/lib/sensors/catalog";
import { isPhoneRig } from "@/lib/sensors/rig";
import { RigEditor } from "./rig-editor";
import { intlLocale } from "@/i18n";

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

function Notebook() {
  const t = useTranslations("rig.side");
  const sessions = useLab((s) => s.sessions);
  const current = useLab((s) => s.session?.id);
  const signedIn = useCloud((s) => !!s.user);
  if (sessions == null) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (!sessions.length) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  const recent = sessions.slice(0, 5);
  return (
    <div className="flex flex-col gap-2">
    <ul className="flex flex-col gap-1.5">
      {recent.map((s) => (
        <li key={s.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", current === s.id && "border-brand/30 bg-brand/5")}>
          <div className="min-w-0 flex-1">
            <b className="flex items-center gap-1.5 truncate text-sm">
              <span className="truncate">{s.name}</span>
              {signedIn && s.cloud && (s.dirty
                ? <CloudUpload className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("cloudDirty")} />
                : <CloudCheck className="size-3.5 shrink-0 text-success" aria-label={t("cloudSaved")} />)}
            </b>
            <small className="block truncate text-xs text-muted-foreground">
              {s.labTitle} · {new Date(s.created).toLocaleString(intlLocale, { dateStyle: "short", timeStyle: "short" })} · {t("readings", { n: s.n })}
            </small>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label={t("openNamed", { name: s.name })} title={t("open")} onClick={() => void openSession(s.id)}><FolderOpen /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("deleteNamed", { name: s.name })} title={t("delete")} className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (await confirm({ title: t("deleteTitle", { name: s.name }), description: t("deleteDescription"), action: t("delete"), destructive: true })) await removeSession(s.id);
            }}>
            <Trash />
          </Button>
        </li>
      ))}
    </ul>
    <Button variant="outline" size="sm" className="self-start" onClick={() => showPage("quaderno")}>
      <BookOpen /> {sessions.length > recent.length ? t("openNotebookCount", { n: sessions.length }) : t("openNotebook")} <ArrowRight />
    </Button>
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
  const tabs = (ins
    ? [["wiring", t("wiring")], ins.source !== "audio" ? ["serial", t("serial")] : null]
    : [["sensors", rig.sensors.length ? t("componentsCount", { n: rig.sensors.length }) : t("components")], ["wiring", t("wiring")], ["notebook", t("notebook")], needsArduino(rig) ? ["serial", t("serial")] : null]
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
          <TabsContent value="notebook"><Notebook /></TabsContent>
          <TabsContent value="serial"><SerialMonitor /></TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
