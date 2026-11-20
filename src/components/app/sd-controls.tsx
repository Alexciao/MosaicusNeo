"use client";
// La scheda SD come componente: «Prepara Arduino» (manda e salva la configurazione, prova la
// scheda) e «Importa dalla scheda» (i file LOGnnnnn.CSV entrano nel Quaderno), con i passi.

import { useRef } from "react";
import { CircleCheck, FolderInput, LoaderCircle, TriangleExclamationPoint, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLab, prepareSd, importSdFiles } from "@/lib/lab-store";
import { cn } from "@/lib/utils";

/** Bottone che apre la scelta dei file della scheda SD e li importa nel Quaderno. */
export function SdImportButton({ size = "sm", variant = "outline", className }: { size?: "sm" | "xs"; variant?: "outline" | "ghost"; className?: string }) {
  const t = useTranslations("rig.sd");
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" accept=".csv,.CSV,text/csv,text/plain" multiple hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) void importSdFiles(files); }} />
      <Button size={size} variant={variant} className={className} onClick={() => input.current?.click()}><FolderInput /> {t("import")}</Button>
    </>
  );
}

const b = (c: React.ReactNode) => <b className="font-semibold">{c}</b>;

export function SdHowTo({ className }: { className?: string }) {
  const t = useTranslations("rig.sd");
  const rig = useLab((s) => s.rig);
  const ready = useLab((s) => s.ready);
  const linkKind = useLab((s) => s.linkKind);
  const running = useLab((s) => s.running);
  const check = useLab((s) => s.sdCheck);
  const button = rig.sensors.some((s) => s.type === "button");
  const canPrep = ready && (linkKind === "arduino" || linkKind === "simulatore") && !running;
  return (
    <div className={cn("flex flex-col gap-2 rounded-md bg-muted/50 p-2.5 text-xs", className)}>
      <ol className="list-decimal space-y-1 pl-4">
        <li>{t.rich("step1", { b })}</li>
        <li>{t.rich("step2", { b, detail: button ? t("step2Button") : t("step2Free") })}</li>
        <li>{t.rich("step3", { b })}</li>
      </ol>
      <p className="text-muted-foreground">{t("liveNote")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canPrep || check?.state === "busy"} onClick={() => void prepareSd()}
          title={canPrep ? t("prepareTitle") : t("prepareNeedsUsb")}>
          {check?.state === "busy" ? <LoaderCircle className="animate-spin" /> : <Upload />} {t("prepare")}
        </Button>
        <SdImportButton />
      </div>
      {!canPrep && !running && <p className="text-muted-foreground">{t("prepareHint")}</p>}
      {check && check.state !== "busy" && (
        <p className={cn("flex gap-1.5", check.state === "ok" ? "text-success" : "text-destructive")}>
          {check.state === "ok" ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <TriangleExclamationPoint className="mt-px size-3.5 shrink-0" />}
          {check.text}
        </p>
      )}
    </div>
  );
}
