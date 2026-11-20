"use client";

import { useTranslations } from "next-intl";
import { Bluetooth, BluetoothSearching, Cable, ChevronDown, Cpu, MemoryStick, Smartphone, Unplug, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLab, connect, connectVia, recordOnSd, disconnect, labInfo, needsArduino, needsPhone, type StatusTone } from "@/lib/lab-store";
import { btOf } from "@/lib/sensors/rig";
import { serialSupported } from "@/lib/mosaicus/serial.js";
import { bleSupported } from "@/lib/mosaicus/ble";
import { cn } from "@/lib/utils";

const dot: Record<StatusTone, string> = {
  off: "bg-muted-foreground/50",
  wait: "bg-warning animate-pulse",
  on: "bg-success",
  err: "bg-destructive",
};

export function StatusPill({ className }: { className?: string }) {
  const status = useLab((s) => s.status);
  return (
    <span role="status" className={cn("inline-flex h-7 min-w-0 items-center gap-2 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", dot[status.tone])} />
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
export function ConnectButton({ size = "sm" }: { size?: "sm" | "lg" }) {
  const serial = serialSupported(), ble = bleSupported();
  const bt = useLab((s) => btOf(s.rig));
  const t = useTranslations("app.connect");
  // il collegamento principale segue il modulo Bluetooth del progetto, se c'è
  const primary: "usb" | "hc06" | "ble" = !serial && ble ? "ble" : bt === "ble" && ble ? "ble" : isAndroid() ? "hc06" : "usb";
  const icon = primary === "ble" ? <BluetoothSearching /> : primary === "hc06" ? <Bluetooth /> : <Usb />;
  const label = primary === "ble" ? t("ble") : isAndroid() ? t("bt") : t("usb");
  return (
    <div className="flex">
      <Button size={size} disabled={!serial && !ble} className="rounded-r-none" onClick={() => void connectVia(primary)}>
        {icon} {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size={size === "lg" ? "icon-lg" : "icon-sm"} aria-label={t("more")} className="rounded-l-none border-l border-l-primary-foreground/15" disabled={!serial && !ble} />}>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("how")}</DropdownMenuLabel>
            {!isAndroid() && (
              <DropdownMenuItem disabled={!serial} onClick={() => void connectVia("usb")}>
                <Cable />
                <span className="flex flex-col">
                  <span>{t("cable")}</span>
                  {!serial && <span className="text-xs text-muted-foreground">{t("unavailable")}</span>}
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={!serial} onClick={() => void connectVia("hc06")}>
              <Bluetooth />
              <span className="flex flex-col">
                <span>{t("hc06")}</span>
                <span className="text-xs text-muted-foreground">{!serial ? t("unavailable") : bt === "hc06" ? t("projectModule") : t("hc06Hint")}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!ble} onClick={() => void connectVia("ble")}>
              <BluetoothSearching />
              <span className="flex flex-col">
                <span>{t("bleItem")}</span>
                <span className="text-xs text-muted-foreground">{!ble ? t("unavailable") : bt === "ble" ? t("bleProject") : t("bleHint")}</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("noLink")}</DropdownMenuLabel>
            <DropdownMenuItem disabled={!serial} onClick={() => void recordOnSd()}>
              <MemoryStick />
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
export function PhoneButton({ size = "sm" }: { size?: "sm" | "lg" }) {
  const t = useTranslations("app.connect");
  return <Button size={size} onClick={() => void connect("phone")}><Smartphone /> {t("phone")}</Button>;
}

/** Collegamento ad Arduino, ai sensori del telefono o al simulatore: solo se il lab ne ha bisogno. */
export function ConnectionControls({ className }: { className?: string }) {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const linkKind = useLab((s) => s.linkKind);
  const t = useTranslations("app.connect");
  const info = labInfo(labId);
  const phone = !info.instrument && needsPhone(rig);
  const arduino = info.instrument ? info.instrument.source === "arduino" : needsArduino(rig);
  if (!arduino && !phone) return null;
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <StatusPill className="max-w-64" />
      {linkKind ? (
        <Button variant="outline" size="sm" onClick={() => void disconnect()}>
          <Unplug /> {linkKind === "telefono" ? t("phoneOff") : t("disconnect")}
        </Button>
      ) : (
        <>
          {phone ? <PhoneButton /> : <ConnectButton />}
          <Button variant="outline" size="sm" onClick={() => void connect("sim")}>
            <Cpu /> {t("sim")}
          </Button>
        </>
      )}
    </div>
  );
}
