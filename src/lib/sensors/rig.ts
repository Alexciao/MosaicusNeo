// MosaicusNeo — il "montaggio": quali sensori, su quali pin, con quali opzioni e a che ritmo.
//
// • resolveRig: assegna a ogni grandezza una chiave unica nel montaggio (T, T_2…) e lo slot del
//   firmware a ogni sensore di Arduino.
// • validateRig: pin doppi, pin analogici, limiti (6 sensori, un GPS…), con messaggi in italiano.
// • firmwareCommands: i comandi CFG da mandare ad Arduino prima di START.
// • buildRows: dalle letture grezze [codice, t_ms, valori…] alle righe con le grandezze fisiche.
//   Ogni sensore ha il suo ritmo: una riga contiene solo le grandezze del sensore che l'ha
//   prodotta (_s), le altre restano vuote. alignRows/nearest servono quando bisogna metterle
//   insieme (mappa, Elaborazione).

import { cmpVersion } from "@/lib/version";
import { t } from "@/i18n";
import { SENSORS, MAX_ARDUINO, pinName, pinsFor, defaultOptions, isSlot, type Rec, type SensorType } from "./catalog";
import { QUANTITIES, symOf } from "./quantities";
import type { Options, Row } from "./types";

export interface SensorInstance {
  id: string;
  type: SensorType;
  label?: string;
  pins: Record<string, number>;
  options: Options;
  interval: number;
}
export interface Rig { id: string; name: string; sensors: SensorInstance[] }

export interface ResolvedQuantity {
  key: string;          // chiave nel montaggio (T, T_2…)
  base: string;         // chiave nel sensore (T)
  sensorId: string;
  sym: string;
  name: string;
  unit: string;
  digits: number;
  raw: boolean;
  line: boolean;
  hidden: boolean;
  primary: boolean;
}
export interface Resolved {
  quantities: ResolvedQuantity[];
  keyOf: Map<string, Map<string, string>>;    // sensore → (chiave base → chiave nel montaggio)
  code: Map<string, number>;                 // sensore → codice nei dati grezzi
  byCode: Map<number, SensorInstance>;
  arduino: SensorInstance[];
}

export const newId = () => Math.random().toString(36).slice(2, 9);
export const sensorLabel = (s: SensorInstance) => s.label?.trim() || SENSORS[s.type].short;

export function makeSensor(type: SensorType, taken: Set<number> = new Set(), extra: Partial<SensorInstance> = {}): SensorInstance {
  const def = SENSORS[type];
  const pins: Record<string, number> = {};
  for (const spec of def.pins) {
    // i pin I2C si condividono: il display e l'accelerometro stanno tutti e due su A4/A5
    const free = spec.bus || spec.fixed ? spec.def : [spec.def, ...pinsFor(spec.kind)].find((p) => !taken.has(p) && !Object.values(pins).includes(p));
    pins[spec.key] = free ?? spec.def;
    taken.add(pins[spec.key]);
  }
  return { id: newId(), type, pins, options: defaultOptions(type), interval: def.interval.def, ...extra, ...(extra.options ? { options: { ...defaultOptions(type), ...extra.options } } : {}) };
}

// ---------------------------------------------------------------------------
// Aggiungere un componente senza conflitti di pin
// ---------------------------------------------------------------------------
/** Dispositivi che possono stare sullo stesso filo I2C: un foro per Arduino e quattro per i moduli
 *  nella colonna del bus sulla breadboard (una colonna ha 5 fori collegati, a–e). */
export const MAX_ON_BUS = 4;

export interface PinMove { sensor: SensorInstance; role: string; from: number; to: number }
/** Indirizzo I2C (esadecimale) dei dispositivi I2C; null per gli altri. */
export function i2cAddr(s: SensorInstance): string | null {
  switch (s.type) {
    case "oled": return "3C";
    case "mlx": return "5A";
    case "sps30": return "69";              // fisso: non si può cambiare
    case "imu": return String(s.options.addr ?? "68");
    default: return null;
  }
}
/** Dispositivi I2C sullo stesso bus (stesso pin SDA). */
const busMates = (list: SensorInstance[], sda: number) => list.filter((o) => i2cAddr(o) && o.pins.a === sda);
export type AddPlan =
  | { ok: true; sensor: SensorInstance; sensors: SensorInstance[]; moved: PinMove[]; readdressed: SensorInstance[] }
  | { ok: false; error: string };

/**
 * Prepara l'aggiunta di un componente in modo che il circuito si possa montare davvero:
 * • i pin obbligati (SPI della scheda SD, seriale del Bluetooth) e quelli del bus I2C vengono
 *   liberati spostando su un altro pin i componenti che li occupavano;
 * • il secondo MPU-6050 prende l'indirizzo 0x69 (AD0 a 3,3 V), altrimenti i due si sovrappongono;
 * • se non resta nessun pin libero, o il bus I2C è pieno, l'aggiunta non si fa e si dice perché.
 */
export function planAdd(current: SensorInstance[], type: SensorType, extra: Partial<SensorInstance> = {}): AddPlan {
  const def = SENSORS[type];
  const sensors = current.map((s) => ({ ...s, pins: { ...s.pins }, options: { ...s.options } }));
  const base = makeSensor(type, new Set(), extra);
  const sensor: SensorInstance = { ...base, pins: { ...base.pins }, options: { ...base.options } };
  const moved: PinMove[] = [];
  const fail = (error: string): AddPlan => ({ ok: false, error });

  // chi occupa ogni pin (escluso il nuovo componente)
  type Use = { s: SensorInstance; key: string; role: string; bus?: "sda" | "scl"; fixed?: boolean; kind: "analog" | "digital" };
  const owners = () => {
    const m = new Map<number, Use[]>();
    for (const s of sensors) for (const spec of SENSORS[s.type].pins) {
      const p = spec.fixed ? spec.def : s.pins[spec.key];
      m.set(p, [...(m.get(p) ?? []), { s, key: spec.key, role: spec.role, bus: spec.bus, fixed: spec.fixed, kind: spec.kind }]);
    }
    return m;
  };

  // 1. pin obbligati e bus I2C del nuovo componente
  const reserved = new Map<number, "sda" | "scl" | "fixed">();
  for (const spec of def.pins) {
    if (!spec.fixed && !spec.bus) continue;
    let p = spec.def;
    if (spec.bus) {
      // se il bus c'è già (anche su pin scelti a mano), il nuovo dispositivo si aggiunge lì
      const on = sensors.flatMap((s) => SENSORS[s.type].pins.filter((q) => q.bus === spec.bus).map((q) => s.pins[q.key]));
      if (on.length) p = on[0];
      const n = on.filter((x) => x === p).length;
      if (n + 1 > MAX_ON_BUS) return fail(t("sensors.rig.busFull", { pin: pinName(p), role: spec.role, max: MAX_ON_BUS }));
    }
    sensor.pins[spec.key] = p;
    reserved.set(p, spec.bus ?? "fixed");
  }
  // chi sta su quei pin e non può condividerli va spostato
  const toMove: Use[] = [];
  for (const [p, what] of reserved) {
    for (const u of owners().get(p) ?? []) {
      if (u.bus && u.bus === what) continue;                     // stesso filo I2C: si condivide
      if (u.fixed || u.bus) {
        const who = `${sensorLabel(u.s)} · ${u.role}`;
        return fail(t("sensors.rig.pinLocked", { pin: pinName(p), sensor: def.title, other: who }));
      }
      toMove.push(u);
    }
  }

  // 2. pin liberi: prima quelli solo digitali, così gli ingressi analogici restano per i sensori analogici
  const pending = new Set<string>(toMove.map((u) => `${u.s.id}:${u.key}`));
  const taken = () => {
    const s = new Set<number>(reserved.keys());
    for (const [p, us] of owners()) if (!us.every((u) => pending.has(`${u.s.id}:${u.key}`))) s.add(p);
    for (const spec of def.pins) if (!spec.fixed && !spec.bus && sensor.pins[spec.key] != null && assigned.has(spec.key)) s.add(sensor.pins[spec.key]);
    return s;
  };
  const assigned = new Set<string>();
  const noPin = (kind: "analog" | "digital", who: string, role: string) => {
    const busOn = [...reserved].length || sensors.some((s) => SENSORS[s.type].pins.some((q) => q.bus));
    return t("sensors.rig.noFreePin", { kind, sensor: who, role, i2c: busOn && kind === "analog" ? "yes" : "no" });
  };
  for (const spec of def.pins) {
    if (spec.fixed || spec.bus) continue;
    const busy = taken();
    const p = [spec.def, ...pinsFor(spec.kind)].find((x) => !busy.has(x) && pinsFor(spec.kind).includes(x));
    if (p == null) return fail(noPin(spec.kind, def.title, spec.role));
    sensor.pins[spec.key] = p;
    assigned.add(spec.key);
  }
  for (const u of toMove) {
    const busy = taken();
    const p = pinsFor(u.kind).find((x) => !busy.has(x));
    if (p == null) return fail(t("sensors.rig.cantMove", { sensor: def.title, other: `${sensorLabel(u.s)} · ${u.role}`, pin: pinName(u.s.pins[u.key]) }));
    moved.push({ sensor: u.s, role: u.role, from: u.s.pins[u.key], to: p });
    u.s.pins[u.key] = p;
    pending.delete(`${u.s.id}:${u.key}`);
  }

  // 3. indirizzi I2C: sullo stesso bus ogni dispositivo deve avere il suo. L'MPU-6050 ne ha due
  //    (AD0 libero 0x68, AD0 a 3,3 V 0x69); l'SPS30 ha solo 0x69, il display 0x3C, l'MLX90614 0x5A.
  const readdressed: SensorInstance[] = [];
  const mates = i2cAddr(sensor) ? busMates(sensors, sensor.pins.a) : [];
  const usedBy = (addr: string) => mates.find((o) => i2cAddr(o) === addr);
  if (type === "imu") {
    const free = ["68", "69"].find((a) => !usedBy(a));
    if (!free) return fail(t("sensors.rig.imuNoAddr", { list: mates.filter((o) => o.type === "imu" || o.type === "sps30").map(sensorLabel).join(", ") }));
    sensor.options = { ...sensor.options, addr: free };
  } else if (i2cAddr(sensor)) {
    const clash = usedBy(i2cAddr(sensor)!);
    if (clash) {
      // un MPU-6050 sull'indirizzo che serve si sposta sull'altro, se è libero
      const other = clash.type === "imu" ? (i2cAddr(clash) === "68" ? "69" : "68") : null;
      if (!other || usedBy(other)) return fail(t("sensors.rig.addrTaken", { sensor: def.title, addr: i2cAddr(sensor)!, other: sensorLabel(clash) }));
      clash.options = { ...clash.options, addr: other };
      readdressed.push(clash);
    }
  }
  return { ok: true, sensor, sensors: [...sensors, sensor], moved, readdressed };
}

export function usedPins(rig: Rig, except?: string) {
  const m = new Map<number, { sensor: SensorInstance; role: string; bus?: "sda" | "scl" }>();
  for (const s of rig.sensors) {
    if (s.id === except) continue;
    for (const spec of SENSORS[s.type].pins) m.set(s.pins[spec.key], { sensor: s, role: spec.role, bus: spec.bus });
  }
  return m;
}
/** Sensori veri (esclusi gli indicatori di stato). */
export const inputsOf = (rig: Rig) => rig.sensors.filter((s) => isSlot(s.type));
export const outputsOf = (rig: Rig) => rig.sensors.filter((s) => SENSORS[s.type].output);
/** Indicatori di stato veri e propri: display, LED RGB, cicalino. */
export const indicatorsOf = (rig: Rig) => rig.sensors.filter((s) => s.type === "oled" || s.type === "rgb" || s.type === "buzzer");
/** Modulo Bluetooth del progetto (componente HC-06 o BLE), se c'è. */
export const btOf = (rig: Rig | SensorInstance[]): "hc06" | "ble" | null => {
  const list = Array.isArray(rig) ? rig : rig.sensors;
  return (list.find((s) => s.type === "hc06" || s.type === "ble")?.type as "hc06" | "ble" | undefined) ?? null;
};
export const hasSd = (rig: Rig) => rig.sensors.some((s) => s.type === "sd");
/** Sensori del telefono e componenti di Arduino (questi ultimi comprendono display, LED e cicalino). */
export const phoneOf = (rig: Rig) => rig.sensors.filter((s) => SENSORS[s.type].phone);
export const arduinoOf = (rig: Rig) => rig.sensors.filter((s) => !SENSORS[s.type].phone);
/** Progetto che usa solo i sensori del telefono: niente Arduino, niente schema dei collegamenti. */
export const isPhoneRig = (rig: Rig) => rig.sensors.length > 0 && rig.sensors.every((s) => SENSORS[s.type].phone);
/** Versione minima del firmware per questo montaggio. */
export function firmwareNeeded(rig: Rig) {
  return rig.sensors.reduce((need, s) => {
    const since = SENSORS[s.type].since;
    return since && cmpVersion(since, need) > 0 ? since : need;
  }, "1.1");
}

export function resolveRig(rig: Rig): Resolved {
  const quantities: ResolvedQuantity[] = [];
  const keyOf = new Map<string, Map<string, string>>();
  const used = new Set<string>(["t"]);
  const code = new Map<string, number>(), byCode = new Map<number, SensorInstance>();
  const arduino: SensorInstance[] = [];
  for (const s of rig.sensors) {
    const def = SENSORS[s.type];
    if (!isSlot(s.type)) continue;
    code.set(s.id, arduino.length); byCode.set(arduino.length, s); arduino.push(s);
    const map = new Map<string, string>();
    for (const q of def.quantities(s.options)) {
      let key = q.key, n = 2;
      while (used.has(key)) key = `${q.key}_${n++}`;
      used.add(key);
      map.set(q.key, key);
      const info = QUANTITIES[q.key];
      quantities.push({
        key, base: q.key, sensorId: s.id,
        sym: symOf(key, q.sym ?? info?.sym), name: q.name ?? info?.name ?? q.key, unit: q.unit ?? info?.unit ?? "",
        digits: q.digits, raw: !!(q.raw ?? info?.raw), line: !!q.line, hidden: !!q.hidden, primary: !!q.primary,
      });
    }
    keyOf.set(s.id, map);
  }
  return { quantities, keyOf, code, byCode, arduino };
}

// ---------------------------------------------------------------------------
// Controlli
// ---------------------------------------------------------------------------
export interface Issue { sensorId?: string; level: "error" | "warn"; text: string }

export function validateRig(rig: Rig): Issue[] {
  const out: Issue[] = [];
  const inputs = inputsOf(rig), arduino = inputs.filter((s) => !SENSORS[s.type].phone);
  if (phoneOf(rig).length && arduinoOf(rig).length) out.push({ level: "error", text: t("sensors.rig.phoneMix") });
  if (!inputs.length) out.push({ level: "error", text: rig.sensors.length ? t("sensors.rig.onlyAccessories") : t("sensors.rig.empty") });
  if (rig.sensors.filter((s) => SENSORS[s.type].link).length > 1) out.push({ level: "error", text: t("sensors.rig.oneBluetooth") });
  if (arduino.length > MAX_ARDUINO) out.push({ level: "error", text: t("sensors.rig.tooMany", { max: MAX_ARDUINO }) });
  const count = new Map<SensorType, number>();
  for (const s of rig.sensors) count.set(s.type, (count.get(s.type) ?? 0) + 1);
  for (const [type, n] of count) if (n > SENSORS[type].max) out.push({ level: "error", text: t("sensors.rig.maxType", { max: SENSORS[type].max, title: SENSORS[type].title }) });
  const seen = new Map<number, { who: string; bus?: string; fixed?: boolean; link?: boolean }>();
  for (const s of rig.sensors) {
    const def = SENSORS[s.type];
    for (const spec of def.pins) {
      const p = spec.fixed ? spec.def : s.pins[spec.key];
      if (spec.fixed) { /* pin obbligato (SPI, seriale): conta solo per i doppioni */ }
      else if (p === 0 || p === 1) out.push({ sensorId: s.id, level: "error", text: t("sensors.rig.serialPin", { sensor: sensorLabel(s) }) });
      else if (!pinsFor(spec.kind).includes(p)) out.push({ sensorId: s.id, level: "error", text: t("sensors.rig.analogPin", { sensor: sensorLabel(s), role: spec.role }) });
      const prev = seen.get(p);
      // due dispositivi I2C sullo stesso filo vanno bene (SDA con SDA, SCL con SCL)
      if (prev && !(spec.bus && prev.bus === spec.bus) && !(SENSORS[s.type].link && prev.link)) out.push({ sensorId: s.id, level: "error", text: spec.fixed
        ? t("sensors.rig.fixedPin", { pin: pinName(p), sensor: sensorLabel(s), role: spec.role, other: prev.who })
        : t("sensors.rig.pinTwice", { pin: pinName(p), other: prev.who, sensor: sensorLabel(s), role: spec.role }) });
      if (!prev || !prev.fixed) seen.set(p, { who: `${sensorLabel(s)} · ${spec.role}`, bus: spec.bus, fixed: spec.fixed, link: def.link });
    }
    if (def.output || def.link || def.events) continue;
    const min = def.minInterval?.(s.options) ?? def.interval.min;
    if (s.interval < min) out.push({ sensorId: s.id, level: "warn", text: t("sensors.rig.minInterval", { sensor: sensorLabel(s), min }) });
  }
  // I2C: due dispositivi con lo stesso indirizzo sullo stesso bus si sovrappongono; il bus ha posto per MAX_ON_BUS moduli
  const seenAddr = new Map<string, SensorInstance>();
  for (const s of rig.sensors) {
    const addr = i2cAddr(s);
    if (!addr) continue;
    const k = `${s.pins.a}:${addr}`, prev = seenAddr.get(k);
    if (prev) out.push({ sensorId: s.id, level: "error", text: t("sensors.rig.addrClash", { a: sensorLabel(prev), b: sensorLabel(s), addr, imu: prev.type === "imu" || s.type === "imu" ? "yes" : "no" }) });
    else seenAddr.set(k, s);
  }
  const onBus = new Map<number, { n: number; role: string }>();
  for (const s of rig.sensors) for (const spec of SENSORS[s.type].pins) if (spec.bus) onBus.set(s.pins[spec.key], { n: (onBus.get(s.pins[spec.key])?.n ?? 0) + 1, role: spec.role });
  for (const [p, { n, role }] of onBus) if (n > MAX_ON_BUS) out.push({ level: "error", text: t("sensors.rig.busFull", { pin: pinName(p), role, max: MAX_ON_BUS }) });
  if (count.get("gps") && count.get("dht")) out.push({ level: "warn", text: t("sensors.rig.gpsDht") });
  if ((count.get("sonar") ?? 0) > 1) out.push({ level: "warn", text: t("sensors.rig.sonars") });
  return out;
}
export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");

// ---------------------------------------------------------------------------
// Firmware
// ---------------------------------------------------------------------------
/** Comandi di configurazione. outputs: anche gli indicatori (firmware 1.2 o più recente). */
export function firmwareCommands(rig: Rig, res: Resolved, { outputs = false } = {}): string[] {
  const cmds = ["CFG,CLEAR"];
  for (const s of res.arduino) {
    const def = SENSORS[s.type];
    const min = def.minInterval?.(s.options) ?? def.interval.min;
    cmds.push(`CFG,ADD,${res.code.get(s.id)},${def.fw},${Math.max(min, Math.round(s.interval))},${s.pins.a ?? 0},${s.pins.b ?? 0},${def.fwOpt?.(s.options) ?? 0}`);
  }
  if (outputs) {
    // sempre, anche senza indicatori: così si cancellano quelli salvati da un montaggio precedente
    cmds.push("OUT,CLEAR");
    for (const s of outputsOf(rig)) {
      const def = SENSORS[s.type];
      // MOSI, MISO e SCK (fissi) li conosce già il firmware; il CS (pin a) si manda sempre
      const pin = (k: "a" | "b" | "c") => (k !== "a" && def.pins.find((p) => p.key === k)?.fixed ? 0 : s.pins[k] ?? 0);
      cmds.push(`OUT,ADD,${def.fw},${pin("a")},${pin("b")},${pin("c")},${def.fwOpt?.(s.options) ?? 0}`);
    }
    cmds.push("OUT,SAVE");
  }
  return cmds;
}

// ---------------------------------------------------------------------------
// Dati
// ---------------------------------------------------------------------------
/** raw: [codice, t_ms, valori…] → righe (una per lettura) con le grandezze fisiche. */
// Lettura grezza → record interpretato, per montaggio risolto: durante una misura le righe si
// ricostruiscono più volte al secondo e così ogni lettura si interpreta una volta sola.
const parsed = new WeakMap<Resolved, WeakMap<number[], Rec | null>>();

export function buildRows(rig: Rig, res: Resolved, raw: number[][]): Row[] {
  const per = new Map<string, Rec[]>();
  for (const s of rig.sensors) per.set(s.id, []);
  let memo = parsed.get(res);
  if (!memo) parsed.set(res, (memo = new WeakMap()));
  for (const f of raw) {
    const s = res.byCode.get(f[0]);
    if (!s || !Number.isFinite(f[1])) continue;
    let r = memo.get(f);
    if (r === undefined) {
      r = SENSORS[s.type].parse(f.slice(2), s.options) ?? null;
      if (r) r.t = f[1] / 1000;
      memo.set(f, r);
    }
    if (!r) continue;
    per.get(s.id)!.push({ ...r });   // copia: derive() aggiunge campi (velocità, …)
  }
  const rows: Row[] = [];
  for (const s of rig.sensors) {
    const recs = per.get(s.id)!;
    SENSORS[s.type].derive?.(recs, s.options);
    const map = res.keyOf.get(s.id)!;
    for (const r of recs) {
      const row: Row = { t: r.t, _s: s.id };
      for (const [k, v] of Object.entries(r)) {
        if (k === "t") continue;
        const key = map.get(k);
        if (key) row[key] = v;
        else if (k === "time") row.time = v;   // istante assoluto (GPS), per GPX
      }
      rows.push(row);
    }
  }
  // con un solo sensore le righe sono già in ordine
  return rig.sensors.length > 1 ? rows.sort((a, b) => a.t - b.t) : rows;
}

/** Serie (t, valore) di una grandezza, solo con i valori validi. */
export function seriesOf(rows: Row[], key: string) {
  const t: number[] = [], y: number[] = [];
  for (const r of rows) { const v = r[key]; if (typeof v === "number" && Number.isFinite(v)) { t.push(r.t); y.push(v); } }
  return { t, y };
}

/** Valore interpolato all'istante t (NaN se il dato più vicino è più lontano di tol secondi). */
export function interpAt(s: { t: number[]; y: number[] }, t: number, tol: number) {
  const { t: ts, y } = s;
  if (!ts.length) return NaN;
  let lo = 0, hi = ts.length - 1;
  if (t <= ts[0]) return ts[0] - t <= tol ? y[0] : NaN;
  if (t >= ts[hi]) return t - ts[hi] <= tol ? y[hi] : NaN;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
  if (Math.min(t - ts[lo], ts[hi] - t) > tol) return NaN;
  if (ts[hi] - ts[lo] > 2 * tol) return t - ts[lo] < ts[hi] - t ? y[lo] : y[hi];
  return y[lo] + ((y[hi] - y[lo]) * (t - ts[lo])) / (ts[hi] - ts[lo]);
}

/** Tolleranza per allineare due sensori: tre volte l'intervallo più lento dei due (almeno 0,5 s). */
export function tolerance(rig: Rig) {
  const slowest = Math.max(...rig.sensors.map((s) => s.interval), 500);
  return (3 * slowest) / 1000;
}

/**
 * Righe allineate sui tempi di un sensore: le grandezze degli altri sensori sono interpolate.
 * Serve per inviare a Elaborazione grandezze di sensori diversi (es. T in funzione di h).
 */
export function alignRows(rows: Row[], baseSensor: string, keys: string[], ownKeys: Set<string>, tol: number): Row[] {
  const series = new Map(keys.filter((k) => !ownKeys.has(k)).map((k) => [k, seriesOf(rows, k)]));
  return rows.filter((r) => r._s === baseSensor).map((r) => {
    const out: Row = { t: r.t };
    for (const k of keys) out[k] = ownKeys.has(k) ? r[k] : interpAt(series.get(k)!, r.t, tol);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Misure salvate prima del sistema a sensori (formato 1): conversione
// ---------------------------------------------------------------------------
type LegacyMap = { rig: (params: Options) => Omit<Rig, "id" | "name">; convert: (f: number[]) => number[][] };
const pick = (params: Options, keys: string[]) => Object.fromEntries(keys.filter((k) => k in params).map((k) => [k, params[k]]));
const ntcKeys = ["orientation", "tAmb", "rSeries", "r0", "t0", "beta", "offset"];
const sonarKeys = ["tAir", "direction", "window", "origin", "dMin", "dMax", "spike"];

export const LEGACY: Record<string, LegacyMap> = {
  cooling: { rig: (p) => ({ sensors: [makeSensor("ntc", new Set(), { options: pick(p, ntcKeys), interval: Number(p.interval) || 1000 })] }), convert: (f) => [[0, f[0], f[1]]] },
  motion: { rig: (p) => ({ sensors: [makeSensor("sonar", new Set(), { options: pick(p, sonarKeys), interval: Number(p.interval) || 50 })] }), convert: (f) => [[0, f[0] / 1000, f[1]]] },
  harmonic: { rig: (p) => ({ sensors: [makeSensor("sonar", new Set(), { options: pick(p, sonarKeys), interval: Number(p.interval) || 50 })] }), convert: (f) => [[0, f[0] / 1000, f[1]]] },
  humidity: { rig: (p) => ({ sensors: [makeSensor("dht", new Set(), { options: { model: p.sensor === "dht22" ? "dht22" : "dht11", offsetT: p.offsetT ?? 0, offsetRH: p.offsetRH ?? 0 }, interval: Number(p.interval) || 2000 })] }), convert: (f) => [[0, ...f]] },
  gpsmap: {
    rig: (p) => {
      const sensors = [makeSensor("gps", new Set(), { options: pick(p, ["minSats", "maxHdop"]), interval: Number(p.interval) || 2000 })];
      if (p.sensor === "ntc") sensors.push(makeSensor("ntc", new Set([4, 3]), { options: pick(p, ntcKeys), interval: Number(p.interval) || 2000 }));
      else if (p.sensor !== "none") sensors.push(makeSensor("dht", new Set([4, 3]), { options: { model: p.sensor === "dht22" ? "dht22" : "dht11" }, interval: Number(p.interval) || 2000 }));
      return { sensors };
    },
    convert: (f) => {
      const out = [[0, f[0], ...f.slice(1, 10)]];
      if (f[10] === 11 || f[10] === 22) out.push([1, f[0], f[11], f[12], f[13], f[14], f[15]]);
      else if (f[10] === 1) out.push([1, f[0], f[11]]);
      return out;
    },
  },
};
