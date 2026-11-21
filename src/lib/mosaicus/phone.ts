// MosaicusNeo — i sensori del telefono (o del computer) come una scheda in più, senza Arduino.
//
// Stessa interfaccia di SerialLink e SimulatedLink e stesso protocollo del firmware:
//   CFG,CLEAR · CFG,ADD,<slot>,<PMOT|PSND>,<ms>,0,0,0 · START · STOP · ID?
//   PMOT → D,<slot>,<t_ms>,ax,ay,az,gx,gy,gz   (accelerazione con la gravità in m/s², rotazione in °/s)
//   PSND → D,<slot>,<t_ms>,f,L                 (frequenza dominante in Hz, livello relativo in dB)
// Così misura, grafici, Quaderno ed Elaborazione trattano il telefono come Arduino.
//
// Note pratiche
//  • Serve una pagina sicura (https). Su iPhone il permesso per i sensori di movimento si chiede
//    con un tocco: per questo open() va chiamata dal clic su «Attiva i sensori».
//  • accelerationIncludingGravity: a telefono fermo sul tavolo a_z ≈ +9,8 m/s² (alcuni dispositivi
//    usano il segno opposto: c'è l'opzione nella scheda Componenti).
//  • Il livello sonoro è relativo al fondo scala del microfono, non tarato in dB SPL.

import { audio, micAnalyser, closeMic } from "./audio.js";
import { t } from "@/i18n";

const FW = "telefono";

export const phoneMotionSupported = () => typeof window !== "undefined" && "DeviceMotionEvent" in window;
export const phoneSoundSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

interface Slot { type: "PMOT" | "PSND"; interval: number }

/**
 * Frequenza dominante dallo spettro (dB per bin): massimo tra 50 Hz e 5 kHz, raffinato con
 * l'interpolazione parabolica sui tre bin vicini (molto meglio della larghezza di un bin).
 */
export function dominantFrequency(specDb: Float32Array, sampleRate: number, fftSize: number, fMin = 50, fMax = 5000) {
  const df = sampleRate / fftSize;
  const i0 = Math.max(1, Math.floor(fMin / df)), i1 = Math.min(specDb.length - 2, Math.ceil(fMax / df));
  let best = -1, bv = -Infinity;
  for (let i = i0; i <= i1; i++) if (specDb[i] > bv) { bv = specDb[i]; best = i; }
  if (best < 0 || bv < -95) return NaN;
  const a = specDb[best - 1], b = specDb[best], c = specDb[best + 1];
  const den = a - 2 * b + c;
  return (best + (den !== 0 ? (0.5 * (a - c)) / den : 0)) * df;
}

export class PhoneLink {
  kind = "telefono" as const;
  private lineCb: (l: string) => void = () => {};
  private closeCb: () => void = () => {};
  private slots = new Map<number, Slot>();
  private stopFns: (() => void)[] = [];
  private motionDenied = false;

  onLine(cb: (l: string) => void) { this.lineCb = cb; }
  onClose(cb: () => void) { this.closeCb = cb; }
  private emit(l: string) { this.lineCb(l); }

  /** Dal clic: su iPhone chiede il permesso per i sensori di movimento e prepara l'audio. */
  async open() {
    if (!window.isSecureContext) throw new Error(t("engine.phone.needsHttps"));
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    // il permesso negato blocca solo i sensori di movimento: il microfono può funzionare lo stesso
    if (typeof DME?.requestPermission === "function") {
      try { this.motionDenied = (await DME.requestPermission()) !== "granted"; } catch { this.motionDenied = true; }
    }
    try { audio(); } catch { /* niente audio: il microfono darà errore solo se serve */ }
    setTimeout(() => this.emit(`#MOSAICUSNEO,${FW},READY`), 50);
  }
  async close() { this.stop(); this.closeCb(); }
  private stop() { for (const f of this.stopFns) f(); this.stopFns = []; }

  async write(cmd: string) {
    const c = cmd.trim();
    let m: RegExpMatchArray | null;
    if (c === "ID?") return this.emit(`#MOSAICUSNEO,${FW},READY`);
    if (c === "STOP") { this.stop(); return this.emit("#ACK,STOP"); }
    if (c === "CFG,CLEAR") { this.stop(); this.slots.clear(); return this.emit("#ACK,CFG,CLEAR"); }
    if ((m = c.match(/^CFG,ADD,(\d+),(\w+),(\d+),/))) {
      const slot = +m[1], type = m[2];
      if (type !== "PMOT" && type !== "PSND") return this.emit(`#ERR,CFG,${slot},TIPO`);
      this.slots.set(slot, { type, interval: Math.max(type === "PMOT" ? 10 : 30, +m[3]) });
      return this.emit(`#ACK,CFG,ADD,${slot}`);
    }
    if (c === "START") {
      this.stop();
      if (!this.slots.size) return this.emit("#ERR,START,EMPTY");
      this.emit("#ACK,START");
      const t0 = performance.now();
      for (const [slot, s] of this.slots) {
        if (s.type === "PMOT") this.startMotion(slot, s.interval, t0);
        else await this.startSound(slot, s.interval, t0);
      }
      return;
    }
    if (c === "PING" || c.startsWith("OUT,") || c.startsWith("LINK,")) return;
    this.emit(`#ERR,${c}`);
  }

  private startMotion(slot: number, interval: number, t0: number) {
    if (this.motionDenied) { this.emit(`#ERR,PHONE,${t("engine.phone.motionDenied")}`); return; }
    let last = -Infinity, got = false;
    const v = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "nan" : (+x).toFixed(4));
    const h = (e: DeviceMotionEvent) => {
      const t = performance.now();
      if (t - last < interval - 4) return;          // gli eventi arrivano a passi di ~16 ms
      last = t; got = true;
      const g = e.accelerationIncludingGravity, r = e.rotationRate;
      // rotationRate in °/s: beta attorno a x, gamma attorno a y, alpha attorno a z
      this.emit(`D,${slot},${(t - t0).toFixed(3)},${v(g?.x)},${v(g?.y)},${v(g?.z)},${v(r?.beta)},${v(r?.gamma)},${v(r?.alpha)}`);
    };
    window.addEventListener("devicemotion", h);
    const warn = setTimeout(() => { if (!got) this.emit(`#ERR,PHONE,${t("engine.phone.noMotionData")}`); }, 2500);
    this.stopFns.push(() => { window.removeEventListener("devicemotion", h); clearTimeout(warn); });
  }

  private async startSound(slot: number, interval: number, t0: number) {
    let an: AnalyserNode;
    try { an = await micAnalyser(); } catch (e) { this.emit(`#ERR,PHONE,${t("engine.phone.micUnavailable", { msg: (e as Error).message })}`); return; }
    const spec = new Float32Array(an.frequencyBinCount), wave = new Float32Array(an.fftSize);
    const sr = an.context.sampleRate;
    const timer = setInterval(() => {
      an.getFloatFrequencyData(spec);
      an.getFloatTimeDomainData(wave);
      const f = dominantFrequency(spec, sr, an.fftSize);
      let s = 0; for (const x of wave) s += x * x;
      const level = 10 * Math.log10(s / wave.length + 1e-12);
      this.emit(`D,${slot},${(performance.now() - t0).toFixed(3)},${Number.isFinite(f) ? f.toFixed(2) : "nan"},${level.toFixed(2)}`);
    }, interval);
    this.stopFns.push(() => { clearInterval(timer); closeMic(); });
  }
}
