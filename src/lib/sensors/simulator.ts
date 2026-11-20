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

const FW = "1.5-sim";
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
const G = 9.80665;
/** Bilancia: a 3 s si appoggia una massa di 200 g su un piatto a molla (oscillazione smorzata). */
function massAt(t: number, k: number) {
  if (t < 3 + 2 * k) return 0;
  const u = t - 3 - 2 * k;
  return 200 * (1 - Math.exp(-u * 1.2) * Math.cos(2 * Math.PI * 1.6 * u));
}
/** Pendolo da 1 m (T ≈ 2,0 s) che passa nella fotocellula al centro: il raggio si interrompe per ~40 ms. */
function gateBlocked(t: number, k: number) {
  const T = 2.006 * (1 + 0.15 * k), x = Math.sin((2 * Math.PI * t) / T) * Math.exp(-t / 400);
  return Math.abs(x) < 0.06 * Math.exp(t / 400) ? 1 : 0;
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

function slotValues(s: SimSlot, t: number, scenario: string, k: number, nowMs: number): (number | string)[] {
  const sc = scenario === "free" && s.type === "GPS" ? "walk" : scenario;
  const w = world(t, sc, k);
  if (s.type === "DS18") return [Math.round((w.T + 0.4 + gauss(0.03)) * 16), 0];
  if (s.type === "HX711") return [Math.round(84231 + 420 * (massAt(t, k) + gauss(0.15))), 0];
  if (s.type === "IMU") {
    const lsb = 16384 / 2 ** (s.opt & 3), tS = 1 + 2 * k;
    const ax = (t > tS && w.x < 1.5 ? 0.45 : 0) + gauss(0.02), ay = gauss(0.02), az = G + gauss(0.03) + 0.05 * Math.sin(2 * Math.PI * 3 * t);
    return [...[ax, ay, az].map((a) => Math.round((a / G) * lsb)), ...[gauss(0.5), gauss(0.5), gauss(0.5)].map((d) => Math.round(d * 131)), 0];
  }
  if (s.type === "MLX") {
    // inquadra lo stesso oggetto degli altri sensori di temperatura (ε = 0,95), con il sensore a temperatura ambiente
    const Ts = 22 + 0.2 * Math.sin(t / 120), eps = 0.95, K = 273.15;
    const Tm = (eps * (w.T + K) ** 4 + (1 - eps) * (Ts + K) ** 4) ** 0.25 - K;
    return [Math.round((Tm + gauss(0.04) + K) / 0.02), Math.round((Ts + gauss(0.01) + K) / 0.02), 0];
  }
  if (s.type === "NTC") return [tempToAdc(w.T + gauss(0.05)).toFixed(2)];
  // fotoresistenza e tensione generica leggono lo stesso segnale lento, con un po' di sfarfallio
  if (s.type === "ANA") return [Math.min(1023, Math.max(0, w.light * 10.23 + gauss(0.8))).toFixed(2)];
  if (s.type === "DHT") return dhtBytes(w.T + gauss(0.05), w.RH + gauss(0.3), s.opt);
  if (s.type === "SONAR") return [sonarEcho(w.x)];
  if (s.type === "GPS") return gpsFields(t, world(t, "walk"), nowMs);
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
  async open() { setTimeout(() => this.emit(`#MOSAICUS,${FW},READY`), 300); }
  async close() { this.stop(); this.closeCb(); }
  private emit(l: string) { this.lineCb(l); }
  private stop() { this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); this.timers = []; }

  async write(cmd: string) {
    const c = cmd.trim();
    let m: RegExpMatchArray | null;
    if (c === "ID?") return this.emit(`#MOSAICUS,${FW},READY`);
    if (c.startsWith("LINK,")) return;
    if (c === "PING") { if (!this.pinged) { this.pinged = true; this.st("I,-1,0"); } return; }
    if (c === "STOP") { const was = this.timers.length > 0; this.stop(); this.emit("#ACK,STOP"); if (was) this.st("I,-1,0"); return; }
    if (c === "OUT,CLEAR") { this.outs.clear(); return this.emit("#ACK,OUT,CLEAR"); }
    if ((m = c.match(/^OUT,ADD,(OLED|RGB|BUZ|BTN|SD),(\d+),(\d+),(\d+),(\d+)$/))) { this.outs.add(m[1]); return this.emit(`#ACK,OUT,ADD,${m[1]}`); }
    // scheda SD (firmware 1.5): configurazione salvata e prova di una scheda da 8 GB
    if (/^CFG,SAVE,[A-Za-z0-9_-]{1,12}$/.test(c)) return this.emit(this.slots.size ? "#ACK,CFG,SAVE" : "#ERR,CFG,-1,VUOTO");
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
    if ((m = c.match(/^CFG,ADD,(\d+),(NTC|ANA|DHT|SONAR|GPS|DS18|GATE|HX711|IMU|MLX),(\d+),(\d+),(\d+),(\d+)$/))) {
      const slot = +m[1], type = m[2], a = +m[4], b = +m[5], opt = +m[6];
      const twoPins = ["SONAR", "GPS", "HX711", "IMU", "MLX"].includes(type), i2c = (t: string) => t === "IMU" || t === "MLX";
      const taken = [...this.slots.entries()].filter(([k, s]) => k !== slot && !(i2c(type) && i2c(s.type))).flatMap(([, s]) => [s.pinA]);
      if (slot > 5) { this.st(`C,${slot},6`); return this.emit(`#ERR,CFG,${slot},SLOT`); }
      if ((type === "NTC" || type === "ANA") && !(a >= 14 && a <= 19)) { this.st(`C,${slot},2`); return this.emit(`#ERR,CFG,${slot},ANALOGICO`); }
      if (a < 2 || a > 19 || (twoPins && (b < 2 || b > 19 || a === b))) { this.st(`C,${slot},1`); return this.emit(`#ERR,CFG,${slot},PIN`); }
      if (taken.includes(a)) { this.st(`C,${slot},3`); return this.emit(`#ERR,CFG,${slot},DOPPIO`); }
      const min = type === "DHT" ? (opt === 22 ? 2000 : 1000) : type === "GPS" || type === "DS18" ? 1000 : type === "SONAR" ? 30
        : type === "HX711" || type === "MLX" ? 100 : type === "IMU" ? 10 : 5;
      this.slots.set(slot, { type, interval: Math.max(min, +m[3]), opt, pinA: a });
      return this.emit(`#ACK,CFG,ADD,${slot}`);
    }
    if (c === "START") {
      this.stop();
      if (!this.slots.size) return this.emit("#ERR,START,VUOTO");
      this.emit("#ACK,START");
      const warp = WARP[this.scenario] ?? 1, t0 = Date.now();
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
          const vals = slotValues(s, tMs / 1000, this.scenario, k, t0 + tMs);
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
