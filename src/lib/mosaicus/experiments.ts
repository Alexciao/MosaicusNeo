// Mosaicus — catalogo degli esperimenti.
// Ogni esperimento dichiara: argomento, parametri, comando per il firmware, conversione
// della riga grezza in un campione, grandezze derivate, grafici, e la descrizione delle
// grandezze (simbolo, unità, modelli consigliati e significato fisico dei parametri) usata
// dalla pagina Elaborazione. Aggiungere un esperimento = aggiungere un oggetto a EXPERIMENTS.

import type { LucideIcon } from 'lucide-react';
import {
  AudioLines, AudioWaveform, Droplets, MoveRight, Piano, Rotate3d, Smartphone, Thermometer,
  WavesHorizontal, Zap,
} from 'lucide-react';
import { localPolyDerivs } from './analysis.js';
import { P } from './fits.js';

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------
export type Row = Record<string, number | boolean> & { t: number };
export type Params = Record<string, number | string>;
type Fit = Parameters<typeof P>[0];

export interface Physics { label: string; unit: string; calc: (fit: Fit) => number[] }
export interface Quantity {
  sym: string; name: string; unit: string;
  models?: string[]; slope?: string; raw?: boolean;
  physics?: Record<string, Physics[]>;
}
export interface Param {
  key: string; label: string; unit?: string; value: number | string;
  min?: number; step?: number; advanced?: boolean;
  type?: 'number' | 'select'; options?: [string, string][];
}
export interface View { id: string; label: string; key: string; yLabel: string; sym: string; line?: boolean; raw?: boolean }
export interface Readout { key: string; label: string; unit: string; digits: number }
export interface Column { key: string; head: string }
export type Schematic = 'hcsr04' | 'ntc' | 'mic' | 'coil' | 'dht';
export interface WiringBlock { title: string; text?: string; schematic?: Schematic; warn?: boolean; tip?: boolean }
export type Tone = 'lime' | 'sky' | 'rose' | 'saffron';

export interface Experiment {
  id: string;
  topic: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  /** da dove arrivano i dati: Arduino (predefinito), sensori del telefono, solo audio del dispositivo */
  source?: 'arduino' | 'phone' | 'audio';
  /** strumento con un pannello proprio invece della serie temporale */
  kind?: 'scope' | 'synth';
  /** il collegamento è facoltativo (es. synth: Arduino serve solo per un modo) */
  optionalLink?: boolean;
  hidden?: boolean;
  /** prima lettera delle righe dati dal firmware, es. 'T' per T,<t>,<adc> */
  lineType?: string;
  /** scenario del simulatore */
  sim?: string;
  /** nota mostrata con lo stato del simulatore */
  simNote?: string;
  command?: (p: Params) => string;
  params: Param[];
  wiring: WiringBlock[];
  parse?: (fields: number[], p: Params) => Row | null;
  derive?: (rows: Row[], p: Params) => Row[];
  views: View[];
  defaultVisible?: string[];
  readouts: Readout[];
  columns: Column[];
  xLabel?: string;
}

// ---------------------------------------------------------------------------
// Grandezze fisiche ricavate dai parametri dei fit (propagazione al primo ordine)
// ---------------------------------------------------------------------------
const TWO_PI = 2 * Math.PI;
const periodFrom = (unit = 's'): Physics[] => [
  { label: 'periodo T = 2π/ω', unit, calc: (f) => { const [w, s] = P(f, 'w'); return [TWO_PI / w, (TWO_PI * s) / (w * w)]; } },
  { label: 'frequenza f = ω/2π', unit: 'Hz', calc: (f) => { const [w, s] = P(f, 'w'); return [w / TWO_PI, s / TWO_PI]; } },
];
const decayFrom = (eqLabel: string, eqUnit: string): Physics[] => [
  { label: 'tempo caratteristico τ = −1/k', unit: 's', calc: (f) => { const [k, s] = P(f, 'k'); return [-1 / k, s / (k * k)]; } },
  { label: eqLabel, unit: eqUnit, calc: (f) => P(f, 'C') },
];

const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const num = (v: number | string) => Number(v);

// ---------------------------------------------------------------------------
// Grandezze: come si chiamano, in che unità, cosa significano i parametri dei fit
// ---------------------------------------------------------------------------
const Q_T: Quantity = { sym: 't', name: 'tempo', unit: 's' };
const Q: Record<string, Quantity> = {
  x: { sym: 'x', name: 'posizione', unit: 'm', models: ['lin', 'poly2', 'dsin'], slope: 'velocità',
    physics: {
      lin: [{ label: 'velocità v = m', unit: 'm/s', calc: (f) => P(f, 'm') }],
      poly2: [{ label: 'accelerazione a = 2·c₂', unit: 'm/s²', calc: (f) => { const [c, s] = P(f, 'c2'); return [2 * c, 2 * s]; } }],
      dsin: [...periodFrom(), { label: 'ampiezza A', unit: 'm', calc: (f) => P(f, 'A') },
        { label: 'posizione di equilibrio C', unit: 'm', calc: (f) => P(f, 'C') },
        { label: 'coefficiente di smorzamento γ', unit: 's⁻¹', calc: (f) => P(f, 'g') }],
    } },
  v: { sym: 'v', name: 'velocità', unit: 'm/s', models: ['lin', 'mean', 'dsin'], slope: 'accelerazione',
    physics: {
      lin: [{ label: 'accelerazione a = m', unit: 'm/s²', calc: (f) => P(f, 'm') }],
      mean: [{ label: 'velocità media', unit: 'm/s', calc: (f) => P(f, 'mean') }],
      dsin: [...periodFrom(), { label: 'velocità massima', unit: 'm/s', calc: (f) => P(f, 'A') }],
    } },
  a: { sym: 'a', name: 'accelerazione', unit: 'm/s²', models: ['mean', 'dsin'], slope: 'variazione dell\'accelerazione',
    physics: {
      mean: [{ label: 'accelerazione media', unit: 'm/s²', calc: (f) => P(f, 'mean') }],
      dsin: [...periodFrom(), { label: 'accelerazione massima', unit: 'm/s²', calc: (f) => P(f, 'A') }],
    } },
  // raw: true = dato tecnico del sensore, utile in Misura ma non inviato a Elaborazione
  d: { sym: 'd', name: 'distanza dal sensore', unit: 'm', models: ['lin', 'poly2'], raw: true },
  echo: { sym: 'eco', name: 'tempo di volo', unit: 'µs', models: [], raw: true },
  T: { sym: 'T', name: 'temperatura', unit: '°C', models: ['expC', 'lin', 'mean'], slope: 'rapidità di variazione della temperatura',
    physics: {
      expC: [
        { label: 'costante di raffreddamento k', unit: 's⁻¹', calc: (f) => { const [k, s] = P(f, 'k'); return [-k, s]; } },
        { label: 'tempo caratteristico θ = 1/k', unit: 's', calc: (f) => { const [k, s] = P(f, 'k'); return [-1 / k, s / (k * k)]; } },
        { label: 'temperatura ambiente Tₐ', unit: '°C', calc: (f) => P(f, 'C') },
      ],
      lin: [{ label: 'rapidità di variazione dT/dt', unit: '°C/s', calc: (f) => P(f, 'm') }],
      mean: [{ label: 'temperatura media', unit: '°C', calc: (f) => P(f, 'mean') }],
    } },
  lnT: { sym: 'ln(T − Tₐ)', name: 'temperatura linearizzata', unit: '', models: ['lin'], slope: 'opposto della costante di raffreddamento (−k)',
    physics: {
      lin: [
        { label: 'costante di raffreddamento k = −m', unit: 's⁻¹', calc: (f) => { const [m, s] = P(f, 'm'); return [-m, s]; } },
        { label: 'tempo caratteristico θ = 1/k', unit: 's', calc: (f) => { const [m, s] = P(f, 'm'); return [-1 / m, s / (m * m)]; } },
      ],
    } },
  adc: { sym: 'ADC', name: 'lettura grezza', unit: '', models: [], raw: true },
  ...Object.fromEntries(['ax', 'ay', 'az', 'amod'].map((k) => [k, {
    sym: k === 'amod' ? '|a|' : `a_${k[1]}`, name: k === 'amod' ? 'accelerazione (modulo)' : `accelerazione lungo ${k[1]}`, unit: 'm/s²',
    models: ['dsin', 'mean', 'lin'], slope: 'variazione dell\'accelerazione',
    physics: {
      dsin: [...periodFrom(), { label: 'ampiezza', unit: 'm/s²', calc: (f: Fit) => P(f, 'A') }, { label: 'valore medio C', unit: 'm/s²', calc: (f: Fit) => P(f, 'C') }],
      mean: [{ label: 'accelerazione media', unit: 'm/s²', calc: (f: Fit) => P(f, 'mean') }],
    } } as Quantity])),
  ...Object.fromEntries(['wx', 'wy', 'wz'].map((k) => [k, {
    sym: `ω_${k[1]}`, name: `velocità angolare attorno a ${k[1]}`, unit: 'rad/s',
    models: ['dsin', 'mean', 'lin'], slope: 'accelerazione angolare',
    physics: {
      dsin: [...periodFrom(), { label: 'velocità angolare massima', unit: 'rad/s', calc: (f: Fit) => P(f, 'A') }, { label: 'smorzamento γ', unit: 's⁻¹', calc: (f: Fit) => P(f, 'g') }],
      mean: [{ label: 'velocità angolare media ω', unit: 'rad/s', calc: (f: Fit) => P(f, 'mean') },
        { label: 'periodo di rotazione T = 2π/ω', unit: 's', calc: (f: Fit) => { const [w, s] = P(f, 'mean'); return [TWO_PI / Math.abs(w), (TWO_PI * s) / (w * w)]; } }],
      lin: [{ label: 'accelerazione angolare α = m', unit: 'rad/s²', calc: (f: Fit) => P(f, 'm') }],
    } } as Quantity])),
  freq: { sym: 'f', name: 'frequenza dominante', unit: 'Hz', models: ['mean', 'lin'],
    physics: { mean: [{ label: 'frequenza media', unit: 'Hz', calc: (f) => P(f, 'mean') }] } },
  level: { sym: 'L', name: 'livello sonoro (relativo)', unit: 'dB', models: ['mean', 'dsin'],
    physics: { dsin: [...periodFrom(), { label: 'frequenza dei battimenti (se la curva è |cos|, è il doppio di f)', unit: 'Hz', calc: (f) => { const [w, s] = P(f, 'w'); return [w / TWO_PI, s / TWO_PI]; } }] } },
  R: { sym: 'R', name: 'resistenza del termistore', unit: 'Ω', models: ['expC', 'exp'], raw: true },
  // DHT11 / DHT22
  RH: { sym: 'UR', name: 'umidità relativa', unit: '%', models: ['expC', 'lin', 'mean'], slope: 'rapidità di variazione dell\'umidità',
    physics: {
      expC: decayFrom('umidità di equilibrio', '%'),
      lin: [{ label: 'rapidità di variazione dUR/dt', unit: '%/s', calc: (f) => P(f, 'm') }],
      mean: [{ label: 'umidità media', unit: '%', calc: (f) => P(f, 'mean') }],
    } },
  Td: { sym: 'Tᵣ', name: 'punto di rugiada', unit: '°C', models: ['mean', 'expC', 'lin'],
    physics: {
      mean: [{ label: 'punto di rugiada medio', unit: '°C', calc: (f) => P(f, 'mean') }],
      expC: decayFrom('punto di rugiada di equilibrio', '°C'),
    } },
  AH: { sym: 'ρᵥ', name: 'umidità assoluta', unit: 'g/m³', models: ['mean', 'expC', 'lin'],
    physics: {
      mean: [{ label: 'vapore acqueo per metro cubo', unit: 'g/m³', calc: (f) => P(f, 'mean') }],
      expC: decayFrom('umidità assoluta di equilibrio', 'g/m³'),
    } },
  ...Object.fromEntries(['b0', 'b1', 'b2', 'b3'].map((k) => [k, { sym: k, name: `byte ${k[1]} del sensore`, unit: '', models: [], raw: true } as Quantity])),
};
export const QUANTITIES: Record<string, Quantity> = { t: Q_T, ...Q };

// ---------------------------------------------------------------------------
// Termologia · Raffreddamento (legge di Newton) con termistore NTC
// ---------------------------------------------------------------------------
const cooling: Experiment = {
  id: 'cooling', topic: 'Termologia', title: 'Raffreddamento', subtitle: 'Legge di Newton · termistore NTC',
  icon: Thermometer, tone: 'rose', lineType: 'T', sim: 'cooling', simNote: 'tempo ×30',
  command: (p) => `START,TEMP,${Math.round(num(p.interval))}`,
  params: [
    { key: 'interval', label: 'Intervallo di campionamento', unit: 'ms', value: 1000, min: 100, step: 100 },
    { key: 'tAmb', label: 'Temperatura ambiente Tₐ (per la vista linearizzata)', unit: '°C', value: 21, step: 0.1 },
    { key: 'orientation', label: 'Posizione del termistore nel partitore', type: 'select', value: 'ntc5v',
      options: [['ntc5v', 'NTC tra 5 V e A0 (lezione Elegoo)'], ['ntcgnd', 'NTC tra A0 e GND']] },
    { key: 'rSeries', label: 'Resistenza fissa del partitore', unit: 'Ω', value: 10000, step: 100, advanced: true },
    { key: 'r0', label: 'R₀ del termistore (a T₀)', unit: 'Ω', value: 10000, step: 100, advanced: true },
    { key: 't0', label: 'T₀ di riferimento', unit: '°C', value: 25, step: 0.1, advanced: true },
    { key: 'beta', label: 'Coefficiente B (Beta)', unit: 'K', value: 3950, step: 10, advanced: true },
    { key: 'offset', label: 'Correzione di taratura (si somma a T)', unit: '°C', value: 0, step: 0.1, advanced: true },
  ],
  wiring: [{ title: 'Con Arduino', schematic: 'ntc', text: 'Termistore in una patata calda, poi lascialo raffreddare.' }],
  /** fields = [t_ms, adc] */
  parse(fields, p) {
    const tMs = +fields[0], adc = +fields[1];
    if (!isFinite(tMs) || !isFinite(adc)) return null;
    let R: number;
    const rs = num(p.rSeries);
    if (adc <= 0.5 || adc >= 1022.5) R = NaN; // fuori scala: circuito aperto o in corto
    else if (p.orientation === 'ntc5v') R = rs * (1023 - adc) / adc;
    else R = rs * adc / (1023 - adc);
    const Tk = 1 / (1 / (num(p.t0) + 273.15) + Math.log(R / num(p.r0)) / num(p.beta));
    const T = Tk - 273.15 + num(p.offset);
    return { t: tMs / 1000, adc, R, T };
  },
  derive(samples, p) {
    const ta = num(p.tAmb);
    return samples.map((s) => ({ ...s, lnT: (s.T as number) - ta > 0 ? Math.log((s.T as number) - ta) : NaN }));
  },
  views: [
    { id: 'T', label: 'T(t)', key: 'T', yLabel: 'T (°C)', sym: 'T' },
    { id: 'lnT', label: 'ln(T − Tₐ)', key: 'lnT', yLabel: 'ln[(T − Tₐ) / °C]', sym: 'ln(T−Tₐ)' },
    { id: 'adc', label: 'Dato grezzo (ADC)', key: 'adc', yLabel: 'ADC (0–1023)', sym: 'ADC', raw: true },
  ],
  defaultVisible: ['T'],
  readouts: [{ key: 'T', label: 'Temperatura', unit: '°C', digits: 2 }, { key: 'R', label: 'Resistenza NTC', unit: 'Ω', digits: 0 }],
  columns: [
    { key: 't', head: 't (s)' }, { key: 'adc', head: 'ADC' }, { key: 'R', head: 'R_NTC (ohm)' },
    { key: 'T', head: 'T (°C)' }, { key: 'lnT', head: 'ln(T-Ta)' },
  ],
  xLabel: 't (s)',
};

// ---------------------------------------------------------------------------
// Termologia · Umidità e temperatura con DHT11 (o DHT22)
// ---------------------------------------------------------------------------
/** Punto di rugiada con la formula di Magnus (coefficienti di Sonntag, −45…60 °C). */
export function dewPoint(T: number, RH: number) {
  if (!isFinite(T) || !(RH > 0)) return NaN;
  const b = 17.62, c = 243.12;
  const g = Math.log(RH / 100) + (b * T) / (c + T);
  return (c * g) / (b - g);
}
/** Umidità assoluta (g di vapore per m³ d'aria) dalla pressione di vapore saturo. */
export function absoluteHumidity(T: number, RH: number) {
  if (!isFinite(T) || !isFinite(RH)) return NaN;
  const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5)); // hPa
  return (es * RH * 2.1674) / (273.15 + T);
}
/** Decodifica i 4 byte del sensore: DHT11 (parte intera + decimi) o DHT22 (16 bit, decimi). */
export function decodeDht(b: number[], type: string) {
  const [b0, b1, b2, b3] = b;
  if (type === 'dht22') {
    const RH = ((b0 << 8) | b1) / 10;
    const T = (((b2 & 0x7f) << 8) | b3) / 10 * (b2 & 0x80 ? -1 : 1);
    return { RH, T };
  }
  const RH = b0 + b1 / 10;
  const T = (b2 + (b3 & 0x7f) / 10) * (b3 & 0x80 ? -1 : 1);
  return { RH, T };
}

const humidity: Experiment = {
  id: 'humidity', topic: 'Termologia', title: 'Umidità e temperatura', subtitle: 'Punto di rugiada · DHT11',
  icon: Droplets, tone: 'sky', lineType: 'H', sim: 'dht', simNote: 'tempo ×5',
  command: (p) => `START,DHT,${Math.round(num(p.interval))},${p.sensor === 'dht22' ? 22 : 11}`,
  params: [
    { key: 'interval', label: 'Intervallo di campionamento', unit: 'ms', value: 2000, min: 1000, step: 500 },
    { key: 'sensor', label: 'Sensore', type: 'select', value: 'dht11',
      options: [['dht11', 'DHT11 (blu, ±2 °C, ±5 %)'], ['dht22', 'DHT22 / AM2302 (bianco, ±0,5 °C, ±2 %)']] },
    { key: 'offsetT', label: 'Correzione di taratura della temperatura', unit: '°C', value: 0, step: 0.1, advanced: true },
    { key: 'offsetRH', label: 'Correzione di taratura dell\'umidità', unit: '%', value: 0, step: 0.5, advanced: true },
  ],
  wiring: [
    { title: 'Con Arduino', schematic: 'dht', text: 'Modulo a 3 pin: DATA al pin 2. Il sensore "nudo" a 4 pin vuole anche 10 kΩ tra DATA e 5 V.' },
    { title: 'Idea', tip: true, text: 'Soffia sul sensore: l\'umidità sale di colpo e poi torna giù lentamente. Con un fit esponenziale misuri il tempo caratteristico. Il punto di rugiada dice a che temperatura il vapore diventerebbe nebbia.' },
  ],
  /** fields = [t_ms, b0, b1, b2, b3, err] */
  parse(f, p) {
    if (!isFinite(f[0])) return null;
    const bytes = [f[1], f[2], f[3], f[4]];
    const ok = f[5] === 0 && bytes.every(isFinite);
    const { RH, T } = ok ? decodeDht(bytes, String(p.sensor)) : { RH: NaN, T: NaN };
    const plausible = ok && RH >= 0 && RH <= 100 && T > -45 && T < 85;
    return {
      t: f[0] / 1000, b0: f[1], b1: f[2], b2: f[3], b3: f[4], err: f[5], ok: plausible,
      RH: plausible ? Math.min(100, Math.max(0, RH + num(p.offsetRH))) : NaN,
      T: plausible ? T + num(p.offsetT) : NaN,
    };
  },
  derive(rows) {
    return rows.map((r) => ({ ...r, Td: dewPoint(r.T as number, r.RH as number), AH: absoluteHumidity(r.T as number, r.RH as number) }));
  },
  views: [
    { id: 'RH', label: 'UR(t)', key: 'RH', yLabel: 'UR (%)', sym: 'UR', line: true },
    { id: 'T', label: 'T(t)', key: 'T', yLabel: 'T (°C)', sym: 'T', line: true },
    { id: 'Td', label: 'Tᵣ(t)', key: 'Td', yLabel: 'Tᵣ (°C)', sym: 'Tᵣ', line: true },
    { id: 'AH', label: 'ρᵥ(t)', key: 'AH', yLabel: 'ρᵥ (g/m³)', sym: 'ρᵥ', line: true },
  ],
  defaultVisible: ['RH', 'T'],
  readouts: [
    { key: 'RH', label: 'Umidità relativa', unit: '%', digits: 1 },
    { key: 'T', label: 'Temperatura', unit: '°C', digits: 1 },
    { key: 'Td', label: 'Punto di rugiada', unit: '°C', digits: 1 },
  ],
  columns: [
    { key: 't', head: 't (s)' }, { key: 'b0', head: 'byte 0' }, { key: 'b1', head: 'byte 1' }, { key: 'b2', head: 'byte 2' }, { key: 'b3', head: 'byte 3' },
    { key: 'ok', head: 'valido' }, { key: 'RH', head: 'UR (%)' }, { key: 'T', head: 'T (°C)' }, { key: 'Td', head: 'Td (°C)' }, { key: 'AH', head: 'umidità assoluta (g/m3)' },
  ],
  xLabel: 't (s)',
};

// ---------------------------------------------------------------------------
// Cinematica · sensore a ultrasuoni HC-SR04 (parte comune)
// ---------------------------------------------------------------------------
function sonarExperiment({ id, title, subtitle, icon, tone, sim, window = 4, tip }:
  { id: string; title: string; subtitle: string; icon: LucideIcon; tone: Tone; sim: string; window?: number; tip: string }): Experiment {
  return {
    id, topic: 'Cinematica', title, subtitle, icon, tone, sim, lineType: 'S',
    command: (p) => `START,SONAR,${Math.round(num(p.interval))}`,
    params: [
      { key: 'interval', label: 'Intervallo di campionamento', unit: 'ms', value: 50, min: 30, step: 5 },
      { key: 'tAir', label: "Temperatura dell'aria (velocità del suono)", unit: '°C', value: 20, step: 0.5 },
      { key: 'direction', label: 'Verso positivo', type: 'select', value: 'away',
        options: [['away', 'Allontanamento dal sensore'], ['toward', 'Avvicinamento al sensore']] },
      { key: 'window', label: 'Lisciatura per v e a (punti per lato)', value: window, min: 1, step: 1, advanced: true },
      { key: 'origin', label: 'Origine delle posizioni (distanza dal sensore)', unit: 'm', value: 0, step: 0.001, advanced: true },
      { key: 'dMin', label: 'Distanza minima accettata', unit: 'm', value: 0.03, step: 0.01, advanced: true },
      { key: 'dMax', label: 'Distanza massima accettata', unit: 'm', value: 3.0, step: 0.1, advanced: true },
      { key: 'spike', label: 'Scarta salti anomali maggiori di', unit: 'm', value: 0.10, step: 0.01, advanced: true },
    ],
    wiring: [{ title: 'Con Arduino', schematic: 'hcsr04', text: tip }],
    /** fields = [t_us, eco_us] */
    parse(fields, p) {
      const tUs = +fields[0], echo = +fields[1];
      if (!isFinite(tUs) || !isFinite(echo)) return null;
      const vSound = 331.3 + 0.606 * num(p.tAir);
      const d = echo > 0 ? (vSound * echo) / 2e6 : NaN;
      return { t: tUs / 1e6, echo, d };
    },
    derive(samples, p) {
      const sign = p.direction === 'toward' ? -1 : 1;
      const dMin = num(p.dMin), dMax = num(p.dMax), spike = num(p.spike), origin = num(p.origin);
      // 1) validità: eco presente e dentro l'intervallo accettato
      const rows = samples.map((s) => ({ ...s, ok: isFinite(s.d as number) && (s.d as number) >= dMin && (s.d as number) <= dMax })) as Row[];
      // 2) salti anomali: confronto con la mediana dei vicini validi
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
      // 3) posizione, velocità e accelerazione (regressione locale)
      const good = rows.filter((r) => r.ok);
      const t = good.map((r) => r.t), x = good.map((r) => sign * ((r.d as number) - origin));
      const { d1, d2 } = localPolyDerivs(t, x, Math.max(1, Math.round(num(p.window))));
      good.forEach((r, i) => { r.x = x[i]; r.v = d1[i]; r.a = d2[i]; });
      for (const r of rows) if (!r.ok) { r.x = NaN; r.v = NaN; r.a = NaN; }
      return rows;
    },
    views: [
      { id: 'x', label: 'x(t)', key: 'x', yLabel: 'x (m)', sym: 'x' },
      { id: 'v', label: 'v(t)', key: 'v', yLabel: 'v (m/s)', sym: 'v', line: true },
      { id: 'a', label: 'a(t)', key: 'a', yLabel: 'a (m/s²)', sym: 'a', line: true },
      { id: 'echo', label: 'Dato grezzo (eco)', key: 'echo', yLabel: 'tempo di volo (µs)', sym: 'eco', raw: true },
    ],
    defaultVisible: ['x', 'v', 'a'],
    readouts: [{ key: 'x', label: 'Posizione', unit: 'm', digits: 3 }, { key: 'v', label: 'Velocità', unit: 'm/s', digits: 2 }],
    columns: [
      { key: 't', head: 't (s)' }, { key: 'echo', head: 'eco (us)' }, { key: 'd', head: 'distanza (m)' },
      { key: 'ok', head: 'valido' }, { key: 'x', head: 'x (m)' }, { key: 'v', head: 'v (m/s)' }, { key: 'a', head: 'a (m/s2)' },
    ],
    xLabel: 't (s)',
  };
}

const motion = sonarExperiment({
  id: 'motion', title: 'Moto rettilineo', subtitle: 'Uniforme e accelerato · HC-SR04',
  icon: MoveRight, tone: 'sky', sim: 'incline', tip: 'Bersaglio piatto, tra 5 cm e 1 m dal sensore.',
});
const harmonic = sonarExperiment({
  id: 'harmonic', title: 'Moto armonico', subtitle: 'Oscillazioni · HC-SR04',
  icon: WavesHorizontal, tone: 'rose', sim: 'spring', window: 2, tip: 'Sensore a terra, cartoncino sotto la massa.',
});

// ---------------------------------------------------------------------------
// Smartphone · i sensori del telefono, senza Arduino
// ---------------------------------------------------------------------------
const phoneHow = (idea: string): WiringBlock[] => [
  { title: 'Senza Arduino', text: 'Si usano i sensori del telefono: apri Mosaicus sul telefono (Chrome su Android, Safari su iPhone), scegli l\'esperimento e premi «Attiva sensori del telefono». Su iPhone ti verrà chiesto il permesso.' },
  { title: 'Idea', tip: true, text: idea },
];
const AXES_NOTE: WiringBlock = { title: 'Gli assi del telefono', text: 'Con il telefono in verticale davanti a te: x verso destra, y verso l\'alto lungo lo schermo, z uscente dallo schermo verso di te. A telefono fermo sul tavolo a_z ≈ +9,8 m/s²: è la reazione del tavolo, l\'accelerometro "sente" l\'opposto della gravità. Se leggi −9,8, cambia il parametro «Convenzione dei segni».' };

function phoneMotion(base: Pick<Experiment, 'id' | 'title' | 'subtitle' | 'icon' | 'tone' | 'wiring' | 'views' | 'defaultVisible' | 'readouts' | 'columns'> & { hidden?: boolean }): Experiment {
  return {
    topic: 'Smartphone', source: 'phone', lineType: 'P', sim: 'phone-pendulum',
    command: (p) => `START,MOTION,${Math.round(num(p.interval))}`,
    params: [
      { key: 'interval', label: 'Intervallo di campionamento', unit: 'ms', value: 20, min: 10, step: 5 },
      { key: 'sign', label: 'Convenzione dei segni dell\'accelerometro', type: 'select', value: 'std',
        options: [['std', 'Standard (telefono sul tavolo: a_z ≈ +9,8)'], ['inv', 'Invertita']], advanced: true },
    ],
    /** fields = [t_ms, ax, ay, az, wx, wy, wz] */
    parse(f, p) {
      if (!isFinite(f[0])) return null;
      const s = p.sign === 'inv' ? -1 : 1;
      const [ax, ay, az] = [f[1], f[2], f[3]].map((v) => s * v);
      return { t: f[0] / 1000, ax, ay, az, amod: Math.hypot(ax, ay, az), wx: f[4], wy: f[5], wz: f[6] };
    },
    derive: (rows) => rows,
    xLabel: 't (s)',
    ...base,
  };
}

// accelerometro e giroscopio: nascosti dall'elenco finché non entrano in un lab (scelta del docente: lab, non strumenti)
const phoneAcc = phoneMotion({ hidden: true,
  id: 'phoneAcc', title: 'Accelerometro', subtitle: 'Sensori del telefono · a_x, a_y, a_z', icon: Smartphone, tone: 'lime',
  wiring: [AXES_NOTE, ...phoneHow('Pendolo: appendi il telefono a due spaghi, schermo verso di te, e fallo oscillare. Ascensore: telefono sul pavimento, guarda a_z alla partenza e all\'arrivo.')],
  views: [
    { id: 'ax', label: 'a_x(t)', key: 'ax', yLabel: 'a_x (m/s²)', sym: 'a_x', line: true },
    { id: 'ay', label: 'a_y(t)', key: 'ay', yLabel: 'a_y (m/s²)', sym: 'a_y', line: true },
    { id: 'az', label: 'a_z(t)', key: 'az', yLabel: 'a_z (m/s²)', sym: 'a_z', line: true },
    { id: 'amod', label: '|a|(t)', key: 'amod', yLabel: '|a| (m/s²)', sym: '|a|', line: true },
  ],
  defaultVisible: ['ax', 'ay', 'az'],
  readouts: [{ key: 'amod', label: '|a|', unit: 'm/s²', digits: 2 }, { key: 'az', label: 'a_z', unit: 'm/s²', digits: 2 }],
  columns: [{ key: 't', head: 't (s)' }, { key: 'ax', head: 'a_x (m/s2)' }, { key: 'ay', head: 'a_y (m/s2)' }, { key: 'az', head: 'a_z (m/s2)' }, { key: 'amod', head: '|a| (m/s2)' }],
});
const phoneGyro = phoneMotion({ hidden: true,
  id: 'phoneGyro', title: 'Giroscopio', subtitle: 'Sensori del telefono · velocità angolare', icon: Rotate3d, tone: 'sky',
  wiring: [AXES_NOTE, ...phoneHow('Moto circolare uniforme: telefono su una sedia girevole, ω_z costante. Pendolo: il giroscopio mostra il periodo del pendolo, mentre l\'accelerometro lungo il filo oscilla a frequenza doppia. Perché?')],
  views: [
    { id: 'wx', label: 'ω_x(t)', key: 'wx', yLabel: 'ω_x (rad/s)', sym: 'ω_x', line: true },
    { id: 'wy', label: 'ω_y(t)', key: 'wy', yLabel: 'ω_y (rad/s)', sym: 'ω_y', line: true },
    { id: 'wz', label: 'ω_z(t)', key: 'wz', yLabel: 'ω_z (rad/s)', sym: 'ω_z', line: true },
  ],
  defaultVisible: ['wz'],
  readouts: [{ key: 'wz', label: 'ω_z', unit: 'rad/s', digits: 2 }],
  columns: [{ key: 't', head: 't (s)' }, { key: 'wx', head: 'w_x (rad/s)' }, { key: 'wy', head: 'w_y (rad/s)' }, { key: 'wz', head: 'w_z (rad/s)' }],
});

const MIC_BLOCK: WiringBlock = { title: 'Microfono del dispositivo', text: 'Telefono o computer: non serve altro. L\'audio non viene registrato né inviato.' };

const phoneSound: Experiment = {
  id: 'phoneSound', topic: 'Onde e suono', source: 'phone', title: 'Frequenza nel tempo', subtitle: 'Effetto Doppler, glissati · microfono',
  icon: AudioLines, tone: 'rose', lineType: 'M', sim: 'phone-sound',
  command: (p) => `START,SOUND,${Math.round(num(p.interval))}`,
  params: [{ key: 'interval', label: 'Intervallo di campionamento', unit: 'ms', value: 50, min: 30, step: 10 }],
  wiring: [MIC_BLOCK],
  parse(f) { return isFinite(f[0]) ? { t: f[0] / 1000, freq: f[1], level: f[2] } : null; },
  derive: (rows) => rows,
  views: [
    { id: 'freq', label: 'f(t)', key: 'freq', yLabel: 'f (Hz)', sym: 'f' },
    { id: 'level', label: 'livello L(t)', key: 'level', yLabel: 'L (dB)', sym: 'L', line: true },
  ],
  defaultVisible: ['freq', 'level'],
  readouts: [{ key: 'freq', label: 'Frequenza', unit: 'Hz', digits: 1 }, { key: 'level', label: 'Livello', unit: 'dB', digits: 1 }],
  columns: [{ key: 't', head: 't (s)' }, { key: 'freq', head: 'f (Hz)' }, { key: 'level', head: 'L (dB)' }],
  xLabel: 't (s)',
};

// ---------------------------------------------------------------------------
// Strumenti con un pannello proprio (kind), non serie temporali
// ---------------------------------------------------------------------------
const instrument = (o: Omit<Experiment, 'params' | 'views' | 'columns' | 'readouts'>): Experiment => ({ params: [], views: [], columns: [], readouts: [], ...o });

const scopeAudio = instrument({
  id: 'scope', topic: 'Onde e suono', kind: 'scope', source: 'audio', title: 'Oscilloscopio', subtitle: 'Guarda la forma di un suono',
  icon: AudioWaveform, tone: 'lime', wiring: [MIC_BLOCK],
});
const synthesizer = instrument({
  id: 'synth', topic: 'Onde e suono', kind: 'synth', source: 'arduino', optionalLink: true, title: 'Synth', subtitle: 'Crea un suono e suonalo: tastiera, dito, telefono, HC-SR04',
  icon: Piano, tone: 'saffron', sim: 'hand',
  wiring: [{ title: 'Con Arduino (facoltativo)', schematic: 'hcsr04', text: 'Sensore rivolto verso l\'alto, la mano sopra tra 5 e 50 cm.' }],
});
const scopeArduino = instrument({
  id: 'escope', topic: 'Elettromagnetismo', kind: 'scope', source: 'arduino', title: 'Oscilloscopio elettrico', subtitle: 'Guarda una tensione: microfono, bobina',
  icon: Zap, tone: 'sky', sim: 'scope',
  wiring: [
    { title: 'Solo 0–5 V', warn: true, text: 'Mai la rete elettrica.' },
    { title: 'Microfono del kit', schematic: 'mic' },
    { title: 'Bobina e magnete', schematic: 'coil', text: 'Fai cadere il magnete nella bobina, trigger singolo.' },
  ],
});

export const EXPERIMENTS: Experiment[] = [motion, harmonic, cooling, humidity, scopeAudio, synthesizer, phoneSound, scopeArduino, phoneAcc, phoneGyro];
export const TOPICS = ['Cinematica', 'Termologia', 'Onde e suono', 'Elettromagnetismo', 'Smartphone'];
export const byId = (id: string | null | undefined) => EXPERIMENTS.find((e) => e.id === id);
export const defaultParams = (exp: Experiment): Params => Object.fromEntries(exp.params.map((p) => [p.key, p.value]));
