// MosaicusNeo — Arduino simulato. Risponde agli stessi comandi del firmware (CFG, START, STOP,
// START,SCOPE, BT,SETUP) e produce le stesse righe grezze, così tutta la catena dell'app viene
// provata anche senza hardware.
//
// Tutti i sensori leggono lo stesso "mondo", che dipende dallo scenario:
//  • incline: carrello fermo a 0,25 m per 1 s, poi giù per un piano inclinato (a = 0,45 m/s²)
//  • spring:  massa su una molla a 0,40 m dal sensore, A = 6 cm, T = 0,90 s, γ = 0,08 s⁻¹
//  • hand:    una mano che sale e scende sopra il sensore (synth)
//  • cooling: patata calda da 75 °C in una stanza a 21 °C, θ = 15 min, tempo ×30
//  • breath:  aula a 22,5 °C e 48 %; a 20 s e 120 s un soffio sul sensore, tempo ×5
//  • walk:    passeggiata ad anello in un parco con ombra, asfalto e collinetta, tempo ×5
//  • free:    montaggi liberi: stanza con una mano che scalda il sensore a 20 s, carrello,
//             luce che cambia, tensione che oscilla; GPS → passeggiata
//  Rumore realistico, echi persi o spuri, qualche checksum sbagliato del DHT.

const FW = "1.0-sim";
export const WARP: Record<string, number> = { cooling: 30, breath: 5, walk: 5 };

const gauss = (s: number) => s * Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());

// ---------------------------------------------------------------------------
// Il mondo simulato
// ---------------------------------------------------------------------------
export interface World { T: number; RH: number; x: number; light: number; V: number; lat: number; lon: number; alt: number; speed: number }

const LAT0 = 45.4725, LON0 = 9.1775;
function walk(t: number) {
  const L = 1200, v = 1.4, th = (2 * Math.PI * v * t) / L;
  const north = 190 * Math.sin(th) + 12 * Math.sin(5 * th), east = 260 * Math.cos(th) + 10 * Math.sin(3 * th);
  const alt = 122 + 25 * Math.max(0, Math.cos(th - 0.8)) ** 2;
  const shade = Math.max(0, Math.sin(th)), asphalt = Math.max(0, -Math.sin(th)) ** 2;
  return {
    lat: LAT0 + north / 111320, lon: LON0 + east / (111320 * Math.cos((LAT0 * Math.PI) / 180)), alt, speed: v,
    T: 21.5 - 2.2 * shade + 1.6 * asphalt - 0.0065 * (alt - 122), RH: 52 + 9 * shade - 5 * asphalt,
  };
}
const pulse = (t: number, t0: number, rise: number, hold: number, tau: number) => {
  if (t < t0) return 0;
  const r = 1 - Math.exp(-Math.min(t - t0, hold) / rise);
  return t > t0 + hold ? r * Math.exp(-(t - t0 - hold) / tau) : r;
};

/** Il mondo all'istante t (s) per lo scenario dato; k = numero del sensore (per variare un po'). */
export function world(t: number, scenario: string, k = 0): World {
  const w: World = { T: 22, RH: 48, x: 0.25, light: 60, V: 2.5, lat: NaN, lon: NaN, alt: NaN, speed: NaN };
  // posizione per il sonar
  if (scenario === "spring") w.x = 0.40 + 0.06 * Math.exp(-0.08 * t) * Math.cos((2 * Math.PI * t) / 0.9);
  else if (scenario === "hand") w.x = 0.27 + 0.17 * Math.sin(2 * Math.PI * 0.2 * t) + 0.03 * Math.sin(2 * Math.PI * 0.7 * t);
  else { const tS = 1 + 2 * k; w.x = t > tS ? Math.min(1.5, 0.25 + 0.5 * 0.45 * (t - tS) ** 2) : 0.25; }
  // temperatura e umidità
  if (scenario === "cooling") w.T = 21 + (75 - 21) * Math.exp(-t / (900 * (1 + 0.3 * k)));
  else if (scenario === "breath") {
    const b = Math.max(pulse(t, 20 + 10 * k, 2.5, 6, 40), pulse(t, 120, 2.5, 6, 40));
    w.T = 22.5 + 1.5 * b; w.RH = Math.min(95, 48 + 42 * b);
  } else if (scenario === "walk") Object.assign(w, walk(t));
  else {
    const h = pulse(t, 20 + 15 * k, 6, 15, 60);
    w.T = 22 + 0.3 * Math.sin(t / 90) + 9 * h; w.RH = 48 + 6 * h;
  }
  w.light = 55 + 25 * Math.sin(2 * Math.PI * t / 30 + k) + 4 * Math.sin(2 * Math.PI * 7 * t);
  w.V = 2.5 + 1.5 * Math.sin(2 * Math.PI * 0.2 * t + k);
  return w;
}

// ---------------------------------------------------------------------------
// Letture grezze come le produce il firmware
// ---------------------------------------------------------------------------
const tempToAdc = (T: number, toGnd = false) => {
  const R = 10000 * Math.exp(3950 * (1 / (T + 273.15) - 1 / 298.15));
  const adc = toGnd ? (1023 * R) / (10000 + R) : (1023 * 10000) / (10000 + R);
  return Math.min(1023, Math.max(0, adc + gauss(0.3)));
};
function dhtBytes(T: number, RH: number, model: number) {
  if (Math.random() < 0.02) return [0, 0, 0, 0, 2];
  if (model === 22) { const h = Math.round(RH * 10), tt = Math.round(Math.abs(T) * 10); return [h >> 8, h & 255, (tt >> 8) | (T < 0 ? 128 : 0), tt & 255, 0]; }
  const hi = Math.floor(RH), ti = Math.floor(Math.abs(T));
  return [hi, Math.round((RH - hi) * 10) % 10, ti, (Math.round((Math.abs(T) - ti) * 10) % 10) | (T < 0 ? 128 : 0), 0];
}
const nmea = (deg: number, w: number) => {
  const a = Math.abs(deg), d = Math.floor(a), mm = (a - d) * 60;
  return `${deg < 0 ? "-" : ""}${String(d * 100 + Math.floor(mm)).padStart(w, "0")}${(mm % 1).toFixed(4).slice(1)}`;
};
function gpsFields(t: number, w: World, nowMs: number) {
  const d = new Date(nowMs), p2 = (n: number) => String(n).padStart(2, "0");
  const utc = `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.00`;
  const date = `${p2(d.getUTCDate())}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCFullYear() % 100)}`;
  if (t < 8 || !Number.isFinite(w.lat)) return [0, "nan", "nan", "nan", Math.min(3, Math.floor(t / 3)), "nan", "nan", utc, date];
  const n = 1.5 / 111320;
  return [1, nmea(w.lat + gauss(n), 4), nmea(w.lon + gauss(n), 5), (w.alt + gauss(0.8)).toFixed(1), Math.round(7 + 2 * Math.sin(t / 40) + gauss(0.4)),
    (1.0 + 0.3 * Math.abs(Math.sin(t / 25))).toFixed(2), (w.speed / 0.514444 + gauss(0.1)).toFixed(3), utc, date];
}
function sonarEcho(x: number) {
  if (Math.random() < 0.01) return 0;
  let d = x + gauss(0.002);
  if (Math.random() < 0.005) d += 0.3 + Math.random();
  return Math.round(((2 * d) / (331.3 + 0.606 * 20)) * 1e6);
}

interface SimSlot { type: string; interval: number; opt: number; pinA: number }
function slotValues(s: SimSlot, t: number, scenario: string, k: number, nowMs: number): (number | string)[] {
  const sc = scenario === "free" && s.type === "GPS" ? "walk" : scenario;
  const w = world(t, sc, k);
  if (s.type === "NTC") return [tempToAdc(w.T + gauss(0.05)).toFixed(2)];
  // fotoresistenza e tensione generica leggono lo stesso segnale lento, con un po' di sfarfallio
  if (s.type === "ANA") return [Math.min(1023, Math.max(0, w.light * 10.23 + gauss(0.8))).toFixed(2)];
  if (s.type === "DHT") return dhtBytes(w.T + gauss(0.05), w.RH + gauss(0.3), s.opt);
  if (s.type === "SONAR") return [sonarEcho(w.x)];
  if (s.type === "GPS") return gpsFields(t, world(t, "walk"), nowMs);
  return [];
}

// ---------------------------------------------------------------------------
// Il collegamento simulato
// ---------------------------------------------------------------------------
export class SimulatedLink {
  kind = "simulatore" as const;
  scenario = "free";
  scopeSignal = "mic";
  private lineCb: (l: string) => void = () => {};
  private closeCb: () => void = () => {};
  private timers: ReturnType<typeof setInterval>[] = [];
  private slots = new Map<number, SimSlot>();

  onLine(cb: (l: string) => void) { this.lineCb = cb; }
  onClose(cb: () => void) { this.closeCb = cb; }
  async open() { setTimeout(() => this.emit(`#MOSAICUS,${FW},READY`), 300); }
  async close() { this.stop(); this.closeCb(); }
  private emit(l: string) { this.lineCb(l); }
  private stop() { this.timers.forEach(clearInterval); this.timers = []; }

  async write(cmd: string) {
    const c = cmd.trim();
    let m: RegExpMatchArray | null;
    if (c === "ID?") return this.emit(`#MOSAICUS,${FW},READY`);
    if (c === "STOP") { this.stop(); return this.emit("#ACK,STOP"); }
    if (c === "CFG,CLEAR") { this.stop(); this.slots.clear(); return this.emit("#ACK,CFG,CLEAR"); }
    if ((m = c.match(/^CFG,ADD,(\d+),(NTC|ANA|DHT|SONAR|GPS),(\d+),(\d+),(\d+),(\d+)$/))) {
      const slot = +m[1], type = m[2], a = +m[4], b = +m[5], opt = +m[6];
      const twoPins = type === "SONAR" || type === "GPS";
      const taken = [...this.slots.entries()].filter(([k]) => k !== slot).flatMap(([, s]) => [s.pinA]);
      if (slot > 5) return this.emit(`#ERR,CFG,${slot},SLOT`);
      if ((type === "NTC" || type === "ANA") && !(a >= 14 && a <= 19)) return this.emit(`#ERR,CFG,${slot},ANALOGICO`);
      if (a < 2 || a > 19 || (twoPins && (b < 2 || b > 19 || a === b))) return this.emit(`#ERR,CFG,${slot},PIN`);
      if (taken.includes(a)) return this.emit(`#ERR,CFG,${slot},DOPPIO`);
      const min = type === "DHT" ? (opt === 22 ? 2000 : 1000) : type === "GPS" ? 1000 : type === "SONAR" ? 30 : 5;
      this.slots.set(slot, { type, interval: Math.max(min, +m[3]), opt, pinA: a });
      return this.emit(`#ACK,CFG,ADD,${slot}`);
    }
    if (c === "START") {
      this.stop();
      if (!this.slots.size) return this.emit("#ERR,START,VUOTO");
      this.emit("#ACK,START");
      const warp = WARP[this.scenario] ?? 1, t0 = Date.now();
      const counts = new Map<string, number>();
      for (const [slot, s] of this.slots) {
        const k = counts.get(s.type) ?? 0; counts.set(s.type, k + 1);
        const delay = s.type === "DHT" || s.type === "GPS" ? 1000 : 0;
        let n = 0;
        this.timers.push(setInterval(() => {
          const tMs = delay + n * s.interval; n++;
          const vals = slotValues(s, tMs / 1000, this.scenario, k, t0 + tMs);
          this.emit(`D,${slot},${tMs.toFixed(3)},${vals.join(",")}`);
        }, Math.max(15, s.interval / warp)));
      }
      return;
    }
    if (c === "BT,SETUP") { this.emit("#BT,SETUP"); setTimeout(() => this.emit("#ACK,BT,SETUP"), 800); return; }
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
