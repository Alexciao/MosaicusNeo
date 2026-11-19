"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, BookOpen, CloudCheck, CloudUpload, FolderOpen, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLab, labInfo, needsArduino, openSession, removeSession, showPage, setSideTab } from "@/lib/lab-store";
import { useCloud } from "@/lib/cloud/sync";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { WiringBlocks } from "./wiring";
import { WiringGuide } from "./wiring-diagram";
import { RigEditor } from "./rig-editor";

/** Collegamenti del progetto: schema, occorrente e passi; i consigli dell'esperimento in fondo. */
function RigWiring() {
  const rig = useLab((s) => s.rig);
  const labId = useLab((s) => s.labId);
  const info = labInfo(labId);
  return (
    <div className="flex flex-col gap-4">
      <WiringGuide sensors={rig.sensors} />
      {!!info.preset?.tips?.length && <WiringBlocks blocks={info.preset.tips} />}
    </div>
  );
}

function Notebook() {
  const sessions = useLab((s) => s.sessions);
  const current = useLab((s) => s.session?.id);
  const signedIn = useCloud((s) => !!s.user);
  if (sessions == null) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (!sessions.length) return <p className="text-sm text-muted-foreground">Nessuna misura. Premi «Avvia» e poi «Ferma»: la misura si salva qui.</p>;
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
                ? <CloudUpload className="size-3.5 shrink-0 text-muted-foreground" aria-label="da salvare nel cloud" />
                : <CloudCheck className="size-3.5 shrink-0 text-success" aria-label="salvata nel cloud" />)}
            </b>
            <small className="block truncate text-xs text-muted-foreground">
              {s.labTitle} · {new Date(s.created).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · {s.n} letture
            </small>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label={`Apri ${s.name}`} title="Apri" onClick={() => void openSession(s.id)}><FolderOpen /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Elimina ${s.name}`} title="Elimina" className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Eliminare «${s.name}»?`, description: "I tratti già inviati a Elaborazione restano.", action: "Elimina", destructive: true })) await removeSession(s.id);
            }}>
            <Trash />
          </Button>
        </li>
      ))}
    </ul>
    <Button variant="outline" size="sm" className="self-start" onClick={() => showPage("quaderno")}>
      <BookOpen /> Apri il Quaderno{sessions.length > recent.length ? ` (${sessions.length})` : ""} <ArrowRight />
    </Button>
    </div>
  );
}

function SerialMonitor() {
  const log = useLab((s) => s.serialLog);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Righe ricevute da Arduino, non convertite. Le righe «D,slot,t,…» sono letture.</p>
      <pre ref={ref} className="h-72 overflow-auto rounded-lg bg-screen p-3 font-mono text-[0.72rem] leading-relaxed text-lime/90">
        {log.length ? log.join("\n") : "In attesa di dati…"}
      </pre>
    </div>
  );
}

export function SidePanel() {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const info = labInfo(labId);
  const ins = info.instrument;
  const tabs = (ins
    ? [["wiring", "Collegamenti"], ins.source !== "audio" ? ["serial", "Seriale"] : null]
    : [["sensors", `Componenti${rig.sensors.length ? ` (${rig.sensors.length})` : ""}`], ["wiring", "Collegamenti"], ["notebook", "Quaderno"], needsArduino(rig) ? ["serial", "Seriale"] : null]
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
