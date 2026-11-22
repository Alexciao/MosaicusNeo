// MosaicusNeo — condivisione dei miei lab: un codice di testo (e un file .neolab che lo contiene, e
// un link che lo porta) con tutto il necessario per ricrearlo su un altro dispositivo: nome, colore,
// icona, componenti con pin, opzioni, intervallo ed etichetta, e i grafici scelti.
//
// Formato attuale, NEO2: «NEO2» + bit impacchettati in base32 di Crockford (cifre e maiuscole senza
// I, L, O, U: si legge e si detta, non conta maiuscolo/minuscolo) + 2 caratteri di controllo.
// Si scrive solo ciò che differisce dai valori di serie; i pin solo se diversi dal pin di serie del
// catalogo (spec.def). Trattini, spazi e a capo si ignorano.
//
// Formato vecchio, NEO1 (solo lettura): «NEO1.» + JSON compatto compresso (deflate-raw) in base64url
// ({ n, c, i, v, s: [[tipo, [pin…], {opzioni}|0, intervallo|0, etichetta]] }); «NEO0.» non compresso.
//
// ATTENZIONE: le tabelle qui sotto (TYPES, TONES, ICONS) e l'ordine delle opzioni di ogni componente
// in SENSORS fanno parte del formato: si aggiunge solo in fondo, non si riordina né si toglie.

import { SENSORS, defaultOptions, type SensorType } from "./catalog";
import { newId, normalizeRig, resolveRig, type Rig, type SensorInstance } from "./rig";
import { PROJECT_TONES, isProjectIcon } from "./project-look";
import type { Options, Tone } from "./types";

export const SHARE_EXT = ".neolab";
/** Estensioni accettate all'import: .neoproj è il nome di prima, letto ancora senza dirlo. */
export const SHARE_EXTS = [SHARE_EXT, ".neoproj"];
const MAX_SENSORS = 40;

/** Un lab pronto per essere creato (da un codice o dalla finestra «Nuovo lab»). */
export interface LabDraft {
  name: string;
  tone?: Tone;
  icon?: string;
  sensors: SensorInstance[];
  /** grafici scelti (chiavi delle grandezze, es. «T», «T_2») */
  visible?: string[];
}

export class ShareError extends Error {
  constructor(public code: "empty" | "format" | "check" | "version" | "noComponents") { super(code); }
}

// ---------------------------------------------------------------------------
// Tabelle del formato NEO2 (solo aggiunte in fondo)

const TYPES: SensorType[] = [
  "ntc", "dht", "sonar", "gps", "analog", "ldr", "ds18b20", "gate", "hx711", "imu", "mlx", "sps30",
  "oled", "oled96", "rgb", "buzzer", "button", "sd", "hc06", "ble", "pmotion", "psound",
];
const TONES: Tone[] = ["violet", "indigo", "sky", "teal", "emerald", "lime", "saffron", "orange", "red", "rose", "fuchsia", "slate"];
const ICONS = [
  "wrench", "flask", "atom", "microscope", "magnet", "zap", "battery", "lightbulb", "thermometer", "flame", "snowflake", "sun",
  "wind", "droplets", "waves", "activity", "music", "radio", "gauge", "ruler", "scale", "timer", "hourglass", "compass",
  "rocket", "orbit", "satellite", "telescope", "car", "bike", "heart", "leaf",
];

// ---------------------------------------------------------------------------
// Bit, base32 di Crockford, controllo

class BitWriter {
  bits: number[] = [];
  put(v: number, n: number) { for (let i = n - 1; i >= 0; i--) this.bits.push(Math.floor(v / 2 ** i) % 2); }
  text(s: string, asciiLen: number) {
    const ascii = /^[\x20-\x7e]*$/.test(s);
    this.put(ascii ? 1 : 0, 1);
    if (ascii) { this.put(s.length, asciiLen); for (const ch of s) this.put(ch.charCodeAt(0), 7); return; }
    const bytes = new TextEncoder().encode(s);
    this.put(bytes.length, asciiLen + 2); for (const b of bytes) this.put(b, 8);
  }
  varint(v: number) { do { const low = v % 128; v = Math.floor(v / 128); this.put(v > 0 ? 1 : 0, 1); this.put(low, 7); } while (v > 0); }
  /** numero esatto, un carattere della sua scrittura decimale ogni 4 bit */
  number(v: number) { for (const ch of String(v)) this.put(NUM.indexOf(ch), 4); this.put(15, 4); }
}
class BitReader {
  private i = 0;
  constructor(private bits: number[]) {}
  get(n: number) {
    if (this.i + n > this.bits.length) throw new ShareError("format");
    let v = 0; for (let k = 0; k < n; k++) v = v * 2 + this.bits[this.i++]; return v;
  }
  text(asciiLen: number) {
    if (this.get(1)) { let s = ""; for (let n = this.get(asciiLen); n > 0; n--) s += String.fromCharCode(this.get(7)); return s; }
    const bytes = new Uint8Array(this.get(asciiLen + 2)); for (let k = 0; k < bytes.length; k++) bytes[k] = this.get(8);
    return new TextDecoder().decode(bytes);
  }
  varint() { let v = 0, mul = 1, more = 1; while (more) { more = this.get(1); v += this.get(7) * mul; mul *= 128; } return v; }
  number() { let s = ""; for (let c = this.get(4); c !== 15; c = this.get(4)) s += NUM[c] ?? ""; return Number(s); }
}
const NUM = "0123456789.-e+";
const isPlainNumber = (v: number) => Number.isFinite(v) && [...String(v)].every((c) => NUM.includes(c));

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const toB32 = (bits: number[]) => {
  let s = "";
  for (let i = 0; i < bits.length; i += 5) { let v = 0; for (let k = 0; k < 5; k++) v = v * 2 + (bits[i + k] ?? 0); s += B32[v]; }
  return s;
};
/** Da base32 a bit; I e L valgono 1, O vale 0. null se c'è un carattere estraneo. */
const fromB32 = (s: string): number[] | null => {
  const bits: number[] = [];
  for (const raw of s.toUpperCase()) {
    const ch = raw === "O" ? "0" : raw === "I" || raw === "L" ? "1" : raw;
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    for (let k = 4; k >= 0; k--) bits.push((v >> k) & 1);
  }
  return bits;
};
/** 2 caratteri di controllo (FNV-1a sui caratteri, 10 bit). */
const checksum = (s: string) => {
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h = (h ^ (h >>> 10) ^ (h >>> 20)) & 1023;
  return B32[h >> 5] + B32[h & 31];
};
const canon = (s: string) => s.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");

// ---------------------------------------------------------------------------
// NEO2

/** Il codice di condivisione di un lab (sempre NEO2). */
export function encodeLab(rig: Rig, visible: string[] = []): string {
  const w = new BitWriter();
  const tone = rig.tone ? TONES.indexOf(rig.tone) : -1;
  const icon = rig.icon ? ICONS.indexOf(rig.icon) : -1;
  w.put(tone + 1, 4);
  w.put(icon + 1, 6);
  w.text(rig.name.slice(0, 80), 7);
  const sensors = rig.sensors.filter((s) => TYPES.includes(s.type) && SENSORS[s.type]).slice(0, MAX_SENSORS);
  w.put(sensors.length, 6);
  for (const s of sensors) {
    const def = SENSORS[s.type];
    const base = defaultOptions(s.type);
    const pins = def.pins.map((p) => s.pins[p.key]);
    const customPins = def.pins.some((p, k) => pins[k] !== p.def) && pins.every((p) => typeof p === "number" && p >= 0 && p < 32);
    const opts = def.options.map((o, k) => [o, k] as const).filter(([o]) => s.options?.[o.key] != null && String(s.options[o.key]) !== String(base[o.key]));
    const encodable = opts.filter(([o]) => {
      const v = s.options[o.key];
      if (o.type === "select") return (o.options ?? []).some(([k]) => k === String(v));
      if (o.type === "text") return true;
      return isPlainNumber(Number(v));
    }).slice(0, 15);
    const customInterval = Number.isFinite(s.interval) && s.interval > 0 && s.interval !== def.interval.def;
    const label = s.label?.trim().slice(0, 60) ?? "";
    w.put(TYPES.indexOf(s.type), 6);
    w.put(customPins ? 1 : 0, 1); w.put(encodable.length ? 1 : 0, 1); w.put(customInterval ? 1 : 0, 1); w.put(label ? 1 : 0, 1);
    if (customPins) { w.put(pins.length, 3); for (const p of pins) w.put(p as number, 5); }
    if (encodable.length) {
      w.put(encodable.length, 4);
      for (const [o, k] of encodable) {
        const v = s.options[o.key];
        w.put(k, 5);
        // un'etichetta di tipo: un'opzione sconosciuta (versione più nuova) si può saltare
        if (o.type === "select") { w.put(0, 2); w.put((o.options ?? []).findIndex(([x]) => x === String(v)), 6); }
        else if (o.type === "text") { w.put(2, 2); w.text(String(v).slice(0, 40), 6); }
        else { w.put(1, 2); w.number(Number(v)); }
      }
    }
    if (customInterval) w.varint(Math.round(s.interval));
    if (label) w.text(label, 6);
  }
  // grafici: n-esima grandezza dell'n-esimo componente
  const res = resolveRig({ ...rig, sensors });
  const charts = visible.map((key) => {
    const q = res.quantities.find((x) => x.key === key);
    if (!q) return null;
    const si = sensors.findIndex((s) => s.id === q.sensorId);
    const qi = res.quantities.filter((x) => x.sensorId === q.sensorId).indexOf(q);
    return si >= 0 && qi >= 0 && qi < 16 ? [si, qi] : null;
  }).filter((x): x is number[] => !!x).slice(0, 31);
  w.put(charts.length, 5);
  for (const [si, qi] of charts) { w.put(si, 6); w.put(qi, 4); }
  const body = toB32(w.bits);
  return `NEO2${body}${checksum(body)}`;
}

function decodeNeo2(body: string): LabDraft {
  const clean = body.replace(/[\s-]+/g, "");
  if (clean.length < 4) throw new ShareError("format");
  const data = clean.slice(0, -2), check = clean.slice(-2);
  const bits = fromB32(data);
  if (!bits || !fromB32(check)) throw new ShareError("format");
  if (checksum(canon(data)) !== canon(check)) throw new ShareError("check");
  const r = new BitReader(bits);
  const tone = TONES[r.get(4) - 1];
  const icon = ICONS[r.get(6) - 1];
  const name = r.text(7).trim().slice(0, 80);
  const n = r.get(6);
  const sensors: (SensorInstance | null)[] = [];
  for (let k = 0; k < n; k++) {
    const type = TYPES[r.get(6)];
    if (!type || !SENSORS[type]) throw new ShareError("version");  // non si saprebbe quanti bit saltare
    const def = SENSORS[type];
    const [hasPins, hasOpts, hasInterval, hasLabel] = [r.get(1), r.get(1), r.get(1), r.get(1)];
    const pins: Record<string, number> = Object.fromEntries(def.pins.map((p) => [p.key, p.def]));
    if (hasPins) { const m = r.get(3); for (let j = 0; j < m; j++) { const p = r.get(5); if (def.pins[j]) pins[def.pins[j].key] = p; } }
    const options = { ...defaultOptions(type) };
    if (hasOpts) {
      for (let m = r.get(4); m > 0; m--) {
        const o = def.options[r.get(5)];
        const tag = r.get(2);
        const v = tag === 0 ? r.get(6) : tag === 1 ? r.number() : tag === 2 ? r.text(6) : null;
        if (v == null) throw new ShareError("version");
        if (!o) continue;  // opzione di una versione più nuova
        if (o.type === "select" && tag === 0) { const opt = o.options?.[v as number]; if (opt) options[o.key] = opt[0]; }
        else if (o.type === "text" && tag === 2) options[o.key] = String(v);
        else if ((o.type ?? "number") === "number" && tag === 1 && Number.isFinite(v)) options[o.key] = v as number;
      }
    }
    const interval = hasInterval ? Math.max(def.interval.min, r.varint()) : def.interval.def;
    const label = hasLabel ? r.text(6).trim().slice(0, 60) : "";
    sensors.push({ id: newId(), type, pins, options, interval, ...(label ? { label } : {}) });
  }
  const charts: [number, number][] = [];
  for (let m = r.get(5); m > 0; m--) charts.push([r.get(6), r.get(4)]);
  const list = sensors.filter((s): s is SensorInstance => !!s);
  if (!list.length && n) throw new ShareError("noComponents");
  const rig = normalizeRig({ id: "draft", name, sensors: list });
  const res = resolveRig(rig);
  const visible = charts.map(([si, qi]) => {
    const s = sensors[si];
    return s ? res.quantities.filter((q) => q.sensorId === s.id)[qi]?.key : undefined;
  }).filter((k): k is string => !!k);
  return { name, ...(tone ? { tone } : {}), ...(icon ? { icon } : {}), sensors: rig.sensors, visible };
}

// ---------------------------------------------------------------------------
// NEO1 (solo lettura)

type Packed = [string, number[], (Options | 0)?, number?, string?];
interface Payload { n?: string; c?: string; i?: string; v?: string[]; s?: Packed[] }

const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
async function inflate(bytes: Uint8Array) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

async function decodeNeo1(version: number, body: string): Promise<LabDraft> {
  let data: Payload;
  try {
    let bytes = fromB64(body);
    if (version === 1) bytes = await inflate(bytes);
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new ShareError("format"); }
  if (!data || typeof data !== "object" || !Array.isArray(data.s)) throw new ShareError("format");
  const sensors: SensorInstance[] = [];
  for (const item of data.s.slice(0, MAX_SENSORS)) {
    if (!Array.isArray(item)) continue;
    const [type, pins, opts, interval, label] = item;
    const def = SENSORS[type as SensorType];
    if (!def) continue;
    const options = { ...defaultOptions(type as SensorType) };
    if (opts && typeof opts === "object") {
      for (const o of def.options) {
        const v = (opts as Options)[o.key];
        if (typeof v !== "number" && typeof v !== "string") continue;
        const num = (o.type ?? "number") === "number";
        if (num && !Number.isFinite(Number(v))) continue;
        options[o.key] = num ? Number(v) : String(v);
      }
    }
    const p: Record<string, number> = {};
    def.pins.forEach((spec, k) => { const v = Array.isArray(pins) ? pins[k] : undefined; if (typeof v === "number" && Number.isFinite(v)) p[spec.key] = v; });
    sensors.push({
      id: newId(), type: type as SensorType, pins: p, options,
      interval: typeof interval === "number" && interval > 0 ? Math.max(def.interval.min, Math.round(interval)) : def.interval.def,
      ...(typeof label === "string" && label.trim() ? { label: label.trim().slice(0, 60) } : {}),
    });
  }
  if (!sensors.length && data.s.length) throw new ShareError("noComponents");
  const rig = normalizeRig({ id: "draft", name: "", sensors });
  const tone = PROJECT_TONES.find((c) => c === data.c);
  return {
    name: typeof data.n === "string" ? data.n.trim().slice(0, 80) : "",
    ...(tone ? { tone } : {}),
    ...(isProjectIcon(data.i) ? { icon: data.i } : {}),
    sensors: rig.sensors,
    visible: Array.isArray(data.v) ? data.v.filter((k): k is string => typeof k === "string").slice(0, 40) : [],
  };
}

// ---------------------------------------------------------------------------
// Ingresso: codice, link o contenuto di un file

/** C'è un codice di lab in questo testo (codice, link, file)? */
export const hasCode = (text: string) => /NEO[0-2]/i.test(text);

/** Dal codice (o da un testo che lo contiene: link, file) al lab. Lancia ShareError se non è valido. */
export async function decodeLab(text: string): Promise<LabDraft> {
  if (!text.trim()) throw new ShareError("empty");
  const v1 = text.replace(/\s+/g, "").match(/NEO([01])\.([A-Za-z0-9_-]+)/i);
  if (v1) return decodeNeo1(Number(v1[1]), v1[2]);
  const m = text.match(/NEO2([0-9A-Za-z\s-]*)/i);
  if (!m) throw new ShareError(/NEO\d/i.test(text) ? "version" : "format");
  // il codice può essere seguito da altre parole: si prova a tagliarlo a ogni spazio, dal più lungo
  const raw = m[1].trim();
  let first: unknown;
  for (const cut of [raw.length, ...[...raw.matchAll(/\s+/g)].map((x) => x.index!).reverse()]) {
    try { return decodeNeo2(raw.slice(0, cut)); }
    catch (e) { if (!(e instanceof ShareError)) throw e; first ??= e; }
  }
  throw first;
}

/** Il link che apre l'import con il codice già pronto. */
export const shareLink = (code: string) =>
  typeof window === "undefined" ? `#lab=${code}` : `${window.location.origin}${window.location.pathname}#lab=${code}`;
/** Il codice nell'indirizzo della pagina (#lab=…), se c'è. */
export const codeFromHash = (hash: string) => { const m = hash.match(/[#&]lab=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; };

/** Nome del file .neolab di un lab. */
export const shareFileName = (name: string) =>
  `${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "lab"}${SHARE_EXT}`;
