// MosaicusNeo — catalogo dei sensori.
//
// Ogni sensore dichiara: i pin che usa (con il tipo: analogico o digitale), le opzioni, il ritmo
// di lettura, le grandezze che produce, come si converte la lettura grezza del firmware in
// grandezze fisiche (parse), le grandezze ricavate dalla serie completa (derive: velocità dal
// sonar, distanza percorsa dal GPS…) e lo schema dei collegamenti.
// Aggiungere un sensore = aggiungere una voce qui (e, se è di Arduino, un tipo nel firmware).

import type { LucideIcon } from "lucide-react";
import { Activity, BellRing, Droplets, Lightbulb, Monitor, Move3d, MoveHorizontal, Satellite, ScanLine, Sun, Thermometer, ThermometerSnowflake, Weight } from "lucide-react";
import { localPolyDerivs } from "@/lib/mosaicus/analysis.js";
import { nmeaToDeg, haversine, nmeaTime } from "@/lib/mosaicus/geo";
import type { Options, Param, Tone, WiringBlock } from "./types";

export type SensorType = "ntc" | "dht" | "sonar" | "gps" | "analog" | "ldr" | "ds18b20" | "gate" | "hx711" | "imu" | "oled" | "rgb" | "buzzer";
export type Rec = Record<string, number | boolean> & { t: number };

/** bus: i pin I2C si possono condividere tra più dispositivi I2C (display, MPU-6050) */
export interface PinSpec { key: "a" | "b" | "c"; role: string; kind: "analog" | "digital"; def: number; note?: string; bus?: "sda" | "scl" }
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
  fw: "NTC" | "ANA" | "DHT" | "SONAR" | "GPS" | "DS18" | "GATE" | "HX711" | "IMU" | "OLED" | "RGB" | "BUZ";
  /** indicatore di stato (display, LED, cicalino): non misura nulla e non occupa uno dei 6 posti */
  output?: boolean;
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
  type: "ntc", title: "Termistore NTC", short: "NTC", measures: "temperatura",
  description: "Resistenza che cambia con la temperatura, in un partitore con una resistenza fissa. Economico, veloce, da immergere.",
  icon: Thermometer, tone: "rose", fw: "NTC",
  pins: [{ key: "a", role: "uscita del partitore", kind: "analog", def: 14 }],
  interval: { def: 1000, min: 100 }, max: 6,
  options: [
    { key: "orientation", label: "Posizione del termistore nel partitore", type: "select", value: "ntc5v",
      options: [["ntc5v", "NTC tra 5 V e il pin (lezione Elegoo)"], ["ntcgnd", "NTC tra il pin e GND"]] },
    { key: "tAmb", label: "Temperatura ambiente Tₐ (per ln(T − Tₐ))", unit: "°C", value: 21, step: 0.1, advanced: true },
    { key: "rSeries", label: "Resistenza fissa del partitore", unit: "Ω", value: 10000, step: 100, advanced: true },
    { key: "r0", label: "R₀ del termistore (a T₀)", unit: "Ω", value: 10000, step: 100, advanced: true },
    { key: "t0", label: "T₀ di riferimento", unit: "°C", value: 25, step: 0.1, advanced: true },
    { key: "beta", label: "Coefficiente B (Beta)", unit: "K", value: 3950, step: 10, advanced: true },
    { key: "offset", label: "Correzione di taratura (si somma a T)", unit: "°C", value: 0, step: 0.1, advanced: true },
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
  wiring: (p) => [{ title: "Termistore NTC", schematic: "ntc", pins: { sig: p.a }, text: `Partitore con una resistenza da 10 kΩ: il punto di mezzo va su ${p.a}.` }],
};

const dht: SensorDef = {
  rawFields: ["byte0", "byte1", "byte2", "byte3", "error"],
  type: "dht", title: "DHT11 / DHT22", short: "DHT", measures: "temperatura e umidità",
  description: "Temperatura e umidità relativa in un solo sensore digitale. Lento (una lettura al secondo) ma preciso a sufficienza; ne ricava anche il punto di rugiada.",
  icon: Droplets, tone: "sky", fw: "DHT",
  pins: [{ key: "a", role: "DATA", kind: "digital", def: 2 }],
  interval: { def: 2000, min: 1000 }, max: 6,
  options: [
    { key: "model", label: "Modello", type: "select", value: "dht11",
      options: [["dht11", "DHT11 (blu, ±2 °C, ±5 %)"], ["dht22", "DHT22 / AM2302 (bianco, ±0,5 °C, ±2 %)"]] },
    { key: "offsetT", label: "Correzione di taratura della temperatura", unit: "°C", value: 0, step: 0.1, advanced: true },
    { key: "offsetRH", label: "Correzione di taratura dell'umidità", unit: "%", value: 0, step: 0.5, advanced: true },
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
  wiring: (p) => [{ title: "DHT11 / DHT22", schematic: "dht", pins: { data: p.a }, text: `DATA su ${p.a}, VCC a 5 V, GND a GND. Il modulo a 3 pin ha già il pull-up; il sensore "nudo" a 4 pin vuole anche 10 kΩ tra DATA e 5 V.` }],
};

const sonar: SensorDef = {
  rawFields: ["echo_us"],
  type: "sonar", title: "Ultrasuoni HC-SR04", short: "HC-SR04", measures: "posizione, velocità, accelerazione",
  description: "Misura la distanza dal tempo di volo di un impulso di ultrasuoni (2 cm – 4 m). Da qui posizione, velocità e accelerazione.",
  icon: MoveHorizontal, tone: "sky", fw: "SONAR",
  pins: [{ key: "a", role: "TRIG", kind: "digital", def: 12 }, { key: "b", role: "ECHO", kind: "digital", def: 11 }],
  interval: { def: 50, min: 30 }, max: 3,
  options: [
    { key: "tAir", label: "Temperatura dell'aria (velocità del suono)", unit: "°C", value: 20, step: 0.5 },
    { key: "direction", label: "Verso positivo", type: "select", value: "away",
      options: [["away", "Allontanamento dal sensore"], ["toward", "Avvicinamento al sensore"]] },
    { key: "window", label: "Lisciatura per v e a (punti per lato)", value: 4, min: 1, step: 1, advanced: true },
    { key: "origin", label: "Origine delle posizioni (distanza dal sensore)", unit: "m", value: 0, step: 0.001, advanced: true },
    { key: "dMin", label: "Distanza minima accettata", unit: "m", value: 0.03, step: 0.01, advanced: true },
    { key: "dMax", label: "Distanza massima accettata", unit: "m", value: 3.0, step: 0.1, advanced: true },
    { key: "spike", label: "Scarta salti anomali maggiori di", unit: "m", value: 0.10, step: 0.01, advanced: true },
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
  wiring: (p) => [{ title: "HC-SR04", schematic: "hcsr04", pins: { trig: p.a, echo: p.b }, text: "Bersaglio piatto e ampio. Più sensori a ultrasuoni insieme possono disturbarsi: puntali in direzioni diverse." }],
};

const gps: SensorDef = {
  rawFields: ["fix", "lat_nmea", "lon_nmea", "alt_m", "sats", "hdop", "speed_knots", "utc_hhmmss", "date_ddmmyy"],
  type: "gps", title: "GPS (NEO-6M / NEO-7M)", short: "GPS", measures: "posizione, altitudine, velocità",
  description: "Modulo GPS seriale, come il Velleman VMA430 / Whadda WPI430 (u-blox NEO-7M, 9600 baud). All'aperto, con il cielo libero.",
  icon: Satellite, tone: "lime", fw: "GPS",
  pins: [{ key: "a", role: "RX di Arduino ← TX del GPS", kind: "digital", def: 4 }, { key: "b", role: "TX di Arduino → RX del GPS", kind: "digital", def: 3, note: "facoltativo da collegare, ma il pin resta occupato" }],
  interval: { def: 2000, min: 1000 }, max: 1,
  options: [
    { key: "minSats", label: "Satelliti minimi per accettare una posizione", value: 4, min: 3, step: 1, advanced: true },
    { key: "maxHdop", label: "HDOP massimo accettato (più basso = più preciso)", value: 5, min: 1, step: 0.5, advanced: true },
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
  wiring: (p) => [{ title: "GPS", schematic: "gps", pins: { rx: p.a, tx: p.b }, text: "Antenna con la faccia di ceramica verso il cielo. Il primo fix all'aperto richiede da 30 s a qualche minuto: il LED del modulo lampeggia quando ha la posizione." }],
};

const analog: SensorDef = {
  rawFields: ["adc"],
  type: "analog", title: "Tensione analogica", short: "Analogico", measures: "tensione (0–5 V) o una grandezza tarata",
  description: "Qualunque segnale tra 0 e 5 V: potenziometro, sensore di pressione o di forza, uscita analogica di un modulo. Con la taratura lineare diventa la grandezza che vuoi.",
  icon: Activity, tone: "saffron", fw: "ANA",
  pins: [{ key: "a", role: "segnale (0–5 V)", kind: "analog", def: 15 }],
  interval: { def: 100, min: 10 }, max: 6,
  options: [
    { key: "calibrate", label: "Taratura lineare y = k·V + q", type: "select", value: "no", options: [["no", "No: mostra la tensione"], ["yes", "Sì"]] },
    { key: "sym", label: "Simbolo della grandezza tarata", type: "text", value: "y" },
    { key: "unit", label: "Unità della grandezza tarata", type: "text", value: "" },
    { key: "k", label: "Coefficiente k", value: 1, step: 0.001 },
    { key: "q", label: "Termine noto q", value: 0, step: 0.001 },
    { key: "vref", label: "Tensione di riferimento", unit: "V", value: 5, step: 0.01, advanced: true },
  ],
  quantities: (o) => [
    { key: "V", digits: 3, line: true, primary: o.calibrate !== "yes" },
    ...(o.calibrate === "yes" ? [{ key: "Y", digits: 3, line: true, primary: true, sym: String(o.sym || "y"), unit: String(o.unit || ""), name: `${o.sym || "y"} (tarata)` }] : []),
    { key: "adc", digits: 1, raw: true },
  ],
  parse([adc], o) {
    if (!Number.isFinite(adc)) return null;
    const V = (adc * num(o.vref)) / 1023;
    return { t: 0, adc, V, Y: o.calibrate === "yes" ? num(o.k) * V + num(o.q) : NaN };
  },
  wiring: (p) => [{ title: "Segnale analogico", schematic: "analog", pins: { sig: p.a }, warn: true, text: `Segnale su ${p.a} e GND in comune con Arduino. Solo tra 0 e 5 V: mai tensioni più alte né la rete elettrica.` }],
};

const ldr: SensorDef = {
  rawFields: ["adc"],
  type: "ldr", title: "Fotoresistenza (luce)", short: "LDR", measures: "luminosità relativa",
  description: "Una fotoresistenza in partitore: più luce, meno resistenza. Dà una luminosità relativa (0–100 %), utile per ombre, lampade, sfarfallio.",
  icon: Sun, tone: "saffron", fw: "ANA",
  pins: [{ key: "a", role: "uscita del partitore", kind: "analog", def: 16 }],
  interval: { def: 100, min: 10 }, max: 6,
  options: [
    { key: "orientation", label: "Posizione della fotoresistenza", type: "select", value: "ldr5v",
      options: [["ldr5v", "Tra 5 V e il pin (più luce = valore più alto)"], ["ldrgnd", "Tra il pin e GND"]] },
  ],
  quantities: () => [{ key: "light", digits: 1, line: true, primary: true }, { key: "adc", digits: 1, raw: true }],
  parse([adc], o) {
    if (!Number.isFinite(adc)) return null;
    const u = adc / 1023;
    return { t: 0, adc, light: 100 * (o.orientation === "ldrgnd" ? 1 - u : u) };
  },
  wiring: (p) => [{ title: "Fotoresistenza", schematic: "ldr", pins: { sig: p.a }, text: `Fotoresistenza tra 5 V e ${p.a}, resistenza da 10 kΩ tra ${p.a} e GND.` }],
};


const ds18b20: SensorDef = {
  rawFields: ["raw_16th_C", "error"],
  type: "ds18b20", title: "Sonda DS18B20", short: "DS18B20", measures: "temperatura (anche in acqua)",
  description: "Termometro digitale, spesso in una sonda d'acciaio impermeabile: si immerge in acqua, nel ghiaccio, nel terreno. Precisione ±0,5 °C, da −55 a 125 °C, nessuna taratura.",
  icon: ThermometerSnowflake, tone: "sky", fw: "DS18", since: "1.2",
  pins: [{ key: "a", role: "DATA", kind: "digital", def: 7, note: "Con una resistenza da 4,7 kΩ tra DATA e 5V." }],
  interval: { def: 1000, min: 1000 }, max: 3,
  options: [{ key: "offset", label: "Correzione di taratura (si somma)", unit: "°C", value: 0, step: 0.1, advanced: true }],
  quantities: () => [{ key: "T", digits: 2, line: true, primary: true }, { key: "ds", digits: 0, raw: true, hidden: true }],
  parse([raw, err]) {
    const ok = err === 0 && Number.isFinite(raw);
    return { t: 0, ds: raw, ok, T: ok ? raw / 16 : NaN };
  },
  derive(recs, o) { for (const r of recs) if (r.ok) r.T = (r.T as number) + num(o.offset); },
  wiring: (p) => [{ title: "DS18B20", schematic: "dht", pins: { data: p.a }, text: `Rosso a 5V, nero a GND, giallo (DATA) su ${p.a}. Una resistenza da 4,7 kΩ tra DATA e 5V (le schedine con morsetti ce l'hanno già).` }],
};

const gate: SensorDef = {
  rawFields: ["state"],
  type: "gate", title: "Fotocellula / ingresso digitale", short: "Fotocellula", measures: "istanti di passaggio, periodo, tempo di oscuramento",
  description: "Una fotocellula a forcella (o a barriera) segna l'istante esatto in cui un oggetto interrompe il raggio: periodo di un pendolo, velocità di un carrello che passa, caduta libera con due fotocellule. Va bene anche un pulsante o un sensore di presenza.",
  icon: ScanLine, tone: "rose", fw: "GATE", since: "1.2", events: true,
  pins: [{ key: "a", role: "OUT", kind: "digital", def: 2, note: "Su D2 o D3 gli istanti sono precisi al µs; sugli altri pin al ms." }],
  interval: { def: 1000, min: 1000 }, max: 2,
  options: [
    { key: "blocked", label: "Quando il raggio è interrotto, l'uscita è", type: "select", value: "high", options: [["high", "alta (5 V) · la maggior parte dei moduli"], ["low", "bassa (0 V)"]] },
    { key: "pullup", label: "Resistenza di pull-up interna", type: "select", value: "no", options: [["no", "no (modulo con uscita propria)"], ["yes", "sì (pulsante, uscita a collettore aperto)"]], advanced: true },
    { key: "width", label: "Larghezza dell'oggetto che passa (per la velocità)", unit: "mm", value: 20, min: 0, step: 1 },
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
  wiring: (p) => [{ title: "Fotocellula", pins: { out: p.a }, text: `VCC a 5V, GND a GND, OUT (o D0 del modulo) su ${p.a}.` }],
};

const hx711: SensorDef = {
  rawFields: ["counts", "error"],
  type: "hx711", title: "Cella di carico + HX711", short: "Bilancia", measures: "massa e forza",
  description: "Una cella di carico (la barretta d'alluminio delle bilance) con l'amplificatore HX711: misura masse e forze, fino a 10 volte al secondo. Si tara con un peso noto.",
  icon: Weight, tone: "saffron", fw: "HX711", since: "1.2",
  pins: [{ key: "a", role: "DT", kind: "digital", def: 5 }, { key: "b", role: "SCK", kind: "digital", def: 6 }],
  interval: { def: 100, min: 100 }, max: 2,
  options: [
    { key: "scale", label: "Taratura: conteggi per grammo", value: 420, step: 0.1 },
    { key: "autotare", label: "Azzera all'avvio (tara)", type: "select", value: "yes", options: [["yes", "sì: il peso iniziale vale 0"], ["no", "no: uso la tara qui sotto"]] },
    { key: "tare", label: "Tara (conteggi a vuoto)", value: 0, step: 1, advanced: true },
    { key: "g", label: "Accelerazione di gravità (per la forza)", unit: "m/s²", value: 9.81, step: 0.01, advanced: true },
    { key: "sign", label: "Verso", type: "select", value: "1", options: [["1", "spingere = positivo"], ["-1", "tirare = positivo"]], advanced: true },
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
  wiring: (p) => [{ title: "HX711", pins: { dt: p.a, sck: p.b }, text: `Cella: rosso E+, nero E−, bianco A−, verde A+ sull'HX711. HX711: VCC 5V, GND, DT su ${p.a}, SCK su ${p.b}.` }],
};

const IMU_RANGE: Record<string, number> = { "2": 0, "4": 1, "8": 2, "16": 3 };
const imu: SensorDef = {
  rawFields: ["ax_raw", "ay_raw", "az_raw", "gx_raw", "gy_raw", "gz_raw", "error"],
  type: "imu", title: "Accelerometro MPU-6050", short: "MPU-6050", measures: "accelerazione sui 3 assi, rotazione",
  description: "Accelerometro e giroscopio a 3 assi (modulo GY-521): accelerazione di un carrello, oscillazioni, inclinazione, rotazione. Fino a 100 letture al secondo. Usa due fili I2C, condivisibili con il display.",
  icon: Move3d, tone: "lime", fw: "IMU", since: "1.2",
  pins: [
    { key: "a", role: "SDA", kind: "digital", def: 18, bus: "sda", note: "Di solito A4 (anche il display può stare qui)." },
    { key: "b", role: "SCL", kind: "digital", def: 19, bus: "scl", note: "Di solito A5." },
  ],
  interval: { def: 20, min: 10 }, max: 2,
  options: [
    { key: "range", label: "Fondo scala", type: "select", value: "2", options: [["2", "±2 g (più preciso)"], ["4", "±4 g"], ["8", "±8 g"], ["16", "±16 g (urti)"]] },
    { key: "addr", label: "Indirizzo", type: "select", value: "68", options: [["68", "0x68 (AD0 a GND o libero)"], ["69", "0x69 (AD0 a 5V)"]], advanced: true },
    { key: "gravity", label: "Togli la gravità dall'asse verticale", type: "select", value: "no", options: [["no", "no"], ["z", "sì, asse z verticale"]], advanced: true },
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
  wiring: (p) => [{ title: "MPU-6050 (GY-521)", pins: { sda: p.a, scl: p.b }, text: `VCC a 5V, GND a GND, SDA su ${p.a}, SCL su ${p.b}.` }],
};

// ---------------------------------------------------------------------------
// Indicatori di stato: mostrano da soli se Arduino è pronto e sta misurando
// ---------------------------------------------------------------------------
const outputBase = { rawFields: [] as string[], interval: { def: 0, min: 0 }, max: 1, output: true, since: "1.2", quantities: () => [] as QView[], parse: () => null };

const oled: SensorDef = {
  ...outputBase,
  type: "oled", title: "Display OLED 64×32 (0,49\")", short: "Display", measures: "stato e valori, scritti chiari",
  description: "Il piccolo display I2C da 0,49 pollici (SSD1306, 64×32 pixel, 4 pin). Mostra in che stato è Arduino (in attesa dell'app, GPS in ricerca, problema a un sensore, misura in corso con il tempo) e, durante la misura, il valore principale.",
  icon: Monitor, tone: "sky", fw: "OLED",
  pins: [
    { key: "a", role: "SDA", kind: "digital", def: 18, bus: "sda", note: "Di solito A4." },
    { key: "b", role: "SCL", kind: "digital", def: 19, bus: "scl", note: "Di solito A5." },
  ],
  options: [],
  wiring: (p) => [{ title: "Display OLED", pins: { sda: p.a, scl: p.b }, text: `VCC (o VDD) a 5V, GND a GND, SDA su ${p.a}, SCL su ${p.b}.` }],
};

const rgb: SensorDef = {
  ...outputBase,
  type: "rgb", title: "LED RGB", short: "LED RGB", measures: "stato a colori",
  description: "Un LED a tre colori: blu = in attesa dell'app (lampeggia) o pronto; giallo lampeggiante = GPS o sensore in ricerca; rosso lampeggiante = problema; verde = sta misurando e tutto va bene.",
  icon: Lightbulb, tone: "rose", fw: "RGB",
  pins: [
    { key: "a", role: "R (rosso)", kind: "digital", def: 9 },
    { key: "b", role: "G (verde)", kind: "digital", def: 10 },
    { key: "c", role: "B (blu)", kind: "digital", def: 11 },
  ],
  options: [{ key: "common", label: "Tipo di LED", type: "select", value: "cathode", options: [["cathode", "catodo comune (piedino lungo a GND)"], ["anode", "anodo comune (piedino lungo a 5V)"]] }],
  fwOpt: (o) => (o.common === "anode" ? 1 : 0),
  wiring: (p, o) => [{ title: "LED RGB", pins: { r: p.a, g: p.b, b: p.c }, text: `Ogni colore con una resistenza da 220 Ω: R su ${p.a}, G su ${p.b}, B su ${p.c}; il piedino lungo a ${o.common === "anode" ? "5V" : "GND"}.` }],
};

const buzzer: SensorDef = {
  ...outputBase,
  type: "buzzer", title: "Cicalino (buzzer)", short: "Cicalino", measures: "bip finché non è tutto pronto",
  description: "Suona un bip ogni 3 secondi finché qualcosa non è pronto (1 bip = in attesa dell'app o fermo, 2 = GPS o sensore in ricerca, 3 = problema): quando smette, Arduino sta misurando e tutto va bene. Utile all'aperto, con il telefono in tasca.",
  icon: BellRing, tone: "saffron", fw: "BUZ",
  pins: [{ key: "a", role: "+ (segnale)", kind: "digital", def: 8 }],
  options: [
    { key: "kind", label: "Tipo", type: "select", value: "active", options: [["active", "attivo (suona da solo con 5 V)"], ["passive", "passivo (serve una nota)"]] },
    { key: "nag", label: "Bip finché non è tutto pronto", type: "select", value: "yes", options: [["yes", "sì"], ["no", "no"]] },
    { key: "confirm", label: "Bip di conferma all'avvio e alla fine", type: "select", value: "yes", options: [["yes", "sì"], ["no", "no"]] },
  ],
  fwOpt: (o) => (o.kind === "passive" ? 1 : 0) | (o.nag !== "no" ? 2 : 0) | (o.confirm !== "no" ? 4 : 0),
  wiring: (p) => [{ title: "Cicalino", pins: { s: p.a }, text: `Piedino + (il più lungo, o «S») su ${p.a}, − a GND.` }],
};

export const SENSORS: Record<SensorType, SensorDef> = { ntc, dht, sonar, gps, analog, ldr, ds18b20, gate, hx711, imu, oled, rgb, buzzer };
/** Tutti i componenti, nell'ordine del catalogo «Aggiungi un componente». */
export const COMPONENTS: SensorType[] = ["dht", "ntc", "ds18b20", "sonar", "imu", "gate", "gps", "ldr", "hx711", "analog", "oled", "rgb", "buzzer"];
export const OUTPUTS: SensorType[] = COMPONENTS.filter((t) => SENSORS[t].output);

/** Categorie per filtrare il catalogo (un componente può stare in più categorie). */
export type ComponentTag = "temp" | "motion" | "light" | "force" | "place" | "volt" | "status";
export const TAGS: [ComponentTag, string][] = [
  ["temp", "Temperatura e clima"], ["motion", "Movimento e tempo"], ["light", "Luce"], ["force", "Forza e massa"],
  ["place", "Posizione"], ["volt", "Tensione"], ["status", "Display, LED, suoni"],
];
export const COMPONENT_TAGS: Record<SensorType, ComponentTag[]> = {
  dht: ["temp"], ntc: ["temp"], ds18b20: ["temp"], sonar: ["motion", "place"], imu: ["motion", "force"], gate: ["motion", "light"],
  gps: ["place", "motion"], ldr: ["light"], hx711: ["force"], analog: ["volt"], oled: ["status"], rgb: ["status", "light"], buzzer: ["status"],
};
/** Parole in più per la ricerca (nomi comuni, sinonimi, kit). */
export const COMPONENT_KEYWORDS: Record<SensorType, string> = {
  dht: "umidità rugiada aria meteo clima dht11 dht22 am2302",
  ntc: "termistore termometro calore raffreddamento newton resistenza",
  ds18b20: "sonda impermeabile acqua liquido termometro onewire",
  sonar: "ultrasuoni distanza sonar carrello caduta moto velocità accelerazione hcsr04 hc-sr04",
  imu: "accelerometro giroscopio inclinazione vibrazioni urti oscillazioni gy521 gy-521 mpu6050",
  gate: "fotocellula fotoporta pendolo periodo cronometro forcella infrarossi pulsante interruttore",
  gps: "satelliti mappa percorso altitudine passeggiata neo6m neo-6m neo7m",
  ldr: "fotoresistenza luminosità buio lampada fotocellula",
  hx711: "bilancia peso cella di carico newton dinamometro",
  analog: "potenziometro voltmetro tensione segnale generico pila",
  oled: "schermo display ssd1306 stato scritte",
  rgb: "led colori luce stato semaforo",
  buzzer: "cicalino suono beep allarme avviso",
};
export const isOutput = (t: SensorType) => !!SENSORS[t].output;
export const MAX_ARDUINO = 6;

export const defaultOptions = (type: SensorType): Options => Object.fromEntries(SENSORS[type].options.map((p) => [p.key, p.value]));
