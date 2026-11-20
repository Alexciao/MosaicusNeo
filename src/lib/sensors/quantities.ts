// MosaicusNeo — le grandezze: simbolo, nome, unità, modelli di fit consigliati e significato
// fisico dei loro parametri (usati dalla pagina Elaborazione).
//
// Le chiavi sono "di base" (T, RH, x…). Se in un montaggio ci sono due sensori che misurano la
// stessa grandezza, il secondo diventa T_2, RH_2…: baseKey() toglie il suffisso.

import { P } from "@/lib/mosaicus/fits.js";
import { t } from "@/i18n";

type Fit = Parameters<typeof P>[0];
export interface Physics { label: string; unit: string; calc: (fit: Fit) => number[] }
export interface Quantity {
  sym: string; name: string; unit: string;
  models?: string[]; slope?: string; raw?: boolean;
  physics?: Record<string, Physics[]>;
}

const TWO_PI = 2 * Math.PI;
const L = {
  period: t("sensors.physics.period"), frequency: t("sensors.physics.frequency"), tau: t("sensors.physics.tau"),
  theta: t("sensors.physics.theta"), accelM: t("sensors.physics.accelM"), accel2c2: t("sensors.physics.accel2c2"),
  meanFreq: t("sensors.physics.meanFreq"),
};
const periodFrom = (unit = "s"): Physics[] => [
  { label: L.period, unit, calc: (f) => { const [w, s] = P(f, "w"); return [TWO_PI / w, (TWO_PI * s) / (w * w)]; } },
  { label: L.frequency, unit: "Hz", calc: (f) => { const [w, s] = P(f, "w"); return [w / TWO_PI, s / TWO_PI]; } },
];
const decayFrom = (eqLabel: string, eqUnit: string): Physics[] => [
  { label: L.tau, unit: "s", calc: (f) => { const [k, s] = P(f, "k"); return [-1 / k, s / (k * k)]; } },
  { label: eqLabel, unit: eqUnit, calc: (f) => P(f, "C") },
];
const mean = (label: string, unit: string): Physics[] => [{ label, unit, calc: (f) => P(f, "mean") }];
const raw = (sym: string, name: string, unit = ""): Quantity => ({ sym, name, unit, models: [], raw: true });
const accelAxis = (axis: string) => t("sensors.quantities.axis", { axis });
const meanAxis = (axis: string) => t("sensors.physics.meanAxis", { axis });
const gyroAxis = (axis: string) => t("sensors.quantities.gyro", { axis });

export const QUANTITIES: Record<string, Quantity> = {
  t: { sym: "t", name: t("sensors.quantities.t"), unit: "s" },
  // --- cinematica (HC-SR04)
  x: { sym: "x", name: t("sensors.quantities.x"), unit: "m", models: ["lin", "poly2", "dsin"], slope: t("sensors.slopes.velocity"),
    physics: {
      lin: [{ label: t("sensors.physics.velocityM"), unit: "m/s", calc: (f) => P(f, "m") }],
      poly2: [{ label: L.accel2c2, unit: "m/s²", calc: (f) => { const [c, s] = P(f, "c2"); return [2 * c, 2 * s]; } }],
      dsin: [...periodFrom(), { label: t("sensors.physics.amplitude"), unit: "m", calc: (f) => P(f, "A") },
        { label: t("sensors.physics.eqPosition"), unit: "m", calc: (f) => P(f, "C") },
        { label: t("sensors.physics.damping"), unit: "s⁻¹", calc: (f) => P(f, "g") }],
    } },
  v: { sym: "v", name: t("sensors.quantities.v"), unit: "m/s", models: ["lin", "mean", "dsin"], slope: t("sensors.slopes.acceleration"),
    physics: {
      lin: [{ label: L.accelM, unit: "m/s²", calc: (f) => P(f, "m") }],
      mean: mean(t("sensors.physics.meanVelocity"), "m/s"),
      dsin: [...periodFrom(), { label: t("sensors.physics.maxVelocity"), unit: "m/s", calc: (f) => P(f, "A") }],
    } },
  a: { sym: "a", name: t("sensors.quantities.a"), unit: "m/s²", models: ["mean", "dsin"], slope: t("sensors.slopes.jerk"),
    physics: {
      mean: mean(t("sensors.physics.meanAccel"), "m/s²"),
      dsin: [...periodFrom(), { label: t("sensors.physics.maxAccel"), unit: "m/s²", calc: (f) => P(f, "A") }],
    } },
  d: { sym: "d", name: t("sensors.quantities.d"), unit: "m", models: ["lin", "poly2"], raw: true },
  echo: raw(t("sensors.symbols.echo"), t("sensors.quantities.echo"), "µs"),
  // --- temperatura
  T: { sym: "T", name: t("sensors.quantities.T"), unit: "°C", models: ["expC", "lin", "mean"], slope: t("sensors.slopes.rateT"),
    physics: {
      expC: [
        { label: t("sensors.physics.coolingK"), unit: "s⁻¹", calc: (f) => { const [k, s] = P(f, "k"); return [-k, s]; } },
        { label: L.theta, unit: "s", calc: (f) => { const [k, s] = P(f, "k"); return [-1 / k, s / (k * k)]; } },
        { label: t("sensors.physics.ambientT"), unit: "°C", calc: (f) => P(f, "C") },
      ],
      lin: [{ label: t("sensors.physics.rateT"), unit: "°C/s", calc: (f) => P(f, "m") }],
      mean: mean(t("sensors.physics.meanT"), "°C"),
    } },
  lnT: { sym: "ln(T − Tₐ)", name: t("sensors.quantities.lnT"), unit: "", models: ["lin"], slope: t("sensors.slopes.lnT"),
    physics: {
      lin: [
        { label: t("sensors.physics.coolingKm"), unit: "s⁻¹", calc: (f) => { const [m, s] = P(f, "m"); return [-m, s]; } },
        { label: L.theta, unit: "s", calc: (f) => { const [m, s] = P(f, "m"); return [-1 / m, s / (m * m)]; } },
      ],
    } },
  R: { sym: "R", name: t("sensors.quantities.R"), unit: "Ω", models: ["expC", "exp"], raw: true },
  adc: raw("ADC", t("sensors.quantities.adc")),
  // --- umidità (DHT)
  RH: { sym: t("sensors.symbols.RH"), name: t("sensors.quantities.RH"), unit: "%", models: ["expC", "lin", "mean"], slope: t("sensors.slopes.rateRH"),
    physics: {
      expC: decayFrom(t("sensors.physics.eqRH"), "%"),
      lin: [{ label: t("sensors.physics.rateRH"), unit: "%/s", calc: (f) => P(f, "m") }],
      mean: mean(t("sensors.physics.meanRH"), "%"),
    } },
  Td: { sym: "Tᵣ", name: t("sensors.quantities.Td"), unit: "°C", models: ["mean", "expC", "lin"],
    physics: { mean: mean(t("sensors.physics.meanTd"), "°C"), expC: decayFrom(t("sensors.physics.eqTd"), "°C") } },
  AH: { sym: "ρᵥ", name: t("sensors.quantities.AH"), unit: "g/m³", models: ["mean", "expC", "lin"],
    physics: { mean: mean(t("sensors.physics.vapor"), "g/m³"), expC: decayFrom(t("sensors.physics.eqAH"), "g/m³") } },
  // --- tensione e luce
  V: { sym: "V", name: t("sensors.quantities.V"), unit: "V", models: ["mean", "lin", "dsin", "expC"], slope: t("sensors.slopes.rateV"),
    physics: { mean: mean(t("sensors.physics.meanV"), "V"), lin: [{ label: "dV/dt", unit: "V/s", calc: (f) => P(f, "m") }], dsin: periodFrom(), expC: decayFrom(t("sensors.physics.finalV"), "V") } },
  Y: { sym: "y", name: t("sensors.quantities.Y"), unit: "", models: ["mean", "lin", "dsin", "expC"] },
  light: { sym: "L", name: t("sensors.quantities.light"), unit: "%", models: ["mean", "lin", "dsin"],
    physics: { mean: mean(t("sensors.physics.meanLight"), "%"), dsin: periodFrom() } },
  // --- GPS
  lat: { sym: "φ", name: t("sensors.quantities.lat"), unit: "°", models: [] },
  lon: { sym: "λ", name: t("sensors.quantities.lon"), unit: "°", models: [] },
  alt: { sym: "h", name: t("sensors.quantities.alt"), unit: "m", models: ["lin", "mean"], slope: t("sensors.slopes.climb"),
    physics: { lin: [{ label: t("sensors.physics.climbRate"), unit: "m/s", calc: (f) => P(f, "m") }], mean: mean(t("sensors.physics.meanAlt"), "m") } },
  s: { sym: "s", name: t("sensors.quantities.s"), unit: "m", models: ["lin", "poly2"], slope: t("sensors.slopes.avgSpeed"),
    physics: {
      lin: [{ label: t("sensors.physics.avgSpeedM"), unit: "m/s", calc: (f) => P(f, "m") }],
      poly2: [{ label: L.accel2c2, unit: "m/s²", calc: (f) => { const [c, sg] = P(f, "c2"); return [2 * c, 2 * sg]; } }],
    } },
  speed: { sym: "v", name: t("sensors.quantities.speed"), unit: "km/h", models: ["mean", "lin"], physics: { mean: mean(t("sensors.physics.meanSpeed"), "km/h") } },
  sats: raw(t("sensors.symbols.sats"), t("sensors.quantities.sats")),
  hdop: raw("HDOP", t("sensors.quantities.hdop")),
  fix: raw("fix", t("sensors.quantities.fix")),
  utc: raw("UTC", t("sensors.quantities.utc")),
  ok: raw(t("sensors.symbols.ok"), t("sensors.quantities.ok")),
  ...Object.fromEntries(["b0", "b1", "b2", "b3"].map((k) => [k, raw(k, t("sensors.quantities.byte", { n: k[1] }))])),
  err: raw("err", t("sensors.quantities.err")),
  ds: raw("DS", t("sensors.quantities.ds")),
  // --- termometro a infrarossi (MLX90614): T è la superficie inquadrata, Ts il sensore stesso
  Ts: { sym: "Tₛ", name: t("sensors.quantities.Ts"), unit: "°C", models: ["mean", "lin", "expC"],
    physics: { mean: mean(t("sensors.physics.meanTs"), "°C"), lin: [{ label: t("sensors.physics.rateTs"), unit: "°C/s", calc: (f) => P(f, "m") }], expC: decayFrom(t("sensors.physics.eqTs"), "°C") } },
  Traw: raw("T(ε=1)", t("sensors.quantities.Traw"), "°C"),
  // --- polveri sottili (SPS30): concentrazione in massa, in numero, dimensione tipica
  ...Object.fromEntries((["pm1", "pm25", "pm4", "pm10"] as const).map((k) => [k, {
    sym: `PM${{ pm1: "1", pm25: "2.5", pm4: "4", pm10: "10" }[k]}`, name: t(`sensors.quantities.${k}`), unit: "µg/m³", models: ["mean", "lin", "expC"],
    physics: { mean: mean(t("sensors.physics.meanPm"), "µg/m³"), lin: [{ label: t("sensors.physics.ratePm"), unit: "µg/m³/s", calc: (f: Fit) => P(f, "m") }], expC: decayFrom(t("sensors.physics.eqPm"), "µg/m³") },
  } satisfies Quantity])),
  ...Object.fromEntries((["nc05", "nc1", "nc25", "nc4", "nc10"] as const).map((k) => [k, {
    sym: `N${{ nc05: "0.5", nc1: "1", nc25: "2.5", nc4: "4", nc10: "10" }[k]}`, name: t(`sensors.quantities.${k}`), unit: "#/cm³", models: ["mean", "lin"],
    physics: { mean: mean(t("sensors.physics.meanNc"), "#/cm³") },
  } satisfies Quantity])),
  tps: { sym: "d", name: t("sensors.quantities.tps"), unit: "µm", models: ["mean"], physics: { mean: mean(t("sensors.physics.meanTps"), "µm") } },
  // --- fotocellula
  gate: { sym: t("sensors.symbols.gate"), name: t("sensors.quantities.gate"), unit: "", models: [] },
  n: { sym: "N", name: t("sensors.quantities.n"), unit: "", models: ["lin"], slope: t("sensors.slopes.passRate"),
    physics: { lin: [{ label: t("sensors.physics.passFreq"), unit: "Hz", calc: (f) => P(f, "m") }] } },
  Tp: { sym: "Tₚ", name: t("sensors.quantities.Tp"), unit: "s", models: ["mean", "lin"],
    physics: { mean: mean(t("sensors.physics.meanPeriod"), "s"), lin: [{ label: t("sensors.physics.periodDrift"), unit: "s/s", calc: (f) => P(f, "m") }] } },
  tb: { sym: "Δtₒ", name: t("sensors.quantities.tb"), unit: "s", models: ["mean", "lin"], physics: { mean: mean(t("sensors.physics.meanBlock"), "s") } },
  vg: { sym: "vₒ", name: t("sensors.quantities.vg"), unit: "m/s", models: ["mean", "lin"], slope: t("sensors.slopes.acceleration"),
    physics: { mean: mean(t("sensors.physics.meanGateVel"), "m/s"), lin: [{ label: L.accelM, unit: "m/s²", calc: (f) => P(f, "m") }] } },
  fg: { sym: "f", name: t("sensors.quantities.fg"), unit: "Hz", models: ["mean"], physics: { mean: mean(L.meanFreq, "Hz") } },
  // --- bilancia
  m: { sym: "m", name: t("sensors.quantities.m"), unit: "g", models: ["mean", "lin", "expC"], slope: t("sensors.slopes.rateM"),
    physics: { mean: mean(t("sensors.physics.meanMass"), "g"), lin: [{ label: "dm/dt", unit: "g/s", calc: (f) => P(f, "m") }] } },
  F: { sym: "F", name: t("sensors.quantities.F"), unit: "N", models: ["mean", "lin", "dsin"], slope: t("sensors.slopes.rateF"),
    physics: { mean: mean(t("sensors.physics.meanForce"), "N"), lin: [{ label: "dF/dt", unit: "N/s", calc: (f) => P(f, "m") }], dsin: periodFrom() } },
  cnt: raw("cnt", t("sensors.quantities.cnt")),
  // --- accelerometro
  ax: { sym: "aₓ", name: accelAxis("x"), unit: "m/s²", models: ["mean", "lin", "dsin"], physics: { mean: mean(meanAxis("x"), "m/s²"), dsin: periodFrom() } },
  ay: { sym: "aᵧ", name: accelAxis("y"), unit: "m/s²", models: ["mean", "lin", "dsin"], physics: { mean: mean(meanAxis("y"), "m/s²"), dsin: periodFrom() } },
  az: { sym: "a_z", name: accelAxis("z"), unit: "m/s²", models: ["mean", "lin", "dsin"], physics: { mean: mean(meanAxis("z"), "m/s²"), dsin: periodFrom() } },
  am: { sym: "|a|", name: t("sensors.quantities.am"), unit: "m/s²", models: ["mean", "dsin"], physics: { mean: mean(t("sensors.physics.meanMagnitude"), "m/s²"), dsin: periodFrom() } },
  gx: { sym: "ωₓ", name: gyroAxis("x"), unit: "°/s", models: ["mean", "dsin"], physics: { dsin: periodFrom() } },
  gy: { sym: "ωᵧ", name: gyroAxis("y"), unit: "°/s", models: ["mean", "dsin"], physics: { dsin: periodFrom() } },
  gz: { sym: "ω_z", name: gyroAxis("z"), unit: "°/s", models: ["mean", "dsin"], physics: { dsin: periodFrom() } },
  // --- microfono
  freq: { sym: "f", name: t("sensors.quantities.freq"), unit: "Hz", models: ["mean", "lin"], slope: t("sensors.slopes.rateFreq"),
    physics: { mean: mean(L.meanFreq, "Hz"), lin: [{ label: "df/dt", unit: "Hz/s", calc: (f) => P(f, "m") }] } },
  level: { sym: "L", name: t("sensors.quantities.level"), unit: "dB", models: ["mean", "lin", "dsin"], physics: { mean: mean(t("sensors.physics.meanLevel"), "dB") } },
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
