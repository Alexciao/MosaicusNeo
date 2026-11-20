"use client";
// La scheda della misura, come il pannello frontale di uno strumento:
// • una riga in alto: lo stato (spia + testo), il nome della misura, i comandi a destra
//   (collega / simulatore → avvia → ferma), sempre nello stesso posto a ogni larghezza;
// • sotto, le letture: una striscia di valori divisi da un filo, cifre tabellari.
// Mentre registra cambiano solo la spia (rossa), la parola e il pulsante: niente altro grida.

import { useTranslations } from "next-intl";
import { Crosshair, LoaderCircle, Pencil, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Diagnostics, DeviceMirror } from "./device-status";
import {
  useLab, start, stop, zeroPosition, setSessionName, commitSessionName, readoutsOf, canStart, rigHas, guideStep,
} from "@/lib/lab-store";
import { sensorLabel, isPhoneRig } from "@/lib/sensors/rig";
import { fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";

type Status = "off" | "connecting" | "ready" | "recording" | "done";

const DOT: Record<Status, string> = {
  off: "bg-muted-foreground/40",
  connecting: "bg-warning",
  ready: "bg-success",
  recording: "bg-red-600 dark:bg-red-500",
  done: "bg-muted-foreground",
};

/** Lo stato: una spia e una parola, senza contenitore. Quando è pronto dice anche con che cosa
 *  (es. «Simulatore pronto · tempo ×30»). */
function StatusText({ status }: { status: Status }) {
  const t = useTranslations("app.run.status");
  const detail = useLab((s) => s.status.text);
  const text = status === "ready" && detail ? detail : t(status);
  return (
    <span role="status" aria-live="polite"
      className={cn("inline-flex min-w-0 shrink items-center gap-2 text-[13px] whitespace-nowrap", status === "recording" ? "font-medium text-foreground" : "text-muted-foreground")}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[status])} />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Readouts() {
  const rows = useLab((s) => s.rows);
  const rig = useLab((s) => s.rig);
  const readouts = readoutsOf();
  const t = useTranslations("app.run");
  // stesso nome per due sensori (es. due temperature): aggiungo il nome del sensore
  const dup = (name: string) => readouts.filter((r) => r.name === name).length > 1;
  const label = (r: (typeof readouts)[number]) => {
    const s = rig.sensors.find((x) => x.id === r.sensorId);
    const n = r.name.charAt(0).toUpperCase() + r.name.slice(1);
    return dup(r.name) && s ? `${n} · ${sensorLabel(s)}` : n;
  };
  const last = (key: string) => {
    for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (typeof v === "number" && Number.isFinite(v)) return v; }
    return NaN;
  };
  const cells = [
    ...readouts.map((r) => ({ key: r.key, label: label(r), value: fmtVal(last(r.key), r.digits), unit: r.unit })),
    { key: "t", label: t("time"), value: rows.length ? fmtVal(rows[rows.length - 1].t, 1) : "—", unit: "s" },
  ];
  // sul telefono due colonne: se sono dispari, il tempo prende tutta la riga
  const odd = cells.length % 2 === 1;
  return (
    <div className="overflow-x-auto border-t">
      <dl className="grid grid-cols-2 gap-px bg-border sm:min-w-max sm:grid-flow-col sm:auto-cols-[minmax(9rem,1fr)] sm:grid-cols-none">
        {cells.map((c, i) => {
          const empty = c.value === "—";
          return (
            <div key={c.key} className={cn("flex min-w-0 flex-col gap-2 bg-card px-4 py-3.5", odd && i === cells.length - 1 && "col-span-2 sm:col-span-1")}>
              <dt className="truncate text-xs text-muted-foreground" title={c.label}>{c.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-1 gap-y-1 leading-none tabular">
                <span className={cn("text-[1.625rem] font-medium tracking-[-0.02em] whitespace-nowrap sm:text-[1.875rem]", empty && "text-muted-foreground/50")}>{c.value}</span>
                {c.unit && <span className="text-sm text-muted-foreground">{c.unit}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function RunCard() {
  const running = useLab((s) => s.running);
  const name = useLab((s) => s.sessionName);
  const hasRows = useLab((s) => s.rows.length > 0);
  const startable = useLab(canStart);
  const step = useLab(guideStep);
  const sonar = useLab((s) => rigHas(["sonar"], s.rig));
  const phone = useLab((s) => isPhoneRig(s.rig));
  const t = useTranslations("app.run");
  const status: Status = step === "link" ? "off" : step === "wait" ? "connecting" : running ? "recording" : hasRows ? "done" : "ready";
  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:min-h-14 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-4 sm:basis-auto">
          <StatusText status={status} />
          <span aria-hidden className="hidden h-4 w-px shrink-0 bg-border sm:block" />
          <label className="group/name flex min-w-0 flex-1 items-center gap-2">
            <input value={name} onChange={(e) => setSessionName(e.target.value)} onBlur={() => void commitSessionName()}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              placeholder={t("namePlaceholder")} aria-label={t("nameLabel")} autoComplete="off" spellCheck={false}
              className="min-w-0 flex-1 truncate bg-transparent text-base font-medium sm:text-[15px] text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground" />
            <Pencil aria-hidden className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-within/name:opacity-0" />
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {step === "link" ? (
            <Button variant="brand" className="min-w-24" disabled><Play className="fill-current" /> {t("start")}</Button>
          ) : step === "wait" ? (
            <Button variant="outline" disabled><LoaderCircle className="animate-spin" /> {t("connecting")}</Button>
          ) : running ? (
            <Button className="min-w-24 bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700" onClick={() => void stop()}>
              <Square className="fill-current" /> {t("stop")}
            </Button>
          ) : (
            <>
              {sonar && <Button variant="ghost" onClick={zeroPosition} title={t("zeroTitle")}><Crosshair /> {t("zeroShort")}</Button>}
              <Button variant="brand" className="min-w-24" disabled={!startable} onClick={() => void start()}>
                <Play className="fill-current" /> {hasRows ? t("startAgain") : t("start")}
              </Button>
            </>
          )}
        </div>
      </div>

      <Readouts />

      {step === "link" && (
        <p className="border-t px-4 py-2.5 text-[13px] text-muted-foreground">{phone ? t("needPhone") : t("needLink")}</p>
      )}

      <div className="flex flex-col gap-3 border-t px-4 py-3 empty:hidden">
        <Diagnostics />
        <DeviceMirror />
      </div>
    </Card>
  );
}
