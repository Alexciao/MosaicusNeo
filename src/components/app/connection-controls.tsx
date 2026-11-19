"use client";

import { Bluetooth, BluetoothSearching, Cable, ChevronDown, Cpu, Unplug, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLab, connect, disconnect, labInfo, needsArduino, type StatusTone } from "@/lib/lab-store";
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
export const connectLabel = () => (isAndroid() ? "Collega via Bluetooth" : "Collega Arduino");
/** Questo browser può collegarsi ad Arduino in qualche modo? */
export const canReachArduino = () => serialSupported() || bleSupported();

/**
 * Pulsante di collegamento: il modo principale (cavo o HC-06 con Web Serial; Bluetooth LE
 * dove Web Serial non c'è, es. Bluefy su iPhone) e, nel menu accanto, gli altri.
 */
export function ConnectButton({ size = "sm" }: { size?: "sm" | "lg" }) {
  const serial = serialSupported(), ble = bleSupported();
  const primaryBle = !serial && ble;
  const icon = primaryBle ? <BluetoothSearching /> : isAndroid() ? <Bluetooth /> : <Usb />;
  return (
    <div className="flex">
      <Button size={size} disabled={!serial && !ble} className="rounded-r-none" onClick={() => void connect(primaryBle ? "ble" : "arduino")}>
        {icon} {primaryBle ? "Collega via Bluetooth LE" : connectLabel()}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size={size === "lg" ? "icon-lg" : "icon-sm"} aria-label="Altri modi di collegamento" className="rounded-l-none border-l border-l-primary-foreground/15" disabled={!serial && !ble} />}>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Come è collegato Arduino?</DropdownMenuLabel>
            <DropdownMenuItem disabled={!serial} onClick={() => void connect("arduino")}>
              {isAndroid() ? <Bluetooth /> : <Cable />}
              <span className="flex flex-col">
                <span>{isAndroid() ? "Bluetooth classico (HC-06)" : "Cavo USB (o HC-06 associato)"}</span>
                {!serial && <span className="text-xs text-muted-foreground">non disponibile in questo browser</span>}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!ble} onClick={() => void connect("ble")}>
              <BluetoothSearching />
              <span className="flex flex-col">
                <span>Bluetooth LE (HM-10, AT-09, HC-08)</span>
                <span className="text-xs text-muted-foreground">{ble ? "anche su iPhone con il browser Bluefy" : "non disponibile in questo browser"}</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Collegamento ad Arduino (o al simulatore): solo se il lab ne ha bisogno. */
export function ConnectionControls({ className }: { className?: string }) {
  const labId = useLab((s) => s.labId);
  const rig = useLab((s) => s.rig);
  const linkKind = useLab((s) => s.linkKind);
  const info = labInfo(labId);
  const arduino = info.instrument ? info.instrument.source === "arduino" : needsArduino(rig);
  if (!arduino) return null;
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <StatusPill className="max-w-64" />
      {linkKind ? (
        <Button variant="outline" size="sm" onClick={() => void disconnect()}>
          <Unplug /> Scollega
        </Button>
      ) : (
        <>
          <ConnectButton />
          <Button variant="outline" size="sm" onClick={() => void connect("sim")}>
            <Cpu /> Simulatore
          </Button>
        </>
      )}
    </div>
  );
}
