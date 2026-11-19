"use client";
// Stato dal vivo durante la misura: (1) i sensori che stanno cercando (GPS senza fix, sonar
// senza eco) o che non rispondono, ricavati dai dati; (2) lo specchio degli indicatori di
// Arduino: lo stesso testo del display OLED (con lo stesso carattere del firmware), il colore
// del LED e il ritmo del cicalino, come li sta mostrando la scheda.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Volume2, VolumeX } from "lucide-react";
import { useLab, resolved, type DeviceStatus } from "@/lib/lab-store";
import { liveStatus, type LiveIssue } from "@/lib/live-status";
import { outputsOf } from "@/lib/sensors/rig";
import { SENSORS } from "@/lib/sensors/catalog";
import { glyph } from "@/lib/mosaicus/oled-font";
import { cn } from "@/lib/utils";

function useTick(ms: number, on = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return t;
}

/** Chip con lo stato dei sensori che non sono (ancora) a posto. */
export function LiveChips() {
  const rig = useLab((s) => s.rig);
  const rows = useLab((s) => s.rows);
  const running = useLab((s) => s.running);
  const created = useLab((s) => s.session?.created ?? 0);
  useTick(2000, running);
  if (!running) return null;
  // eslint-disable-next-line react-hooks/purity -- il tempo trascorso serve solo a non segnalare troppo presto
  const elapsed = (Date.now() - created) / 1000;
  const issues = liveStatus(rig, resolved(rig), rows, running, elapsed);
  if (!issues.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-live="polite">
      {issues.map((i) => <Chip key={i.sensorId} i={i} />)}
    </div>
  );
}
function Chip({ i }: { i: LiveIssue }) {
  const Icon = i.tone === "ok" ? CircleCheck : i.tone === "search" ? LoaderCircle : CircleAlert;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs animate-in fade-in-0",
      i.tone === "ok" ? "border-success/30 bg-success/10" : i.tone === "search" ? "border-warning/40 bg-warning/10" : "border-destructive/30 bg-destructive/10 text-destructive")}>
      <Icon className={cn("size-3.5 shrink-0", i.tone === "search" && "animate-spin [animation-duration:2s]", i.tone === "ok" && "text-success")} />
      <b className="font-semibold">{i.text}</b>
      {i.hint && <span className="hidden text-muted-foreground sm:inline">· {i.hint}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Specchio degli indicatori
// ---------------------------------------------------------------------------
const FW_NAME: Record<string, string> = { ntc: "NTC", analog: "ANA", ldr: "ANA", dht: "DHT", sonar: "SONAR", gps: "GPS", ds18b20: "DS18", gate: "GATE", hx711: "HX711", imu: "IMU" };
const SMALL_ERR: Record<string, string> = { gps: "fili GPS?", ntc: "sonda?", ds18b20: "fili 4,7k?", imu: "fili SDA?", hx711: "fili DT?" };
const SMALL_ERR_SHORT: Record<string, string> = { ds18b20: "4,7k?", imu: "SDA?", hx711: "DT?" };

const CFG_WHY = ["?", "pin errato", "pin A0-A5", "pin doppio", "1 solo GPS", "tipo?", "comando?"];
interface MirrorCtx { running: boolean; slotType?: string; cfgType?: string; same: number; ord: number; sats: string; elapsed: number; lines: [string, string]; tick: number }

/** Gli stessi testi che compone il firmware (screenTexts in mosaicusneo_firmware.ino). */
function screenTexts(d: DeviceStatus, o: MirrorCtx) {
  const spin = "-\\|/"[Math.floor(o.tick / 2.4) % 4];
  let bar = "", big = "", small = "", sp = spin;
  const count = (pre: string) => `${pre} ${d.k}/${d.n}`;
  const num = o.same > 1 ? `#${o.ord} ` : "";
  switch (d.st) {
    case "W":
      if (o.running) { bar = "APP PERSA"; big = d.link === "B" ? "BT?" : "USB?"; small = "ricollega"; }
      else if (d.bt) { bar = "ATTESA BT"; big = "APP"; small = d.bt === 1 ? "PIN 1234" : "BLE pronto"; }
      else { bar = "ATTESA"; big = "APP"; small = "Collega ~"; }
      break;
    case "I": bar = "COLLEGATO"; big = "OK"; small = d.link === "B" ? "BT ~ Avvia" : "~ Avvia"; break;
    case "O": bar = "OSCILLOSC."; big = "SCOPE"; small = "segnale A0"; break;
    case "C": bar = "CONFIG"; big = d.slot < 0 ? "OUT" : FW_NAME[o.cfgType ?? ""] ?? "?"; small = CFG_WHY[d.issue] ?? "?"; break;
    case "S":
    case "E": {
      const t = o.slotType ?? "";
      if (d.issue === 1 && t === "gps") { bar = d.n > 1 ? count("CERCO") : "CERCO GPS"; big = `${o.sats.slice(0, 2) || "0"} sat`; small = "all'aperto"; }
      else if (d.issue === 1) {
        bar = d.n > 1 ? count("CERCO") : t === "sonar" ? "NO ECO" : "ATTENDO"; big = FW_NAME[t] ?? "?";
        small = num + (t === "sonar" ? (o.same > 1 ? "eco?" : "bersaglio?") : "attendo");
      } else {
        bar = d.n > 1 ? count("PROBL") : "PROBLEMA"; big = FW_NAME[t] ?? "?";
        small = num + (o.same > 1 ? SMALL_ERR_SHORT[t] ?? SMALL_ERR[t] ?? "fili?" : SMALL_ERR[t] ?? "fili?");
      }
      break;
    }
    case "T": {
      const s = Math.floor(o.elapsed), m = Math.floor(s / 60);
      bar = m > 99 ? `REC ${Math.floor(m / 60)}h` : `REC ${m}:${String(s % 60).padStart(2, "0")}`;
      if (o.lines[0]) { big = o.lines[0]; small = o.lines[1]; } else { big = "REC"; small = "misuro..."; }
      sp = Math.floor(o.tick / 4) % 2 ? "*" : " ";
      break;
    }
  }
  bar = bar.padEnd(9, " ").slice(0, 9) + (d.st === "W" || d.st === "S" || d.st === "T" ? sp : " ");
  return { bar, big: big.slice(0, 5), small: small.slice(0, 10) };
}

function Oled({ bar, big, small }: { bar: string; big: string; small: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const S = 3, g = cv.getContext("2d")!;
    g.fillStyle = "#020617"; g.fillRect(0, 0, 64 * S, 32 * S);
    const px: boolean[][] = Array.from({ length: 32 }, () => Array(64).fill(false));
    const text = (row: number, s: string, inv: boolean) => {
      for (let x = 0; x < 64; x++) for (let b = 0; b < 8; b++) px[row * 8 + b][x] = inv;
      [...s.padEnd(10, " ").slice(0, 10)].forEach((ch, i) => {
        for (let k = 0; k < 5; k++) { const col = glyph(ch, k); for (let b = 0; b < 8; b++) if (col & (1 << b)) px[row * 8 + b][i * 6 + k] = !inv; }
      });
    };
    text(0, bar, true);
    const w = big.length * 12, pad = Math.floor((64 - w) / 2);
    [...big].forEach((ch, i) => {
      for (let k = 0; k < 5; k++) {
        const col = glyph(ch, k);
        for (let b = 0; b < 8; b++) if (col & (1 << b)) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) px[8 + b * 2 + dy][pad + i * 12 + k * 2 + dx] = true;
      }
    });
    text(3, small, false);
    g.fillStyle = "#dbeafe";
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if (px[y][x]) g.fillRect(x * S, y * S, S - 0.35, S - 0.35);
  }, [bar, big, small]);
  return <canvas ref={ref} width={192} height={96} className="h-[72px] w-[144px] rounded-sm [image-rendering:pixelated] ring-4 ring-slate-800" aria-label={`Display di Arduino: ${bar.trim()} · ${big} · ${small}`} />;
}

const LED: Record<DeviceStatus["st"], { color: string; blink: number; text: string }> = {
  W: { color: "#3b82f6", blink: 500, text: "blu lampeggiante: in attesa dell'app" },
  I: { color: "#3b82f6", blink: 0, text: "blu: collegato, pronto" },
  S: { color: "#eab308", blink: 125, text: "giallo lampeggiante: in ricerca" },
  E: { color: "#ef4444", blink: 125, text: "rosso lampeggiante: problema" },
  C: { color: "#ef4444", blink: 125, text: "rosso lampeggiante: configurazione rifiutata" },
  T: { color: "#22c55e", blink: 0, text: "verde: sta misurando" },
  O: { color: "#06b6d4", blink: 0, text: "azzurro: oscilloscopio" },
};
const BEEPS: Record<DeviceStatus["st"], number> = { W: 1, I: 1, S: 2, E: 3, T: 0, O: 0, C: 3 };

/** Ciò che mostrano in questo momento il display, il LED e il cicalino di Arduino. */
export function DeviceMirror() {
  const rig = useLab((s) => s.rig);
  const device = useLab((s) => s.device);
  const running = useLab((s) => s.running);
  const lines = useLab((s) => s.oledLines);
  const created = useLab((s) => s.session?.created ?? 0);
  const lim = useLab((s) => s.lim);
  const outs = outputsOf(rig);
  const tick = useTick(lim ? 500 : 125, !!device && outs.length > 0);
  if (!device || !outs.length) return null;
  const has = (t: string) => outs.some((s) => s.type === t);
  const res = resolved(rig);
  const slotSensor = device.slot >= 0 ? res.byCode.get(device.slot) : undefined;
  const rows = useLab.getState().rows;
  let sats = "";
  if (slotSensor?.type === "gps") {
    const key = res.keyOf.get(slotSensor.id)?.get("sats") ?? "sats";
    for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (typeof v === "number" && Number.isFinite(v)) { sats = String(v); break; } }
  }
  // eslint-disable-next-line react-hooks/purity -- orologio del display, aggiornato dal tick
  const elapsed = running && created ? (Date.now() - created) / 1000 : 0;
  // come il firmware: «#2» se ci sono più sensori dello stesso tipo (in ordine di slot)
  let same = 0, ord = 0;
  if (slotSensor) {
    const fw = SENSORS[slotSensor.type].fw;
    for (const [code, x] of [...res.byCode.entries()].sort((p, q) => p[0] - q[0])) {
      if (SENSORS[x.type].fw !== fw) continue;
      same++;
      if (code <= device.slot) ord = same;
    }
  }
  const txt = screenTexts(device, { running, slotType: slotSensor?.type, cfgType: device.st === "C" ? slotSensor?.type : undefined, same, ord, sats, elapsed, lines, tick });
  const led = LED[device.st];
  const ms = tick * (lim ? 500 : 125);
  const ledOn = !led.blink || Math.floor(ms / led.blink) % 2 === 0;
  const beeps = has("buzzer") && (outs.find((s) => s.type === "buzzer")!.options.nag !== "no") ? BEEPS[device.st] : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
      <span className="font-semibold text-muted-foreground">Su Arduino</span>
      {has("oled") && <Oled {...txt} />}
      {has("rgb") && (
        <span className="inline-flex items-center gap-2">
          <span className="size-3.5 rounded-full ring-2 ring-background transition-[background-color,box-shadow] duration-75" style={{ background: ledOn ? led.color : "#334155", boxShadow: ledOn ? `0 0 10px ${led.color}` : "none" }} />
          {led.text}
        </span>
      )}
      {has("buzzer") && (
        <span className="inline-flex items-center gap-1.5">
          {beeps ? <Volume2 className="size-4 text-warning" /> : <VolumeX className="size-4 text-success" />}
          {beeps ? `${beeps} bip ogni 3 s` : "nessun bip"}
        </span>
      )}
      {!has("oled") && !has("rgb") && !has("buzzer") && <span>{SENSORS.oled.title}</span>}
    </div>
  );
}
