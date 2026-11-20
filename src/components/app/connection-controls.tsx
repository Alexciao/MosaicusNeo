"use client";

import { useTranslations } from "next-intl";
import { Bluetooth, BluetoothSearching, Cable, ChevronDown, Cpu, Gauge, MemoryStick, Smartphone, Unplug, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLab, connect, connectVia, recordOnSd, disconnect, labInfo, setSimWarp, simDefaultWarp, type StatusTone } from "@/lib/lab-store";
import { WARPS } from "@/lib/sensors/simulator";
import { btOf } from "@/lib/sensors/rig";
import { serialSupported } from "@/lib/mosaicus/serial.js";
import { bleSupported } from "@/lib/mosaicus/ble";
import { cn } from "@/lib/utils";

const dot: Record<StatusTone, string> = {
  off: "bg-muted-foreground/50",
  wait: "bg-warning",
  on: "bg-success",
  err: "bg-destructive",
};

/** Lo stato del collegamento: una spia e il testo, senza contenitore. */
export function StatusText({ className }: { className?: string }) {
  const status = useLab((s) => s.status);
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot[status.tone])} />
      <span className="truncate">{status.text}</span>
    </span>
  );
}

/** Android: la Web Serial di Chrome vede solo le porte seriali Bluetooth (HC-06 associato). */
export const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
/** Questo browser può collegarsi ad Arduino in qualche modo? */
export const canReachArduino = () => serialSupported() || bleSupported();

/**
 * Pulsante di collegamento: il modo principale (cavo, o il modulo Bluetooth del progetto; Bluetooth LE
 * dove Web Serial non c'è, es. Bluefy su iPhone) e, nel menu accanto, gli altri. Scegliere un
 * modulo Bluetooth o la scheda SD li aggiunge ai componenti: schema e guida si aggiornano.
 */
export function ConnectButton({ size = "default", quiet = false }: { size?: "default" | "sm"; quiet?: boolean }) {
  const serial = serialSupported(), ble = bleSupported();
  const bt = useLab((s) => btOf(s.rig));
  const t = useTranslations("app.connect");
  // il collegamento principale segue il modulo Bluetooth del progetto, se c'è
  const primary: "usb" | "hc06" | "ble" = !serial && ble ? "ble" : bt === "ble" && ble ? "ble" : isAndroid() ? "hc06" : "usb";
  const icon = primary === "ble" ? <BluetoothSearching /> : primary === "hc06" ? <Bluetooth /> : <Usb />;
  const label = primary === "ble" ? t("ble") : isAndroid() ? t("bt") : t("usb");
  return (
    <div className="flex">
      <Button variant={quiet ? "outline" : "brand"} size={size} disabled={!serial && !ble} className="rounded-r-none pr-2.5" onClick={() => void connectVia(primary)}>
        {icon} {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant={quiet ? "outline" : "brand"} size={size === "sm" ? "icon-sm" : "icon"} aria-label={t("more")} className={cn("w-7 rounded-l-none", quiet ? "-ml-px" : "border-l border-l-black/10")} disabled={!serial && !ble} />}>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("how")}</DropdownMenuLabel>
            {!isAndroid() && (
              <DropdownMenuItem disabled={!serial} className="items-start" onClick={() => void connectVia("usb")}>
                <Cable className="mt-0.5" />
                <span className="flex flex-col">
                  <span>{t("cable")}</span>
                  {!serial && <span className="text-xs text-muted-foreground">{t("unavailable")}</span>}
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={!serial} className="items-start" onClick={() => void connectVia("hc06")}>
              <Bluetooth className="mt-0.5" />
              <span className="flex flex-col">
                <span>{t("hc06")}</span>
                <span className="text-xs text-muted-foreground">{!serial ? t("unavailable") : bt === "hc06" ? t("projectModule") : t("hc06Hint")}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!ble} className="items-start" onClick={() => void connectVia("ble")}>
              <BluetoothSearching className="mt-0.5" />
              <span className="flex flex-col">
                <span>{t("bleItem")}</span>
                <span className="text-xs text-muted-foreground">{!ble ? t("unavailable") : bt === "ble" ? t("bleProject") : t("bleHint")}</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("noLink")}</DropdownMenuLabel>
            <DropdownMenuItem disabled={!serial} className="items-start" onClick={() => void recordOnSd()}>
              <MemoryStick className="mt-0.5" />
              <span className="flex flex-col">
                <span>{t("sd")}</span>
                <span className="text-xs text-muted-foreground">{serial ? t("sdHint") : t("sdNoSerial")}</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Sensori del telefono: il permesso si chiede con questo clic (iPhone). */
export function PhoneButton({ size = "default", variant = "brand" }: { size?: "default" | "sm"; variant?: "brand" | "outline" }) {
  const t = useTranslations("app.connect");
  return <Button size={size} variant={variant} onClick={() => void connect("phone")}><Smartphone /> {t("phone")}</Button>;
}

/** Le voci della scala del tempo del simulatore (tempo reale, ×5…); quella dello scenario è segnata come consigliata. */
function TimeScaleItems() {
  const t = useTranslations("app.connect");
  const running = useLab((s) => s.running);
  const chosen = useLab((s) => s.simWarp);
  useLab((s) => s.labId);                     // la scala consigliata cambia con il lab
  const def = simDefaultWarp();
  const value = chosen ?? def;
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{t("timeScale")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={String(value)} onValueChange={(v) => setSimWarp(Number(v))}>
        {WARPS.map((w) => (
          <DropdownMenuRadioItem key={w} value={String(w)} disabled={running} closeOnClick>
            <span className="flex-1">{w === 1 ? t("realTime") : t("warpX", { warp: w })}</span>
            {w === def && <span className="text-xs text-muted-foreground">{t("recommended")}</span>}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">{t("timeScaleHint")}</p>
    </DropdownMenuGroup>
  );
}

/** Simulatore: il pulsante e, accanto, la scala del tempo. */
export function SimButton({ size = "default" }: { size?: "default" | "sm" }) {
  const t = useTranslations("app.connect");
  return (
    <div className="flex">
      <Button variant="outline" size={size} className="rounded-r-none pr-2.5" onClick={() => void connect("sim")}>
        <Cpu /> {t("sim")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size={size === "sm" ? "icon-sm" : "icon"} aria-label={t("timeScale")} className="-ml-px w-7 rounded-l-none" />}>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60"><TimeScaleItems /></DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Simulatore collegato: la scala del tempo in uso, da cambiare tra una misura e l'altra. */
export function SimSpeed({ size = "default" }: { size?: "default" | "sm" }) {
  const t = useTranslations("app.connect");
  const chosen = useLab((s) => s.simWarp);
  const running = useLab((s) => s.running);
  useLab((s) => s.labId);
  const w = chosen ?? simDefaultWarp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={size} className="text-muted-foreground" disabled={running} title={t("timeScale")} aria-label={`${t("timeScale")}: ${w === 1 ? t("realTime") : t("warpX", { warp: w })}`} />}>
        <Gauge /> <span className="tabular">{w === 1 ? "1×" : `${w}×`}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60"><TimeScaleItems /></DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Collegamento fuori dalla scheda della misura. I progetti e gli esperimenti si collegano dalla
 * scheda della misura (a ogni larghezza): qui resta solo lo stato, quando c'è qualcosa collegato.
 * Gli strumenti (oscilloscopi, synth) non hanno quella scheda: qui hanno anche i comandi.
 */
export function ConnectionControls({ className }: { className?: string }) {
  const labId = useLab((s) => s.labId);
  const page = useLab((s) => s.page);
  const linkKind = useLab((s) => s.linkKind);
  const idle = useLab((s) => s.status.tone === "off");
  const t = useTranslations("app.connect");
  const info = labInfo(labId);
  const ins = info.instrument;
  // nella pagina Misura lo stato è già nella scheda della misura: qui serve nelle altre pagine
  if (!ins) return linkKind && !idle && page !== "misura" ? <StatusText className={cn("max-w-72", className)} /> : null;
  if (ins.source !== "arduino") return null;
  // oscilloscopio: le raffiche sono istantanee, la scala del tempo non c'entra
  const scope = ins.kind === "scope";
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {!idle && <StatusText className="max-w-64" />}
      {linkKind ? (
        <>
          {linkKind === "simulatore" && !scope && <SimSpeed size="sm" />}
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            <Unplug /> {t("disconnect")}
          </Button>
        </>
      ) : (
        <>
          {scope ? (
            <Button variant="outline" size="sm" onClick={() => void connect("sim")}>
              <Cpu /> {t("sim")}
            </Button>
          ) : <SimButton size="sm" />}
          <ConnectButton size="sm" quiet={!!info.instrument?.optionalLink} />
        </>
      )}
    </div>
  );
}
