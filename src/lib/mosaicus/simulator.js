// Mosaicus — Arduino simulato. Risponde agli stessi comandi del firmware vero
// e produce le stesse righe grezze, così tutta la catena dell'app viene provata.
//
//  • TEMP: patata calda che si raffredda, T = Ta + (T0 − Ta)·e^(−t/θ), letta da un
//    termistore NTC (B = 3950 K, R0 = 10 kΩ, partitore con 10 kΩ, NTC verso 5 V).
//    Il tempo è accelerato ×30, così in un minuto si vedono ~25 minuti di misura.
//  • SONAR, scenario «incline»: carrello fermo a 0,25 m per 1 s, poi parte su un piano
//    inclinato con a = 0,45 m/s² e si ferma a fine corsa (1,50 m).
//  • SONAR, scenario «spring»: massa appesa a una molla, 0,40 m sopra il sensore,
//    ampiezza 6 cm, periodo 0,90 s, smorzamento γ = 0,08 s⁻¹.
//  In entrambi: rumore ±2 mm, qualche eco perso, qualche eco spurio.
//  • MOTION (sensori del telefono), scenario «phone-pendulum»: telefono appeso come un
//    pendolo (L = 0,60 m, ampiezza 25°, leggero smorzamento). Il giroscopio vede θ'(t) con il
//    periodo del pendolo; l'accelerometro lungo il filo vede g·cosθ + L·θ'², a frequenza doppia.
//  • SOUND (microfono), scenario «phone-sound»: due diapason a 440 Hz e 443 Hz → battimenti a 3 Hz.
//  • SONAR, scenario «hand»: una mano che sale e scende sopra il sensore (theremin), 10–45 cm.
//  • SCOPE (oscilloscopio elettrico): 400 campioni "a raffica" da un segnale scelto con
//    link.scopeSignal: «mic» = fischio a ~880 Hz letto dal modulo microfono (pochi mV attorno
//    a 2,43 V), «coil» = magnete che cade in una bobina (impulso positivo poi negativo attorno a 2,5 V).
//  • DHT (DHT11/DHT22): aula a 22,5 °C e 48 % di umidità; a 20 s e a 120 s qualcuno soffia
//    sul sensore: l'umidità sale verso il 90 % e poi torna giù lentamente (τ ≈ 40 s), la
//    temperatura sale di un grado e mezzo. Tempo accelerato ×5. Ogni tanto un checksum sbagliato.
//  • GPS (mappa della temperatura): passeggiata ad anello in un parco (~1,2 km) a 1,4 m/s,
//    con una collinetta di 25 m, ombra degli alberi a nord (più fresco e umido) e asfalto a sud
//    (più caldo). I primi 8 s senza fix, poi 5…9 satelliti. Tempo accelerato ×5.
//  L'app sceglie lo scenario impostando link.scenario prima del comando START.

const FW = '0.1-sim';
const WARP = 30;

function gauss(s) {
  return s * Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
}

export class SimulatedLink {
  constructor() {
    this.kind = 'simulatore';
    this._lineCb = () => {};
    this._closeCb = () => {};
    this._timer = null;
    this.warp = WARP;
    this.scenario = 'incline';
    this.scopeSignal = 'mic';
  }
  onLine(cb) { this._lineCb = cb; }
  onClose(cb) { this._closeCb = cb; }
  async open() { setTimeout(() => this._emit(`#MOSAICUS,${FW},READY`), 300); }
  async close() { this._stop(); this._closeCb(); }
  _emit(line) { this._lineCb(line); }
  _stop() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  async write(cmd) {
    const c = cmd.trim();
    if (c === 'ID?') return this._emit(`#MOSAICUS,${FW},READY`);
    if (c === 'STOP') { this._stop(); return this._emit('#ACK,STOP'); }
    let m;
    if ((m = c.match(/^START,(MOTION|SOUND),(\d+)$/))) {
      this._stop();
      const interval = Math.max(m[1] === 'MOTION' ? 10 : 30, +m[2]);
      this._emit(`#ACK,START,${m[1]},${interval}`);
      const t0 = performance.now();
      this._timer = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        this._emit(m[1] === 'MOTION' ? simMotion(t) : simSound(t));
      }, interval);
      return;
    }
    if ((m = c.match(/^START,SCOPE,(\d+),(\d+),(\d+),(-?\d+),([01])$/))) {
      this._stop();
      const dt = Math.max(20, +m[1]), n = Math.min(400, Math.max(10, +m[2])), level = +m[3], edge = +m[4], auto = m[5] === '1';
      this._emit(`#ACK,START,SCOPE,${dt}`);
      const t0 = performance.now();
      let nextCoil = 1.2;                                   // s: prossima caduta del magnete
      this._timer = setInterval(() => {
        const tNow = (performance.now() - t0) / 1000;
        const sig = this.scopeSignal;
        // il segnale "continua" nel tempo reale: cerco il trigger a partire da adesso
        const look = sig === 'coil' ? 0.25 : 0.05;          // s di attesa simulata del trigger
        const step = dt / 1e6, hyst = 3;
        const v = (t) => scopeAdc(sig, t, nextCoil);
        let tTrig = null;
        if (edge !== 0) {
          let armed = false;
          for (let t = tNow; t < tNow + look; t += step) {
            const a = v(t), d = edge > 0 ? a - level : level - a;
            if (d < -hyst) armed = true; else if (armed && d >= 0) { tTrig = t; break; }
          }
        }
        if (tTrig == null && !auto) {                       // singolo: niente trigger, niente traccia
          if (sig === 'coil' && tNow > nextCoil + 0.5) nextCoil = tNow + 1.5 + Math.random();
          return;
        }
        const ts = tTrig ?? tNow;
        const vals = Array.from({ length: n }, (_, i) => v(ts + i * step));
        if (sig === 'coil' && tTrig != null) nextCoil = tTrig + 1.5 + Math.random() * 1.5;   // un magnete alla volta
        this._emit(`W,${tTrig == null ? 0 : 1},${dt},${vals.join(',')}`);
      }, 160);
      return;
    }
    if ((m = c.match(/^START,GPS,(\d+)(?:,(\d+))?$/))) {
      this._stop();
      const sens = [0, 1, 11, 22].includes(+m[2]) ? +m[2] : 11;
      const interval = Math.max(sens === 22 ? 2000 : 1000, +m[1]);
      this._emit(`#ACK,START,GPS,${interval}`);
      const t0 = Date.now();
      let k = 0;
      this._timer = setInterval(() => {
        const tMs = k * interval; k++;
        this._emit(`G,${tMs},${simGps(tMs / 1000, sens, t0 + tMs).join(',')}`);
      }, Math.max(50, interval / DHT_WARP));
      return;
    }
    if (c === 'BT,SETUP') { this._emit('#BT,SETUP'); setTimeout(() => this._emit('#ACK,BT,SETUP'), 800); return; }
    if ((m = c.match(/^START,DHT,(\d+)(?:,(\d+))?$/))) {
      this._stop();
      const type = m[2] === '22' ? 22 : 11;
      const interval = Math.max(type === 22 ? 2000 : 1000, +m[1]);
      this._emit(`#ACK,START,DHT,${interval}`);
      let k = 0;
      this._timer = setInterval(() => {
        const tMs = k * interval; k++;
        this._emit(`H,${tMs},${simDht(tMs / 1000, type).join(',')}`);
      }, Math.max(50, interval / DHT_WARP));
      return;
    }
    if ((m = c.match(/^START,(TEMP|SONAR),(\d+)$/))) {
      this._stop();
      let interval = +m[2];
      if (m[1] === 'TEMP') interval = Math.max(100, interval);
      if (m[1] === 'SONAR') interval = Math.max(30, interval);
      this._emit(`#ACK,START,${m[1]},${interval}`);
      const t0 = performance.now();
      if (m[1] === 'TEMP') {
        // in tempo accelerato l'intervallo reale si riduce di WARP volte
        const realInterval = Math.max(20, interval / this.warp);
        let k = 0;
        this._timer = setInterval(() => {
          const tMs = k * interval; k++;
          this._emit(`T,${tMs},${simAdcTemp(tMs / 1000).toFixed(2)}`);
        }, realInterval);
      } else {
        this._timer = setInterval(() => {
          const tUs = Math.round((performance.now() - t0) * 1000);
          this._emit(`S,${tUs},${simEcho(tUs / 1e6, this.scenario)}`);
        }, interval);
      }
      return;
    }
    this._emit(`#ERR,${c}`);
  }
}

const DHT_WARP = 5;

/** I quattro byte del DHT e il codice d'errore, come li invia il firmware. */
function simDht(t, type) {
  const breath = (t0) => {
    if (t < t0) return 0;
    const rise = 1 - Math.exp(-Math.min(t - t0, 6) / 2.5);           // 6 s di soffio
    const fall = t > t0 + 6 ? Math.exp(-(t - t0 - 6) / 40) : 1;
    return rise * fall;
  };
  const b = Math.max(breath(20), breath(120));
  const rh = Math.min(95, 48 + 42 * b + gauss(0.3));
  const T = 22.5 + 1.5 * b + gauss(0.05);
  if (Math.random() < 0.02) return [0, 0, 0, 0, 2];                  // checksum sbagliato
  if (type === 22) {
    const h = Math.round(rh * 10), tt = Math.round(Math.abs(T) * 10);
    return [h >> 8, h & 255, (tt >> 8) | (T < 0 ? 128 : 0), tt & 255, 0];
  }
  // DHT11: parte intera e decimi (le versioni recenti danno anche i decimi)
  const hi = Math.floor(rh), ti = Math.floor(Math.abs(T));
  return [hi, Math.round((rh - hi) * 10) % 10, ti, (Math.round((Math.abs(T) - ti) * 10) % 10) | (T < 0 ? 128 : 0), 0];
}

/** Una riga G del firmware (senza t_ms): posizione NMEA, satelliti, ora, sensore di temperatura. */
function simGps(t, sens, nowMs) {
  const LAT0 = 45.4725, LON0 = 9.1775, L = 1200, v = 1.4;          // centro del parco, giro, velocità
  const th = (2 * Math.PI * v * t) / L;
  const north = 190 * Math.sin(th) + 12 * Math.sin(5 * th), east = 260 * Math.cos(th) + 10 * Math.sin(3 * th);
  const lat = LAT0 + (north + gauss(1.5)) / 111320;
  const lon = LON0 + (east + gauss(1.5)) / (111320 * Math.cos((LAT0 * Math.PI) / 180));
  const alt = 122 + 25 * Math.max(0, Math.cos(th - 0.8)) ** 2 + gauss(0.8);
  const shade = Math.max(0, Math.sin(th));                           // alberi a nord
  const asphalt = Math.max(0, -Math.sin(th)) ** 2;                   // viale a sud
  const T = 21.5 - 2.2 * shade + 1.6 * asphalt - 0.0065 * (alt - 122) + gauss(0.12);
  const RH = 52 + 9 * shade - 5 * asphalt + gauss(0.8);
  const nmea = (deg, w) => {                                          // gradi → ggmm.mmmm con segno
    const a = Math.abs(deg), d = Math.floor(a), mm = (a - d) * 60;
    return `${deg < 0 ? '-' : ''}${String(d * 100 + Math.floor(mm)).padStart(w, '0')}${(mm % 1).toFixed(4).slice(1)}`;
  };
  const d = new Date(nowMs), p2 = (n) => String(n).padStart(2, '0');
  const utc = `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.00`;
  const date = `${p2(d.getUTCDate())}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCFullYear() % 100)}`;
  const fix = t >= 8;
  const sats = fix ? Math.round(7 + 2 * Math.sin(t / 40) + gauss(0.4)) : Math.min(3, Math.floor(t / 3));
  const pos = fix ? [1, nmea(lat, 4), nmea(lon, 5), alt.toFixed(1), sats, (1.0 + 0.3 * Math.abs(Math.sin(t / 25))).toFixed(2), (v / 0.514444 + gauss(0.1)).toFixed(3)]
    : [0, 'nan', 'nan', 'nan', sats, 'nan', 'nan'];
  let temp;
  if (sens === 11 || sens === 22) {
    if (Math.random() < 0.02) temp = [0, 0, 0, 0, 2];
    else if (sens === 22) { const h = Math.round(RH * 10), tt = Math.round(T * 10); temp = [h >> 8, h & 255, tt >> 8, tt & 255, 0]; }
    else { const hi = Math.floor(RH), ti = Math.floor(T); temp = [hi, Math.round((RH - hi) * 10) % 10, ti, Math.round((T - ti) * 10) % 10, 0]; }
  } else if (sens === 1) {
    const R = 10000 * Math.exp(3950 * (1 / (T + 273.15) - 1 / 298.15));
    temp = [((1023 * 10000) / (10000 + R)).toFixed(2), 0, 0, 0, 0];
  } else temp = [0, 0, 0, 0, 0];
  return [...pos, utc, date, sens, ...temp];
}

function simAdcTemp(t) {
  const Ta = 21, T0 = 75, theta = 900;
  const Tc = Ta + (T0 - Ta) * Math.exp(-t / theta) + gauss(0.05);
  const T = Tc + 273.15, B = 3950, R0 = 10000, Tref = 298.15, Rs = 10000;
  const R = R0 * Math.exp(B * (1 / T - 1 / Tref));
  // NTC verso 5 V, resistenza fissa verso GND: Vout/Vcc = Rs/(Rs+R)
  const adc = (1023 * Rs) / (Rs + R);
  return Math.min(1023, Math.max(0, adc + gauss(0.3)));
}

function simEcho(t, scenario) {
  let x;
  if (scenario === 'hand') {
    x = 0.27 + 0.17 * Math.sin(2 * Math.PI * 0.2 * t) + 0.03 * Math.sin(2 * Math.PI * 0.7 * t);
  } else if (scenario === 'spring') {
    const A = 0.06, T = 0.9, g = 0.08;
    x = 0.40 + A * Math.exp(-g * t) * Math.cos((2 * Math.PI * t) / T);
  } else {
    const x0 = 0.25, a = 0.45, tStart = 1.0, xEnd = 1.5;
    x = x0;
    if (t > tStart) x = Math.min(xEnd, x0 + 0.5 * a * (t - tStart) ** 2);
  }
  x += gauss(0.002);
  if (Math.random() < 0.01) return 0;                // eco perso
  if (Math.random() < 0.005) x += 0.3 + Math.random(); // eco spurio
  const v = 331.3 + 0.606 * 20; // aria a 20 °C
  return Math.round((2 * x / v) * 1e6);
}

function simMotion(t) {
  const L = 0.6, g = 9.81, th0 = (25 * Math.PI) / 180, gam = 0.03;
  const w0 = Math.sqrt(g / L);
  const th = th0 * Math.exp(-gam * t) * Math.cos(w0 * t);
  const dth = th0 * Math.exp(-gam * t) * (-w0 * Math.sin(w0 * t) - gam * Math.cos(w0 * t));
  const ay = g * Math.cos(th) + L * dth * dth;   // lungo il filo (asse y del telefono)
  const n = (s) => gauss(s);
  const f = (v) => v.toFixed(4);
  return `P,${Math.round(t * 1000)},${f(n(0.05))},${f(ay + n(0.05))},${f(n(0.05))},${f(n(0.01))},${f(n(0.01))},${f(dth + n(0.01))}`;
}

function simSound(t) {
  const f1 = 440, f2 = 443;
  const amp = Math.abs(Math.cos(Math.PI * (f2 - f1) * t)) * 0.3 + 0.002; // inviluppo dei battimenti
  const level = 20 * Math.log10(amp) + gauss(0.4);
  const freq = (f1 + f2) / 2 + gauss(0.3);
  return `M,${Math.round(t * 1000)},${freq.toFixed(2)},${level.toFixed(2)}`;
}

/** Lettura ADC (0…1023) del segnale simulato per l'oscilloscopio elettrico, all'istante t (s). */
function scopeAdc(sig, t, tCoil) {
  let V;
  if (sig === 'coil') {
    // f.e.m. indotta: derivata di una gaussiana (il flusso sale e poi scende), il secondo
    // lobo è più stretto e più alto perché il magnete esce più veloce (sta cadendo)
    const u = t - tCoil;
    const lobe = (c, s, A) => A * Math.exp(-((u - c) ** 2) / (2 * s * s));
    V = 2.5 + lobe(-0.006, 0.004, 0.28) - lobe(0.006, 0.003, 0.36);
  } else {
    // fischio (~880 Hz) con un po' di seconda armonica, letto dal modulo microfono
    const f = 880 * (1 + 0.004 * Math.sin(2 * Math.PI * 0.3 * t));
    const env = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
    V = 2.43 + env * (0.045 * Math.sin(2 * Math.PI * f * t) + 0.012 * Math.sin(4 * Math.PI * f * t + 1));
  }
  V += gauss(0.004);
  return Math.max(0, Math.min(1023, Math.round((V / 5) * 1023)));
}
