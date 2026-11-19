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

import { SENSORS, MAX_ARDUINO, pinName, pinsFor, defaultOptions, type Rec, type SensorType } from "./catalog";
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
    const free = [spec.def, ...pinsFor(spec.kind)].find((p) => !taken.has(p) && !Object.values(pins).includes(p));
    pins[spec.key] = free ?? spec.def;
    taken.add(pins[spec.key]);
  }
  return { id: newId(), type, pins, options: defaultOptions(type), interval: def.interval.def, ...extra, ...(extra.options ? { options: { ...defaultOptions(type), ...extra.options } } : {}) };
}

export function usedPins(rig: Rig, except?: string) {
  const m = new Map<number, { sensor: SensorInstance; role: string }>();
  for (const s of rig.sensors) {
    if (s.id === except) continue;
    for (const spec of SENSORS[s.type].pins) m.set(s.pins[spec.key], { sensor: s, role: spec.role });
  }
  return m;
}

export function resolveRig(rig: Rig): Resolved {
  const quantities: ResolvedQuantity[] = [];
  const keyOf = new Map<string, Map<string, string>>();
  const used = new Set<string>(["t"]);
  const code = new Map<string, number>(), byCode = new Map<number, SensorInstance>();
  const arduino: SensorInstance[] = [];
  for (const s of rig.sensors) {
    const def = SENSORS[s.type];
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
  const arduino = rig.sensors;
  if (!rig.sensors.length) out.push({ level: "error", text: "Il montaggio è vuoto: aggiungi almeno un sensore." });
  if (arduino.length > MAX_ARDUINO) out.push({ level: "error", text: `Arduino legge al massimo ${MAX_ARDUINO} sensori alla volta.` });
  const count = new Map<SensorType, number>();
  for (const s of rig.sensors) count.set(s.type, (count.get(s.type) ?? 0) + 1);
  for (const [type, n] of count) if (n > SENSORS[type].max) out.push({ level: "error", text: SENSORS[type].max === 1 ? `Ci può essere un solo sensore «${SENSORS[type].title}».` : `Al massimo ${SENSORS[type].max} sensori «${SENSORS[type].title}».` });
  const seen = new Map<number, string>();
  for (const s of arduino) {
    const def = SENSORS[s.type];
    for (const spec of def.pins) {
      const p = s.pins[spec.key];
      if (p === 0 || p === 1) out.push({ sensorId: s.id, level: "error", text: `${sensorLabel(s)}: D0 e D1 sono della porta seriale (USB e Bluetooth).` });
      else if (!pinsFor(spec.kind).includes(p)) out.push({ sensorId: s.id, level: "error", text: `${sensorLabel(s)}: ${spec.role} deve stare su un pin analogico (A0…A5).` });
      if (seen.has(p)) out.push({ sensorId: s.id, level: "error", text: `${pinName(p)} è usato due volte (${seen.get(p)} e ${sensorLabel(s)} · ${spec.role}).` });
      seen.set(p, `${sensorLabel(s)} · ${spec.role}`);
    }
    const min = def.minInterval?.(s.options) ?? def.interval.min;
    if (s.interval < min) out.push({ sensorId: s.id, level: "warn", text: `${sensorLabel(s)}: più veloce di ${min} ms non si può, userò ${min} ms.` });
  }
  if (count.get("gps") && count.get("dht")) out.push({ level: "warn", text: "Con il GPS acceso il DHT si legge nei momenti di silenzio del GPS: qualche lettura può arrivare in ritardo." });
  if ((count.get("sonar") ?? 0) > 1) out.push({ level: "warn", text: "Più sensori a ultrasuoni possono sentire l'uno l'eco dell'altro: puntali in direzioni diverse." });
  return out;
}
export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");

// ---------------------------------------------------------------------------
// Firmware
// ---------------------------------------------------------------------------
export function firmwareCommands(rig: Rig, res: Resolved): string[] {
  const cmds = ["CFG,CLEAR"];
  for (const s of res.arduino) {
    const def = SENSORS[s.type];
    const min = def.minInterval?.(s.options) ?? def.interval.min;
    cmds.push(`CFG,ADD,${res.code.get(s.id)},${def.fw},${Math.max(min, Math.round(s.interval))},${s.pins.a ?? 0},${s.pins.b ?? 0},${def.fwOpt?.(s.options) ?? 0}`);
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
