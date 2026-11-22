"use client";
// Stato dal vivo durante la misura: (1) i sensori che stanno cercando (GPS senza fix, sonar
// senza eco) o che non rispondono, ricavati dai dati; (2) lo specchio degli indicatori di
// Arduino: lo stesso testo del display OLED (con lo stesso carattere del firmware), il colore
// del LED e il ritmo del cicalino, come li sta mostrando la scheda.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronRight, CircleAlert, CircleCheck, LoaderCircle, Plug, SlidersHorizontal, TriangleAlert, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab, resolved, showWiring, type DeviceStatus, showComponents } from "@/lib/lab-store";
import { useDiag, diagDismiss, type Diag } from "@/lib/diagnostics";
import { indicatorsOf, sensorLabel, type SensorInstance } from "@/lib/sensors/rig";
import { SENSORS, isOled, pinName } from "@/lib/sensors/catalog";
import { glyph } from "@/lib/mosaicus/oled-font";
import { cn } from "@/lib/utils";
import { LedPart, BuzzerPart } from "./arduino-parts";

function useTick(ms: number, on = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return t;
}

/** Diagnostica della misura: un elenco ordinato dei problemi visti, con il componente, i suoi pin,
 *  che cosa controllare e quando. Resta dopo «Ferma», fino alla misura successiva. */
export function Diagnostics() {
  const items = useDiag((s) => s.items);
  const ended = useDiag((s) => s.ended);
  const running = useLab((s) => s.running);
  const rig = useLab((s) => s.rig);
  const t = useTranslations("app.diag");
  if (!items.length) return null;
  const rank = (d: Diag) => (d.active ? (d.tone === "error" ? 0 : 1) : 2);
  const list = [...items].sort((x, y) => rank(x) - rank(y) || x.first - y.first);
  const active = items.filter((d) => d.active).length;
  const errors = items.some((d) => d.active && d.tone === "error");
  const allOk = !active;
  // finché qualcosa non va, i problemi già risolti si richiudono in fondo: in vista resta ciò che serve
  const open = allOk ? list : list.filter((d) => d.active);
  const solved = allOk ? [] : list.filter((d) => !d.active);
  const row = (d: Diag) => <DiagRow key={d.id} d={d} sensor={rig.sensors.find((x) => x.id === d.sensorId)} running={running} />;
  const HeadIcon = allOk ? CircleCheck : errors ? CircleAlert : TriangleAlert;
  return (
    <section aria-label={t("title")}
      className={cn("mz-enter overflow-hidden rounded-lg border", errors ? "border-destructive/30" : allOk ? "border-success/30" : "border-warning/40")}>
      <header className={cn("flex items-center gap-2 px-3 py-2", errors ? "bg-destructive/[0.06]" : allOk ? "bg-success/[0.06]" : "bg-warning/[0.08]")}>
        <HeadIcon aria-hidden className={cn("size-4 shrink-0", errors ? "text-destructive" : allOk ? "text-success" : "text-warning")} />
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <span aria-live="polite" className="text-xs text-muted-foreground tabular">
          {allOk ? t("allResolved") : t("live", { n: items.length, active })}
        </span>
        {ended && !running && (
          <Button size="icon-xs" variant="ghost" className="ml-auto text-muted-foreground" aria-label={t("dismiss")} title={t("dismiss")} onClick={diagDismiss}><X /></Button>
        )}
      </header>
      {ended && !running && items.some((d) => !d.setup) && <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">{t("after")}</p>}
      <ul className="divide-y border-t">{open.map(row)}</ul>
      {solved.length > 0 && (
        <details className="group border-t">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
            <CircleCheck aria-hidden className="size-3.5 text-success" />
            {t("showResolved", { n: solved.length })}
          </summary>
          <ul className="divide-y border-t">{solved.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

const mmss = (s: number) => { const v = Math.max(0, Math.floor(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };

function DiagRow({ d, sensor, running }: { d: Diag; sensor?: SensorInstance; running: boolean }) {
  const t = useTranslations("app.diag");
  const def = sensor ? SENSORS[sensor.type] : undefined;
  const SIcon = def?.icon;
  const resolvedNow = !d.active;
  const Icon = resolvedNow ? CircleCheck : d.tone === "error" ? CircleAlert : LoaderCircle;
  const state = resolvedNow ? t("resolved") : !running && !d.setup ? t("stillAtStop") : d.setup ? t(`severity.${d.tone}`) : t("stillActive");
  const when = d.setup ? t("setup") : resolvedNow || !running ? (mmss(d.first) === mmss(d.last) ? mmss(d.first) : t("range", { from: mmss(d.first), to: mmss(d.last) })) : t("since", { t: mmss(d.first) });
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0",
          resolvedNow ? "text-success" : d.tone === "error" ? "text-destructive" : "text-warning",
          !resolvedNow && d.tone === "search" && running && "animate-spin [animation-duration:2s]")} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              {SIcon && <SIcon className="size-3.5 text-muted-foreground" />}
              {sensor ? sensorLabel(sensor) : t("general")}
            </span>
            {sensor && def && def.pins.length > 0 && (
              <span className="font-mono text-[0.68rem] text-muted-foreground">{def.pins.map((p) => `${p.role} ${pinName(sensor.pins[p.key])}`).join(" · ")}</span>
            )}
            <span className={cn("rounded px-1.5 py-px text-[0.65rem] font-semibold",
              resolvedNow ? "bg-success/10 text-success" : d.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning")}>{state}</span>
            <span className="ml-auto text-[0.7rem] text-muted-foreground tabular">{when}{d.repeats > 0 && ` · ${t("repeats", { n: d.repeats })}`}</span>
          </div>
          <p className={cn("text-sm", resolvedNow && "text-muted-foreground")}>
            {d.text}{resolvedNow && d.okText && <> <ArrowRight className="inline size-3.5 align-[-2px]" /> <span className="text-foreground">{d.okText}</span></>}
          </p>
          {d.hint && !resolvedNow && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Wrench className="mt-px size-3.5 shrink-0" /><span><b className="font-medium text-foreground/80">{t("check")}:</b> {d.hint}</span></p>
          )}
        </div>
      </div>
      {!resolvedNow && (sensor || d.setup) && (
        <div className="flex shrink-0 gap-1.5 pl-6.5 sm:pl-0">
          {sensor && !def?.phone && <Button size="xs" variant="outline" onClick={showWiring}><Plug /> {t("wiring")}</Button>}
          {/* il title sul contenitore: un pulsante disabilitato non mostra il suo */}
          <span title={running ? t("componentBlocked") : undefined}>
            <Button size="xs" variant="ghost" disabled={running} onClick={showComponents}><SlidersHorizontal /> {t("component")}</Button>
          </span>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Specchio degli indicatori
// ---------------------------------------------------------------------------
const FW_NAME: Record<string, string> = { ntc: "NTC", analog: "ANA", ldr: "ANA", dht: "DHT", sonar: "SONAR", gps: "GPS", ds18b20: "DS18", gate: "GATE", hx711: "HX711", imu: "IMU", mlx: "MLX", sps30: "SPS" };
const SMALL_ERR: Record<string, string> = { gps: "GPS wires?", ntc: "probe?", ds18b20: "4.7k wire?", imu: "SDA wires?", mlx: "SDA wires?", sps30: "SDA wires?", hx711: "DT wires?" };
const SMALL_ERR_SHORT: Record<string, string> = { ds18b20: "4.7k?", imu: "SDA?", mlx: "SDA?", sps30: "SDA?", hx711: "DT?" };

const CFG_WHY = ["?", "bad pin", "pin A0-A5", "pin twice", "1 GPS only", "type?", "command?"];
interface MirrorCtx { running: boolean; fw: string; slotType?: string; cfgType?: string; same: number; ord: number; sats: string; elapsed: number; lines: [string, string]; tick: number }

/** Gli stessi testi che compone il firmware (screenTexts in mosaicusneo_firmware.ino). */
function screenTexts(d: DeviceStatus, o: MirrorCtx) {
  const spin = "-\\|/"[Math.floor(o.tick / 2.4) % 4];
  let bar = "", big = "", small = "";
  const sp = spin;
  const count = (pre: string) => `${pre} ${d.k}/${d.n}`;
  const num = o.same > 1 ? `#${o.ord} ` : "";
  const bt = d.link === "B";
  switch (d.st) {
    case "W":
      if (o.running) { bar = "LINK LOST"; big = bt ? "BT?" : "USB?"; small = "reconnect"; }
      else { bar = "NO APP"; big = "WAIT"; small = d.bt ? `USB/BT ${o.fw.slice(0, 4)}` : `USB v${o.fw.slice(0, 4)}`; }
      break;
    case "I": bar = bt ? "LINK BT" : "LINK USB"; big = "READY"; small = "tap Start"; break;
    case "O": bar = "LIVE A0"; big = "SCOPE"; small = bt ? "via BT" : "via USB"; break;
    case "C": bar = "BAD SETUP"; big = d.slot < 0 ? "OUT" : FW_NAME[o.cfgType ?? ""] ?? "?"; small = CFG_WHY[d.issue] ?? "?"; break;
    case "R": bar = "SD CARD"; big = "PRESS"; small = "to record"; break;
    case "S":
    case "E": {
      const t = o.slotType ?? "";
      if (d.slot === -2) { bar = "ERROR"; big = "SD"; small = "card?"; break; }
      if (d.issue === 1 && t === "gps") { bar = d.n > 1 ? count("SEARCH") : "GPS SEARCH"; big = `${o.sats.slice(0, 2) || "0"} sat`; small = "go outside"; }
      else if (d.issue === 1) {
        bar = d.n > 1 ? count("SEARCH") : t === "sonar" ? "NO ECHO" : "WAITING"; big = FW_NAME[t] ?? "?";
        small = num + (t === "sonar" ? (o.same > 1 ? "echo?" : "target?") : "waiting");
      } else {
        bar = d.n > 1 ? count("ERROR") : "ERROR"; big = FW_NAME[t] ?? "?";
        small = num + (o.same > 1 ? SMALL_ERR_SHORT[t] ?? SMALL_ERR[t] ?? "wires?" : SMALL_ERR[t] ?? "wires?");
      }
      break;
    }
    case "T":
    case "L": {
      // registrazione: il pallino ● (carattere 126, «~») lampeggia all'inizio della barra
      const sec = Math.floor(o.elapsed), m = Math.floor(sec / 60);
      const tm = m > 99 ? `${Math.floor(m / 60) % 100}h` : `${m}:${String(sec % 60).padStart(2, "0")}`;
      const dot = Math.floor(o.tick / 4) % 2 ? "~" : " ";
      const sd = d.st === "L", val = !sd && !!o.lines[0];
      bar = dot + (sd ? "SD REC" : val ? `REC ${tm}` : bt ? "REC BT" : "REC USB");
      if (val) { big = o.lines[0]; small = o.lines[1]; }
      else { big = tm; small = sd ? "LOG…" : "measuring"; }
      return { bar: bar.slice(0, 10), big: big.slice(0, 5), small: small.slice(0, 10) };
    }
  }
  bar = bar.padEnd(9, " ").slice(0, 9) + (d.st === "W" || d.st === "S" ? sp : " ");
  return { bar, big: big.slice(0, 5), small: small.slice(0, 10) };
}

function Oled({ bar, big, small }: { bar: string; big: string; small: string }) {
  const t = useTranslations("app.device");
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
  return <canvas ref={ref} width={192} height={96} className="h-[72px] w-[144px] rounded-sm [image-rendering:pixelated] ring-4 ring-slate-800" aria-label={t("display", { text: `${bar.trim()} · ${big} · ${small}` })} />;
}

const LED: Record<DeviceStatus["st"], { color: string; blink: number }> = {
  W: { color: "#3b82f6", blink: 500 },
  I: { color: "#3b82f6", blink: 0 },
  S: { color: "#eab308", blink: 125 },
  E: { color: "#ef4444", blink: 125 },
  C: { color: "#ef4444", blink: 125 },
  T: { color: "#22c55e", blink: 0 },
  O: { color: "#06b6d4", blink: 0 },
  R: { color: "#3b82f6", blink: 0 },
  L: { color: "#22c55e", blink: 0 },
};
const BEEPS: Record<DeviceStatus["st"], number> = { W: 1, I: 1, S: 2, E: 3, T: 0, O: 0, C: 3, R: 1, L: 0 };

/** Ciò che mostrano in questo momento il display, il LED e il cicalino di Arduino. */
export function DeviceMirror() {
  const rig = useLab((s) => s.rig);
  const device = useLab((s) => s.device);
  const running = useLab((s) => s.running);
  const lines = useLab((s) => s.oledLines);
  const fw = useLab((s) => s.fw);
  const created = useLab((s) => s.session?.created ?? 0);
  const lim = useLab((s) => s.lim);
  const linkKind = useLab((s) => s.linkKind);
  const t = useTranslations("app.device");
  const outs = indicatorsOf(rig);
  const tick = useTick(lim ? 500 : 125, !!device && outs.length > 0);
  if (!device || !outs.length) return null;
  const has = (t: string) => outs.some((s) => (t === "oled" ? isOled(s.type) : s.type === t));
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
  const txt = screenTexts(device, { running, fw: (fw ?? "").replace(/-.*$/, ""), slotType: slotSensor?.type, cfgType: device.st === "C" ? slotSensor?.type : undefined, same, ord, sats, elapsed, lines, tick });
  const led = LED[device.st];
  const ms = tick * (lim ? 500 : 125);
  const ledOn = !led.blink || Math.floor(ms / led.blink) % 2 === 0;
  // come il firmware (2.0): con il pulsante, da fermo tace e mentre registra fa un «tic» grave ogni 5 s
  const nag = has("buzzer") && outs.find((s) => s.type === "buzzer")!.options.nag !== "no";
  const btn = rig.sensors.some((s) => s.type === "button");
  const idle = device.st === "W" || device.st === "I" || device.st === "R";
  const tic = nag && btn && (device.st === "T" || device.st === "L");
  const beeps = nag && !(btn && idle) ? BEEPS[device.st] : 0;
  const buzzer = outs.find((s) => s.type === "buzzer");
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
      <span className="font-semibold text-muted-foreground">{t("onArduino")}</span>
      {has("oled") && <Oled {...txt} />}
      {/* LED e cicalino disegnati come i componenti veri; le descrizioni restano per chi usa uno screen reader */}
      {has("rgb") && <LedPart color={led.color} on={ledOn} label={t(`led.${device.st}`)} />}
      {buzzer && (
        <BuzzerPart st={device.st} plan={{ beeps, tic }} passive={buzzer.options.kind === "passive"} confirm={buzzer.options.confirm !== "no"} simulated={linkKind === "simulatore"}
          label={beeps ? t("beeps", { n: beeps }) : tic ? t("tic") : t("noBeeps")} />
      )}
      {!has("oled") && !has("rgb") && !has("buzzer") && <span>{SENSORS.oled.title}</span>}
    </div>
  );
}
