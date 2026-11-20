// MosaicusNeo — le grandezze: simbolo, nome, unità, modelli di fit consigliati e significato
// fisico dei loro parametri (usati dalla pagina Elaborazione).
//
// Le chiavi sono "di base" (T, RH, x…). Se in un montaggio ci sono due sensori che misurano la
// stessa grandezza, il secondo diventa T_2, RH_2…: baseKey() toglie il suffisso.

import { P } from "@/lib/mosaicus/fits.js";

type Fit = Parameters<typeof P>[0];
export interface Physics { label: string; unit: string; calc: (fit: Fit) => number[] }
export interface Quantity {
  sym: string; name: string; unit: string;
  models?: string[]; slope?: string; raw?: boolean;
  physics?: Record<string, Physics[]>;
}

const TWO_PI = 2 * Math.PI;
const periodFrom = (unit = "s"): Physics[] => [
  { label: "periodo T = 2π/ω", unit, calc: (f) => { const [w, s] = P(f, "w"); return [TWO_PI / w, (TWO_PI * s) / (w * w)]; } },
  { label: "frequenza f = ω/2π", unit: "Hz", calc: (f) => { const [w, s] = P(f, "w"); return [w / TWO_PI, s / TWO_PI]; } },
];
const decayFrom = (eqLabel: string, eqUnit: string): Physics[] => [
  { label: "tempo caratteristico τ = −1/k", unit: "s", calc: (f) => { const [k, s] = P(f, "k"); return [-1 / k, s / (k * k)]; } },
  { label: eqLabel, unit: eqUnit, calc: (f) => P(f, "C") },
];
const mean = (label: string, unit: string): Physics[] => [{ label, unit, calc: (f) => P(f, "mean") }];
const raw = (sym: string, name: string, unit = ""): Quantity => ({ sym, name, unit, models: [], raw: true });

export const QUANTITIES: Record<string, Quantity> = {
  t: { sym: "t", name: "tempo", unit: "s" },
  // --- cinematica (HC-SR04)
  x: { sym: "x", name: "posizione", unit: "m", models: ["lin", "poly2", "dsin"], slope: "velocità",
    physics: {
      lin: [{ label: "velocità v = m", unit: "m/s", calc: (f) => P(f, "m") }],
      poly2: [{ label: "accelerazione a = 2·c₂", unit: "m/s²", calc: (f) => { const [c, s] = P(f, "c2"); return [2 * c, 2 * s]; } }],
      dsin: [...periodFrom(), { label: "ampiezza A", unit: "m", calc: (f) => P(f, "A") },
        { label: "posizione di equilibrio C", unit: "m", calc: (f) => P(f, "C") },
        { label: "coefficiente di smorzamento γ", unit: "s⁻¹", calc: (f) => P(f, "g") }],
    } },
  v: { sym: "v", name: "velocità", unit: "m/s", models: ["lin", "mean", "dsin"], slope: "accelerazione",
    physics: {
      lin: [{ label: "accelerazione a = m", unit: "m/s²", calc: (f) => P(f, "m") }],
      mean: mean("velocità media", "m/s"),
      dsin: [...periodFrom(), { label: "velocità massima", unit: "m/s", calc: (f) => P(f, "A") }],
    } },
  a: { sym: "a", name: "accelerazione", unit: "m/s²", models: ["mean", "dsin"], slope: "variazione dell'accelerazione",
    physics: {
      mean: mean("accelerazione media", "m/s²"),
      dsin: [...periodFrom(), { label: "accelerazione massima", unit: "m/s²", calc: (f) => P(f, "A") }],
    } },
  d: { sym: "d", name: "distanza dal sensore", unit: "m", models: ["lin", "poly2"], raw: true },
  echo: raw("eco", "tempo di volo", "µs"),
  // --- temperatura
  T: { sym: "T", name: "temperatura", unit: "°C", models: ["expC", "lin", "mean"], slope: "rapidità di variazione della temperatura",
    physics: {
      expC: [
        { label: "costante di raffreddamento k", unit: "s⁻¹", calc: (f) => { const [k, s] = P(f, "k"); return [-k, s]; } },
        { label: "tempo caratteristico θ = 1/k", unit: "s", calc: (f) => { const [k, s] = P(f, "k"); return [-1 / k, s / (k * k)]; } },
        { label: "temperatura ambiente Tₐ", unit: "°C", calc: (f) => P(f, "C") },
      ],
      lin: [{ label: "rapidità di variazione dT/dt", unit: "°C/s", calc: (f) => P(f, "m") }],
      mean: mean("temperatura media", "°C"),
    } },
  lnT: { sym: "ln(T − Tₐ)", name: "temperatura linearizzata", unit: "", models: ["lin"], slope: "opposto della costante di raffreddamento (−k)",
    physics: {
      lin: [
        { label: "costante di raffreddamento k = −m", unit: "s⁻¹", calc: (f) => { const [m, s] = P(f, "m"); return [-m, s]; } },
        { label: "tempo caratteristico θ = 1/k", unit: "s", calc: (f) => { const [m, s] = P(f, "m"); return [-1 / m, s / (m * m)]; } },
      ],
    } },
  R: { sym: "R", name: "resistenza", unit: "Ω", models: ["expC", "exp"], raw: true },
  adc: raw("ADC", "lettura grezza (0–1023)"),
  // --- umidità (DHT)
  RH: { sym: "UR", name: "umidità relativa", unit: "%", models: ["expC", "lin", "mean"], slope: "rapidità di variazione dell'umidità",
    physics: {
      expC: decayFrom("umidità di equilibrio", "%"),
      lin: [{ label: "rapidità di variazione dUR/dt", unit: "%/s", calc: (f) => P(f, "m") }],
      mean: mean("umidità media", "%"),
    } },
  Td: { sym: "Tᵣ", name: "punto di rugiada", unit: "°C", models: ["mean", "expC", "lin"],
    physics: { mean: mean("punto di rugiada medio", "°C"), expC: decayFrom("punto di rugiada di equilibrio", "°C") } },
  AH: { sym: "ρᵥ", name: "umidità assoluta", unit: "g/m³", models: ["mean", "expC", "lin"],
    physics: { mean: mean("vapore acqueo per metro cubo", "g/m³"), expC: decayFrom("umidità assoluta di equilibrio", "g/m³") } },
  // --- tensione e luce
  V: { sym: "V", name: "tensione", unit: "V", models: ["mean", "lin", "dsin", "expC"], slope: "rapidità di variazione della tensione",
    physics: { mean: mean("tensione media", "V"), lin: [{ label: "dV/dt", unit: "V/s", calc: (f) => P(f, "m") }], dsin: periodFrom(), expC: decayFrom("tensione finale", "V") } },
  Y: { sym: "y", name: "grandezza tarata", unit: "", models: ["mean", "lin", "dsin", "expC"] },
  light: { sym: "L", name: "luminosità (relativa)", unit: "%", models: ["mean", "lin", "dsin"],
    physics: { mean: mean("luminosità media", "%"), dsin: periodFrom() } },
  // --- GPS
  lat: { sym: "φ", name: "latitudine", unit: "°", models: [] },
  lon: { sym: "λ", name: "longitudine", unit: "°", models: [] },
  alt: { sym: "h", name: "altitudine", unit: "m", models: ["lin", "mean"], slope: "velocità di salita",
    physics: { lin: [{ label: "velocità di salita dh/dt", unit: "m/s", calc: (f) => P(f, "m") }], mean: mean("altitudine media", "m") } },
  s: { sym: "s", name: "distanza percorsa", unit: "m", models: ["lin", "poly2"], slope: "velocità media",
    physics: {
      lin: [{ label: "velocità media v = m", unit: "m/s", calc: (f) => P(f, "m") }],
      poly2: [{ label: "accelerazione a = 2·c₂", unit: "m/s²", calc: (f) => { const [c, sg] = P(f, "c2"); return [2 * c, 2 * sg]; } }],
    } },
  speed: { sym: "v", name: "velocità (GPS)", unit: "km/h", models: ["mean", "lin"], physics: { mean: mean("velocità media", "km/h") } },
  sats: raw("sat", "satelliti in uso"),
  hdop: raw("HDOP", "diluizione della precisione"),
  fix: raw("fix", "qualità del fix"),
  utc: raw("UTC", "ora del satellite (hhmmss)"),
  ok: raw("valido", "lettura valida"),
  ...Object.fromEntries(["b0", "b1", "b2", "b3"].map((k) => [k, raw(k, `byte ${k[1]} del sensore`)])),
  err: raw("err", "errore del sensore"),
  ds: raw("DS", "lettura grezza (1/16 °C)"),
  // --- termometro a infrarossi (MLX90614): T è la superficie inquadrata, Ts il sensore stesso
  Ts: { sym: "Tₛ", name: "temperatura del sensore (ambiente)", unit: "°C", models: ["mean", "lin", "expC"],
    physics: { mean: mean("temperatura media del sensore", "°C"), lin: [{ label: "rapidità di variazione dTₛ/dt", unit: "°C/s", calc: (f) => P(f, "m") }], expC: decayFrom("temperatura di equilibrio del sensore", "°C") } },
  Traw: raw("T(ε=1)", "temperatura senza correzione di emissività", "°C"),
  // --- fotocellula
  gate: { sym: "stato", name: "raggio (1 = interrotto)", unit: "", models: [] },
  n: { sym: "N", name: "passaggi contati", unit: "", models: ["lin"], slope: "passaggi al secondo",
    physics: { lin: [{ label: "frequenza dei passaggi", unit: "Hz", calc: (f) => P(f, "m") }] } },
  Tp: { sym: "Tₚ", name: "tempo tra due passaggi", unit: "s", models: ["mean", "lin"],
    physics: { mean: mean("periodo medio", "s"), lin: [{ label: "variazione del periodo a ogni secondo", unit: "s/s", calc: (f) => P(f, "m") }] } },
  tb: { sym: "Δtₒ", name: "tempo di oscuramento", unit: "s", models: ["mean", "lin"], physics: { mean: mean("tempo di oscuramento medio", "s") } },
  vg: { sym: "vₒ", name: "velocità al passaggio", unit: "m/s", models: ["mean", "lin"], slope: "accelerazione",
    physics: { mean: mean("velocità media al passaggio", "m/s"), lin: [{ label: "accelerazione a = m", unit: "m/s²", calc: (f) => P(f, "m") }] } },
  fg: { sym: "f", name: "frequenza dei passaggi", unit: "Hz", models: ["mean"], physics: { mean: mean("frequenza media", "Hz") } },
  // --- bilancia
  m: { sym: "m", name: "massa", unit: "g", models: ["mean", "lin", "expC"], slope: "rapidità di variazione della massa",
    physics: { mean: mean("massa media", "g"), lin: [{ label: "dm/dt", unit: "g/s", calc: (f) => P(f, "m") }] } },
  F: { sym: "F", name: "forza", unit: "N", models: ["mean", "lin", "dsin"], slope: "rapidità di variazione della forza",
    physics: { mean: mean("forza media", "N"), lin: [{ label: "dF/dt", unit: "N/s", calc: (f) => P(f, "m") }], dsin: periodFrom() } },
  cnt: raw("cnt", "conteggi dell'HX711"),
  // --- accelerometro
  ax: { sym: "aₓ", name: "accelerazione x", unit: "m/s²", models: ["mean", "lin", "dsin"], physics: { mean: mean("accelerazione media x", "m/s²"), dsin: periodFrom() } },
  ay: { sym: "aᵧ", name: "accelerazione y", unit: "m/s²", models: ["mean", "lin", "dsin"], physics: { mean: mean("accelerazione media y", "m/s²"), dsin: periodFrom() } },
  az: { sym: "a_z", name: "accelerazione z", unit: "m/s²", models: ["mean", "lin", "dsin"], physics: { mean: mean("accelerazione media z", "m/s²"), dsin: periodFrom() } },
  am: { sym: "|a|", name: "accelerazione (modulo)", unit: "m/s²", models: ["mean", "dsin"], physics: { mean: mean("modulo medio (fermo ≈ g)", "m/s²"), dsin: periodFrom() } },
  gx: { sym: "ωₓ", name: "velocità angolare x", unit: "°/s", models: ["mean", "dsin"], physics: { dsin: periodFrom() } },
  gy: { sym: "ωᵧ", name: "velocità angolare y", unit: "°/s", models: ["mean", "dsin"], physics: { dsin: periodFrom() } },
  gz: { sym: "ω_z", name: "velocità angolare z", unit: "°/s", models: ["mean", "dsin"], physics: { dsin: periodFrom() } },
  // --- microfono
  freq: { sym: "f", name: "frequenza dominante", unit: "Hz", models: ["mean", "lin"], slope: "rapidità di variazione della frequenza",
    physics: { mean: mean("frequenza media", "Hz"), lin: [{ label: "df/dt", unit: "Hz/s", calc: (f) => P(f, "m") }] } },
  level: { sym: "L", name: "livello sonoro (relativo)", unit: "dB", models: ["mean", "lin", "dsin"], physics: { mean: mean("livello medio", "dB") } },
};

/** Chiave di base: "T_2" → "T". */
export const baseKey = (k: string) => k.replace(/_\d+$/, "");
const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** Simbolo con il numero del sensore: T_2 → T₂. */
export function symOf(key: string, sym?: string) {
  const m = key.match(/_(\d+)$/);
  const s = sym ?? QUANTITIES[baseKey(key)]?.sym ?? key;
  return m ? `${s}${[...m[1]].map((d) => SUB[+d]).join("")}` : s;
}
/** Descrizione della grandezza (anche per le chiavi con suffisso). */
export const quantityOf = (key: string): Quantity | undefined => QUANTITIES[key] ?? QUANTITIES[baseKey(key)];
