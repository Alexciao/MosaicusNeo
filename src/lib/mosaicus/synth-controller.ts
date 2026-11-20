// MosaicusNeo — synth: come lo suoni (tastiera, nastro, inclinazione, ultrasuoni) e i disegni
// (schermo della forma d'onda, nastro delle note). Il motore audio è in synth-engine.js,
// il pannello React in components/instruments/synth-panel.tsx.
//
// Con nastro, inclinazione e ultrasuoni la posizione diventa n semitoni e f = 440 · 2^(n/12);
// con una scala n si aggancia alle note.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { audioSupported, monitorAnalyser, readSamples, sampleRate } from "./audio.js";
import { noteFreq, snapToScale, SCALES as SCALES_JS, NOTE_IT, synth, findTrigger, TIMBRES } from "./dsp.js";
import { Screen } from "./screen.js";
import { canvasFont, rootScale, canvasDpr } from "./style.js";
import {
  SY, WAVES, save, retimbre, classicTail, ensureVoices, noteOn, noteOff, glideTo, voices, voice2, fullCoefs, notify, onGeneratorChange,
} from "./synth-engine.js";
import type { InstrumentApi } from "@/lib/lab-store";
import { t } from "@/i18n";

export const SCALES = SCALES_JS as Record<string, number[] | null>;
export const FMIN = 20, FMAX = 4000;
export const toSlider = (f: number) => Math.round((1000 * Math.log(f / FMIN)) / Math.log(FMAX / FMIN));
export const fromSlider = (u: number) => FMIN * Math.pow(FMAX / FMIN, u / 1000);
const roundF = (f: number) => (f < 100 ? Math.round(f * 10) / 10 : Math.round(f));
export const RANGES: Record<string, [number, number]> = { "Do3–Do5": [-21, 3], "Do4–Do6": [-9, 15], "Do2–Do4": [-33, -9] };
/** Le chiavi di RANGES restano in italiano (salvate in SY.range): questa è l'etichetta da mostrare. */
export const rangeLabel = (r: string) => r.replace(/Do/g, NOTE_IT[0]);
/** Scale per "umore": [icona, gruppo, [[chiave, etichetta], …]]. Con « · » il secondo nome è un sinonimo. */
export const SCALE_UI: [string, string, [string, string][]][] = [
  ["☀", "bright", ["maggiore", "lidia", "misolidia", "pentatonica"]],
  ["☾", "melancholic", ["minore", "dorica", "frigia", "locria", "minoreArmonica", "minoreMelodica", "pentatonicaMin"]],
  ["✦", "exotic", ["araba", "napoletana", "ungherese", "giapponese", "spagnola"]],
  ["♪", "blues", ["blues", "bluesMag"]],
  ["∿", "other", ["esatonale", "diminuita", "cromatica", "continua"]],
].map(([icon, group, keys]) => [icon as string, t(`engine.synth.scaleGroups.${group as "bright"}`), (keys as string[]).map((k) => [k, t(`engine.synth.scales.${k as "maggiore"}`)] as [string, string])]);
export const SCALE_NAME: Record<string, string> = Object.fromEntries(SCALE_UI.flatMap(([, , l]) => l.map(([k, n]) => [k, n.split(" · ")[0]])));
export const D_NEAR = 0.05, D_FAR = 0.5;
const V_SOUND = 343;
export type SynthMode = "keys" | "ribbon" | "tilt" | "sonar";
export const MODES: [SynthMode, string][] = (["keys", "ribbon", "tilt", "sonar"] as const).map((m) => [m, t(`engine.synth.modes.${m}`)]);
// testi dello schermo, ridisegnato a ogni fotogramma: tradotti una volta sola
const TXT = { live: t("engine.synth.screen.live"), computed: t("engine.synth.screen.computed"), periods: t("engine.synth.screen.twoPeriods") };

export interface HandState {
  u: number | null; n: number; d: number; tilt: number | null; dBuf: number[];
  acq: boolean; tiltOn: boolean; lastNote: number | null; playing: boolean; hearing: boolean;
  raf: number; dead: boolean; buf: Float32Array | null; last: number;
}

export function createSynthController(api: InstrumentApi & { toast: (m: string) => void }, onChange: () => void) {
  if (!RANGES[SY.range]) SY.range = "Do4–Do6";
  const L: HandState = { u: null, n: NaN, d: NaN, tilt: null, dBuf: [], acq: false, tiltOn: false, lastNote: null, playing: false, hearing: false, raf: 0, dead: false, buf: null, last: 0 };
  let scr: any = null, rib: HTMLCanvasElement | null = null, ro: ResizeObserver | null = null, offGen: (() => void) | null = null;

  const paint = () => { drawRibbon(); onChange(); };

  // ---------------- timbro ----------------
  function setPreset(id: string) {
    SY.preset = id;
    SY.amps = [...((WAVES as any)[id]?.amps || (TIMBRES as any)[id]?.amps || SY.amps)];
    classicTail(id);
    save(); retimbre(); paint();
    if (SY.mode === "keys" && SY.env !== "continuo") noteOn(SY.f);
  }
  function setHarmonic(i: number, v: number) { SY.amps[i] = v; SY.preset = "libera"; save(); retimbre(); paint(); }
  function setEnv(id: string) {
    SY.env = id; save();
    if (SY.on && SY.env !== "continuo") noteOff();
    if (SY.mode === "keys" && SY.env !== "continuo") noteOn(SY.f); // fa sentire subito l'inviluppo
    paint();
  }

  // ---------------- tastiera ----------------
  function setF(f: number, exact = false) {
    f = Math.min(FMAX, Math.max(FMIN, exact ? Math.round(f * 100) / 100 : roundF(f)));
    SY.f = f; save(); glideTo(f); notify(); paint();
  }
  function pressKey(n: number) {
    setF(noteFreq(n), true);
    if (!noteOn(SY.f)) api.toast(t("engine.synth.noAudio"));
    paint();
  }
  function setTwo(on: boolean) { SY.two = on; save(); const was = SY.on; ensureVoices(); if (was) noteOn(SY.f); paint(); }
  function setDf(df: number) { SY.df = df; save(); voice2()?.freq(SY.f + SY.df); paint(); }
  function setVol(v: number) { SY.vol = v; save(); voices().forEach((x: any) => x.relevel()); onChange(); }

  // ---------------- con la mano ----------------
  function setU(u: number | null, retrigger = false) {
    if (u == null || !Number.isFinite(u)) { L.u = null; paint(); return; }
    L.u = Math.min(1, Math.max(0, u));
    const [a, b] = RANGES[SY.range];
    let f = noteFreq(a + L.u * (b - a));
    if (SY.scale !== "continua") f = snapToScale(f, SY.scale, 440, SY.tonic);
    L.n = 12 * Math.log2(f / 440);
    const changed = L.lastNote == null || Math.abs(L.n - L.lastNote) > 0.01;
    // con pizzicato o campana, ogni nota nuova della scala è un nuovo "colpo"
    if (retrigger || (SY.env !== "continuo" && SY.scale !== "continua" && changed && L.playing)) noteOn(f);
    else if (L.playing) glideTo(f);
    else SY.f = f;
    L.lastNote = L.n;
    paint();
  }
  let down = false;
  const uFrom = (e: PointerEvent) => { const r = rib!.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  const ribDown = (e: PointerEvent) => {
    if (SY.mode !== "ribbon") return;
    stopHear(); down = true; rib!.setPointerCapture(e.pointerId); L.playing = true; setU(uFrom(e), true);
  };
  const ribMove = (e: PointerEvent) => { if (down) setU(uFrom(e)); };
  const ribUp = () => { if (down) { down = false; L.playing = false; noteOff(); paint(); } };

  const onTilt = (e: DeviceOrientationEvent) => { if (e.gamma == null) return; L.tilt = e.gamma; setU((Math.max(-45, Math.min(45, e.gamma)) + 45) / 90); };
  async function startTilt() {
    if (!("DeviceOrientationEvent" in window)) { api.toast(t("engine.synth.noTilt")); return false; }
    if (!window.isSecureContext) { api.toast(t("engine.synth.tiltNeedsHttps")); return false; }
    const DOE = DeviceOrientationEvent as any;
    if (typeof DOE.requestPermission === "function") {
      try { if ((await DOE.requestPermission()) !== "granted") { api.toast(t("engine.synth.motionDenied")); return false; } } catch { return false; }
    }
    window.addEventListener("deviceorientation", onTilt); L.tiltOn = true;
    return true;
  }
  const stopTilt = () => { window.removeEventListener("deviceorientation", onTilt); L.tiltOn = false; };

  function onLine(line: string) {
    if (SY.mode !== "sonar" || !L.acq || !line.startsWith("D,0,")) return false;
    const echo = Number(line.split(",")[3]);
    if (!(echo > 0)) return true;
    const d = (echo * 1e-6 * V_SOUND) / 2;
    if (d > 1.2) return true;
    L.dBuf.push(d); if (L.dBuf.length > 3) L.dBuf.shift();
    L.d = [...L.dBuf].sort((p, q) => p - q)[L.dBuf.length >> 1]; // mediana di 3: toglie i salti
    setU(1 - (L.d - D_NEAR) / (D_FAR - D_NEAR));
    return true;
  }

  // ---------------- ▶ Suona ----------------
  async function stopHand() {
    stopTilt();
    if (L.acq) { L.acq = false; try { await api.send("STOP"); } catch { /* scollegato */ } }
    L.playing = false;
  }
  async function play() {
    stopHear();
    if (SY.mode === "keys") {
      if (SY.on) noteOff(); else if (!noteOn(SY.f)) api.toast(t("engine.synth.noAudio"));
      paint(); return;
    }
    if (L.playing || L.acq || L.tiltOn) { await stopHand(); noteOff(); paint(); return; }
    if (SY.mode === "tilt") { if (!(await startTilt())) return; L.playing = true; setU(L.u ?? 0.5, true); }
    if (SY.mode === "sonar") {
      if (!api.ready()) { api.toast(t("engine.common.connectFirst")); return; }
      L.acq = true; L.dBuf = []; L.playing = true; // un HC-SR04 con TRIG su D12 ed ECHO su D11, letto ogni 30 ms
      await api.send("CFG,CLEAR"); await api.send("CFG,ADD,0,SONAR,30,12,11,0"); await api.send("START"); noteOn(SY.f);
    }
    paint();
  }
  async function setMode(m: SynthMode) {
    stopHear(); await stopHand(); noteOff(true);
    SY.mode = m; save(); L.u = null; L.n = NaN; L.lastNote = null; ensureVoices(); paint();
  }

  // Ascolto rapido: toccando una scala se ne sente la salita, così se ne riconosce il carattere.
  let hearT: ReturnType<typeof setTimeout>[] = [];
  function stopHear() { hearT.forEach(clearTimeout); hearT = []; if (L.hearing) { L.hearing = false; noteOff(true); } }
  function hearScale() {
    stopHear();
    const deg = SCALES[SY.scale];
    if (!deg || L.dead || SY.on || L.playing || L.acq || L.tiltOn) return;
    const seq = [...deg.map((d) => SY.tonic + d), SY.tonic + 12], dt = seq.length > 9 ? 120 : 200;
    L.hearing = true;
    seq.forEach((s, i) => hearT.push(setTimeout(() => {
      if (L.dead) return;
      noteOn(noteFreq(s - 9));
      if (i === seq.length - 1) hearT.push(setTimeout(() => { L.hearing = false; noteOff(); }, dt * 1.8));
    }, i * dt)));
  }
  function setScale(k: string) { SY.scale = k; save(); setU(L.u); hearScale(); }
  function setTonic(i: number) { SY.tonic = i; save(); setU(L.u); hearScale(); }
  function setRange(r: string) { SY.range = r; save(); setU(L.u); }

  // ---------------- disegno ----------------
  function drawRibbon() {
    if (!rib) return;
    const r = rib.getBoundingClientRect(), dpr = canvasDpr();
    if (!r.width) return;
    rib.width = Math.round(r.width * dpr); rib.height = Math.round(r.height * dpr);
    const g = rib.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height, k = rootScale();
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--mz-screen").trim() || "#00302A"; g.fillRect(0, 0, W, H);
    const [a, b] = RANGES[SY.range];
    const xOf = (n: number) => ((n - a) / (b - a)) * W;
    const root = SY.tonic || 0, deg = SCALES[SY.scale] || SCALES.maggiore!; // continua: si disegna la scala maggiore
    g.font = `500 ${11 * k}px ${canvasFont()}`; g.textAlign = "center"; g.textBaseline = "bottom";
    for (let n = Math.ceil(a); n <= b; n++) {
      const c = (((n + 9) % 12) + 12) % 12, isDo = c === root, inScale = deg.includes((((c - root) % 12) + 12) % 12);
      const X = Math.round(xOf(n)) + 0.5;
      g.strokeStyle = isDo ? "rgba(198,244,50,0.6)" : inScale ? "rgba(198,244,50,0.28)" : "rgba(255,255,255,0.07)";
      g.lineWidth = isDo ? 2 : 1;
      g.beginPath(); g.moveTo(X, 4); g.lineTo(X, H - 18 * k); g.stroke();
      if (inScale && (SY.scale !== "cromatica" || isDo || W > 700)) {
        g.fillStyle = isDo ? "#C6F432" : "rgba(198,244,50,0.7)";
        const lab = isDo ? `${NOTE_IT[c]}${4 + Math.floor((n + 9) / 12)}` : NOTE_IT[c], hw = g.measureText(lab).width / 2 + 2;
        g.fillText(lab, Math.min(W - hw, Math.max(hw, X)), H - 3);
      }
    }
    if (L.u != null) {
      const X = Number.isFinite(L.n) ? xOf(L.n) : L.u * W, R = 14 * Math.sqrt(k);
      g.fillStyle = L.playing ? "#C6F432" : "rgba(198,244,50,0.45)";
      g.beginPath(); g.arc(X, (H - 18 * k) / 2 + 2, R, 0, 2 * Math.PI); g.fill();
    }
  }

  /** Schermo: la forma d'onda vera (dall'uscita dell'app) se suona, altrimenti quella calcolata dalle armoniche. */
  function drawScreen() {
    let x: number[] | undefined, y: number[] | undefined, note = "";
    const an = audioSupported() && (SY.on || voices().some((v: any) => v.sounding)) ? monitorAnalyser() : null;
    if (an) {
      const buf = (L.buf = readSamples(an, L.buf)), sr = sampleRate(), N = buf.length;
      const per = sr / SY.f, span = Math.ceil(2 * per);
      let pk = 0; for (let i = N - 3 * span; i < N; i++) pk = Math.max(pk, Math.abs(buf[i]));
      if (pk > 0.003) {
        let t = findTrigger(buf, { level: 0, hyst: 0.3 * pk, edge: 1, from: N - 3 * span - Math.ceil(per), to: N - span });
        if (t < 0) t = N - span;
        const i0 = Math.floor(t);
        x = []; y = [];
        for (let i = 0; i <= span && i0 + i < N; i++) { x.push((i - (t - i0)) / per); y.push(buf[i0 + i] / pk); }
        note = TXT.live;
      }
    }
    if (!x) {
      const n = 400;
      const yy = synth(fullCoefs().slice(0, 96), 2, n, n); // 2 periodi su 400 punti: oltre la 96ª armonica ci sarebbe aliasing
      x = Array.from({ length: n }, (_, i) => (i / n) * 2); y = Array.from(yy);
      note = TXT.computed;
    }
    scr?.draw({ x0: 0, x1: 2, y0: -1.25, y1: 1.25, traces: [{ x, y, color: "#C6F432", width: 2.2, glow: true }], xLabel: TXT.periods, yLabel: "", note });
  }
  function loop(now: number) {
    if (L.dead) return;
    L.raf = requestAnimationFrame(loop);
    if (document.hidden || now - L.last < 50) return;
    L.last = now; drawScreen();
  }

  return {
    L,
    mount(screen: HTMLCanvasElement, ribbon: HTMLCanvasElement) {
      L.dead = false;
      scr = new Screen(screen, { divX: 8, divY: 4 });
      rib = ribbon;
      rib.addEventListener("pointerdown", ribDown);
      rib.addEventListener("pointermove", ribMove);
      rib.addEventListener("pointerup", ribUp);
      rib.addEventListener("pointercancel", ribUp);
      ro = new ResizeObserver(() => drawRibbon()); ro.observe(rib);
      offGen = onGeneratorChange(() => onChange());
      paint();
      L.raf = requestAnimationFrame(loop);
    },
    destroy() {
      L.dead = true; stopHear(); cancelAnimationFrame(L.raf); offGen?.(); ro?.disconnect(); scr?.destroy();
      if (rib) {
        rib.removeEventListener("pointerdown", ribDown); rib.removeEventListener("pointermove", ribMove);
        rib.removeEventListener("pointerup", ribUp); rib.removeEventListener("pointercancel", ribUp);
      }
      // la tastiera continua a suonare cambiando pagina; i modi "con la mano" si fermano
      if (SY.mode !== "keys") { void stopHand(); noteOff(true); }
    },
    onLine,
    linkChanged() { if (!api.ready() && L.acq) { L.acq = false; L.playing = false; noteOff(); paint(); } },
    refreshStyle() { drawRibbon(); },
    setPreset, setHarmonic, setEnv, setF, pressKey, setTwo, setDf, setVol, play, setMode, setScale, setTonic, setRange,
    isLive: () => (SY.mode === "keys" ? SY.on : L.playing || L.acq || L.tiltOn),
  };
}
export type SynthController = ReturnType<typeof createSynthController>;
