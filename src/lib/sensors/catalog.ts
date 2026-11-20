// MosaicusNeo — catalogo dei sensori.
//
// Ogni sensore dichiara: i pin che usa (con il tipo: analogico o digitale), le opzioni, il ritmo
// di lettura, le grandezze che produce, come si converte la lettura grezza del firmware in
// grandezze fisiche (parse), le grandezze ricavate dalla serie completa (derive: velocità dal
// sonar, distanza percorsa dal GPS…) e lo schema dei collegamenti.
// Aggiungere un sensore = aggiungere una voce qui (e, se è di Arduino, un tipo nel firmware).

import type { LucideIcon } from "lucide-react";
import { Activity, AudioLines, BellRing, Bluetooth, BluetoothSearching, CircleDot, MemoryStick, Droplets, Lightbulb, Monitor, Move3d, MoveHorizontal, Radar, Satellite, ScanLine, Smartphone, Sun, Thermometer, ThermometerSnowflake, Weight, Wind } from "lucide-react";
import { localPolyDerivs } from "@/lib/mosaicus/analysis.js";
import { nmeaToDeg, haversine, nmeaTime } from "@/lib/mosaicus/geo";
import { t } from "@/i18n";
import type { Options, Param, Tone, WiringBlock } from "./types";

export type SensorType = "ntc" | "dht" | "sonar" | "gps" | "analog" | "ldr" | "ds18b20" | "gate" | "hx711" | "imu" | "mlx" | "sps30" | "oled" | "rgb" | "buzzer" | "button" | "sd" | "hc06" | "ble" | "pmotion" | "psound";
export type Rec = Record<string, number | boolean> & { t: number };

/** bus: i pin I2C si possono condividere tra più dispositivi I2C (display, MPU-6050, MLX90614);
 *  fixed: pin che non si sceglie (SPI della scheda SD su D11–D13, seriale del Bluetooth su D0/D1) */
export interface PinSpec { key: "a" | "b" | "c" | "d"; role: string; kind: "analog" | "digital"; def: number; note?: string; bus?: "sda" | "scl"; fixed?: boolean }
/** Gruppi del catalogo: che cosa fa il componente. */
export type ComponentGroup = "sensor" | "control" | "output" | "storage" | "comm" | "phone";
/** primary: tra le letture in evidenza; raw: dato tecnico; hidden: solo in tabella ed export */
export interface QView { key: string; digits: number; line?: boolean; raw?: boolean; hidden?: boolean; primary?: boolean; sym?: string; name?: string; unit?: string }

export interface SensorDef {
  type: SensorType;
  title: string;
  short: string;
  measures: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  /** tipo nel firmware (CFG,ADD,…,<tipo>,… oppure OUT,ADD,<tipo>,… per gli indicatori) */
  fw: "NTC" | "ANA" | "DHT" | "SONAR" | "GPS" | "DS18" | "GATE" | "HX711" | "IMU" | "MLX" | "SPS" | "OLED" | "RGB" | "BUZ" | "BTN" | "SD" | "BT" | "PMOT" | "PSND";
  /** gruppo nel catalogo (se manca: sensore, o uscita per gli indicatori, o telefono) */
  group?: ComponentGroup;
  /** sensore del telefono o del computer: niente Arduino, non si mescola con i componenti di Arduino */
  phone?: boolean;
  /** accessorio comandato da Arduino (display, LED, cicalino, pulsante, scheda SD): si configura con
   *  OUT,ADD, non misura nulla e non occupa uno dei 6 posti */
  output?: boolean;
  /** modulo di collegamento (Bluetooth): solo fili, nessun comando al firmware e nessun posto */
  link?: boolean;
  /** scrive solo quando cambia qualcosa (fotocellula): nessun ritmo di lettura */
  events?: boolean;
  /** versione minima del firmware */
  since?: string;
  pins: PinSpec[];
  options: Param[];
  interval: { def: number; min: number };
  /** quanti se ne possono mettere in un montaggio */
  max: number;
  quantities(o: Options): QView[];
  /** nomi dei valori grezzi inviati dal firmware (riga D,<slot>,<t>,…), per l'export grezzo */
  rawFields: string[];
  parse(v: number[], o: Options): Rec | null;
  derive?(recs: Rec[], o: Options): void;
  fwOpt?(o: Options): number;
  minInterval?(o: Options): number;
  wiring(pins: Record<string, string>, o: Options): WiringBlock[];
}

// ---------------------------------------------------------------------------
// Pin di Arduino Uno: D2…D13 digitali, A0…A5 (14…19) analogici (anche digitali)
// ---------------------------------------------------------------------------
export const pinName = (p: number) => (p >= 14 ? `A${p - 14}` : `D${p}`);
export const DIGITAL_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export const ANALOG_PINS = [14, 15, 16, 17, 18, 19];
export const pinsFor = (kind: PinSpec["kind"]) => (kind === "analog" ? ANALOG_PINS : DIGITAL_PINS);

const num = (v: number | string | undefined) => Number(v);
const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Punto di rugiada con la formula di Magnus (coefficienti di Sonntag, −45…60 °C). */
export function dewPoint(T: number, RH: number) {
  if (!Number.isFinite(T) || !(RH > 0)) return NaN;
  const b = 17.62, c = 243.12;
  const g = Math.log(RH / 100) + (b * T) / (c + T);
  return (c * g) / (b - g);
}
/** Umidità assoluta (g di vapore per m³ d'aria). */
export function absoluteHumidity(T: number, RH: number) {
  if (!Number.isFinite(T) || !Number.isFinite(RH)) return NaN;
  const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
  return (es * RH * 2.1674) / (273.15 + T);
}
/** I 4 byte del DHT: DHT11 (parte intera + decimi) o DHT22 (16 bit, decimi). */
export function decodeDht(b: number[], model: string) {
  const [b0, b1, b2, b3] = b;
  if (model === "dht22") return { RH: ((b0 << 8) | b1) / 10, T: ((((b2 & 0x7f) << 8) | b3) / 10) * (b2 & 0x80 ? -1 : 1) };
  return { RH: b0 + b1 / 10, T: (b2 + (b3 & 0x7f) / 10) * (b3 & 0x80 ? -1 : 1) };
}
/** Distanza percorsa lungo una traccia; i salti sotto 1,5 m (rumore del GPS) non si sommano. */
function trackDistance(recs: Rec[]) {
  let s = 0, last: Rec | null = null;
  for (const r of recs) {
    const has = Number.isFinite(r.lat as number) && Number.isFinite(r.lon as number);
    if (has) {
      if (last) { const d = haversine(last.lat as number, last.lon as number, r.lat as number, r.lon as number); if (d > 1.5) { s += d; last = r; } } else last = r;
    }
    r.s = has ? s : NaN;
  }
}

// ---------------------------------------------------------------------------
// Sensori collegati ad Arduino
// ---------------------------------------------------------------------------
const ntc: SensorDef = {
  rawFields: ["adc"],
  type: "ntc", title: t("sensors.catalog.ntc.title"), short: "NTC", measures: t("sensors.catalog.ntc.measures"),
  description: t("sensors.catalog.ntc.description"),
  icon: Thermometer, tone: "rose", fw: "NTC",
  pins: [{ key: "a", role: t("sensors.catalog.dividerOut"), kind: "analog", def: 14 }],
  interval: { def: 1000, min: 100 }, max: 6,
  options: [
    { key: "orientation", label: t("sensors.catalog.ntc.orientation"), type: "select", value: "ntc5v",
      options: [["ntc5v", t("sensors.catalog.ntc.ntc5v")], ["ntcgnd", t("sensors.catalog.ntc.ntcgnd")]] },
    { key: "tAmb", label: t("sensors.catalog.ntc.tAmb"), unit: "°C", value: 21, step: 0.1, advanced: true },
    { key: "rSeries", label: t("sensors.catalog.ntc.rSeries"), unit: "Ω", value: 10000, step: 100, advanced: true },
    { key: "r0", label: t("sensors.catalog.ntc.r0"), unit: "Ω", value: 10000, step: 100, advanced: true },
    { key: "t0", label: t("sensors.catalog.ntc.t0"), unit: "°C", value: 25, step: 0.1, advanced: true },
    { key: "beta", label: t("sensors.catalog.ntc.beta"), unit: "K", value: 3950, step: 10, advanced: true },
    { key: "offset", label: t("sensors.catalog.offsetT"), unit: "°C", value: 0, step: 0.1, advanced: true },
  ],
  quantities: () => [{ key: "T", digits: 2, primary: true }, { key: "lnT", digits: 3 }, { key: "R", digits: 0, raw: true }, { key: "adc", digits: 1, raw: true }],
  parse([adc], o) {
    if (!Number.isFinite(adc)) return null;
    let R = NaN;
    const rs = num(o.rSeries);
    if (adc > 0.5 && adc < 1022.5) R = o.orientation === "ntcgnd" ? rs * adc / (1023 - adc) : rs * (1023 - adc) / adc;
    const T = 1 / (1 / (num(o.t0) + 273.15) + Math.log(R / num(o.r0)) / num(o.beta)) - 273.15 + num(o.offset);
    const ta = num(o.tAmb);
    return { t: 0, adc, R, T, lnT: T - ta > 0 ? Math.log(T - ta) : NaN };
  },
  wiring: (p) => [{ title: t("sensors.catalog.ntc.title"), schematic: "ntc", pins: { sig: p.a }, text: t("sensors.catalog.ntc.wiring", { pin: p.a }) }],
};

const dht: SensorDef = {
  rawFields: ["byte0", "byte1", "byte2", "byte3", "error"],
  type: "dht", title: "DHT11 / DHT22", short: "DHT", measures: t("sensors.catalog.dht.measures"),
  description: t("sensors.catalog.dht.description"),
  icon: Droplets, tone: "sky", fw: "DHT",
  pins: [{ key: "a", role: "DATA", kind: "digital", def: 2 }],
  interval: { def: 2000, min: 1000 }, max: 6,
  options: [
    { key: "model", label: t("sensors.catalog.dht.model"), type: "select", value: "dht11",
      options: [["dht11", t("sensors.catalog.dht.dht11")], ["dht22", t("sensors.catalog.dht.dht22")]] },
    // cambia solo i collegamenti: il sensore senza schedina ha un piedino in più (il 3, libero)
    { key: "pkg", label: t("sensors.catalog.dht.pkg"), type: "select", value: "module",
      options: [["module", t("sensors.catalog.dht.pkgModule")], ["bare", t("sensors.catalog.dht.pkgBare")]] },
    { key: "offsetT", label: t("sensors.catalog.dht.offsetT"), unit: "°C", value: 0, step: 0.1, advanced: true },
    { key: "offsetRH", label: t("sensors.catalog.dht.offsetRH"), unit: "%", value: 0, step: 0.5, advanced: true },
  ],
  fwOpt: (o) => (o.model === "dht22" ? 22 : 11),
  minInterval: (o) => (o.model === "dht22" ? 2000 : 1000),
  quantities: () => [
    { key: "T", digits: 1, line: true, primary: true }, { key: "RH", digits: 0, line: true, primary: true }, { key: "Td", digits: 1, line: true }, { key: "AH", digits: 1, line: true },
    { key: "ok", digits: 0, raw: true, hidden: true },
    ...["b0", "b1", "b2", "b3"].map((k) => ({ key: k, digits: 0, raw: true, hidden: true })),
  ],
  parse(f, o) {
    const bytes = f.slice(0, 4);
    const ok0 = f[4] === 0 && bytes.every(Number.isFinite);
    const d = ok0 ? decodeDht(bytes, String(o.model)) : { RH: NaN, T: NaN };
    const ok = ok0 && d.RH >= 0 && d.RH <= 100 && d.T > -45 && d.T < 85;
    const T = ok ? d.T + num(o.offsetT) : NaN, RH = ok ? Math.min(100, Math.max(0, d.RH + num(o.offsetRH))) : NaN;
    return { t: 0, b0: f[0], b1: f[1], b2: f[2], b3: f[3], ok, T, RH, Td: dewPoint(T, RH), AH: absoluteHumidity(T, RH) };
  },
  wiring: (p) => [{ title: "DHT11 / DHT22", schematic: "dht", pins: { data: p.a }, text: t("sensors.catalog.dht.wiring", { pin: p.a }) }],
};

const sonar: SensorDef = {
  rawFields: ["echo_us"],
  type: "sonar", title: t("sensors.catalog.sonar.title"), short: "HC-SR04", measures: t("sensors.catalog.sonar.measures"),
  description: t("sensors.catalog.sonar.description"),
  icon: MoveHorizontal, tone: "sky", fw: "SONAR",
  pins: [{ key: "a", role: "TRIG", kind: "digital", def: 12 }, { key: "b", role: "ECHO", kind: "digital", def: 11 }],
  interval: { def: 50, min: 30 }, max: 3,
  options: [
    { key: "tAir", label: t("sensors.catalog.sonar.tAir"), unit: "°C", value: 20, step: 0.5 },
    { key: "direction", label: t("sensors.catalog.sonar.direction"), type: "select", value: "away",
      options: [["away", t("sensors.catalog.sonar.away")], ["toward", t("sensors.catalog.sonar.toward")]] },
    { key: "window", label: t("sensors.catalog.sonar.window"), value: 4, min: 1, step: 1, advanced: true },
    { key: "origin", label: t("sensors.catalog.sonar.origin"), unit: "m", value: 0, step: 0.001, advanced: true },
    { key: "dMin", label: t("sensors.catalog.sonar.dMin"), unit: "m", value: 0.03, step: 0.01, advanced: true },
    { key: "dMax", label: t("sensors.catalog.sonar.dMax"), unit: "m", value: 3.0, step: 0.1, advanced: true },
    { key: "spike", label: t("sensors.catalog.sonar.spike"), unit: "m", value: 0.10, step: 0.01, advanced: true },
  ],
  quantities: () => [
    { key: "x", digits: 3, primary: true }, { key: "v", digits: 2, line: true, primary: true }, { key: "a", digits: 2, line: true },
    { key: "d", digits: 3, raw: true }, { key: "echo", digits: 0, raw: true }, { key: "ok", digits: 0, raw: true, hidden: true },
  ],
  parse([echo], o) {
    if (!Number.isFinite(echo)) return null;
    const vSound = 331.3 + 0.606 * num(o.tAir);
    return { t: 0, echo, d: echo > 0 ? (vSound * echo) / 2e6 : NaN };
  },
  derive(rows, o) {
    const sign = o.direction === "toward" ? -1 : 1;
    const dMin = num(o.dMin), dMax = num(o.dMax), spike = num(o.spike), origin = num(o.origin);
    for (const r of rows) r.ok = Number.isFinite(r.d as number) && (r.d as number) >= dMin && (r.d as number) <= dMax;
    // salti anomali: confronto con la mediana dei vicini validi
    if (spike > 0) {
      const idx = rows.map((r, i) => (r.ok ? i : -1)).filter((i) => i >= 0);
      const flags: number[] = [];
      for (let k = 0; k < idx.length; k++) {
        const neigh: number[] = [];
        for (let j = Math.max(0, k - 3); j <= Math.min(idx.length - 1, k + 3); j++) if (j !== k) neigh.push(rows[idx[j]].d as number);
        if (neigh.length >= 2 && Math.abs((rows[idx[k]].d as number) - median(neigh)) > spike) flags.push(idx[k]);
      }
      for (const i of flags) rows[i].ok = false;
    }
    const good = rows.filter((r) => r.ok);
    const t = good.map((r) => r.t), x = good.map((r) => sign * ((r.d as number) - origin));
    const { d1, d2 } = localPolyDerivs(t, x, Math.max(1, Math.round(num(o.window))));
    good.forEach((r, i) => { r.x = x[i]; r.v = d1[i]; r.a = d2[i]; });
    for (const r of rows) if (!r.ok) { r.x = NaN; r.v = NaN; r.a = NaN; }
  },
  wiring: (p) => [{ title: "HC-SR04", schematic: "hcsr04", pins: { trig: p.a, echo: p.b }, text: t("sensors.catalog.sonar.wiring") }],
};

const gps: SensorDef = {
  rawFields: ["fix", "lat_nmea", "lon_nmea", "alt_m", "sats", "hdop", "speed_knots", "utc_hhmmss", "date_ddmmyy"],
  type: "gps", title: "GPS (NEO-6M / NEO-7M)", short: "GPS", measures: t("sensors.catalog.gps.measures"),
  description: t("sensors.catalog.gps.description"),
  icon: Satellite, tone: "lime", fw: "GPS",
  pins: [{ key: "a", role: t("sensors.catalog.gps.pinRx"), kind: "digital", def: 4 }, { key: "b", role: t("sensors.catalog.gps.pinTx"), kind: "digital", def: 3, note: t("sensors.catalog.gps.pinTxNote") }],
  interval: { def: 2000, min: 1000 }, max: 1,
  options: [
    { key: "minSats", label: t("sensors.catalog.gps.minSats"), value: 4, min: 3, step: 1, advanced: true },
    { key: "maxHdop", label: t("sensors.catalog.gps.maxHdop"), value: 5, min: 1, step: 0.5, advanced: true },
  ],
  quantities: () => [
    { key: "alt", digits: 0, line: true }, { key: "speed", digits: 1, line: true }, { key: "s", digits: 0, line: true, primary: true },
    { key: "lat", digits: 6, hidden: true }, { key: "lon", digits: 6, hidden: true },
    { key: "sats", digits: 0, raw: true, primary: true }, { key: "hdop", digits: 1, raw: true, hidden: true }, { key: "fix", digits: 0, raw: true, hidden: true }, { key: "utc", digits: 0, raw: true, hidden: true },
  ],
  /** [fix, lat, lon, alt, sat, hdop, vel_nodi, utc, data] */
  parse(f, o) {
    const [fix, lat, lon, alt, sats, hdop, kn, utc, date] = f;
    const good = (fix || 0) > 0 && Number.isFinite(lat) && Number.isFinite(lon) && !(sats < num(o.minSats)) && !(hdop > num(o.maxHdop));
    return {
      t: 0, fix: fix || 0, sats, hdop, utc, time: nmeaTime(utc, date), ok: good,
      lat: good ? nmeaToDeg(lat) : NaN, lon: good ? nmeaToDeg(lon) : NaN, alt: good ? alt : NaN,
      speed: good && Number.isFinite(kn) ? kn * 1.852 : NaN,
    };
  },
  derive: (rows) => trackDistance(rows),
  wiring: (p) => [{ title: "GPS", schematic: "gps", pins: { rx: p.a, tx: p.b }, text: t("sensors.catalog.gps.wiring") }],
};

const analog: SensorDef = {
  rawFields: ["adc"],
  type: "analog", title: t("sensors.catalog.analog.title"), short: t("sensors.catalog.analog.short"), measures: t("sensors.catalog.analog.measures"),
  description: t("sensors.catalog.analog.description"),
  icon: Activity, tone: "saffron", fw: "ANA",
  pins: [{ key: "a", role: t("sensors.catalog.analog.pin"), kind: "analog", def: 15 }],
  interval: { def: 100, min: 10 }, max: 6,
  options: [
    { key: "calibrate", label: t("sensors.catalog.analog.calibrate"), type: "select", value: "no", options: [["no", t("sensors.catalog.analog.calNo")], ["yes", t("sensors.catalog.analog.calYes")]] },
    { key: "sym", label: t("sensors.catalog.analog.sym"), type: "text", value: "y" },
    { key: "unit", label: t("sensors.catalog.analog.unit"), type: "text", value: "" },
    { key: "k", label: t("sensors.catalog.analog.k"), value: 1, step: 0.001 },
    { key: "q", label: t("sensors.catalog.analog.q"), value: 0, step: 0.001 },
    { key: "vref", label: t("sensors.catalog.analog.vref"), unit: "V", value: 5, step: 0.01, advanced: true },
  ],
  quantities: (o) => [
    { key: "V", digits: 3, line: true, primary: o.calibrate !== "yes" },
    ...(o.calibrate === "yes" ? [{ key: "Y", digits: 3, line: true, primary: true, sym: String(o.sym || "y"), unit: String(o.unit || ""), name: t("sensors.catalog.analog.calibrated", { sym: String(o.sym || "y") }) }] : []),
    { key: "adc", digits: 1, raw: true },
  ],
  parse([adc], o) {
    if (!Number.isFinite(adc)) return null;
    const V = (adc * num(o.vref)) / 1023;
    return { t: 0, adc, V, Y: o.calibrate === "yes" ? num(o.k) * V + num(o.q) : NaN };
  },
  wiring: (p) => [{ title: t("sensors.catalog.analog.wiringTitle"), schematic: "analog", pins: { sig: p.a }, warn: true, text: t("sensors.catalog.analog.wiring", { pin: p.a }) }],
};

const ldr: SensorDef = {
  rawFields: ["adc"],
  type: "ldr", title: t("sensors.catalog.ldr.title"), short: "LDR", measures: t("sensors.catalog.ldr.measures"),
  description: t("sensors.catalog.ldr.description"),
  icon: Sun, tone: "saffron", fw: "ANA",
  pins: [{ key: "a", role: t("sensors.catalog.dividerOut"), kind: "analog", def: 16 }],
  interval: { def: 100, min: 10 }, max: 6,
  options: [
    { key: "orientation", label: t("sensors.catalog.ldr.orientation"), type: "select", value: "ldr5v",
      options: [["ldr5v", t("sensors.catalog.ldr.ldr5v")], ["ldrgnd", t("sensors.catalog.ldr.ldrgnd")]] },
  ],
  quantities: () => [{ key: "light", digits: 1, line: true, primary: true }, { key: "adc", digits: 1, raw: true }],
  parse([adc], o) {
    if (!Number.isFinite(adc)) return null;
    const u = adc / 1023;
    return { t: 0, adc, light: 100 * (o.orientation === "ldrgnd" ? 1 - u : u) };
  },
  wiring: (p) => [{ title: t("sensors.catalog.ldr.wiringTitle"), schematic: "ldr", pins: { sig: p.a }, text: t("sensors.catalog.ldr.wiring", { pin: p.a }) }],
};


const ds18b20: SensorDef = {
  rawFields: ["raw_16th_C", "error"],
  type: "ds18b20", title: t("sensors.catalog.ds18b20.title"), short: "DS18B20", measures: t("sensors.catalog.ds18b20.measures"),
  description: t("sensors.catalog.ds18b20.description"),
  icon: ThermometerSnowflake, tone: "sky", fw: "DS18", since: "1.2",
  pins: [{ key: "a", role: "DATA", kind: "digital", def: 7, note: t("sensors.catalog.ds18b20.pinNote") }],
  interval: { def: 1000, min: 1000 }, max: 3,
  options: [{ key: "offset", label: t("sensors.catalog.offsetT"), unit: "°C", value: 0, step: 0.1, advanced: true }],
  quantities: () => [{ key: "T", digits: 2, line: true, primary: true }, { key: "ds", digits: 0, raw: true, hidden: true }],
  parse([raw, err]) {
    const ok = err === 0 && Number.isFinite(raw);
    return { t: 0, ds: raw, ok, T: ok ? raw / 16 : NaN };
  },
  derive(recs, o) { for (const r of recs) if (r.ok) r.T = (r.T as number) + num(o.offset); },
  wiring: (p) => [{ title: "DS18B20", schematic: "dht", pins: { data: p.a }, text: t("sensors.catalog.ds18b20.wiring", { pin: p.a }) }],
};

const gate: SensorDef = {
  rawFields: ["state"],
  type: "gate", title: t("sensors.catalog.gate.title"), short: t("sensors.catalog.gate.short"), measures: t("sensors.catalog.gate.measures"),
  description: t("sensors.catalog.gate.description"),
  icon: ScanLine, tone: "rose", fw: "GATE", since: "1.2", events: true,
  pins: [{ key: "a", role: "OUT", kind: "digital", def: 2, note: t("sensors.catalog.gate.pinNote") }],
  interval: { def: 1000, min: 1000 }, max: 2,
  options: [
    { key: "blocked", label: t("sensors.catalog.gate.blocked"), type: "select", value: "high", options: [["high", t("sensors.catalog.gate.high")], ["low", t("sensors.catalog.gate.low")]] },
    { key: "pullup", label: t("sensors.catalog.gate.pullup"), type: "select", value: "no", options: [["no", t("sensors.catalog.gate.pullupNo")], ["yes", t("sensors.catalog.gate.pullupYes")]], advanced: true },
    { key: "width", label: t("sensors.catalog.gate.width"), unit: "mm", value: 20, min: 0, step: 1 },
  ],
  fwOpt: (o) => (o.blocked === "low" ? 1 : 0) | (o.pullup === "yes" ? 2 : 0),
  quantities: () => [
    { key: "gate", digits: 0, primary: true },
    { key: "n", digits: 0, line: true },
    { key: "Tp", digits: 4, primary: true },
    { key: "tb", digits: 4 },
    { key: "vg", digits: 3 },
    { key: "fg", digits: 3, hidden: true },
  ],
  parse([lv]) { return Number.isFinite(lv) ? { t: 0, gate: lv } : null; },
  derive(recs, o) {
    // n: interruzioni contate; Tp: tempo tra due interruzioni; tb: durata dell'interruzione; vg = larghezza / tb
    let n = 0, lastOn = NaN, onAt = NaN;
    const w = num(o.width) / 1000;
    for (const r of recs) {
      r.Tp = NaN; r.tb = NaN; r.vg = NaN; r.fg = NaN;
      if (r.gate === 1) {
        if (r.t > 0 || n > 0) n++;
        if (Number.isFinite(lastOn)) { r.Tp = r.t - lastOn; r.fg = 1 / (r.Tp as number); }
        lastOn = r.t; onAt = r.t;
      } else if (Number.isFinite(onAt)) {
        r.tb = r.t - onAt;
        if (w > 0) r.vg = w / (r.tb as number);
        onAt = NaN;
      }
      r.n = n;
    }
  },
  wiring: (p) => [{ title: t("sensors.catalog.gate.wiringTitle"), pins: { out: p.a }, text: t("sensors.catalog.gate.wiring", { pin: p.a }) }],
};

const hx711: SensorDef = {
  rawFields: ["counts", "error"],
  type: "hx711", title: t("sensors.catalog.hx711.title"), short: t("sensors.catalog.hx711.short"), measures: t("sensors.catalog.hx711.measures"),
  description: t("sensors.catalog.hx711.description"),
  icon: Weight, tone: "saffron", fw: "HX711", since: "1.2",
  pins: [{ key: "a", role: "DT", kind: "digital", def: 5 }, { key: "b", role: "SCK", kind: "digital", def: 6 }],
  interval: { def: 100, min: 100 }, max: 2,
  options: [
    { key: "scale", label: t("sensors.catalog.hx711.scale"), value: 420, step: 0.1 },
    { key: "autotare", label: t("sensors.catalog.hx711.autotare"), type: "select", value: "yes", options: [["yes", t("sensors.catalog.hx711.autotareYes")], ["no", t("sensors.catalog.hx711.autotareNo")]] },
    { key: "tare", label: t("sensors.catalog.hx711.tare"), value: 0, step: 1, advanced: true },
    { key: "g", label: t("sensors.catalog.hx711.g"), unit: "m/s²", value: 9.81, step: 0.01, advanced: true },
    { key: "sign", label: t("sensors.catalog.hx711.sign"), type: "select", value: "1", options: [["1", t("sensors.catalog.hx711.push")], ["-1", t("sensors.catalog.hx711.pull")]], advanced: true },
  ],
  quantities: () => [{ key: "m", digits: 1, line: true, primary: true }, { key: "F", digits: 3, line: true, primary: true }, { key: "cnt", digits: 0, raw: true }],
  parse([c, err]) { const ok = err === 0 && Number.isFinite(c); return { t: 0, cnt: c, ok }; },
  derive(recs, o) {
    const good = recs.filter((r) => r.ok).map((r) => r.cnt as number);
    const tare = o.autotare === "yes" && good.length ? median(good.slice(0, 5)) : num(o.tare);
    const k = num(o.scale) || 1, sgn = Number(o.sign) || 1, g = num(o.g);
    for (const r of recs) {
      const m = r.ok ? (sgn * ((r.cnt as number) - tare)) / k : NaN;
      r.m = m; r.F = (m / 1000) * g;
    }
  },
  wiring: (p) => [{ title: "HX711", pins: { dt: p.a, sck: p.b }, text: t("sensors.catalog.hx711.wiring", { dt: p.a, sck: p.b }) }],
};

const IMU_RANGE: Record<string, number> = { "2": 0, "4": 1, "8": 2, "16": 3 };
const imu: SensorDef = {
  rawFields: ["ax_raw", "ay_raw", "az_raw", "gx_raw", "gy_raw", "gz_raw", "error"],
  type: "imu", title: t("sensors.catalog.imu.title"), short: "MPU-6050", measures: t("sensors.catalog.imu.measures"),
  description: t("sensors.catalog.imu.description"),
  icon: Move3d, tone: "lime", fw: "IMU", since: "1.2",
  pins: [
    { key: "a", role: "SDA", kind: "digital", def: 18, bus: "sda", note: t("sensors.catalog.imu.sdaNote") },
    { key: "b", role: "SCL", kind: "digital", def: 19, bus: "scl", note: t("sensors.catalog.usuallyA5") },
  ],
  interval: { def: 20, min: 10 }, max: 2,
  options: [
    { key: "range", label: t("sensors.catalog.imu.range"), type: "select", value: "2", options: [["2", t("sensors.catalog.imu.range2")], ["4", "±4 g"], ["8", "±8 g"], ["16", t("sensors.catalog.imu.range16")]] },
    { key: "addr", label: t("sensors.catalog.imu.addr"), type: "select", value: "68", options: [["68", t("sensors.catalog.imu.addr68")], ["69", t("sensors.catalog.imu.addr69")]], advanced: true },
    { key: "gravity", label: t("sensors.catalog.imu.gravity"), type: "select", value: "no", options: [["no", t("sensors.catalog.no")], ["z", t("sensors.catalog.imu.gravityZ")]], advanced: true },
  ],
  fwOpt: (o) => (IMU_RANGE[String(o.range)] ?? 0) | (o.addr === "69" ? 4 : 0),
  quantities: () => [
    { key: "ax", digits: 2, line: true, primary: true }, { key: "ay", digits: 2, line: true }, { key: "az", digits: 2, line: true },
    { key: "am", digits: 2, line: true, primary: true },
    { key: "gx", digits: 1, line: true, hidden: true }, { key: "gy", digits: 1, line: true, hidden: true }, { key: "gz", digits: 1, line: true },
  ],
  parse([ax, ay, az, gx, gy, gz, err], o) {
    if (err !== 0 || !Number.isFinite(ax)) return { t: 0, ax: NaN, ay: NaN, az: NaN, am: NaN, gx: NaN, gy: NaN, gz: NaN };
    const lsb = 16384 / 2 ** (IMU_RANGE[String(o.range)] ?? 0), G = 9.80665;
    const a = [ax, ay, az].map((v) => (v / lsb) * G);
    const am = Math.hypot(a[0], a[1], a[2]);
    if (o.gravity === "z") a[2] -= G;
    return { t: 0, ax: a[0], ay: a[1], az: a[2], am, gx: gx / 131, gy: gy / 131, gz: gz / 131 };
  },
  wiring: (p) => [{ title: "MPU-6050 (GY-521)", pins: { sda: p.a, scl: p.b }, text: t("sensors.catalog.imu.wiring", { sda: p.a, scl: p.b }) }],
};

/**
 * MLX90614: il sensore calcola la temperatura dell'oggetto supponendo emissività 1 (impostazione di
 * fabbrica). Per una superficie con emissività ε la correzione viene dalla legge di Stefan-Boltzmann,
 * con la temperatura ambiente come temperatura della radiazione riflessa:
 *   T_vera⁴ = (T_misurata⁴ − (1 − ε)·T_amb⁴) / ε   (temperature in kelvin)
 */
export function mlxCorrect(Tobj: number, Tamb: number, eps: number) {
  if (!(eps > 0 && eps < 1) || !Number.isFinite(Tobj) || !Number.isFinite(Tamb)) return Tobj;
  const K = 273.15, t4 = ((Tobj + K) ** 4 - (1 - eps) * (Tamb + K) ** 4) / eps;
  return t4 > 0 ? t4 ** 0.25 - K : NaN;
}
const mlx: SensorDef = {
  rawFields: ["obj_raw_0.02K", "amb_raw_0.02K", "error"],
  type: "mlx", title: t("sensors.catalog.mlx.title"), short: "MLX90614", measures: t("sensors.catalog.mlx.measures"),
  description: t("sensors.catalog.mlx.description"),
  icon: Radar, tone: "rose", fw: "MLX", since: "1.4",
  pins: [
    { key: "a", role: "SDA", kind: "digital", def: 18, bus: "sda", note: t("sensors.catalog.mlx.sdaNote") },
    { key: "b", role: "SCL", kind: "digital", def: 19, bus: "scl", note: t("sensors.catalog.usuallyA5") },
  ],
  // tutti i MLX90614 rispondono all'indirizzo 0x5A: due sullo stesso bus si disturberebbero
  interval: { def: 250, min: 100 }, max: 1,
  options: [
    { key: "eps", label: t("sensors.catalog.mlx.eps"), value: 0.95, min: 0.1, step: 0.01 },
    { key: "offset", label: t("sensors.catalog.offsetT"), unit: "°C", value: 0, step: 0.1, advanced: true },
  ],
  quantities: () => [
    { key: "T", digits: 2, line: true, primary: true },
    { key: "Ts", digits: 2, line: true },
    { key: "Traw", digits: 2, raw: true, hidden: true },
  ],
  parse([obj, amb, err], o) {
    const ok = err === 0 && Number.isFinite(obj) && Number.isFinite(amb);
    if (!ok) return { t: 0, ok, T: NaN, Ts: NaN, Traw: NaN };
    const Traw = obj * 0.02 - 273.15, Ts = amb * 0.02 - 273.15;
    return { t: 0, ok, Traw, Ts, T: mlxCorrect(Traw, Ts, num(o.eps)) + num(o.offset) };
  },
  wiring: (p) => [{ title: "MLX90614 (GY-906)", pins: { sda: p.a, scl: p.b }, text: t("sensors.catalog.mlx.wiring", { sda: p.a, scl: p.b }) }],
};

// Polveri sottili (Sensirion SPS30): conteggio laser delle particelle, un dato al secondo.
// Su Arduino Uno va in I2C (SEL a GND): la seriale a 115200 baud non si può fare via software.
// Indirizzo fisso 0x69, lo stesso dell'MPU-6050 con AD0 alto.
const sps30: SensorDef = {
  rawFields: ["pm1_ug_m3", "pm2.5_ug_m3", "pm4_ug_m3", "pm10_ug_m3", "nc0.5_cm3", "nc1_cm3", "nc2.5_cm3", "nc4_cm3", "nc10_cm3", "tps_um", "error"],
  type: "sps30", title: t("sensors.catalog.sps30.title"), short: "SPS30", measures: t("sensors.catalog.sps30.measures"),
  description: t("sensors.catalog.sps30.description"),
  icon: Wind, tone: "sky", fw: "SPS", since: "1.6",
  pins: [
    { key: "a", role: "SDA", kind: "digital", def: 18, bus: "sda", note: t("sensors.catalog.sps30.sdaNote") },
    { key: "b", role: "SCL", kind: "digital", def: 19, bus: "scl", note: t("sensors.catalog.usuallyA5") },
  ],
  interval: { def: 1000, min: 1000 }, max: 1,
  options: [],
  quantities: () => [
    { key: "pm1", digits: 1, line: true },
    { key: "pm25", digits: 1, line: true, primary: true },
    { key: "pm4", digits: 1, line: true },
    { key: "pm10", digits: 1, line: true, primary: true },
    { key: "nc05", digits: 1, line: true, hidden: true }, { key: "nc1", digits: 1, line: true, hidden: true },
    { key: "nc25", digits: 1, line: true, hidden: true }, { key: "nc4", digits: 1, line: true, hidden: true },
    { key: "nc10", digits: 1, line: true, hidden: true },
    { key: "tps", digits: 2, line: true },
  ],
  parse(v) {
    const [pm1, pm25, pm4, pm10, nc05, nc1, nc25, nc4, nc10, tps, err] = v;
    const ok = err === 0 && Number.isFinite(pm25);
    const val = (x: number) => (ok ? x : NaN);
    return { t: 0, ok, pm1: val(pm1), pm25: val(pm25), pm4: val(pm4), pm10: val(pm10), nc05: val(nc05), nc1: val(nc1), nc25: val(nc25), nc4: val(nc4), nc10: val(nc10), tps: val(tps) };
  },
  wiring: (p) => [{ title: "Sensirion SPS30", pins: { sda: p.a, scl: p.b }, text: t("sensors.catalog.sps30.wiring", { sda: p.a, scl: p.b }) }],
};

// ---------------------------------------------------------------------------
// Indicatori di stato: mostrano da soli se Arduino è pronto e sta misurando
// ---------------------------------------------------------------------------
const outputBase = { rawFields: [] as string[], interval: { def: 0, min: 0 }, max: 1, output: true, since: "1.2", quantities: () => [] as QView[], parse: () => null };

const oled: SensorDef = {
  ...outputBase,
  type: "oled", title: t("sensors.catalog.oled.title"), short: "Display", measures: t("sensors.catalog.oled.measures"),
  description: t("sensors.catalog.oled.description"),
  icon: Monitor, tone: "sky", fw: "OLED",
  pins: [
    { key: "a", role: "SDA", kind: "digital", def: 18, bus: "sda", note: t("sensors.catalog.usuallyA4") },
    { key: "b", role: "SCL", kind: "digital", def: 19, bus: "scl", note: t("sensors.catalog.usuallyA5") },
  ],
  options: [],
  wiring: (p) => [{ title: t("sensors.catalog.oled.wiringTitle"), pins: { sda: p.a, scl: p.b }, text: t("sensors.catalog.oled.wiring", { sda: p.a, scl: p.b }) }],
};

const rgb: SensorDef = {
  ...outputBase,
  type: "rgb", title: t("sensors.catalog.rgb.title"), short: t("sensors.catalog.rgb.title"), measures: t("sensors.catalog.rgb.measures"),
  description: t("sensors.catalog.rgb.description"),
  icon: Lightbulb, tone: "rose", fw: "RGB",
  pins: [
    { key: "a", role: t("sensors.catalog.rgb.pinR"), kind: "digital", def: 9 },
    { key: "b", role: t("sensors.catalog.rgb.pinG"), kind: "digital", def: 10 },
    { key: "c", role: t("sensors.catalog.rgb.pinB"), kind: "digital", def: 11 },
  ],
  options: [{ key: "common", label: t("sensors.catalog.rgb.common"), type: "select", value: "cathode", options: [["cathode", t("sensors.catalog.rgb.cathode")], ["anode", t("sensors.catalog.rgb.anode")]] }],
  fwOpt: (o) => (o.common === "anode" ? 1 : 0),
  wiring: (p, o) => [{ title: t("sensors.catalog.rgb.title"), pins: { r: p.a, g: p.b, b: p.c }, text: t("sensors.catalog.rgb.wiring", { r: p.a, g: p.b, b: p.c, common: o.common === "anode" ? "5V" : "GND" }) }],
};

const buzzer: SensorDef = {
  ...outputBase,
  type: "buzzer", title: t("sensors.catalog.buzzer.title"), short: t("sensors.catalog.buzzer.short"), measures: t("sensors.catalog.buzzer.measures"),
  description: t("sensors.catalog.buzzer.description"),
  icon: BellRing, tone: "saffron", fw: "BUZ",
  pins: [{ key: "a", role: t("sensors.catalog.buzzer.pin"), kind: "digital", def: 8 }],
  options: [
    { key: "kind", label: t("sensors.catalog.buzzer.kind"), type: "select", value: "active", options: [["active", t("sensors.catalog.buzzer.active")], ["passive", t("sensors.catalog.buzzer.passive")]] },
    { key: "nag", label: t("sensors.catalog.buzzer.nag"), type: "select", value: "yes", options: [["yes", t("sensors.catalog.yes")], ["no", t("sensors.catalog.no")]] },
    { key: "confirm", label: t("sensors.catalog.buzzer.confirm"), type: "select", value: "yes", options: [["yes", t("sensors.catalog.yes")], ["no", t("sensors.catalog.no")]] },
  ],
  fwOpt: (o) => (o.kind === "passive" ? 1 : 0) | (o.nag !== "no" ? 2 : 0) | (o.confirm !== "no" ? 4 : 0),
  wiring: (p) => [{ title: t("sensors.catalog.buzzer.wiringTitle"), pins: { s: p.a }, text: t("sensors.catalog.buzzer.wiring", { pin: p.a }) }],
};

// ---------------------------------------------------------------------------
// Comandi e memoria: pulsante per avviare e fermare, scheda SD per misurare senza computer
// ---------------------------------------------------------------------------
const button: SensorDef = {
  ...outputBase, group: "control", since: "1.5",
  type: "button", title: t("sensors.catalog.button.title"), short: t("sensors.catalog.button.short"), measures: t("sensors.catalog.button.measures"),
  description: t("sensors.catalog.button.description"),
  icon: CircleDot, tone: "lime", fw: "BTN",
  pins: [{ key: "a", role: t("sensors.catalog.button.pin"), kind: "digital", def: 3, note: t("sensors.catalog.button.pinNote") }],
  options: [],
  wiring: (p) => [{ title: t("sensors.catalog.button.wiringTitle"), pins: { s: p.a }, text: t("sensors.catalog.button.wiring", { pin: p.a }) }],
};

const sd: SensorDef = {
  ...outputBase, group: "storage", since: "1.5",
  type: "sd", title: t("sensors.catalog.sd.title"), short: t("sensors.catalog.sd.short"), measures: t("sensors.catalog.sd.measures"),
  description: t("sensors.catalog.sd.description"),
  icon: MemoryStick, tone: "saffron", fw: "SD",
  pins: [
    // CS su D10: con la scheda SD D10 resta comunque riservato (su Arduino Uno l'SPI smette di
    // funzionare se D10 è un ingresso tirato a 0), quindi il CS sta lì
    { key: "a", role: "CS", kind: "digital", def: 10, fixed: true },
    { key: "b", role: "MOSI", kind: "digital", def: 11, fixed: true },
    { key: "c", role: "MISO", kind: "digital", def: 12, fixed: true },
    { key: "d", role: "SCK", kind: "digital", def: 13, fixed: true },
  ],
  options: [],
  // bit0: senza pulsante, registra appena Arduino si accende
  fwOpt: () => 1,
  wiring: (p) => [{ title: t("sensors.catalog.sd.wiringTitle"), pins: { cs: p.a }, text: t("sensors.catalog.sd.wiring") }],
};

// ---------------------------------------------------------------------------
// Bluetooth: un modulo sulla seriale (D0/D1), in parallelo al cavo USB. Arduino non lo comanda:
// è un componente per avere lo schema, i fili e la guida giusti, e per collegarsi senza cavo.
// ---------------------------------------------------------------------------
const btBase = {
  rawFields: [] as string[], interval: { def: 0, min: 0 }, max: 1, link: true, group: "comm" as const, fw: "BT" as const,
  quantities: () => [] as QView[], parse: () => null, options: [] as Param[],
  pins: [
    { key: "a" as const, role: "TXD → D0 (RX)", kind: "digital" as const, def: 0, fixed: true },
    { key: "b" as const, role: "RXD ← D1 (TX)", kind: "digital" as const, def: 1, fixed: true, note: t("sensors.catalog.bt.rxdNote") },
  ],
};
const hc06: SensorDef = {
  ...btBase,
  type: "hc06", title: t("sensors.catalog.hc06.title"), short: "HC-06", measures: t("sensors.catalog.hc06.measures"),
  description: t("sensors.catalog.hc06.description"),
  icon: Bluetooth, tone: "sky",
  wiring: () => [{ title: "Bluetooth HC-06", text: t("sensors.catalog.bt.wiring") }],
};
const ble: SensorDef = {
  ...btBase,
  type: "ble", title: "Bluetooth LE (HM-10, AT-09, HC-08)", short: "Bluetooth LE", measures: t("sensors.catalog.ble.measures"),
  description: t("sensors.catalog.ble.description"),
  icon: BluetoothSearching, tone: "sky",
  wiring: () => [{ title: "Bluetooth LE", text: t("sensors.catalog.bt.wiring") }],
};

// ---------------------------------------------------------------------------
// Sensori del telefono (senza Arduino): stesso protocollo, li legge PhoneLink
// ---------------------------------------------------------------------------
const pmotion: SensorDef = {
  rawFields: ["ax", "ay", "az", "gx", "gy", "gz"],
  type: "pmotion", title: t("sensors.catalog.pmotion.title"), short: t("sensors.catalog.pmotion.short"), measures: t("sensors.catalog.pmotion.measures"),
  description: t("sensors.catalog.pmotion.description"),
  icon: Smartphone, tone: "lime", fw: "PMOT", phone: true,
  pins: [], interval: { def: 20, min: 10 }, max: 1,
  options: [
    { key: "sign", label: t("sensors.catalog.pmotion.sign"), type: "select", value: "std", advanced: true,
      options: [["std", t("sensors.catalog.pmotion.std")], ["inv", t("sensors.catalog.pmotion.inv")]] },
  ],
  quantities: () => [
    { key: "ax", digits: 2, line: true, primary: true }, { key: "ay", digits: 2, line: true }, { key: "az", digits: 2, line: true, primary: true },
    { key: "am", digits: 2, line: true },
    { key: "gx", digits: 1, line: true }, { key: "gy", digits: 1, line: true }, { key: "gz", digits: 1, line: true },
  ],
  parse([ax, ay, az, gx, gy, gz], o) {
    if (![ax, ay, az].some(Number.isFinite)) return { t: 0, ax: NaN, ay: NaN, az: NaN, am: NaN, gx, gy, gz };
    const k = o.sign === "inv" ? -1 : 1;
    return { t: 0, ax: k * ax, ay: k * ay, az: k * az, am: Math.hypot(ax, ay, az), gx, gy, gz };
  },
  wiring: () => [
    { title: t("sensors.catalog.nothingToConnect"), text: t("sensors.catalog.pmotion.wiring") },
    { title: t("sensors.catalog.pmotion.axesTitle"), text: t("sensors.catalog.pmotion.axes") },
  ],
};
const psound: SensorDef = {
  rawFields: ["f_hz", "level_db"],
  type: "psound", title: t("sensors.catalog.psound.title"), short: t("sensors.catalog.psound.short"), measures: t("sensors.catalog.psound.measures"),
  description: t("sensors.catalog.psound.description"),
  icon: AudioLines, tone: "rose", fw: "PSND", phone: true,
  pins: [], interval: { def: 50, min: 30 }, max: 1,
  options: [],
  quantities: () => [{ key: "freq", digits: 1, primary: true }, { key: "level", digits: 1, line: true, primary: true }],
  parse([f, L]) { return { t: 0, freq: f, level: L }; },
  wiring: () => [{ title: t("sensors.catalog.nothingToConnect"), text: t("sensors.catalog.psound.wiring") }],
};

export const SENSORS: Record<SensorType, SensorDef> = { ntc, dht, sonar, gps, analog, ldr, ds18b20, gate, hx711, imu, mlx, sps30, oled, rgb, buzzer, button, sd, hc06, ble, pmotion, psound };
export const isPhoneType = (t: SensorType) => !!SENSORS[t].phone;
/** Tutti i componenti, nell'ordine del catalogo «Aggiungi un componente». */
export const COMPONENTS: SensorType[] = ["dht", "ntc", "ds18b20", "mlx", "sps30", "sonar", "imu", "gate", "gps", "ldr", "hx711", "analog", "button", "oled", "rgb", "buzzer", "sd", "hc06", "ble", "pmotion", "psound"];
export const OUTPUTS: SensorType[] = COMPONENTS.filter((t) => SENSORS[t].output);
/** Gruppo di un componente nel catalogo. */
export const groupOf = (t: SensorType): ComponentGroup => SENSORS[t].group ?? (SENSORS[t].phone ? "phone" : SENSORS[t].output ? "output" : "sensor");
/** Occupa uno dei 6 posti di Arduino (è un sensore vero)? */
export const isSlot = (t: SensorType) => !SENSORS[t].output && !SENSORS[t].link;
export const GROUPS: [ComponentGroup, string, string][] = [
  ["sensor", t("sensors.groups.sensor.name"), t("sensors.groups.sensor.hint")],
  ["control", t("sensors.groups.control.name"), t("sensors.groups.control.hint")],
  ["output", t("sensors.groups.output.name"), t("sensors.groups.output.hint")],
  ["storage", t("sensors.groups.storage.name"), t("sensors.groups.storage.hint")],
  ["comm", t("sensors.groups.comm.name"), t("sensors.groups.comm.hint")],
  ["phone", t("sensors.groups.phone.name"), t("sensors.groups.phone.hint")],
];

/** Categorie per filtrare il catalogo (un componente può stare in più categorie). */
/** Argomenti per filtrare i sensori (dentro il gruppo «Sensori»; un sensore può stare in più argomenti). */
export type ComponentTag = "temp" | "motion" | "light" | "force" | "place" | "volt" | "air";
export const TAGS: [ComponentTag, string][] = [
  ["temp", t("sensors.tags.temp")], ["motion", t("sensors.tags.motion")], ["light", t("sensors.tags.light")], ["force", t("sensors.tags.force")],
  ["place", t("sensors.tags.place")], ["volt", t("sensors.tags.volt")], ["air", t("sensors.tags.air")],
];
export const COMPONENT_TAGS: Record<SensorType, ComponentTag[]> = {
  dht: ["temp"], ntc: ["temp"], ds18b20: ["temp"], mlx: ["temp"], sps30: ["air"], sonar: ["motion", "place"], imu: ["motion", "force"], gate: ["motion", "light"],
  gps: ["place", "motion"], ldr: ["light"], hx711: ["force"], analog: ["volt"],
  oled: [], rgb: [], buzzer: [], button: [], sd: [], hc06: [], ble: [],
  pmotion: ["motion"], psound: [],
};
/** Parole in più per la ricerca (nomi comuni, sinonimi, kit). */
export const COMPONENT_KEYWORDS: Record<SensorType, string> = {
  pmotion: t("sensors.keywords.pmotion"),
  psound: t("sensors.keywords.psound"),
  dht: t("sensors.keywords.dht"),
  ntc: t("sensors.keywords.ntc"),
  ds18b20: t("sensors.keywords.ds18b20"),
  sonar: t("sensors.keywords.sonar"),
  mlx: t("sensors.keywords.mlx"),
  sps30: t("sensors.keywords.sps30"),
  imu: t("sensors.keywords.imu"),
  gate: t("sensors.keywords.gate"),
  gps: t("sensors.keywords.gps"),
  ldr: t("sensors.keywords.ldr"),
  hx711: t("sensors.keywords.hx711"),
  analog: t("sensors.keywords.analog"),
  oled: t("sensors.keywords.oled"),
  rgb: t("sensors.keywords.rgb"),
  buzzer: t("sensors.keywords.buzzer"),
  button: t("sensors.keywords.button"),
  sd: t("sensors.keywords.sd"),
  hc06: t("sensors.keywords.hc06"),
  ble: t("sensors.keywords.ble"),
};
export const isOutput = (t: SensorType) => !!SENSORS[t].output;
export const MAX_ARDUINO = 6;

export const defaultOptions = (type: SensorType): Options => Object.fromEntries(SENSORS[type].options.map((p) => [p.key, p.value]));
