"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, RotateCcw, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Param } from "@/lib/mosaicus/experiments";
import { byId } from "@/lib/mosaicus/experiments";
import { useLab, currentExp, setParam, resetParams, openSession, removeSession } from "@/lib/lab-store";
import { confirm } from "@/lib/confirm";
import { prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { WiringBlocks } from "./wiring";

function NumberParam({ p, value }: { p: Param; value: number }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (!Number.isFinite(v)) { setText(String(value)); return; }
    if (v !== value) setParam(p.key, v);
  };
  return (
    <Input id={`param-${p.key}`} type="number" inputMode="decimal" step={p.step ?? "any"} min={p.min}
      value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }} className="h-8 tabular" />
  );
}

function ParamRow({ p }: { p: Param }) {
  const value = useLab((s) => s.params[p.key]);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`param-${p.key}`} className="text-xs leading-snug font-medium text-muted-foreground">
        {p.label}{p.unit ? <span className="font-normal"> ({p.unit})</span> : null}
      </Label>
      {p.type === "select" ? (
        <Select value={String(value)} onValueChange={(v) => v != null && setParam(p.key, String(v))} items={Object.fromEntries(p.options!)}>
          <SelectTrigger id={`param-${p.key}`} size="sm" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{p.options!.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <NumberParam key={String(value)} p={p} value={Number(value)} />
      )}
    </div>
  );
}

function ParamsForm() {
  const expId = useLab((s) => s.expId);
  const [adv, setAdv] = useState(false);
  const exp = currentExp();
  void expId;
  const basic = exp.params.filter((p) => !p.advanced), advanced = exp.params.filter((p) => p.advanced);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      {basic.map((p) => <ParamRow key={`${exp.id}-${p.key}`} p={p} />)}
      {!!advanced.length && (
        <Collapsible open={adv} onOpenChange={setAdv} className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold">
            <ChevronDown className={cn("size-4 transition-transform", !adv && "-rotate-90")} /> Parametri avanzati
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3 border-t px-3 pt-3 pb-3">
            {advanced.map((p) => <ParamRow key={`${exp.id}-${p.key}`} p={p} />)}
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={resetParams}><RotateCcw /> Ripristina valori predefiniti</Button>
          </CollapsibleContent>
        </Collapsible>
      )}
    </form>
  );
}

function Notebook() {
  const sessions = useLab((s) => s.sessions);
  const current = useLab((s) => s.session?.id);
  if (sessions == null) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (!sessions.length) return <p className="text-sm text-muted-foreground">Ancora nessuna misura. Le misure si salvano qui da sole quando premi «Ferma».</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {sessions.map((s) => (
        <li key={s.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", current === s.id && "border-primary/30 bg-accent/40")}>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm">{s.name}</b>
            <small className="block truncate text-xs text-muted-foreground">
              {byId(s.experiment)?.title ?? ""} · {new Date(s.created).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · {s.n} punti
            </small>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label={`Apri ${s.name}`} title="Apri" onClick={() => void openSession(s.id)}><FolderOpen /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={`Elimina ${s.name}`} title="Elimina" className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Eliminare «${s.name}»?`, description: "La misura sparisce dal Quaderno. I tratti già inviati a Elaborazione restano.", action: "Elimina", destructive: true })) await removeSession(s.id);
            }}>
            <Trash />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function SerialMonitor() {
  const log = useLab((s) => s.serialLog);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Le righe grezze che arrivano dal dispositivo: il dato «com&apos;è», prima di ogni conversione.</p>
      <pre ref={ref} className="h-72 overflow-auto rounded-lg bg-screen p-3 font-mono text-[0.72rem] leading-relaxed text-lime/90">
        {log.length ? log.join("\n") : "In attesa di dati…"}
      </pre>
    </div>
  );
}

export function SidePanel() {
  const expId = useLab((s) => s.expId);
  const exp = currentExp();
  void expId;
  const tabs = [
    !exp.kind && exp.params.length ? ["params", "Parametri"] : null,
    ["wiring", "Collegamenti"],
    !exp.kind ? ["notebook", "Quaderno"] : null,
    exp.source !== "audio" ? ["serial", "Seriale"] : null,
  ].filter(Boolean) as [string, string][];
  const [tab, setTab] = useState(() => prefs.get("mosaicus.sideTab", "params"));
  const active = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  return (
    <Card className="gap-0 p-0">
      <Tabs value={active} onValueChange={(v) => { setTab(String(v)); prefs.set("mosaicus.sideTab", v); }}>
        <div className="border-b p-2">
          <TabsList className="w-full">
            {tabs.map(([id, label]) => <TabsTrigger key={id} value={id} className="text-xs">{label}</TabsTrigger>)}
          </TabsList>
        </div>
        <div className="p-4">
          <TabsContent value="params"><ParamsForm /></TabsContent>
          <TabsContent value="wiring"><WiringBlocks blocks={exp.wiring} /></TabsContent>
          <TabsContent value="notebook"><Notebook /></TabsContent>
          <TabsContent value="serial"><SerialMonitor /></TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
