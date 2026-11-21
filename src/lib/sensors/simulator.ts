// MosaicusNeo — Arduino simulato. Risponde agli stessi comandi del firmware (CFG, START, STOP,
// START,SCOPE, BT,SETUP) e produce le stesse righe grezze, così tutta la catena dell'app viene
// provata anche senza hardware.
//
// Tutti i sensori leggono lo stesso "mondo", che dipende dallo scenario:
//  • incline: carrello tenuto fermo a 0,25 m, poi lasciato andare giù per un piano inclinato
//             (a = 0,45 m/s²); in fondo, a 1,5 m, sbatte sul respingente e rimbalza qualche volta
//  • spring:  massa su una molla a 0,40 m dal sensore, A ≈ 6 cm, T = 0,90 s, γ = 0,08 s⁻¹
//  • hand:    una mano che sale e scende sopra il sensore, senza un ritmo preciso (synth)
//  • cooling: sonda infilata in una patata calda da 75 °C, stanza a 21 °C, tempo ×30
//  • breath:  aula a 22,5 °C e 48 %; a 20 s e 120 s un soffio sul sensore, tempo ×5
//  • walk:    passeggiata ad anello in un parco con ombra, asfalto e collinetta, tempo ×5
//  • free:    i lab personali: un'aula tranquilla, con temperatura e umidità che derivano piano, la
//             luce delle lampade e delle finestre (con le nuvole), un carrello sul piano inclinato,
//             una massa sulla bilancia e una tensione stabile; con il GPS → passeggiata
// Ogni misura è diversa (rumore liscio con un seme nuovo a ogni «Avvia»), ogni sensore ha il suo
// errore di taratura e il suo tempo di risposta (un DHT11 è lento, un termistore nudo veloce).
// Rumore realistico, echi persi o spuri, qualche checksum sbagliato del DHT, l'errore del GPS che
// deriva lentamente invece di saltare a ogni lettura.

const FW = "2.0-sim";
export const WARP: Record<string, number> = { cooling: 30, breath: 5, walk: 5 };
/** Scale del tempo tra cui scegliere (1 = tempo reale). */
export const WARPS = [1, 5, 10, 30, 50] as const;

const gauss = (s: number) => s * Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Rumore liscio: valori casuali a intervalli regolari, raccordati. Stesso seme e stesso t, stesso
// valore: le grandezze cambiano con continuità, come nel mondo vero, invece di oscillare a sinusoide.
// ---------------------------------------------------------------------------
function hash(i: number, seed: number) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;              // [0, 1]
}
/** In [−1, 1], con un valore nuovo ogni `scale` secondi. */
function smooth(t: number, scale: number, seed: number) {
  const x = t / scale, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return 2 * (hash(i, seed) * (1 - u) + hash(i + 1, seed) * u) - 1;
}
/** Deriva lenta (minuti) con un po' di dettaglio (secondi), in [−1, 1] circa. */
const drift = (t: number, seed: number) => 0.6 * smooth(t, 90, seed) + 0.3 * smooth(t, 23, seed + 1) + 0.1 * smooth(t, 6, seed + 2);
/** Un numero fisso in [−1, 1] per (seme, canale): l'errore di taratura di quel sensore. */
const bias = (seed: number, ch: number) => 2 * hash(ch, seed) - 1;

/** Tensione di vapore saturo (hPa, formula di Magnus). */
const esat = (T: number) => 6.112 * Math.exp((17.62 * T) / (243.12 + T));

// ---------------------------------------------------------------------------
// Il mondo simulato
// ---------------------------------------------------------------------------
export interface World {
  /** temperatura dell'oggetto o dell'aria vicino al sensore (°C) e pressione del vapore (hPa) */
  T: number; vap: number;
  /** posizione del bersaglio del sonar (m) e accelerazione del carrello lungo il piano (m/s²) */
  x: number; acc: number; moving: boolean;
  /** illuminamento (lux) e tensione generica (frazione di 5 V) */
  lux: number; volt: number;
  lat: number; lon: number; alt: number; speed: number;
}

const LAT0 = 45.4725, LON0 = 9.1775;
function walk(t: number, seed: number) {
  const L = 1200, v = 1.4 * (1 + 0.06 * smooth(t, 20, seed + 40)), th = (2 * Math.PI * 1.4 * t) / L;
  const north = 190 * Math.sin(th) + 12 * Math.sin(5 * th), east = 260 * Math.cos(th) + 10 * Math.sin(3 * th);
  const alt = 122 + 25 * Math.max(0, Math.cos(th - 0.8)) ** 2;
  const shade = Math.max(0, Math.sin(th)), asphalt = Math.max(0, -Math.sin(th)) ** 2;
  const T = 21.5 - 2.2 * shade + 1.6 * asphalt - 0.0065 * (alt - 122) + 0.25 * smooth(t, 15, seed + 41);
  const RH = 52 + 9 * shade - 5 * asphalt + 1.5 * smooth(t, 25, seed + 42);
  return {
    lat: LAT0 + north / 111320, lon: LON0 + east / (111320 * Math.cos((LAT0 * Math.PI) / 180)), alt, speed: v,
    T, vap: (RH / 100) * esat(T), shade,
  };
}
const pulse = (t: number, t0: number, rise: number, hold: number, tau: number) => {
  if (t < t0) return 0;
  const r = 1 - Math.exp(-Math.min(t - t0, hold) / rise);
  return t > t0 + hold ? r * Math.exp(-(t - t0 - hold) / tau) : r;
};

/** Carrello sul piano inclinato: fermo in mano, poi giù; sul respingente perde il 65 % della velocità
 *  a ogni urto (urto di 30 ms) e risale un po', finché si ferma. */
function incline(t: number, k: number, seed: number) {
  const X0 = 0.25, L = 1.5, A = 0.45, E = 0.35, HIT = 0.03;
  const tS = 1 + 2 * k + 0.4 * hash(k, seed + 50);
  if (t < tS) return { x: X0 + 0.0008 * smooth(t, 0.6, seed + 51), acc: 0, moving: false };
  let u = t - tS;
  const tHit = Math.sqrt((2 * (L - X0)) / A);
  if (u < tHit) return { x: X0 + 0.5 * A * u * u, acc: A, moving: true };
  u -= tHit;
  let vin = A * tHit, v = vin * E;
  for (let n = 0; n < 10 && v > 0.03; n++) {
    if (u < HIT) return { x: L, acc: -(vin + v) / HIT, moving: true };
    u -= HIT;
    const fly = (2 * v) / A;
    if (u < fly) return { x: L - v * u + 0.5 * A * u * u, acc: A, moving: true };
    u -= fly;
    vin = v; v *= E;
  }
  return { x: L, acc: 0, moving: false };
}

/** Il mondo all'istante t (s) per lo scenario dato; k = numero del sensore dello stesso tipo. */
export function world(t: number, scenario: string, k: number, seed: number): World {
  const w: World = { T: 22, vap: 0.48 * esat(22), x: 0.25, acc: 0, moving: false, lux: 400, volt: 0.44, lat: NaN, lon: NaN, alt: NaN, speed: NaN };
  // posizione per il sonar
  if (scenario === "spring") {
    const A = 0.06 * (1 + 0.08 * bias(seed, 70)), om = (2 * Math.PI) / 0.9;
    w.x = 0.40 + A * Math.exp(-0.08 * t) * Math.cos(om * t) + 0.0005 * smooth(t, 3, seed + 71);
    w.acc = -A * om * om * Math.exp(-0.08 * t) * Math.cos(om * t); w.moving = true;
  } else if (scenario === "hand") {
    w.x = clamp(0.27 + 0.13 * smooth(t, 1.3, seed + 72) + 0.05 * smooth(t, 0.45, seed + 73), 0.06, 0.55);
  } else Object.assign(w, incline(t, k, seed));

  // temperatura e umidità
  const room = (T0: number, a: number) => T0 + a * drift(t, seed + 80);
  if (scenario === "cooling") {
    // la superficie della patata si raffredda prima del cuore: due esponenziali, θ = 15 min
    const th = 900 * (1 + 0.3 * k), Tr = room(21, 0.2);
    w.T = Tr + (75 - 21) * (0.85 * Math.exp(-t / th) + 0.15 * Math.exp(-t / (th / 6)));
    w.vap = 0.5 * esat(21);
  } else if (scenario === "breath") {
    const a1 = 1 + 0.2 * bias(seed, 81), a2 = 1 + 0.2 * bias(seed, 82);
    const b = Math.max(a1 * pulse(t, 20 + 10 * k, 2.5, 6, 40), a2 * pulse(t, 120, 2.5, 6, 40));
    w.T = room(22.5, 0.15) + 1.5 * b;
    w.vap = 0.48 * esat(22.5) * (1 + 1.6 * b);                // il fiato è caldo e quasi saturo
  } else if (scenario === "walk") {
    const g = walk(t, seed);
    Object.assign(w, g);
    w.lux = 20000 * (1 - 0.8 * g.shade) * (1 + 0.3 * smooth(t, 30, seed + 83));
  } else {
    // aula: la temperatura deriva di qualche decimo di grado, l'umidità di un paio di punti
    w.T = room(22, 0.4);
    w.vap = 0.48 * esat(22) * (1 + 0.04 * drift(t, seed + 84));
  }

  // luce: lampade del soffitto + finestre, con le nuvole che passano; ogni sensore in un punto un po' diverso
  if (scenario !== "walk") w.lux = (320 + 150 * (1 + 0.6 * smooth(t, 25, seed + 90))) * (1 + 0.15 * bias(seed, 91 + k));
  // tensione generica: una sorgente stabile (es. l'uscita di un sensore), con una piccola deriva
  w.volt = clamp(0.44 + 0.12 * bias(seed, 60 + k) + 0.004 * drift(t, seed + 61 + k), 0, 1);
  return w;
}

// ---------------------------------------------------------------------------
// Tempi di risposta dei sensori: ognuno segue il mondo con il suo ritardo (filtro del primo ordine)
// ---------------------------------------------------------------------------
class Lag {
  private m = new Map<string, { y: number; t: number }>();
  /** valore del sensore `key` al tempo t, che insegue x con costante di tempo tau (s) */
  get(key: string, t: number, x: number, tau: number, init = x) {
    const p = this.m.get(key) ?? { y: init, t };
    const y = tau > 0 ? p.y + (x - p.y) * (1 - Math.exp(-Math.max(0, t - p.t) / tau)) : x;
    this.m.set(key, { y, t });
    return y;
  }
}

// ---------------------------------------------------------------------------
// Letture grezze come le produce il firmware
// ---------------------------------------------------------------------------
/** Termistore 10 kΩ (B = 3950) con 10 kΩ fissi; il firmware manda la media di 16 letture. */
const tempToAdc = (T: number, toGnd = false) => {
  const R = 10000 * Math.exp(3950 * (1 / (T + 273.15) - 1 / 298.15));
  const adc = toGnd ? (1023 * R) / (10000 + R) : (1023 * 10000) / (10000 + R);
  return clamp(adc + gauss(0.25), 0, 1023);
};
/** Fotoresistenza tipo GL5528 (≈ 8 kΩ a 10 lux, γ = 0,7) con 10 kΩ fissi. */
const luxToAdc = (lux: number, toGnd: boolean) => {
  const R = 8000 * Math.pow(Math.max(0.5, lux) / 10, -0.7);
  return clamp((toGnd ? (1023 * R) / (10000 + R) : (1023 * 10000) / (10000 + R)) + gauss(0.4), 0, 1023);
};
function dhtBytes(T: number, RH: number, model: number) {
  if (Math.random() < 0.02) return [0, 0, 0, 0, 2];
  RH = clamp(RH, model === 22 ? 0 : 5, model === 22 ? 99.9 : 95);
  if (model === 22) { const h = Math.round(RH * 10), tt = Math.round(Math.abs(T) * 10); return [h >> 8, h & 255, (tt >> 8) | (T < 0 ? 128 : 0), tt & 255, 0]; }
  // il DHT11 dà l'umidità in punti interi e la temperatura al decimo
  const ti = Math.floor(Math.abs(T));
  return [Math.round(RH), 0, ti, (Math.round((Math.abs(T) - ti) * 10) % 10) | (T < 0 ? 128 : 0), 0];
}
const nmea = (deg: number, w: number) => {
  const a = Math.abs(deg), d = Math.floor(a), mm = (a - d) * 60;
  return `${deg < 0 ? "-" : ""}${String(d * 100 + Math.floor(mm)).padStart(w, "0")}${(mm % 1).toFixed(4).slice(1)}`;
};
function gpsFields(t: number, w: World, nowMs: number, seed: number) {
  const d = new Date(nowMs), p2 = (n: number) => String(n).padStart(2, "0");
  const utc = `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.00`;
  const date = `${p2(d.getUTCDate())}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCFullYear() % 100)}`;
  if (t < 8 || !Number.isFinite(w.lat)) return [0, "nan", "nan", "nan", Math.min(3, Math.floor(t / 3)), "nan", "nan", utc, date];
  // l'errore della posizione deriva lentamente (qualche metro), come in un GPS vero
  const sats = Math.round(clamp(7.5 + 2.5 * smooth(t, 50, seed + 100), 4, 11));
  const hdop = clamp(0.8 + 4 / sats + 0.1 * smooth(t, 10, seed + 101), 0.7, 3);
  const eN = hdop * (1.6 * smooth(t, 30, seed + 102) + 0.3 * smooth(t, 4, seed + 103));
  const eE = hdop * (1.6 * smooth(t, 30, seed + 104) + 0.3 * smooth(t, 4, seed + 105));
  return [1, nmea(w.lat + eN / 111320, 4), nmea(w.lon + eE / (111320 * Math.cos((LAT0 * Math.PI) / 180)), 5),
    (w.alt + hdop * 2.5 * smooth(t, 40, seed + 106)).toFixed(1), sats, hdop.toFixed(2),
    (Math.max(0, w.speed + gauss(0.08)) / 0.514444).toFixed(3), utc, date];
}
function sonarEcho(x: number) {
  if (x > 4 || Math.random() < 0.01) return 0;           // eco perso
  let d = x + gauss(0.0015);
  if (Math.random() < 0.005) d += 0.3 + Math.random();    // eco spurio da un altro oggetto
  return Math.round(((2 * d) / (331.3 + 0.606 * 20)) * 1e6);
}

interface SimSlot { type: string; interval: number; opt: number; pinA: number }
const G = 9.80665;
/** Bilancia: a 3 s si appoggia una massa di 200 g su un piatto a molla (oscillazione smorzata),
 *  poi la cella "cede" di qualche decimo di grammo (creep) e deriva un po' con la temperatura. */
function massAt(t: number, k: number, seed: number) {
  const drift0 = 0.12 * drift(t, seed + 110 + k);
  if (t < 3 + 2 * k) return drift0;
  const u = t - 3 - 2 * k;
  return drift0 + 200 * (1 - Math.exp(-u * 1.2) * Math.cos(2 * Math.PI * 1.6 * u)) + 0.3 * (1 - Math.exp(-u / 30));
}
/** Pendolo da 1 m (T ≈ 2,0 s), sfera di 3 cm, fotocellula al centro: lasciato da 15 cm, l'ampiezza cala piano,
 *  quindi il raggio resta interrotto un po' di più a ogni passaggio. */
function gateBlocked(t: number, k: number) {
  const T = 2.006 * (1 + 0.15 * k), A = 0.15 * Math.exp(-t / 300);
  return Math.abs(A * Math.cos((2 * Math.PI * t) / T)) < 0.015 ? 1 : 0;   // lasciato andare da un lato
}
/**
 * Telefono simulato.
 *  • phone-turn: appoggiato su una sedia girevole, a 2 s parte e gira a ~0,4 giri/s (ω_z ≈ 140 °/s)
 *  • altrimenti (phone-pendulum): appeso a due spaghi, pendolo da 0,64 m (T ≈ 1,6 s), smorzato
 */
function phoneMotion(t: number, scenario: string) {
  if (scenario === "phone-turn") {
    const w = t < 2 ? 0 : 140 * (1 - Math.exp(-(t - 2) / 0.6)) * Math.exp(-Math.max(0, t - 12) / 4);
    const wr = (w * Math.PI) / 180, r = 0.35;
    return [wr * wr * r + gauss(0.05), gauss(0.05), G + gauss(0.05), gauss(1.5), gauss(1.5), w + gauss(1.5)];
  }
  const T = 1.6, th0 = 0.35 * Math.exp(-t / 40), om = (2 * Math.PI) / T;
  const th = th0 * Math.sin(om * t), thd = th0 * om * Math.cos(om * t);
  // lungo il filo (y): g·cos θ + L·θ'²; tangente (x): rumore (in caduta libera lungo la traiettoria)
  return [gauss(0.08), G * Math.cos(th) + 0.64 * thd * thd + gauss(0.05), gauss(0.08), gauss(1), gauss(1), (thd * 180) / Math.PI + gauss(1)];
}
/** Microfono simulato: un'auto che suona a 440 Hz passa davanti al telefono a 15 m/s (effetto Doppler). */
function phoneSound(t: number): (number | string)[] {
  const u = ((t % 12) - 6), v = 15, c = 343, d = 6;
  const vr = (v * v * u) / Math.sqrt(d * d + (v * u) ** 2);    // velocità radiale (positiva = si allontana)
  const f = 440 * c / (c + vr);
  const L = -38 - 10 * Math.log10(1 + ((v * u) / d) ** 2) + gauss(0.4);
  return [(f + gauss(0.6)).toFixed(2), L.toFixed(2)];
}

/** Costanti di tempo (s): quanto ci mette ogni sensore a seguire la temperatura vera. */
const TAU = { NTC: 3, DS18: 8, DHT: 15, MLX: 0 };

function slotValues(s: SimSlot, slot: number, t: number, scenario: string, k: number, nowMs: number, seed: number, lag: Lag): (number | string)[] {
  const sc = scenario === "free" && s.type === "GPS" ? "walk" : scenario;
  const w = world(t, sc, k, seed);
  const me = seed + 1000 * (slot + 1);                       // errori di taratura propri di questo sensore
  // all'avvio la sonda è a temperatura ambiente, anche se la infili in qualcosa di caldo
  const T0 = scenario === "cooling" ? 21 : undefined;
  if (s.type === "DS18") {
    const T = lag.get(`${slot}`, t, w.T, TAU.DS18, T0) + 0.25 * bias(me, 1);
    return [Math.round((T + gauss(0.02)) * 16), 0];
  }
  if (s.type === "HX711") return [Math.round(84231 + 1500 * bias(me, 2) + 420 * (massAt(t, k, seed) + gauss(0.15))), 0];
  if (s.type === "IMU") {
    // carrello sul piano: accelerazione lungo x, vibrazioni delle ruote mentre si muove, urti sul respingente
    const lsb = 16384 / 2 ** (s.opt & 3), vib = w.moving ? 0.12 : 0.015;
    const ax = w.acc + 0.06 * bias(me, 3) + gauss(vib), ay = 0.05 * bias(me, 4) + gauss(vib * 0.6);
    const az = G + 0.08 * bias(me, 5) + gauss(vib);
    const gyro = [0.8 * bias(me, 6) + gauss(0.06), 0.8 * bias(me, 7) + gauss(0.06), 0.8 * bias(me, 8) + gauss(0.06) + (w.moving ? gauss(0.4) : 0)];
    return [...[ax, ay, az].map((a) => clamp(Math.round((a / G) * lsb), -32768, 32767)), ...gyro.map((d) => Math.round(d * 131)), 0];
  }
  if (s.type === "MLX") {
    // inquadra lo stesso oggetto degli altri sensori di temperatura (ε = 0,95), con il sensore a temperatura ambiente
    const Ts = 22 + 0.3 * drift(t, seed + 120), eps = 0.95, K = 273.15;
    const Tm = (eps * (w.T + K) ** 4 + (1 - eps) * (Ts + K) ** 4) ** 0.25 - K;
    return [Math.round((Tm + gauss(0.05) + K) / 0.02), Math.round((Ts + gauss(0.01) + K) / 0.02), 0];
  }
  if (s.type === "SPS") {
    // aria di un'aula (≈ 8 µg/m³ di PM2,5) che cambia piano, con qualche aumento irregolare
    const base = 5 + 1.5 * drift(t, seed + 130);
    const pm1 = Math.max(0.3, base + 6 * Math.max(0, smooth(t, 35, seed + 131)) ** 3 + gauss(0.3));
    const pm25 = pm1 * (1.4 + 0.05 * smooth(t, 60, seed + 133)), pm4 = pm25 * 1.12, pm10 = pm4 * 1.05, nc05 = pm1 * 6.1, nc1 = nc05 * 1.17, nc25 = nc1 * 1.01;
    return [pm1, pm25, pm4, pm10, nc05, nc1, nc25, nc25 * 1.001, nc25 * 1.002].map((v) => v.toFixed(2)).concat([(0.5 + 0.05 * smooth(t, 40, seed + 134) + gauss(0.01)).toFixed(3), "0"]);
  }
  if (s.type === "NTC") return [tempToAdc(lag.get(`${slot}`, t, w.T, TAU.NTC, T0) + 0.3 * bias(me, 9) + gauss(0.03)).toFixed(2)];
  // fotoresistenza (bit0 dell'opzione) o tensione generica
  if (s.type === "ANA") return [(s.opt & 1 ? luxToAdc(w.lux, !!(s.opt & 2)) : clamp(w.volt * 1023 + gauss(0.5), 0, 1023)).toFixed(2)];
  if (s.type === "DHT") {
    // lento, con un errore di taratura (DHT11: ±1 °C e ±4 %); l'umidità relativa dipende dalla sua temperatura
    const T = lag.get(`${slot}`, t, w.T, TAU.DHT, T0), vap = lag.get(`${slot}v`, t, w.vap, TAU.DHT * 0.6);
    const dT = (s.opt === 22 ? 0.3 : 1) * bias(me, 10), dRH = (s.opt === 22 ? 1.5 : 4) * bias(me, 11);
    return dhtBytes(T + dT + gauss(0.05), (100 * vap) / esat(T) + dRH + gauss(0.3), s.opt);
  }
  if (s.type === "SONAR") return [sonarEcho(w.x)];
  if (s.type === "GPS") return gpsFields(t, world(t, "walk", 0, seed), nowMs, seed);
  if (s.type === "PMOT") return phoneMotion(t, scenario).map((v) => v.toFixed(4));
  if (s.type === "PSND") return phoneSound(t);
  return [];
}

// ---------------------------------------------------------------------------
// Il collegamento simulato
// ---------------------------------------------------------------------------
export class SimulatedLink {
  kind = "simulatore" as const;
  scenario = "free";
  scopeSignal = "mic";
  /** scala del tempo scelta da chi usa l'app; null = quella dello scenario */
  warp: number | null = null;
  private lineCb: (l: string) => void = () => {};
  private closeCb: () => void = () => {};
  private timers: ReturnType<typeof setInterval>[] = [];
  private slots = new Map<number, SimSlot>();
  private pinged = false;
  private outs = new Set<string>();
  private st(s: string) { this.emit(`#ST,${s}`); }
  /** Il pulsante su Arduino (firmware 1.5): con l'app collegata manda #KEY. */
  pressKey() { if (this.outs.has("BTN")) this.emit("#KEY"); }

  onLine(cb: (l: string) => void) { this.lineCb = cb; }
  onClose(cb: () => void) { this.closeCb = cb; }
  async open() { setTimeout(() => this.emit(`#MOSAICUSNEO,${FW},READY`), 300); }
  async close() { this.stop(); this.closeCb(); }
  private emit(l: string) { this.lineCb(l); }
  private stop() { this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); this.timers = []; }

  async write(cmd: string) {
    const c = cmd.trim();
    let m: RegExpMatchArray | null;
    if (c === "ID?") return this.emit(`#MOSAICUSNEO,${FW},READY`);
    if (c.startsWith("LINK,")) return;
    if (c === "PING") { if (!this.pinged) { this.pinged = true; this.st("I,-1,0"); } return; }
    if (c === "STOP") { const was = this.timers.length > 0; this.stop(); this.emit("#ACK,STOP"); if (was) this.st("I,-1,0"); return; }
    if (c === "OUT,CLEAR") { this.outs.clear(); return this.emit("#ACK,OUT,CLEAR"); }
    if ((m = c.match(/^OUT,ADD,(OLED|RGB|BUZ|BTN|SD),(\d+),(\d+),(\d+),(\d+)$/))) { this.outs.add(m[1]); return this.emit(`#ACK,OUT,ADD,${m[1]}`); }
    // scheda SD (firmware 1.5): configurazione salvata e prova di una scheda da 8 GB
    if (/^CFG,SAVE,[A-Za-z0-9_-]{1,12}$/.test(c)) return this.emit(this.slots.size ? "#ACK,CFG,SAVE" : "#ERR,CFG,-1,EMPTY");
    if (c === "SD,TEST") { setTimeout(() => this.emit(this.outs.has("SD") ? "#SD,OK,7580" : "#SD,ERR,NOOUT"), 600); return; }
    if (c === "OUT,SAVE") return this.emit("#ACK,OUT,SAVE");
    if (c === "OUT,TEST") { setTimeout(() => this.emit("#ACK,OUT,TEST"), 1500); return; }
    if (c.startsWith("OUT,L,")) return;
    if (c === "CFG,CLEAR") { this.stop(); this.slots.clear(); if (this.pinged) this.st("I,-1,0"); return this.emit("#ACK,CFG,CLEAR"); }
    if ((m = c.match(/^CFG,ADD,(\d+),(PMOT|PSND),(\d+),/))) {
      // sensori del telefono simulati: nessun pin
      const slot = +m[1];
      this.slots.set(slot, { type: m[2], interval: Math.max(m[2] === "PMOT" ? 10 : 30, +m[3]), opt: 0, pinA: -1 - slot });
      return this.emit(`#ACK,CFG,ADD,${slot}`);
    }
    if ((m = c.match(/^CFG,ADD,(\d+),(NTC|ANA|DHT|SONAR|GPS|DS18|GATE|HX711|IMU|MLX|SPS),(\d+),(\d+),(\d+),(\d+)$/))) {
      const slot = +m[1], type = m[2], a = +m[4], b = +m[5], opt = +m[6];
      const twoPins = ["SONAR", "GPS", "HX711", "IMU", "MLX", "SPS"].includes(type), i2c = (t: string) => t === "IMU" || t === "MLX" || t === "SPS";
      const taken = [...this.slots.entries()].filter(([k, s]) => k !== slot && !(i2c(type) && i2c(s.type))).flatMap(([, s]) => [s.pinA]);
      if (slot > 5) { this.st(`C,${slot},6`); return this.emit(`#ERR,CFG,${slot},SLOT`); }
      if ((type === "NTC" || type === "ANA") && !(a >= 14 && a <= 19)) { this.st(`C,${slot},2`); return this.emit(`#ERR,CFG,${slot},ANALOG`); }
      if (a < 2 || a > 19 || (twoPins && (b < 2 || b > 19 || a === b))) { this.st(`C,${slot},1`); return this.emit(`#ERR,CFG,${slot},PIN`); }
      if (taken.includes(a)) { this.st(`C,${slot},3`); return this.emit(`#ERR,CFG,${slot},DUPLICATE`); }
      const min = type === "DHT" ? (opt === 22 ? 2000 : 1000) : type === "GPS" || type === "DS18" || type === "SPS" ? 1000 : type === "SONAR" ? 30
        : type === "HX711" || type === "MLX" ? 100 : type === "IMU" ? 10 : 5;
      this.slots.set(slot, { type, interval: Math.max(min, +m[3]), opt, pinA: a });
      return this.emit(`#ACK,CFG,ADD,${slot}`);
    }
    if (c === "START") {
      this.stop();
      if (!this.slots.size) return this.emit("#ERR,START,EMPTY");
      this.emit("#ACK,START");
      const warp = this.warp ?? WARP[this.scenario] ?? 1, t0 = Date.now();
      // ogni misura è diversa: un seme nuovo per il rumore, i tempi di risposta ripartono da capo
      const seed = (Math.random() * 2 ** 31) | 0, lag = new Lag();
      // stato come lo riferirebbe Arduino: il GPS prima cerca i satelliti (8 s di misura)
      const gps = [...this.slots.entries()].find(([, s]) => s.type === "GPS");
      if (gps) { this.st(`S,${gps[0]},1`); this.timers.push(setTimeout(() => this.st("T,-1,0"), 8000 / warp) as unknown as ReturnType<typeof setInterval>); }
      else this.st("T,-1,0");
      const counts = new Map<string, number>();
      for (const [slot, s] of this.slots) {
        const k = counts.get(s.type) ?? 0; counts.set(s.type, k + 1);
        if (s.type === "GATE") {
          // fotocellula: righe solo ai cambi, con l'istante del cambio
          const p0 = performance.now();
          let last = gateBlocked(0, k);
          this.emit(`D,${slot},0.000,${last}`);
          this.timers.push(setInterval(() => {
            const tS = ((performance.now() - p0) / 1000) * warp;
            const lv = gateBlocked(tS, k);
            if (lv !== last) { last = lv; this.emit(`D,${slot},${(tS * 1000).toFixed(3)},${lv}`); }
          }, 4));
          continue;
        }
        const delay = s.type === "DHT" || s.type === "GPS" ? 1000 : 0;
        let n = 0;
        this.timers.push(setInterval(() => {
          const tMs = delay + n * s.interval; n++;
          const vals = slotValues(s, slot, tMs / 1000, this.scenario, k, t0 + tMs, seed, lag);
          this.emit(`D,${slot},${tMs.toFixed(3)},${vals.join(",")}`);
        }, Math.max(15, s.interval / warp)));
      }
      return;
    }
    if (c === "BT,SETUP") { this.emit("#BT,SETUP"); setTimeout(() => this.emit("#ACK,BT,SETUP"), 800); return; }
    if (c === "BT,SETUP,BLE") { this.emit("#BT,SETUP"); setTimeout(() => this.emit("#ACK,BT,SETUP,BLE"), 800); return; }
    if ((m = c.match(/^START,SCOPE,(\d+),(\d+),(\d+),(-?\d+),([01])$/))) return this.scope(+m[1], +m[2], +m[3], +m[4], m[5] === "1");
    this.emit(`#ERR,${c}`);
  }

  /** Oscilloscopio: 400 campioni "a raffica" del segnale scelto (fischio dal microfono o magnete nella bobina). */
  private scope(dt0: number, n0: number, level: number, edge: number, auto: boolean) {
    this.stop();
    const dt = Math.max(20, dt0), n = Math.min(400, Math.max(10, n0));
    this.emit(`#ACK,START,SCOPE,${dt}`);
    const t0 = performance.now();
    let nextCoil = 1.2;
    this.timers.push(setInterval(() => {
      const tNow = (performance.now() - t0) / 1000;
      const sig = this.scopeSignal;
      const look = sig === "coil" ? 0.25 : 0.05, step = dt / 1e6, hyst = 3;
      const v = (t: number) => scopeAdc(sig, t, nextCoil);
      let tTrig: number | null = null;
      if (edge !== 0) {
        let armed = false;
        for (let t = tNow; t < tNow + look; t += step) {
          const a = v(t), d = edge > 0 ? a - level : level - a;
          if (d < -hyst) armed = true; else if (armed && d >= 0) { tTrig = t; break; }
        }
      }
      if (tTrig == null && !auto) { if (sig === "coil" && tNow > nextCoil + 0.5) nextCoil = tNow + 1.5 + Math.random(); return; }
      const ts = tTrig ?? tNow;
      const vals = Array.from({ length: n }, (_, i) => v(ts + i * step));
      if (sig === "coil" && tTrig != null) nextCoil = tTrig + 1.5 + Math.random() * 1.5;
      this.emit(`W,${tTrig == null ? 0 : 1},${dt},${vals.join(",")}`);
    }, 160));
  }
}

/** Lettura ADC (0…1023) del segnale simulato per l'oscilloscopio elettrico. */
function scopeAdc(sig: string, t: number, tCoil: number) {
  let V: number;
  if (sig === "coil") {
    const u = t - tCoil;
    const lobe = (c: number, s: number, A: number) => A * Math.exp(-((u - c) ** 2) / (2 * s * s));
    V = 2.5 + lobe(-0.006, 0.004, 0.28) - lobe(0.006, 0.003, 0.36);
  } else {
    const f = 880 * (1 + 0.004 * Math.sin(2 * Math.PI * 0.3 * t));
    const env = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
    V = 2.43 + env * (0.045 * Math.sin(2 * Math.PI * f * t) + 0.012 * Math.sin(4 * Math.PI * f * t + 1));
  }
  V += gauss(0.004);
  return Math.max(0, Math.min(1023, Math.round((V / 5) * 1023)));
}
