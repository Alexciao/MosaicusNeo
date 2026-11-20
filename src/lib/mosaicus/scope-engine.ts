// MosaicusNeo — oscilloscopio (motore, senza interfaccia).
//
// Due modalità con la stessa interfaccia:
//  • 'audio'   : microfono o suoni di esempio / synth dell'app (Web Audio, ~48 000 campioni/s)
//  • 'arduino' : tensione su A0 catturata "a raffica" dal firmware (START,SCOPE,…), 400 campioni
//
// Schermo della forma d'onda con trigger, spettro con le armoniche, frequenza dalla
// autocorrelazione, nota musicale. «Congela» conserva fino a 3 tracce (A, B, C) sovrapposte,
// allineate sul trigger; si possono inviare a Elaborazione (forme d'onda e spettri).
// Il pannello React (components/instruments/scope-panel.tsx) legge lo stato S e chiama i metodi.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Screen, niceDiv, fmtIt } from "./screen.js";
import { pitch, spectrum, findTrigger, harmonics, noteOf, TIMBRES, sig } from "./dsp.js";
import { micAnalyser, monitorAnalyser, readSamples, Voice, closeMic, audioSupported, sampleRate } from "./audio.js";
import { generatorOn } from "./synth-engine.js";
import { prefs } from "@/lib/prefs";
import type { InstrumentApi } from "@/lib/lab-store";
import { t as tx } from "@/i18n";

export const LIVE = "#C6F432";
const SLOT_IDS = ["A", "B", "C"];
/** Colore della traccia congelata (dipende dal tema). */
export const slotColor = (id: string) => getComputedStyle(document.documentElement).getPropertyValue(`--slot-${id.toLowerCase()}`).trim() || "#fff";
const slotDash = (id: string) => { const v = getComputedStyle(document.documentElement).getPropertyValue(`--slot-${id.toLowerCase()}-dash`).trim(); return !v || v === "none" ? null : v.split(/\s+/).map(Number); };
export const WIN_STEPS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];       // ms
export const DT_STEPS = [20, 50, 100, 250, 500, 1000, 2500];                        // µs tra due campioni (Arduino)
export const N_ARD = 400;
const KEEP_MS = 51;          // ms conservati dopo il trigger per ogni traccia
export const EXAMPLES: [string, string][] = (["sinusoide", "flauto", "clarinetto", "violino", "voce"] as const).map((id) => [id, tx(`engine.scope.examples.${id}`)]);
const EX_NAME: Record<string, string> = Object.fromEntries([...EXAMPLES, ["beats", tx("engine.scope.examples.beats")]]);
// testi disegnati a ogni fotogramma: tradotti una volta sola
const AU = tx("engine.scope.arbitraryUnit");
const TXT = {
  sameHeights: tx("engine.scope.normHeights"), sameAmps: tx("engine.scope.normAmps"), noTrigger: tx("engine.scope.noTrigger"),
  spectrum: tx("engine.scope.spectrumTag"), pickSource: tx("engine.scope.pickSource"), connectArduino: tx("engine.scope.connectArduino"),
  pressStart: tx("engine.scope.pressStart"), live: tx("engine.scope.live"), waiting: tx("engine.scope.waitingTrigger"),
  freq: tx("engine.scope.readout.frequency"), period: tx("engine.scope.readout.period"), note: tx("engine.scope.readout.note"),
  pp: tx("engine.scope.readout.peakToPeak"), mean: tx("engine.scope.readout.mean"),
};
const AMP: Record<string, string> = Object.fromEntries(["V", "mA", AU].map((u) => [u, tx("engine.scope.amplitudeUnit", { unit: u })]));

export interface Frame {
  y: Float32Array; adc?: number[]; sr: number; off: number; unit: string; fired?: boolean; peak?: number;
  f?: number; T?: number; clarity?: number; spec?: { mag: any; df: number }; recipe?: number[] | null;
  pitchBuf?: Float32Array; specBuf?: Float32Array;
}
export interface Slot extends Frame { id: string; name: string; visible: boolean }
export type Circuit = "mic" | "coil" | "lamp";

export interface ScopeState {
  source: "arduino" | "mic" | "ex" | null;
  analyser: AnalyserNode | null; buf: Float32Array | null;
  paused: boolean; showLive: boolean; winMs: number; edge: number; same: boolean;
  live: Frame | null; slots: Slot[]; fHist: number[]; yHalf: number; fRef: number;
  example: string | null; voices: any[];
  dt: number; level: number; single: boolean; acq: boolean;
  qty: "V" | "I"; R: number; V0: number; circuit: Circuit;
  lastTick: number; nTick: number; raf: number; dead: boolean; msg: string;
  /** letture mostrate sopra lo schermo: [etichetta, valore, unità] */
  readouts: [string, string, string][];
  /** ricette delle armoniche: righe dal vivo e tracce congelate */
  recipe: { id: string; name: string; color: string; amps: number[] }[];
  screenMsg: string;
}

export function createScopeEngine(api: InstrumentApi & { toast: (m: string) => void }, onChange: () => void) {
  const ard = api.mode === "arduino";
  const pref = prefs.get<Partial<ScopeState>>(`mosaicus.scope.${api.mode}`, {});
  const S: ScopeState = {
    source: ard ? "arduino" : null, analyser: null, buf: null,
    paused: !ard, showLive: true, winMs: pref.winMs ?? 10, edge: pref.edge ?? 1, same: pref.same ?? !ard,
    live: null, slots: [], fHist: [], yHalf: 0.05, fRef: 0,
    example: null, voices: [],
    dt: pref.dt ?? 100, level: pref.level ?? 2.5, single: pref.single ?? false, acq: false,
    qty: pref.qty ?? "V", R: pref.R ?? 100, V0: pref.V0 ?? 0, circuit: pref.circuit ?? "mic",
    lastTick: 0, nTick: 0, raf: 0, dead: false, msg: "",
    readouts: [], recipe: [], screenMsg: "",
  };
  const save = () => prefs.set(`mosaicus.scope.${api.mode}`, { winMs: S.winMs, edge: S.edge, same: S.same, dt: S.dt, level: S.level, single: S.single, qty: S.qty, R: S.R, V0: S.V0, circuit: S.circuit });
  let wave: any = null, spec: any = null;
  if (ard) api.setSimSignal(S.circuit);

  // ---------------- sorgenti audio ----------------
  async function selectSource(src: "mic" | "ex") {
    if (!audioSupported()) { api.toast(tx("engine.scope.noAudio")); return; }
    if (src === S.source) return;
    if (src !== "ex") stopExample();
    if (src !== "mic") closeMic();
    try {
      S.analyser = src === "mic" ? await micAnalyser() : monitorAnalyser();
    } catch (e) {
      api.toast(tx("engine.scope.micUnavailable", { msg: (e as Error).message }));
      return;
    }
    S.source = src; S.showLive = true; S.live = null; S.fHist = [];
    // il microfono parte subito; gli esempi aspettano ▶ Avvia (si sceglie in silenzio)
    S.paused = src === "ex";
    if (src === "ex" && !S.example && !generatorOn()) S.example = "violino";
    prefs.set("mosaicus.scope.src", src);
    onChange();
  }
  function stopVoices() { S.voices.forEach((v) => v.dispose()); S.voices = []; }
  function startVoices(id: string | null) {
    stopVoices();
    if (!id) return;
    if (id === "beats") S.voices = [new Voice({ type: "sine", freq: 440, gain: 0.18 }), new Voice({ type: "sine", freq: 443, gain: 0.18 })];
    else S.voices = [new Voice({ amps: (TIMBRES as any)[id].amps, freq: 220, gain: 0.3 })];
    S.voices.forEach((v) => v.start());
  }
  function stopExample() { stopVoices(); S.example = null; }
  function pause() { S.paused = true; stopVoices(); onChange(); }
  function resume() {
    S.paused = false; S.showLive = true; S.fHist = [];
    if (S.source === "ex") {
      if (!S.example && !generatorOn()) S.example = "violino";
      startVoices(S.example);
    }
    onChange();
  }
  function playExample(id: string) {
    if (S.example === id && !S.paused) { pause(); return; }
    S.example = id;
    resume();
  }

  // ---------------- Arduino ----------------
  const acqCommand = () => `START,SCOPE,${S.dt},${N_ARD},${Math.round((S.level / 5) * 1023)},${S.edge},${S.single ? 0 : 1}`;
  async function startAcq() {
    if (!api.ready()) { api.toast(tx("engine.common.connectFirst")); return; }
    S.acq = true; S.showLive = true; onChange();
    await api.send(acqCommand());
    S.msg = S.single && S.edge ? TXT.waiting : "";
  }
  async function stopAcq() { if (!S.acq) return; S.acq = false; S.msg = ""; onChange(); try { await api.send("STOP"); } catch { /* scollegato */ } }
  async function restartAcq() { if (!S.acq) return; await api.send("STOP"); await api.send(acqCommand()); }
  const toQty = (adc: number) => { const V = (adc * 5) / 1023 - S.V0; return S.qty === "I" ? (V / S.R) * 1000 : V; };
  const unit = () => (ard ? (S.qty === "I" ? "mA" : "V") : AU);
  function reconvert() {
    for (const f of [S.live, ...S.slots]) if (f?.adc) { f.y = Float32Array.from(f.adc, toQty); f.unit = unit(); analyse(f, true); }
    redraw(); updateReadouts(true);
  }

  function onLine(line: string) {
    if (!line.startsWith("W,")) return false;
    if (!S.acq) return true;
    const p = line.slice(2).split(",").map(Number);
    const [fired, dt] = p, adc = p.slice(2);
    if (adc.length < 8 || !(dt > 0)) return true;
    const fr: Frame = { adc, y: Float32Array.from(adc, toQty), sr: 1e6 / dt, off: 0, unit: unit(), fired: !!fired };
    analyse(fr, true);
    S.live = fr; S.msg = "";
    if (S.single) { void stopAcq(); api.toast(tx("engine.scope.captured")); }
    redraw(); updateReadouts(true); onChange();
    return true;
  }

  // ---------------- analisi di una traccia ----------------
  function analyse(fr: Frame, full: boolean) {
    const sr = fr.sr;
    const pk = pitch(fr.pitchBuf || fr.y, sr, { fmin: ard ? Math.max(2, (sr / fr.y.length) * 2) : 50, fmax: Math.min(sr / 4, 5000), minRms: ard ? 0.002 : 0.004 });
    fr.f = pk?.f ?? NaN; fr.T = pk?.T ?? NaN; fr.clarity = pk?.clarity ?? 0;
    if (full || !fr.spec) {
      const s = spectrum(fr.specBuf || fr.y, sr, (ard ? 2048 : null) as any);
      const kmax = Math.min(s.mag.length, Math.ceil(Math.min(sr / 2, 10000) / s.df));
      fr.spec = { mag: s.mag.slice(0, kmax), df: s.df };
    }
    fr.recipe = Number.isFinite(fr.f) ? (harmonics(fr.spec!.mag, fr.spec!.df, fr.f!, 8) as any[]).map((h) => h.rel as number) : null;
    delete fr.pitchBuf; delete fr.specBuf;
    return fr;
  }

  function grabAudio(): Frame {
    const buf = (S.buf = readSamples(S.analyser, S.buf));
    const sr = sampleRate(), N = buf.length;
    let mean = 0; for (let i = N - 4096; i < N; i++) mean += buf[i]; mean /= 4096;
    const keep = Math.ceil((KEEP_MS / 1000) * sr);
    const span = Math.ceil(sr / 25);
    const to = N - keep, from = Math.max(1, to - span);
    let peak = 0; for (let i = from; i < N; i++) peak = Math.max(peak, Math.abs(buf[i] - mean));
    let trig = S.edge ? findTrigger(buf, { level: mean, hyst: 0.35 * peak, edge: S.edge, from, to }) : -1;
    if (trig < 0) trig = to;
    const i0 = Math.floor(trig);
    const fr: Frame = { y: buf.slice(i0, Math.min(N, i0 + keep + 1)), sr, off: trig - i0, unit: AU, peak, pitchBuf: buf.subarray(N - 4096) };
    const doSpec = S.nTick % 3 === 0 || !S.live?.spec;
    if (doSpec) fr.specBuf = buf; else fr.spec = S.live!.spec;
    return analyse(fr, doSpec);
  }

  // ---------------- congela e tracce ----------------
  function freeze() {
    if (!S.live || S.slots.length >= 3) return;
    const free = SLOT_IDS.find((id) => !S.slots.some((x) => x.id === id))!;
    const fr = S.live;
    const name = ard ? free : S.source === "ex" && S.example ? EX_NAME[S.example] || free : free;
    S.slots.push({ ...fr, y: fr.y.slice(), adc: fr.adc?.slice(), id: free, visible: true, name });
    S.slots.sort((a, b) => a.id.localeCompare(b.id));
    // «Congela» ferma davvero: per un'altra traccia ▶ Avvia, poi di nuovo ❄
    S.paused = true; S.showLive = false;
    stopVoices();
    if (S.acq) void stopAcq();
    redraw(); updateReadouts(true); renderRecipe(); onChange();
  }
  function toggleSlot(id: string) { const s = S.slots.find((x) => x.id === id); if (s) s.visible = !s.visible; redraw(); renderRecipe(); onChange(); }
  function renameSlot(id: string, name: string) { const s = S.slots.find((x) => x.id === id); if (s) s.name = name.trim() || s.id; renderRecipe(); onChange(); }
  function removeSlot(id: string) { S.slots = S.slots.filter((x) => x.id !== id); redraw(); renderRecipe(); onChange(); }

  // ---------------- disegno ----------------
  function traceXY(fr: Frame, tmax: number, norm: boolean) {
    const n = Math.min(fr.y.length, Math.ceil((tmax / 1000) * fr.sr) + 2);
    const x = new Float32Array(n), y = new Float32Array(n);
    let mean = 0, pk = 0;
    if (norm || !ard) { for (let i = 0; i < fr.y.length; i++) mean += fr.y[i]; mean /= fr.y.length || 1; }
    if (norm) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(fr.y[i] - mean));
    for (let i = 0; i < n; i++) { x[i] = ((i - fr.off) / fr.sr) * 1000; y[i] = norm ? (fr.y[i] - mean) / (pk || 1) : ard ? fr.y[i] : fr.y[i] - mean; }
    return { x, y };
  }
  const windowMs = () => (ard ? (S.live ? (S.live.y.length / S.live.sr) * 1000 : (S.dt * N_ARD) / 1000) : S.winMs);

  function redraw() {
    if (!wave) return;
    const tmax = windowMs();
    const frames: Frame[] = [...S.slots.filter((s) => s.visible), ...(S.live && S.showLive ? [S.live] : [])];
    const tr = frames.map((f) => ({ ...traceXY(f, tmax, S.same), color: f === S.live ? LIVE : slotColor((f as Slot).id), dash: f === S.live ? null : slotDash((f as Slot).id), width: f === S.live ? 2 : 2.8, glow: f === S.live }));
    let y0, y1, yLabel;
    if (S.same) { y0 = -1.2; y1 = 1.2; yLabel = TXT.sameHeights; }
    else {
      let lo = Infinity, hi = -Infinity;
      tr.forEach((t) => t.y.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; }));
      if (!Number.isFinite(lo)) { lo = ard ? 0 : -0.05; hi = ard ? 5 : 0.05; }
      const half = Math.max((hi - lo) / 2, ard ? 0.02 : 0.002) * 1.15;
      S.yHalf = half > S.yHalf ? half : S.yHalf * 0.92 + half * 0.08;
      const div = niceDiv(2 * S.yHalf, 8);
      const c = ard ? Math.round((lo + hi) / 2 / div) * div : 0;
      y0 = c - 4 * div; y1 = c + 4 * div;
      yLabel = `${fmtIt(div, 3)} ${unit()}/div`;
    }
    wave.draw({
      x0: 0, x1: tmax, y0, y1, traces: tr, markers: [],
      xLabel: `${fmtIt(tmax / 10, 3)} ms/div`, yLabel,
      note: S.msg || (ard && S.live && !S.live.fired && S.edge ? TXT.noTrigger : ""),
    });
    if (ard && !S.same && S.edge && S.qty === "V" && wave.map) drawLevel(S.level - S.V0);
    const msg = !ard && !S.source ? TXT.pickSource
      : !frames.length ? (ard && !S.acq ? TXT.connectArduino : TXT.pressStart) : "";
    if (msg !== S.screenMsg) { S.screenMsg = msg; onChange(); }
    drawSpectrum(frames);
  }

  function drawLevel(v: number) {
    const { g } = wave, m = wave.map;
    const Y = m.sy(v); if (Y < m.pad.t || Y > m.pad.t + m.ph) return;
    g.save(); g.strokeStyle = "rgba(255,255,255,0.55)"; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(m.pad.l, Y); g.lineTo(m.pad.l + m.pw, Y); g.stroke();
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(m.pad.l, Y - 6); g.lineTo(m.pad.l + 9, Y); g.lineTo(m.pad.l, Y + 6); g.fill(); g.restore();
  }

  function drawSpectrum(frames: Frame[]) {
    const liveOn = S.live && S.showLive;
    const ref = liveOn && Number.isFinite(S.live!.f) ? S.live!.f : S.slots.find((s) => Number.isFinite(s.f))?.f;
    if (ref && (!S.fRef || Math.abs(ref / S.fRef - 1) > 0.15)) S.fRef = ref;
    const srMin = Math.min(...frames.map((f) => f.sr), 48000);
    // fondo scala: il primo valore "tondo" che contiene circa 9 armoniche
    const SPANS = [50, 100, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000];
    const want = S.fRef ? Math.max(ard ? 50 : 500, S.fRef * 8.6) : ard ? srMin / 4 : 4000;
    const fmax = Math.min(srMin / 2, SPANS.find((v) => v >= want) ?? srMin / 2);
    let gmax = 0;
    const tr = frames.filter((f) => f.spec).map((f) => {
      const { mag, df } = f.spec!; const kmax = Math.min(mag.length, Math.ceil(fmax / df) + 1);
      let m = 0; for (let k = 1; k < kmax; k++) m = Math.max(m, mag[k]);
      gmax = Math.max(gmax, m);
      return { f, kmax, m };
    }).map(({ f, kmax, m }) => {
      const x = new Float32Array(kmax), y = new Float32Array(kmax);
      for (let k = 0; k < kmax; k++) { x[k] = k * f.spec!.df; y[k] = f.spec!.mag[k] / (S.same ? m || 1 : 1); }
      const live = f === S.live;
      return { x, y, color: live ? LIVE : slotColor((f as Slot).id), dash: live ? null : slotDash((f as Slot).id), width: live ? 1.8 : 2.2, glow: live, fill: live ? "rgba(198,244,50,0.12)" : null };
    });
    const markers = [];
    const base = liveOn && Number.isFinite(S.live!.f) ? S.live!.f : S.slots.find((s) => s.visible && Number.isFinite(s.f))?.f ?? null;
    if (base) for (let n = 1; n * base <= fmax && n <= 12; n++) markers.push({ x: n * base, label: String(n), color: "rgba(198,244,50,0.55)" });
    spec.draw({
      x0: 0, x1: fmax, y0: 0, y1: (S.same ? 1 : gmax || 1) * 1.12, traces: tr, markers, centerX: false, centerY: false,
      xLabel: `${fmtIt(fmax / 10, 0)} Hz/div · ${TXT.spectrum}`, yLabel: S.same ? TXT.sameAmps : AMP[unit()],
    });
  }

  function renderRecipe() {
    const rows = [
      ...(S.live && S.showLive ? [{ ...S.live, id: "ora", name: TXT.live, color: LIVE }] : []),
      ...S.slots.filter((s) => s.visible).map((s) => ({ ...s, color: slotColor(s.id) })),
    ];
    S.recipe = rows.filter((r) => r.recipe).map((r) => ({ id: r.id, name: r.name, color: r.color, amps: r.recipe! }));
  }

  let roLast = 0;
  function updateReadouts(force = false) {
    const now = performance.now();
    if (!force && now - roLast < 160) return;
    roLast = now;
    const src = S.showLive ? S.live : S.slots[S.slots.length - 1];
    const f = src?.f ?? NaN;
    if (!S.showLive) S.fHist = Number.isFinite(f) ? [f] : [];
    else if (Number.isFinite(f)) { S.fHist.push(f); if (S.fHist.length > 5) S.fHist.shift(); } else S.fHist = [];
    const fm = S.fHist.length ? [...S.fHist].sort((a, b) => a - b)[S.fHist.length >> 1] : NaN;
    const note = !ard && Number.isFinite(fm) ? noteOf(fm) : null;
    const cells: [string, string, string][] = [
      [TXT.freq, Number.isFinite(fm) ? fmtIt(sig(fm, 4), fm < 100 ? 2 : 1) : "—", "Hz"],
      [TXT.period, Number.isFinite(fm) ? fmtIt(sig(1000 / fm, 3), 3) : "—", "ms"],
    ];
    if (note) cells.push([TXT.note, note.label, `${note.cents >= 0 ? "+" : "−"}${Math.abs(note.cents)} cent`]);
    if (ard && src) {
      let lo = Infinity, hi = -Infinity, s = 0; src.y.forEach((v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); s += v; });
      cells.push([TXT.pp, fmtIt(sig(hi - lo, 3), 3), unit()], [TXT.mean, fmtIt(sig(s / src.y.length, 3), 3), unit()]);
    }
    S.readouts = cells;
    onChange();
  }

  // ---------------- ciclo di animazione ----------------
  function tick(now: number) {
    if (S.dead) return;
    S.raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (now - S.lastTick < 33) return;
    S.lastTick = now; S.nTick++;
    if (!ard && S.analyser && !S.paused) {
      S.live = grabAudio();
      if (S.nTick % 6 === 0) { renderRecipe(); onChange(); }
      updateReadouts();
    }
    redraw();
  }

  // ---------------- invio a Elaborazione ----------------
  function chosen(): Slot[] {
    const vis = S.slots.filter((s) => s.visible);
    if (vis.length) return vis;
    if (S.live && S.showLive) return [{ ...S.live, id: "A", visible: true, name: ard ? "A" : S.source === "ex" ? EX_NAME[S.example ?? ""] || "A" : "A" }];
    return [];
  }
  const meta = (list: Slot[]) => list.map((s) => `${s.id}${s.name !== s.id ? ` = ${s.name}` : ""}: ${Number.isFinite(s.f) ? `${fmtIt(sig(s.f, 4), 1)} Hz` : tx("engine.scope.fNotFound")}${!ard && noteOf(s.f) ? ` (${noteOf(s.f)?.label})` : ""}`).join(" · ");

  async function sendWaves() {
    const list = chosen();
    if (!list.length) { api.toast(tx("engine.scope.noTraceToSend")); return; }
    const tmax = windowMs(), base = list[0], dt = 1000 / base.sr;
    const n = Math.min(Math.floor(tmax / dt) + 1, 6000);
    const rows: Record<string, number>[] = [];
    const series = list.map((s) => traceXY(s, tmax + dt, false));
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const r: Record<string, number> = { t: +t.toPrecision(7) };
      list.forEach((s, j) => { r[s.id] = interp(series[j].x, series[j].y, t); });
      rows.push(r);
    }
    const u = list[0].unit;
    await api.sendBox({
      title: tx("engine.scope.waveTitle", { names: list.map((s) => s.name).join(", ") }),
      subtitle: meta(list), wave: true, tUnit: "ms", t1: 0, t2: rows[rows.length - 1].t,
      columns: [{ key: "t", sym: "t", unit: "ms", name: tx("engine.scope.colTime") }, ...list.map((s) => ({ key: s.id, sym: s.id, unit: u, name: s.name }))],
      xKey: "t", yKey: list[0].id, rows,
    }, tx("engine.scope.wavesSent", { n: list.length, points: rows.length }));
  }

  async function sendSpectra() {
    const list = chosen().filter((s) => s.spec);
    if (!list.length) { api.toast(tx("engine.scope.noSpectrumToSend")); return; }
    const fmax = Math.min(...list.map((s) => s.spec!.df * (s.spec!.mag.length - 1)), S.fRef ? S.fRef * 10 : 5000);
    const df = list[0].spec!.df, n = Math.min(Math.floor(fmax / df) + 1, 6000);
    const rows: Record<string, number>[] = [];
    for (let k = 0; k < n; k++) {
      const f = k * df, r: Record<string, number> = { f: +f.toPrecision(7) };
      list.forEach((s) => { const m = s.spec!.mag, j = f / s.spec!.df, j0 = Math.floor(j); r[s.id] = j0 + 1 < m.length ? m[j0] + (m[j0 + 1] - m[j0]) * (j - j0) : NaN; });
      rows.push(r);
    }
    await api.sendBox({
      title: tx("engine.scope.spectrumTitle", { names: list.map((s) => s.name).join(", ") }),
      subtitle: meta(list), wave: true, tUnit: "Hz", t1: 0, t2: rows[rows.length - 1].f,
      columns: [{ key: "f", sym: "f", unit: "Hz", name: tx("engine.scope.colFrequency") }, ...list.map((s) => ({ key: s.id, sym: s.id, unit: s.unit, name: tx("engine.scope.colAmplitude", { name: s.name }) }))],
      xKey: "f", yKey: list[0].id, rows,
    }, tx("engine.scope.spectraSent", { n: list.length }));
  }

  // ---------------- comandi dal pannello ----------------
  return {
    S, ard,
    mount(waveCanvas: HTMLCanvasElement, specCanvas: HTMLCanvasElement) {
      S.dead = false;
      wave = new Screen(waveCanvas);
      spec = new Screen(specCanvas, { divX: 10, divY: 4 });
      updateReadouts(true); redraw();
      S.raf = requestAnimationFrame(tick);
    },
    destroy() {
      S.dead = true; cancelAnimationFrame(S.raf);
      stopExample();
      if (S.acq) api.send("STOP").catch(() => {});
      closeMic();
      wave?.destroy(); spec?.destroy();
    },
    onLine,
    linkChanged() { if (!api.ready()) { S.acq = false; onChange(); } },
    async run() {
      if (ard) { if (S.acq) await stopAcq(); else await startAcq(); return; }
      if (S.analyser && !S.paused) { pause(); return; }
      if (!S.source) await selectSource(prefs.get<"mic" | "ex">("mosaicus.scope.src", "mic") || "mic");
      if (S.source) resume();
    },
    isRunning: () => (ard ? S.acq : !!S.analyser && !S.paused),
    selectSource, playExample, freeze, toggleSlot, renameSlot, removeSlot, sendWaves, sendSpectra,
    setEdge(e: number) { S.edge = e; save(); onChange(); void restartAcq(); },
    setSame(v: boolean) { S.same = v; save(); redraw(); onChange(); },
    setWin(i: number) { S.winMs = WIN_STEPS[i]; save(); redraw(); onChange(); },
    setDt(dt: number) { S.dt = dt; save(); onChange(); void restartAcq(); },
    previewLevel(v: number) { S.level = v; redraw(); onChange(); },
    commitLevel() { save(); void restartAcq(); },
    setSingle(v: boolean) { S.single = v; save(); onChange(); void restartAcq(); },
    setCircuit(c: Circuit) {
      S.circuit = c;
      // impostazioni di partenza adatte al circuito
      if (c === "coil") Object.assign(S, { V0: 2.5, level: 2.6, single: true, dt: 100, edge: 1 });
      else Object.assign(S, { V0: 0, level: 2.45, single: false, dt: 50, edge: 1 });
      api.setSimSignal(c);
      S.live = null; save(); redraw(); onChange();
      void restartAcq();
    },
    levelToMean() {
      if (!S.live?.adc) { api.toast(tx("engine.scope.needTrace")); return; }
      const m = S.live.adc.reduce((a, b) => a + b, 0) / S.live.adc.length;
      S.level = Math.round((m / 1023) * 5 * 100) / 100; save(); redraw(); onChange();
      void restartAcq();
    },
    setQty(q: "V" | "I") { S.qty = q; save(); reconvert(); onChange(); },
    setV0(v: number) { if (Number.isFinite(v)) S.V0 = v; save(); reconvert(); onChange(); },
    setR(v: number) { if (v > 0) S.R = v; save(); reconvert(); onChange(); },
    refreshStyle() { renderRecipe(); redraw(); onChange(); },
    generatorOn,
  };
}
export type ScopeEngine = ReturnType<typeof createScopeEngine>;

function interp(x: Float32Array, y: Float32Array, t: number) {
  if (!x.length || t < x[0] || t > x[x.length - 1]) return NaN;
  let lo = 0, hi = x.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= t) lo = m; else hi = m; }
  const a = x[lo], b = x[hi];
  return b === a ? y[lo] : y[lo] + ((y[hi] - y[lo]) * (t - a)) / (b - a);
}
