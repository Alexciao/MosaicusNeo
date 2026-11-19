"use client";

import { Bluetooth, Cpu, Smartphone, Unplug, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, connect, disconnect, currentExp, type StatusTone } from "@/lib/lab-store";
import { serialSupported } from "@/lib/mosaicus/serial.js";
import { phoneSupport } from "@/lib/mosaicus/phone.js";
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
export const connectLabel = (phone: boolean) => (phone ? "Attiva sensori" : isAndroid() ? "Collega via Bluetooth" : "Collega Arduino");

/** Il dispositivo di questo lab si può usare in questo browser? */
export function deviceSupport() {
  const exp = currentExp();
  if (exp.source === "phone") { const s = phoneSupport(); return s.motion || s.sound; }
  return serialSupported();
}

export function ConnectionControls({ className }: { className?: string }) {
  const expId = useLab((s) => s.expId);
  const linkKind = useLab((s) => s.linkKind);
  const exp = currentExp();
  void expId;
  if (exp.source === "audio") return null;
  const phone = exp.source === "phone";
  const supported = deviceSupport();
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <StatusPill className="max-w-64" />
      {linkKind ? (
        <Button variant="outline" size="sm" onClick={() => void disconnect()}>
          <Unplug /> Scollega
        </Button>
      ) : (
        <>
          <Button size="sm" disabled={!supported} onClick={() => void connect("device")}>
            {phone ? <Smartphone /> : isAndroid() ? <Bluetooth /> : <Usb />} {connectLabel(phone)}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void connect("sim")}>
            <Cpu /> Simulatore
          </Button>
        </>
      )}
    </div>
  );
}
