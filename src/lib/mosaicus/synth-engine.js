// MosaicusNeo — motore del synth: una sola sorgente di suono per tutta l'app.
//
//  • Timbro: somma di 8 armoniche (sintesi additiva). Le forme d'onda classiche sono ricette
//    di armoniche (serie di Fourier); gli strumenti sono ricette approssimate.
//  • Inviluppo: continuo (organo), pizzicato, campana: smorzamento esponenziale con costante τ.
//  • Volume pareggiato: ogni timbro suona con lo stesso valore efficace (RMS).
// In modalità tastiera il suono continua anche cambiando pagina, così lo si guarda con
// l'oscilloscopio (sorgente «Esempi», che legge l'uscita dell'app). Il pannello è in
// components/instruments/synth-panel.tsx.

import { audio, periodicWave, audioSupported } from './audio.js';
import { TIMBRES, synth } from './dsp.js';
import { t as tr } from '@/i18n';

import { prefs as store } from '@/lib/prefs';

// ---------------------------------------------------------------------------
// Ricette dei timbri
// ---------------------------------------------------------------------------
const odd = (f) => Array.from({ length: 8 }, (_, k) => ((k + 1) % 2 ? f(k + 1) : 0));
/** Forme d'onda classiche: suonano con l'oscillatore "vero" (tutte le armoniche); i cursori ne mostrano le prime 8. */
export const WAVES = {
  sinusoide: { label: tr('engine.synth.waves.sinusoide'), type: 'sine', amps: [1, 0, 0, 0, 0, 0, 0, 0], d: 'M2 12 C6 2 10 2 14 12 S22 22 26 12' },
  quadra: { label: tr('engine.synth.waves.quadra'), type: 'square', amps: odd((n) => 1 / n), d: 'M2 17 V5 H14 V17 H26 V5' },
  triangolare: { label: tr('engine.synth.waves.triangolare'), type: 'triangle', amps: odd((n) => 1 / (n * n)), d: 'M2 12 L8 4 L20 20 L26 12' },
  dente: { label: tr('engine.synth.waves.dente'), type: 'sawtooth', amps: Array.from({ length: 8 }, (_, k) => 1 / (k + 1)), d: 'M2 18 L14 4 V18 L26 4 V18' },
};
export const INSTR = ['flauto', 'clarinetto', 'violino', 'voce', 'organo'];
export const instrLabel = (id) => (id === 'voce' ? tr('engine.dsp.timbres.voceShort') : TIMBRES[id].label);

/** Valore efficace (RMS) della forma d'onda normalizzata a picco 1, come fa Web Audio. */
function rmsOf(amps, signs = null) {
  const n = 2048, y = synth(amps, 1, n, n, { phases: signs ? signs.map((s) => (s < 0 ? Math.PI : 0)) : null });
  let s = 0; for (let i = 0; i < n; i++) s += y[i] * y[i];
  return Math.sqrt(s / n);
}
// per le forme d'onda classiche l'RMS si calcola con molte armoniche (come l'oscillatore vero)
const NH = 128;                                 // armoniche della forma classica (l'oscillatore vero a 220 Hz ne ha circa 100)
const many = (f, N = NH) => Array.from({ length: N }, (_, k) => f(k + 1));
/** Coefficiente (con segno) della k-esima armonica delle forme classiche, come le calcola Web Audio. */
const waveCoef = (type, k) => type === 'sine' ? (k === 1 ? 1 : 0)
  : type === 'square' ? (k % 2 ? 1 / k : 0)
  : type === 'triangle' ? (k % 2 ? (((k - 1) / 2) % 2 ? -1 : 1) / (k * k) : 0)
  : (k % 2 ? 1 : -1) / k;                       // dente di sega (rampa che sale)
const RMS_WAVE = {
  sine: Math.SQRT1_2,
  square: rmsOf(many((n) => (n % 2 ? 1 / n : 0))),
  triangle: rmsOf(many((n) => (n % 2 ? 1 / (n * n) : 0)), many((n) => ((n - 1) / 2) % 2 ? -1 : 1)),
  sawtooth: rmsOf(many((n) => 1 / n)),
};

// ---------------------------------------------------------------------------
// Inviluppi
// ---------------------------------------------------------------------------
export const ENV = {
  continuo: { label: tr('engine.synth.env.continuo'), attack: 0.015, tau: Infinity, d: 'M2 18 L5 6 H23 L26 18' },
  pizzicato: { label: tr('engine.synth.env.pizzicato'), attack: 0.005, tau: 0.25, d: 'M2 18 L4 4 C8 13 12 17 26 18' },
  campana: { label: tr('engine.synth.env.campana'), attack: 0.003, tau: 1.2, d: 'M2 18 L4 4 C12 8 18 14 26 17' },
};

// ---------------------------------------------------------------------------
// Motore (unico per tutta l'app)
// ---------------------------------------------------------------------------
const DEF = { preset: 'sinusoide', amps: [...WAVES.sinusoide.amps], sgn: Array(8).fill(1), tail: [], env: 'continuo', f: 440, vol: 0.6, two: false, df: 3, mode: 'keys', scale: 'pentatonica', tonic: 0, range: 'Do4–Do6' };
const saved = store.get('mosaicus.synth', null) || (() => { const g = store.get('mosaicus.gen', {}); return { f: g.f, vol: g.vol }; })();
export const SY = { ...DEF, ...Object.fromEntries(Object.entries(saved || {}).filter(([k, v]) => k in DEF && v != null)), on: false };
/** Fissa segni e armoniche 9…64 della forma classica: toccando un cursore la "forma libera" parte dall'onda esatta. */
export function classicTail(id) {
  const w = WAVES[id];
  SY.sgn = Array.from({ length: 8 }, (_, i) => (w && waveCoef(w.type, i + 1) < 0 ? -1 : 1));
  SY.tail = w ? Array.from({ length: NH - 8 }, (_, i) => waveCoef(w.type, i + 9)) : [];
}
if (WAVES[SY.preset]) classicTail(SY.preset);
/** Coefficienti (con segno) di tutte le armoniche del timbro attuale: quelli da cui nasce il suono. */
export const fullCoefs = () => {
  const w = WAVES[SY.preset];
  return w ? many((k) => waveCoef(w.type, k), NH) : SY.amps.map((a, i) => a * (SY.sgn[i] || 1)).concat(SY.tail);
};
export const synthCoefs = fullCoefs;           // aggancio per le prove automatiche
export const save = () => { const o = {}; Object.keys(DEF).forEach((k) => (o[k] = SY[k])); store.set('mosaicus.synth', o); };
const listeners = new Set();
export const notify = () => listeners.forEach((fn) => fn(SY));

class SynthVoice {
  constructor() {
    const { ctx, master } = audio();
    this.c = ctx;
    this.osc = ctx.createOscillator();
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.osc.connect(this.g); this.g.connect(master);
    this.osc.start();
    this.timbre();
  }
  /** Applica il timbro attuale e restituisce il fattore che pareggia il volume. */
  timbre() {
    const w = WAVES[SY.preset];
    if (w) { this.osc.type = w.type; this.eq = Math.SQRT1_2 / RMS_WAVE[w.type]; }
    else { const c = fullCoefs(); this.osc.setPeriodicWave(periodicWave(c)); this.eq = Math.SQRT1_2 / (rmsOf(c) || 1); }
  }
  level() { return Math.min(0.9, 0.42 * SY.vol * this.eq); }
  freq(f, glide = 0.012) { this.osc.frequency.setTargetAtTime(f, this.c.currentTime, glide); }
  /** Attacco (e, per pizzicato/campana, smorzamento esponenziale con costante di tempo τ). */
  on(f) {
    const t = this.c.currentTime, e = ENV[SY.env], g = this.g.gain;
    if (f) this.osc.frequency.setValueAtTime(f, t);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.level(), t + e.attack);
    if (isFinite(e.tau)) g.setTargetAtTime(0, t + e.attack, e.tau);
  }
  /** Aggiorna il volume di una nota che sta suonando (solo inviluppo continuo). */
  relevel() { if (SY.env === 'continuo' && this.sounding) { const g = this.g.gain; g.cancelScheduledValues(this.c.currentTime); g.setTargetAtTime(this.level(), this.c.currentTime, 0.02); } }
  off(fast = false) { const g = this.g.gain, t = this.c.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, fast ? 0.02 : 0.06); }
  dispose() { this.off(true); const o = this.osc, g = this.g; setTimeout(() => { try { o.stop(); o.disconnect(); g.disconnect(); } catch { /* già fermo */ } }, 300); }
}
let V1 = null, V2 = null;
/** Seconda voce (battimenti), se c'è. */
export const voice2 = () => V2;
export const voices = () => [V1, V2].filter(Boolean);
export function ensureVoices() {
  if (!audioSupported()) return false;
  if (!V1) V1 = new SynthVoice();
  if (SY.mode === 'keys' && SY.two) { if (!V2) V2 = new SynthVoice(); } else if (V2) { V2.dispose(); V2 = null; }
  return true;
}
export function retimbre() { voices().forEach((v) => { v.timbre(); v.relevel(); }); }

/** Nota: f (e f + Δf se c'è il secondo suono). Restituisce false se l'audio non è disponibile. */
export function noteOn(f) {
  if (!ensureVoices()) return false;
  SY.f = f;
  V1.on(f); V1.sounding = true;
  if (V2) { V2.on(f + SY.df); V2.sounding = true; }
  SY.on = SY.env === 'continuo'; notify();
  return true;
}
export function glideTo(f) { SY.f = f; V1?.freq(f); V2?.freq(f + SY.df); }
export function noteOff(fast = false) { voices().forEach((v) => { v.off(fast); v.sounding = false; }); SY.on = false; notify(); }

// ---- interfaccia verso il resto dell'app (spia in alto, oscilloscopio)
export const generatorOn = () => SY.on;
export const generatorState = () => SY;
export function onGeneratorChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function stopGenerator() { noteOff(true); }

