// MosaicusNeo — condivisione dei miei lab: un codice di testo (e un file .neoproj che lo contiene)
// con tutto il necessario per ricrearlo su un altro dispositivo: nome, colore, icona, componenti con
// pin, opzioni, intervallo ed etichetta, e i grafici scelti.
//
// Formato: «NEO1.» + JSON compatto compresso (deflate-raw) in base64url. Se la compressione non c'è
// (o non conviene) «NEO0.» + JSON in base64url. Nel JSON solo ciò che differisce dai valori di serie:
//   { n: nome, c: colore, i: icona, v: [grafici], s: [[tipo, [pin…], {opzioni}|0, intervallo|0, etichetta]] }
// I pin sono nell'ordine del catalogo (SENSORS[tipo].pins); le voci finali vuote si omettono.

import { SENSORS, defaultOptions, type SensorType } from "./catalog";
import { newId, normalizeRig, type Rig, type SensorInstance } from "./rig";
import { PROJECT_TONES, isProjectIcon } from "./project-look";
import type { Options, Tone } from "./types";

export const SHARE_EXT = ".neoproj";
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

type Packed = [string, number[], (Options | 0)?, number?, string?];
interface Payload { n?: string; c?: string; i?: string; v?: string[]; s?: Packed[] }

export class ShareError extends Error {
  constructor(public code: "empty" | "format" | "version" | "noComponents") { super(code); }
}

// ---------------------------------------------------------------------------
// base64url e compressione (CompressionStream: tutti i browser recenti)

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const canCompress = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// ---------------------------------------------------------------------------

function pack(rig: Rig, visible: string[]): Payload {
  const s = rig.sensors.map((x): Packed => {
    const def = SENSORS[x.type];
    const base = defaultOptions(x.type);
    const diff = Object.fromEntries(Object.entries(x.options ?? {}).filter(([k, v]) => def.options.some((o) => o.key === k) && String(base[k]) !== String(v)));
    const item: Packed = [x.type, def.pins.map((p) => x.pins[p.key]), Object.keys(diff).length ? diff : 0, x.interval !== def.interval.def ? x.interval : 0, x.label?.trim() || undefined];
    while (item.length > 2 && !item[item.length - 1]) item.pop();
    return item;
  });
  return { n: rig.name, ...(rig.tone ? { c: rig.tone } : {}), ...(rig.icon ? { i: rig.icon } : {}), ...(visible.length ? { v: visible } : {}), s };
}

/** Il codice di condivisione di un lab. */
export async function encodeLab(rig: Rig, visible: string[] = []): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(pack(rig, visible)));
  const plain = `NEO0.${toB64(bytes)}`;
  if (!canCompress()) return plain;
  try {
    const packed = `NEO1.${toB64(await pipe(bytes, new CompressionStream("deflate-raw")))}`;
    return packed.length < plain.length ? packed : plain;
  } catch { return plain; }
}

/** Il codice dentro un testo incollato o un file (spazi, a capo e virgolette ignorati). */
export function findCode(text: string): string | null {
  const m = text.replace(/\s+/g, "").match(/NEO(\d+)\.([A-Za-z0-9_-]+)/i);
  return m ? `NEO${m[1]}.${m[2]}` : null;
}

/** Dal codice (o da un testo che lo contiene) al lab. Lancia ShareError se non è valido. */
export async function decodeLab(text: string): Promise<LabDraft> {
  if (!text.trim()) throw new ShareError("empty");
  const code = findCode(text);
  if (!code) throw new ShareError("format");
  const [head, body] = code.split(".");
  const version = Number(head.slice(3));
  if (version > 1) throw new ShareError("version");
  let data: Payload;
  try {
    let bytes = fromB64(body);
    if (version === 1) bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw new ShareError("format"); }
  if (!data || typeof data !== "object" || !Array.isArray(data.s)) throw new ShareError("format");
  return unpack(data);
}

function unpack(data: Payload): LabDraft {
  const sensors: SensorInstance[] = [];
  for (const item of (data.s ?? []).slice(0, MAX_SENSORS)) {
    if (!Array.isArray(item)) continue;
    const [type, pins, opts, interval, label] = item;
    const def = SENSORS[type as SensorType];
    if (!def) continue;  // componente di una versione più nuova: si salta
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
    // pin mancanti o non numerici: normalizeRig ne assegna uno libero
    def.pins.forEach((spec, k) => { const v = Array.isArray(pins) ? pins[k] : undefined; if (typeof v === "number" && Number.isFinite(v)) p[spec.key] = v; });
    sensors.push({
      id: newId(), type: type as SensorType, pins: p, options,
      interval: typeof interval === "number" && interval > 0 ? Math.max(def.interval.min, Math.round(interval)) : def.interval.def,
      ...(typeof label === "string" && label.trim() ? { label: label.trim().slice(0, 60) } : {}),
    });
  }
  if (!sensors.length && (data.s ?? []).length) throw new ShareError("noComponents");
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

/** Nome del file .neoproj di un lab. */
export const shareFileName = (name: string) =>
  `${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "lab"}${SHARE_EXT}`;
