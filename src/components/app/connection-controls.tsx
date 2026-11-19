"use client";

import { Bluetooth, Cpu, Unplug, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, connect, disconnect, labInfo, needsArduino, type StatusTone } from "@/lib/lab-store";
import { serialSupported } from "@/lib/mosaicus/serial.js";
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
export const deviceSupport = () => serialSupported();

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
          <Button size="sm" disabled={!serialSupported()} onClick={() => void connect("arduino")}>
            {isAndroid() ? <Bluetooth /> : <Usb />} {connectLabel()}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void connect("sim")}>
            <Cpu /> Simulatore
          </Button>
        </>
      )}
    </div>
  );
}
