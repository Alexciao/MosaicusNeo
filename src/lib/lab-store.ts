"use client";
// MosaicusNeo — pagina Misura: il montaggio di sensori (da un esperimento pronto o libero), il
// collegamento (Arduino via cavo o Bluetooth, simulatore), le letture grezze → grandezze
// fisiche, la selezione, il Quaderno delle misure, l'export.
//
// Lo stato "da mostrare" sta nello store zustand; gli oggetti imperativi (collegamento, gruppo
// di grafici su canvas, pannello dello strumento attivo, sensori del dispositivo) restano in
// variabili di modulo.

import { create } from "zustand";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { Wrench } from "lucide-react";
import { ChartGroup } from "@/lib/mosaicus/chart.js";
import { SerialLink, serialSupported } from "@/lib/mosaicus/serial.js";
import { BleLink } from "@/lib/mosaicus/ble";
import { SimulatedLink, WARP } from "@/lib/sensors/simulator";
import * as repo from "@/lib/cloud/repo";
import { toCSV, toXLSX, download } from "@/lib/mosaicus/export.js";
import { APP_VERSION, FIRMWARE_VERSION, cmpVersion } from "@/lib/version";
import { prefs, fmtVal, stamp } from "@/lib/prefs";
import { useWorkbench, type NewBox } from "@/lib/workbench-store";
import { toGPX, toGeoJSON, type TrackPoint } from "@/lib/mosaicus/geo";
import { SENSORS, pinName, type SensorType } from "@/lib/sensors/catalog";
import {
  resolveRig, validateRig, hasErrors, firmwareCommands, buildRows, alignRows, seriesOf, interpAt, tolerance,
  makeSensor, usedPins, newId, sensorLabel, LEGACY, type Rig, type SensorInstance, type Resolved, type ResolvedQuantity,
} from "@/lib/sensors/rig";
import { PRESETS, INSTRUMENTS, presetById, instrumentById, presetSensors, type Preset, type Instrument } from "@/lib/sensors/presets";
import type { Row, Tone } from "@/lib/sensors/types";

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------
export interface Link {
  kind: "arduino" | "simulatore";
  /** come arriva Arduino: cavo/Bluetooth classico (Web Serial) o Bluetooth LE */
  transport?: "serial" | "ble";
  scenario?: string;
  scopeSignal?: string;
  open(): Promise<void>;
  write(cmd: string): Promise<void>;
  close(): Promise<void>;
  onLine(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
}
export interface Session { id?: number; name: string; created: number; source: string; fw: string | null }
export interface SessionSummary {
  id: number; name: string; labId: string; labTitle: string; created: number; n: number;
  /** durata in secondi (dal primo all'ultimo dato) */
  duration: number;
  /** sensori del montaggio (nomi brevi) */
  sensors: string[];
  source: string; cloud?: boolean; dirty?: boolean;
}
export type StatusTone = "off" | "wait" | "on" | "err";
export type Page = "misura" | "quaderno" | "elab";
export type GuideStep = "link" | "wait" | "start" | "stop" | "pick" | "send" | "go" | null;

/** Pannello di uno strumento (oscilloscopio, synth): riceve le righe che lo riguardano. */
export interface InstrumentPanel {
  onLine?: (line: string) => boolean;
  linkChanged?: () => void;
}
/** Ciò che uno strumento può chiedere all'app. */
export interface InstrumentApi {
  mode: "arduino" | "audio";
  ready: () => boolean;
  send: (cmd: string) => Promise<void>;
  sendBox: (data: Omit<NewBox, "experiment" | "expTitle" | "sessionId" | "sessionName">, msg: string) => Promise<void>;
  setSimSignal: (sig: string) => void;
}
export interface View { id: string; label: string; key: string; yLabel: string; sym: string; line: boolean; raw: boolean; sensorId: string }
export interface LabInfo {
  kind: "preset" | "custom" | "instrument";
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  icon: LucideIcon;
  tone: Tone;
  preset?: Preset;
  instrument?: Instrument;
}

interface LabState {
  page: Page;
  labId: string;
  rig: Rig;
  modified: boolean;
  customRigs: Rig[];
  linkKind: Link["kind"] | null;
  transport: "serial" | "ble" | null;
  ready: boolean;
  fw: string | null;
  running: boolean;
  rows: Row[];
  nRaw: number;
  visible: string[];
  viewId: string | null;
  selection: [number, number] | null;
  session: Session | null;
  sessionName: string;
  sent: boolean;
  status: { text: string; tone: StatusTone };
  sessions: SessionSummary[] | null;
  serialLog: string[];
  lim: boolean;
  dragHint: boolean;
  labsOpen: boolean;
  rigOpen: boolean;
  /** capitolo della guida aperto (null = guida chiusa) */
  guide: string | null;
  /** ultimo tratto inviato a Elaborazione: per riconoscerlo e aprirlo */
  lastSent: { key: string; boxId: number } | null;
}

const EMPTY_RIG: Rig = { id: "empty", name: "", sensors: [] };

export const useLab = create<LabState>(() => ({
  page: (["misura", "quaderno", "elab"] as const).find((p) => p === prefs.get<Page>("mosaicus.page", "misura")) ?? "misura",
  labId: "motion",
  rig: EMPTY_RIG,
  modified: false,
  customRigs: [],
  linkKind: null,
  transport: null,
  ready: false,
  fw: null,
  running: false,
  rows: [],
  nRaw: 0,
  visible: [],
  viewId: null,
  selection: null,
  session: null,
  sessionName: "",
  sent: false,
  status: { text: "Nessun dispositivo", tone: "off" },
  sessions: null,
  serialLog: [],
  lim: prefs.get("mosaicus.lim", false),
  dragHint: false,
  labsOpen: false,
  rigOpen: false,
  guide: null,
  lastSent: null,
}));

const get = useLab.getState;
const set = useLab.setState;

// ---------------------------------------------------------------------------
// Il lab corrente, il montaggio risolto, i grafici
// ---------------------------------------------------------------------------
export function labInfo(id = get().labId, customRigs = get().customRigs): LabInfo {
  const p = presetById(id);
  if (p) return { kind: "preset", id, title: p.title, subtitle: p.subtitle, topic: p.topic, icon: p.icon, tone: p.tone, preset: p };
  const ins = instrumentById(id);
  if (ins) return { kind: "instrument", id, title: ins.title, subtitle: ins.subtitle, topic: "Strumenti", icon: ins.icon, tone: ins.tone, instrument: ins };
  const r = customRigs.find((x) => x.id === id);
  return { kind: "custom", id, title: r?.name || "Montaggio libero", subtitle: r ? rigSummary(r) : "", topic: "I miei montaggi", icon: Wrench, tone: "saffron" };
}
export const rigSummary = (r: Rig) => r.sensors.length ? r.sensors.map(sensorLabel).join(" · ") : "nessun sensore";

let resolvedCache: { rig: Rig; res: Resolved } | null = null;
export function resolved(rig = get().rig): Resolved {
  if (resolvedCache?.rig !== rig) resolvedCache = { rig, res: resolveRig(rig) };
  return resolvedCache.res;
}

/** Grafici possibili: tutte le grandezze non nascoste del montaggio. */
export function viewsOf(rig = get().rig): View[] {
  const res = resolved(rig);
  const multi = rig.sensors.length > 1;
  return res.quantities.filter((q) => !q.hidden).map((q) => {
    const s = rig.sensors.find((x) => x.id === q.sensorId)!;
    return {
      id: q.key, key: q.key, sym: q.sym, line: q.line, raw: q.raw, sensorId: q.sensorId,
      label: q.raw ? `${q.sym} (grezzo)` : `${q.sym}(t)`,
      yLabel: `${q.sym}${q.unit ? ` (${q.unit})` : ""}${multi && q.raw ? ` · ${sensorLabel(s)}` : ""}`,
    };
  });
}
export function readoutsOf(): ResolvedQuantity[] {
  const res = resolved();
  const info = labInfo();
  const byKey = new Map(res.quantities.map((q) => [q.key, q]));
  const fromPreset = (info.preset?.readouts ?? []).map((k) => byKey.get(k)).filter(Boolean) as ResolvedQuantity[];
  if (fromPreset.length) {
    // sensori aggiunti al preset: anche la loro prima grandezza
    const extra = get().rig.sensors.filter((s) => !fromPreset.some((q) => q.sensorId === s.id))
      .map((s) => res.quantities.find((q) => q.sensorId === s.id && q.primary)).filter(Boolean) as ResolvedQuantity[];
    return [...fromPreset, ...extra].slice(0, 6);
  }
  return res.quantities.filter((q) => q.primary).slice(0, 6);
}
/** Colonne della tabella e dell'export: tempo e tutte le grandezze (anche quelle tecniche). */
export function columnsOf(rig = get().rig) {
  const res = resolved(rig);
  const multi = rig.sensors.length > 1;
  return [
    { key: "t", head: "t (s)" },
    ...res.quantities.map((q) => {
      const s = rig.sensors.find((x) => x.id === q.sensorId)!;
      return { key: q.key, head: `${q.sym}${q.unit ? ` (${q.unit})` : ""}${multi ? ` · ${sensorLabel(s)}` : ""}` };
    }),
  ];
}
export const rigHas = (types: SensorType[], rig = get().rig) => rig.sensors.some((s) => types.includes(s.type));
export const needsArduino = (rig = get().rig) => rig.sensors.length > 0;
export const hasMap = (rig = get().rig) => rigHas(["gps"], rig);
export const simScenario = () => labInfo().preset?.sim ?? (hasMap() ? "walk" : "free");

// ---------------------------------------------------------------------------
// Oggetti imperativi
// ---------------------------------------------------------------------------
let link: Link | null = null;
let raw: number[][] = [];
let instrument: InstrumentPanel | null = null;
let simSignal = "mic";
let group: ChartGroup | null = null;

/** Grafici impilati di Misura: condividono asse dei tempi, zoom, selezione e mirino. */
export function measureGroup(): ChartGroup {
  if (!group) {
    group = new ChartGroup({
      onSelect: (sel: [number, number] | null) => { set({ selection: sel }); if (sel) hideDragHint(true); },
      onActivate: (chart: { viewId: string }) => { if (get().viewId !== chart.viewId) set({ viewId: chart.viewId }); },
    });
  }
  return group;
}

export function registerInstrument(i: InstrumentPanel | null) { instrument = i; }

export function instrumentApi(ins: Instrument): InstrumentApi {
  return {
    mode: ins.source === "arduino" ? "arduino" : "audio",
    ready: () => !!link && get().ready,
    async send(cmd) {
      if (!link) return;
      if (link.kind === "simulatore") { link.scenario = ins.sim; link.scopeSignal = simSignal; }
      await link.write(cmd);
    },
    async sendBox(data, msg) {
      const box = await useWorkbench.getState().addBox({ experiment: ins.id, expTitle: ins.title, sessionId: null, sessionName: "", ...data } as NewBox);
      toast.success(msg, { duration: 6000, action: { label: "Apri in Elaborazione", onClick: () => goElab(box.id) } });
    },
    setSimSignal(sig) { simSignal = sig; if (link?.kind === "simulatore") link.scopeSignal = sig; },
  };
}

// ---------------------------------------------------------------------------
// Pagine e preferenze del dispositivo
// ---------------------------------------------------------------------------
const scrollOf: Partial<Record<Page, number>> = {};
/** Cambia pagina; ognuna ritrova il punto in cui la si era lasciata. */
export function showPage(page: Page, { restoreScroll = true } = {}) {
  const from = get().page;
  if (from === page) return;
  scrollOf[from] = window.scrollY;
  set({ page });
  prefs.set("mosaicus.page", page);
  if (restoreScroll) requestAnimationFrame(() => window.scrollTo({ top: scrollOf[page] ?? 0 }));
}
/** Logo: torna alla pagina iniziale (Misura, in cima). */
export function goHome() {
  showPage("misura", { restoreScroll: false });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
/** Apre la guida a un capitolo (es. dal messaggio "firmware vecchio" o dalla sezione Bluetooth). */
export function openGuide(chapter = "start") { set({ guide: chapter }); }
export function closeGuide() { set({ guide: null }); }

/** Vai a Elaborazione, sul riquadro indicato o sull'ultimo inviato. */
export function goElab(boxId?: number) {
  const id = boxId ?? get().lastSent?.boxId;
  set({ sent: false });
  showPage("elab", { restoreScroll: id == null });
  if (id != null) useWorkbench.getState().focus(id);
}

/** Chiave del tratto selezionato (misura, intervallo, grafico attivo). */
export function selectionKey(st = get()) {
  const [a, b] = st.selection ?? [-Infinity, Infinity];
  return `${st.session?.id ?? st.session?.created ?? "-"}|${a}|${b}|${st.viewId}|${st.nRaw}`;
}
/** Il tratto selezionato è già in Elaborazione? Restituisce il riquadro, se esiste ancora. */
export function sentBoxId(st = get()): number | null {
  if (!st.lastSent || st.lastSent.key !== selectionKey(st)) return null;
  return useWorkbench.getState().boxes.some((b) => b.id === st.lastSent!.boxId) ? st.lastSent.boxId : null;
}

/**
 * Prima visita da una lavagna (schermo grande, touch, processore modesto): propone la modalità LIM,
 * che oltre a ingrandire i testi alleggerisce i grafici. Una volta sola.
 */
function suggestLim() {
  if (get().lim || prefs.get("mosaicus.limSuggested", false)) return;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
  const board = matchMedia("(pointer: coarse)").matches && Math.max(screen.width, screen.height) >= 1600;
  if (!weak || !board) return;
  prefs.set("mosaicus.limSuggested", true);
  toast("Sembra una lavagna interattiva", {
    description: "La modalità LIM ingrandisce i testi e alleggerisce i grafici.",
    duration: 12000,
    action: { label: "Attiva", onClick: () => setLim(true) },
  });
}

export function setLim(on: boolean) {
  document.documentElement.classList.toggle("lim", on);
  prefs.set("mosaicus.lim", on);
  set({ lim: on });
}

// ---------------------------------------------------------------------------
// Scelta del lab e montaggio
// ---------------------------------------------------------------------------
const rigKey = (id: string) => `mosaicus.rig.${id}`;

function loadRig(id: string): { rig: Rig; modified: boolean } {
  const p = presetById(id);
  if (p) {
    const base = presetSensors(p);
    const saved = prefs.get<SensorInstance[] | null>(rigKey(id), null);
    return { rig: { id, name: p.title, sensors: saved ?? base }, modified: !!saved };
  }
  const custom = get().customRigs.find((r) => r.id === id);
  return { rig: custom ?? { id, name: "Montaggio libero", sensors: [] }, modified: false };
}

function defaultVisible(rig: Rig): string[] {
  const views = viewsOf(rig);
  const p = presetById(rig.id);
  const fromPreset = (p?.visible ?? []).filter((k) => views.some((v) => v.id === k));
  if (fromPreset.length) return fromPreset;
  // una vista per sensore (la prima grandezza), al massimo tre
  return rig.sensors.map((s) => views.find((v) => v.sensorId === s.id && !v.raw)?.id).filter(Boolean).slice(0, 3) as string[];
}

function applyRig(rig: Rig, modified: boolean, { keepData = false } = {}) {
  const views = viewsOf(rig);
  const saved = prefs.get<string[] | null>(`mosaicus.visible.${rig.id}`, null);
  let visible = [...new Set(saved ?? defaultVisible(rig))].filter((v) => views.some((w) => w.id === v));
  if (!visible.length && views[0]) visible = [views[0].id];
  const viewId = visible.includes(get().viewId ?? "") ? get().viewId : visible[0] ?? null;
  set({ rig, modified, visible, viewId });
  void keepData;
  recompute();
  if (link?.kind === "simulatore") { link.scenario = simScenario(); if (get().ready) setStatus(simStatus(), "on"); }
}

export function selectLab(id: string, { keepData = false } = {}) {
  if (get().running) { toast("Ferma la misura prima di cambiare lab."); return; }
  if (id === "generator" || id === "theremin") id = "synth";
  const known = presetById(id) || instrumentById(id) || get().customRigs.some((r) => r.id === id);
  if (!known) id = serialSupported() ? "motion" : "synth";
  prefs.set("mosaicus.lastLab", id);
  if (!keepData) raw = [];
  set({
    labId: id, selection: null, sent: false, dragHint: false, labsOpen: false,
    ...(keepData ? {} : { session: null, sessionName: "", rows: [], nRaw: 0 }),
  });
  measureGroup().setSelection(null); measureGroup().fitAll();
  if (instrumentById(id)) { set({ rig: EMPTY_RIG, modified: false, visible: [], viewId: null }); return; }
  const { rig, modified } = loadRig(id);
  applyRig(rig, modified, { keepData });
}

/** Modifica del montaggio: per un preset diventa una sua versione personale, per un montaggio libero si salva. */
function commitRig(rig: Rig) {
  if (get().running) { toast("Ferma la misura prima di cambiare i sensori."); return false; }
  const p = presetById(rig.id);
  if (p) prefs.set(rigKey(rig.id), rig.sensors);
  else {
    const list = get().customRigs.map((r) => (r.id === rig.id ? rig : r));
    set({ customRigs: list });
    prefs.set("mosaicus.rigs", list);
  }
  applyRig(rig, !!p, { keepData: true });
  return true;
}

export function updateSensor(id: string, patch: Partial<SensorInstance>) {
  const rig = get().rig;
  commitRig({ ...rig, sensors: rig.sensors.map((s) => (s.id === id ? { ...s, ...patch, ...(patch.options ? { options: { ...s.options, ...patch.options } } : {}) } : s)) });
}
export function addSensor(type: SensorType) {
  const rig = get().rig;
  const taken = new Set(usedPins(rig).keys());
  const s = makeSensor(type, taken);
  if (commitRig({ ...rig, sensors: [...rig.sensors, s] })) {
    // la sua prima grandezza compare subito tra i grafici
    const first = viewsOf().find((v) => v.sensorId === s.id && !v.raw);
    if (first && !get().visible.includes(first.id)) { const visible = [...get().visible, first.id]; set({ visible }); prefs.set(`mosaicus.visible.${rig.id}`, visible); }
  }
}
export function removeSensor(id: string) {
  const rig = get().rig;
  commitRig({ ...rig, sensors: rig.sensors.filter((s) => s.id !== id) });
}
export function moveSensor(id: string, dir: -1 | 1) {
  const rig = get().rig, i = rig.sensors.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= rig.sensors.length) return;
  const sensors = [...rig.sensors];
  [sensors[i], sensors[j]] = [sensors[j], sensors[i]];
  commitRig({ ...rig, sensors });
}
export function resetPreset() {
  const rig = get().rig;
  const p = presetById(rig.id);
  if (!p || get().running) return;
  prefs.set(rigKey(rig.id), null);
  prefs.set(`mosaicus.visible.${rig.id}`, null);
  applyRig({ ...rig, sensors: presetSensors(p) }, false);
}
export function renameRig(name: string) {
  const rig = get().rig;
  if (presetById(rig.id)) return;
  commitRig({ ...rig, name: name.trim() || "Montaggio libero" });
}
/** Nuovo montaggio libero (vuoto o copia del montaggio corrente). */
export function newRig({ copy = false } = {}) {
  if (get().running) { toast("Ferma la misura prima."); return; }
  const cur = get().rig;
  const rig: Rig = {
    id: `rig-${newId()}`,
    name: copy ? `${labInfo().title} (copia)` : "Nuovo montaggio",
    sensors: copy ? cur.sensors.map((s) => ({ ...s, id: newId(), options: { ...s.options }, pins: { ...s.pins } })) : [],
  };
  const list = [...get().customRigs, rig];
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  selectLab(rig.id);
  set({ rigOpen: true });
  return rig;
}
/** Nuovo montaggio libero con questi sensori (dalla guida). */
export function createRigFrom(types: SensorType[], name = "Montaggio dalla guida") {
  const rig = newRig();
  if (!rig) return;
  const taken = new Set<number>();
  const sensors = types.map((t) => { const s = makeSensor(t, taken); return s; });
  commitRig({ ...get().rig, name, sensors });
  set({ visible: defaultVisible(get().rig) });
}

/** Rinomina un montaggio libero qualsiasi (anche non aperto). */
export function renameRigById(id: string, name: string) {
  const clean = name.trim() || "Montaggio libero";
  if (get().labId === id) { renameRig(clean); return; }
  const list = get().customRigs.map((r) => (r.id === id ? { ...r, name: clean } : r));
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
}
/** Copia di un montaggio libero, aperta subito. */
export function duplicateRig(id: string) {
  if (get().running) { toast("Ferma la misura prima."); return; }
  const src = get().customRigs.find((r) => r.id === id);
  if (!src) return;
  const rig: Rig = { id: `rig-${newId()}`, name: `${src.name} (copia)`, sensors: src.sensors.map((x) => ({ ...x, id: newId(), options: { ...x.options }, pins: { ...x.pins } })) };
  const list = [...get().customRigs, rig];
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  selectLab(rig.id);
}

export function deleteRig(id: string) {
  if (get().running && get().labId === id) { toast("Ferma la misura prima di eliminare il montaggio."); return; }
  const list = get().customRigs.filter((r) => r.id !== id);
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  prefs.set(`mosaicus.visible.${id}`, null);
  if (get().labId === id) selectLab("motion");
}

/** Montaggi e versioni personali riletti dalle preferenze (es. arrivati da un altro dispositivo). */
export function reloadParams() {
  set({ customRigs: prefs.get<Rig[]>("mosaicus.rigs", []) });
  if (get().running || instrumentById(get().labId)) return;
  const { rig, modified } = loadRig(get().labId);
  applyRig(rig, modified, { keepData: true });
}

export function toggleView(id: string) {
  const { visible, rig } = get();
  const on = visible.includes(id);
  if (on && visible.length === 1) { toast("Almeno un grafico deve restare visibile."); return; }
  const order = viewsOf().map((v) => v.id);
  const next = on ? visible.filter((v) => v !== id) : [...visible, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  prefs.set(`mosaicus.visible.${rig.id}`, next);
  set({ visible: next, viewId: on ? (get().viewId === id ? next[0] : get().viewId) : id });
}

// ---------------------------------------------------------------------------
// Dati
// ---------------------------------------------------------------------------
export function recompute() {
  const rig = get().rig;
  set({ rows: buildRows(rig, resolved(rig), raw), nRaw: raw.length });
}

let pending = false;
function scheduleRecompute() {
  if (pending) return;
  pending = true;
  // più dati = ricostruzione più costosa: si diradano gli aggiornamenti (120 ms … 1 s)
  const delay = Math.min(1000, Math.max(get().lim ? 300 : 120, raw.length / (get().lim ? 20 : 40)));
  setTimeout(() => { pending = false; recompute(); }, delay);
}

export function selectedRows() {
  const { rows, selection } = get();
  const [a, b] = selection ?? [-Infinity, Infinity];
  return rows.filter((r) => r.t >= a && r.t <= b);
}

export function clearSelection() { measureGroup().setSelection(null, true); }

// ---------------------------------------------------------------------------
// Collegamento
// ---------------------------------------------------------------------------
function setStatus(text: string, tone: StatusTone) { set({ status: { text, tone } }); }
const simStatus = () => {
  const warp = WARP[simScenario()];
  return `Simulatore pronto${warp ? ` · tempo ×${warp}` : ""}`;
};

/** arduino = Web Serial (cavo USB, o HC-06 su Android); ble = modulo Bluetooth LE; sim = simulatore */
export async function connect(kind: "arduino" | "ble" | "sim") {
  const l = (kind === "sim" ? new SimulatedLink() : kind === "ble" ? new BleLink() : new SerialLink()) as unknown as Link;
  if (kind === "sim") { l.scenario = simScenario(); l.scopeSignal = simSignal; }
  l.onLine(handleLine);
  l.onClose(() => {
    if (link !== l) return;
    const wasRunning = get().running;
    link = null;
    set({ linkKind: null, transport: null, ready: false });
    setStatus("Nessun dispositivo", "off");
    instrument?.linkChanged?.();
    if (wasRunning) {
      set({ running: false });
      stopKeepAlive();
      toast.warning("Arduino scollegato durante la misura: salvo i dati raccolti.");
      void autosave();
    }
  });
  try {
    await l.open();
  } catch (err) {
    const e = err as Error;
    if (e?.name !== "NotFoundError") toast.error(kind === "ble" ? `Bluetooth LE: ${e.message}` : `Impossibile aprire la porta: ${e.message}`);
    return;
  }
  link = l;
  set({ linkKind: l.kind, transport: kind === "sim" ? null : kind === "ble" ? "ble" : "serial", ready: false });
  setStatus(kind === "sim" ? "Simulatore: avvio…" : "Arduino: attendo il firmware…", "wait");
  // l'Uno si riavvia quando si apre la porta USB: tempo al bootloader, poi chiedo l'identità
  // (via Bluetooth non si riavvia: la risposta arriva subito; lo chiedo due volte per sicurezza)
  setTimeout(() => { if (link === l && !get().ready) void l.write("ID?"); }, kind === "sim" ? 600 : kind === "ble" ? 400 : 2200);
  if (kind === "ble") setTimeout(() => { if (link === l && !get().ready) void l.write("ID?"); }, 1800);
  setTimeout(() => {
    if (link === l && !get().ready) {
      setStatus("Firmware non trovato", "err");
      toast.error("Arduino risponde, ma non con il firmware MosaicusNeo. Caricalo con l'IDE di Arduino.", { duration: 10000, action: { label: "Come si fa", onClick: () => openGuide("firmware") } });
    }
  }, 5000);
}

export async function disconnect() {
  if (get().running) await stop();
  await link?.close();
}

// risposte attese dal firmware (#ACK…/#ERR…), per mandare la configurazione un comando alla volta
let waiter: { match: (l: string) => boolean; resolve: (l: string | null) => void } | null = null;
function request(cmd: string, match: (l: string) => boolean, ms = 2000) {
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => { if (waiter?.resolve === done) waiter = null; resolve(null); }, ms);
    const done = (l: string | null) => { clearTimeout(timer); resolve(l); };
    waiter = { match, resolve: done };
    void link!.write(cmd);
  });
}

const logBuf: string[] = [];
let logTimer: ReturnType<typeof setTimeout> | null = null;
function logSerial(line: string) {
  if (line.length > 140) line = `${line.slice(0, 120)}… (${line.split(",").length} valori)`;
  logBuf.push(line);
  if (logBuf.length > 80) logBuf.shift();
  if (!logTimer) logTimer = setTimeout(() => { logTimer = null; set({ serialLog: [...logBuf] }); }, 200);
}

function handleLine(line: string) {
  logSerial(line);
  if (waiter && waiter.match(line)) { const w = waiter; waiter = null; w.resolve(line); return; }
  const kind = link?.kind;
  if (line.startsWith("#MOSAICUS")) {
    const fw = line.split(",")[1] ?? null;
    set({ ready: true, fw });
    if (kind === "arduino" && fw && cmpVersion(fw, FIRMWARE_VERSION) < 0) {
      toast.warning(`Su Arduino c'è il firmware v${fw}: aggiornalo alla v${FIRMWARE_VERSION}.`, { duration: 10000, action: { label: "Come si fa", onClick: () => openGuide("firmware") } });
    }
    setStatus(kind === "simulatore" ? simStatus() : `Arduino pronto${link?.transport === "ble" ? " (Bluetooth LE)" : ""} · firmware ${fw}`, "on");
    return;
  }
  if (line === "#BT,SETUP") { toast.info("Configuro il modulo Bluetooth: nome «MosaicusNeo», 115200 baud…"); return; }
  if (line === "#ACK,BT,SETUP,BLE") {
    toast.success("Modulo BLE configurato. Ora scollega il cavo, alimenta Arduino e scegli «Bluetooth LE» → «MosaicusNeo» (su iPhone, nel browser Bluefy). Se il nome non compare, cerca HMSoft, BT05 o HC-08.", { duration: 14000 });
    return;
  }
  if (line === "#ACK,BT,SETUP") {
    toast.success("HC-06 configurato. Ora associa «MosaicusNeo» nelle impostazioni Bluetooth del telefono (PIN 1234).", { duration: 12000 });
    return;
  }
  if (line.startsWith("#ERR")) {
    const what = line.slice(5);
    toast.error(/SCOPE|BT|CFG|START/.test(what)
      ? `Il firmware su Arduino è vecchio: carica mosaicusneo_firmware.ino v${FIRMWARE_VERSION} con l'IDE di Arduino.`
      : `Arduino non ha capito il comando: ${what}`, { duration: 8000 });
    return;
  }
  if (line.startsWith("#")) return;
  if (instrument?.onLine?.(line)) return;
  if (!get().running) return;
  if (line.startsWith("D,")) {
    const f = line.slice(2).split(",").map((v) => (v === "nan" ? NaN : Number(v)));
    if (Number.isFinite(f[0]) && Number.isFinite(f[1])) { raw.push(f); scheduleRecompute(); }
  }
}

const CFG_ERR: Record<string, string> = {
  PIN: "pin non valido", ANALOGICO: "serve un pin analogico (A0…A5)", DOPPIO: "pin già usato da un altro sensore",
  GPS: "c'è già un GPS", SLOT: "troppi sensori", TIPO: "tipo di sensore sconosciuto", ARGOMENTI: "comando incompleto",
};

/** Si può premere Avvia? (montaggio valido e, se servono, Arduino o simulatore pronti) */
export function canStart(st = get()) {
  if (st.running || !st.rig.sensors.length) return false;
  if (hasErrors(validateRig(st.rig))) return false;
  return !!st.linkKind && st.ready;
}

// ---------------------------------------------------------------------------
// Misura
// ---------------------------------------------------------------------------
export async function start() {
  const st = get();
  const rig = st.rig, res = resolved(rig);
  const issues = validateRig(rig);
  if (hasErrors(issues)) { toast.error(issues.find((i) => i.level === "error")!.text); set({ rigOpen: true }); return; }
  if (!canStart()) return;
  if (link) {
    if (link.kind === "simulatore") link.scenario = simScenario();
    for (const cmd of firmwareCommands(rig, res)) {
      const reply = await request(cmd, (l) => l.startsWith("#ACK,CFG") || l.startsWith("#ERR"));
      if (!reply) { toast.error("Arduino non risponde alla configurazione. Scollega e ricollega."); return; }
      if (reply.startsWith("#ERR")) {
        const parts = reply.split(",");
        if (parts[1] !== "CFG") { toast.error(`Il firmware su Arduino è vecchio: serve la v${FIRMWARE_VERSION} per i montaggi di sensori. Scaricala dalla «Guida».`, { duration: 10000 }); return; }
        const s = res.byCode.get(Number(parts[2]));
        toast.error(`${s ? sensorLabel(s) : "Sensore"}: ${CFG_ERR[parts[3]] ?? parts[3]}.`);
        return;
      }
    }
  }
  const exp = labInfo();
  raw = [];
  measureGroup().setSelection(null); measureGroup().fitAll();
  const name = st.sessionName.trim() || `${exp.title} ${new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}`;
  set({ session: { name, created: Date.now(), source: link?.kind ?? "arduino", fw: st.fw }, sessionName: name, sent: false, running: true, selection: null, dragHint: false });
  recompute();
  if (link) {
    const ok = await request("START", (l) => l.startsWith("#ACK,START") || l.startsWith("#ERR,START"));
    if (!ok || ok.startsWith("#ERR")) { set({ running: false }); toast.error("Arduino non è partito: controlla i sensori e riprova."); return; }
  }
  startKeepAlive();
}

export async function stop() {
  if (!get().running) return;
  set({ running: false });
  stopKeepAlive();
  {
    try {
      await link?.write("STOP");
      // con il GPS acceso la SoftwareSerial può far perdere qualche carattere: lo ripeto
      if (rigHas(["gps"])) { await new Promise((r) => setTimeout(r, 250)); await link?.write("STOP"); }
    } catch { /* scollegato */ }
  }
  recompute();
  await autosave();
  showDragHint();
}

// ---------------------------------------------------------------------------
// Misure lunghe (sul campo): schermo sempre acceso e salvataggio ogni 30 s
// ---------------------------------------------------------------------------
let wakeLock: { release: () => Promise<void> } | null = null;
let autosaveTimer: ReturnType<typeof setInterval> | null = null;

async function requestWakeLock() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (wl && document.visibilityState === "visible") wakeLock = await wl.request("screen");
  } catch { /* non supportato o negato */ }
}
function onVisibility() { if (document.visibilityState === "visible" && get().running && !wakeLock) void requestWakeLock(); }
function startKeepAlive() {
  void requestWakeLock();
  document.addEventListener("visibilitychange", onVisibility);
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = setInterval(() => { if (get().running) void autosave(true); }, 30000);
}
function stopKeepAlive() {
  document.removeEventListener("visibilitychange", onVisibility);
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
}

/** Configura il modulo Bluetooth (nome e 115200 baud): solo con Arduino collegato via cavo USB. */
export async function bluetoothSetup(module: "hc06" | "ble" = "hc06") {
  if (!link || !get().ready || link.transport !== "serial") { toast("Prima collega Arduino con il cavo USB."); return; }
  if (get().running) { toast("Ferma la misura prima di configurare il modulo."); return; }
  if (get().fw && cmpVersion(get().fw!, module === "ble" ? "1.1" : "0.4") < 0) {
    toast.error(`Il firmware su Arduino è vecchio: per configurare il modulo serve la v${FIRMWARE_VERSION}.`); return;
  }
  await link.write(module === "ble" ? "BT,SETUP,BLE" : "BT,SETUP");
}

function showDragHint() {
  if (!get().rows.length || get().selection || get().running) return;
  const n = prefs.get("mosaicus.hint.drag", 0);
  if (n >= 3) return;
  prefs.set("mosaicus.hint.drag", n + 1);
  set({ dragHint: true });
}
export function hideDragHint(done = false) {
  if (get().dragHint) set({ dragHint: false });
  if (done) prefs.set("mosaicus.hint.drag", 3);
}

export async function autosave(quiet = false) {
  const st = get();
  if (!raw.length || !st.session) return;
  const rec = {
    ...(st.session.id ? { id: st.session.id } : {}),
    format: 2,
    name: st.sessionName.trim() || st.session.name,
    experiment: st.labId, labTitle: labInfo().title,
    rig: { id: st.rig.id, name: st.rig.name, sensors: st.rig.sensors },
    created: st.session.created, source: st.session.source, fw: st.session.fw,
    raw, app: APP_VERSION,
  };
  try {
    const id = (await repo.save("sessions", rec)).id;
    set({ session: { ...st.session, id: st.session.id ?? id } });
    if (!quiet) toast.success(`Misura salvata nel Quaderno (${raw.length} letture).`);
    await refreshSessions();
  } catch (err) {
    toast.error(`Salvataggio non riuscito: ${(err as Error).message}`);
  }
}

export function setSessionName(name: string) { set({ sessionName: name }); }
export async function commitSessionName() { if (get().session?.id && !get().running) await autosave(true); }

/** Origine delle posizioni = posizione attuale (primo sensore a ultrasuoni). */
export function zeroPosition() {
  const s = get().rig.sensors.find((x) => x.type === "sonar");
  if (!s) return;
  const dKey = resolved().keyOf.get(s.id)?.get("d");
  const valid = get().rows.filter((r) => r._s === s.id && Number.isFinite(r[dKey!] as number)).slice(-10).map((r) => r[dKey!] as number).sort((a, b) => a - b);
  if (!valid.length) { toast("Nessuna distanza valida da usare come origine."); return; }
  const med = valid[valid.length >> 1];
  updateSensor(s.id, { options: { origin: Math.round(med * 1000) / 1000 } });
  toast.success(`Origine impostata a ${fmtVal(med, 3)} m dal sensore.`);
}

// ---------------------------------------------------------------------------
// Invio a Elaborazione
// ---------------------------------------------------------------------------
/**
 * Manda il tratto selezionato (o tutta la misura) a Elaborazione.
 * open = true: apre subito Elaborazione sul nuovo riquadro; altrimenti resta qui (per mandarne altri).
 */
export async function sendSelection({ open = true } = {}) {
  const st = get();
  if (st.running) { toast("Ferma la misura prima di salvare un tratto."); return; }
  const already = sentBoxId(st);
  if (already != null) { if (open) goElab(already); else toast("Questo tratto è già in Elaborazione.", { action: { label: "Apri", onClick: () => goElab(already) } }); return; }
  const key = selectionKey(st);
  const rig = st.rig, res = resolved(rig);
  const [t1s, t2s] = st.selection ?? [-Infinity, Infinity];
  // grandezze fisiche (non i dati tecnici) con almeno un valore nel tratto
  const inSel = st.rows.filter((r) => r.t >= t1s && r.t <= t2s);
  const keys = res.quantities.filter((q) => !q.raw && inSel.some((r) => Number.isFinite(r[q.key] as number))).map((q) => q.key);
  if (!keys.length) { toast("Il tratto non contiene dati validi."); return; }
  // tempi del sensore del grafico attivo; le grandezze degli altri sensori vengono interpolate
  const view = viewsOf().find((v) => v.id === st.viewId && !v.raw);
  const baseSensor = view?.sensorId ?? res.quantities.find((q) => q.key === keys[0])!.sensorId;
  const own = new Set(res.quantities.filter((q) => q.sensorId === baseSensor).map((q) => q.key));
  const aligned = alignRows(st.rows, baseSensor, keys, own, tolerance(rig)).filter((r) => r.t >= t1s && r.t <= t2s && keys.some((k) => own.has(k) && Number.isFinite(r[k] as number)));
  if (aligned.length < 3) { toast("Il tratto contiene troppo pochi punti validi."); return; }
  if (!st.session?.id) await autosave(true);
  const byKey = new Map(res.quantities.map((q) => [q.key, q]));
  const columns = [{ key: "t", sym: "t", unit: "s", name: "tempo" }, ...keys.map((k) => ({ key: k, sym: byKey.get(k)!.sym, unit: byKey.get(k)!.unit, name: byKey.get(k)!.name }))];
  const t1 = aligned[0].t, t2 = aligned[aligned.length - 1].t;
  const exp = labInfo();
  const session = get().session;
  const yKey = view && keys.includes(view.key) ? view.key : keys.find((k) => own.has(k)) ?? keys[0];
  const box = await useWorkbench.getState().addBox({
    title: `${exp.title} · ${fmtVal(t1, 2)}–${fmtVal(t2, 2)} s`,
    experiment: exp.id, expTitle: exp.title,
    sessionId: session?.id ?? null, sessionName: st.sessionName.trim() || session?.name || "",
    t1, t2, columns, yKey, xKey: "t",
    rows: aligned.map((r) => Object.fromEntries(["t", ...keys].map((k) => [k, Number.isFinite(r[k] as number) ? (r[k] as number) : NaN]))),
  });
  set({ sent: true, lastSent: { key, boxId: box.id } });
  const mixed = rig.sensors.length > 1 && keys.some((k) => !own.has(k));
  const note = mixed ? " Le grandezze degli altri sensori sono interpolate sui tempi di questo." : "";
  if (open) {
    goElab(box.id);
    if (mixed) toast(note.trim(), { duration: 6000 });
  } else {
    toast.success(`Tratto aggiunto a Elaborazione (${aligned.length} punti).${note}`, { duration: 6000, action: { label: "Apri", onClick: () => goElab(box.id) } });
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export type ExportKind = "xlsx" | "csv-it" | "csv" | "png" | "gpx" | "geojson" | "raw-csv" | "raw-xlsx";

/**
 * Letture grezze così come le ha mandate Arduino (conteggi ADC, µs di eco, byte del DHT, campi NMEA),
 * una riga per lettura, con nomi di colonna semplici: pensate per script (Python, R, MATLAB…).
 */
function rawTable(sel: [number, number] | null) {
  const { rig } = get();
  const res = resolved(rig);
  const [a, b] = sel ?? [-Infinity, Infinity];
  const fields: string[] = [];
  for (const s of rig.sensors) for (const f of SENSORS[s.type].rawFields) if (!fields.includes(f)) fields.push(f);
  const headers = ["t_s", "t_ms", "sensor", "type", "slot", ...fields];
  const per = new Map<string, (string | number)[][]>();
  const rows: (string | number)[][] = [];
  for (const f of raw) {
    const s = res.byCode.get(f[0]);
    const t = f[1] / 1000;
    if (!s || t < a || t > b) continue;
    const names = SENSORS[s.type].rawFields;
    rows.push([t, f[1], sensorLabel(s), s.type, f[0], ...fields.map((k) => { const i = names.indexOf(k); return i >= 0 ? f[2 + i] : ""; })]);
    if (!per.has(s.id)) per.set(s.id, []);
    per.get(s.id)!.push([t, f[1], ...names.map((_, i) => f[2 + i])]);
  }
  rows.sort((x, y) => (x[1] as number) - (y[1] as number));
  const sheets = rig.sensors.filter((s) => per.has(s.id)).map((s) => ({
    name: sensorLabel(s).replace(/[\/?*[\]:]/g, " ").slice(0, 28),
    rows: [["t_s", "t_ms", ...SENSORS[s.type].rawFields], ...per.get(s.id)!],
  }));
  return { headers, rows, sheets };
}

/** Punti con una posizione valida, con le grandezze degli altri sensori al loro istante. */
export function trackPoints(rows: Row[], rig = get().rig): TrackPoint[] {
  const res = resolved(rig);
  const geo = rig.sensors.find((s) => s.type === "gps");
  if (!geo) return [];
  const k = res.keyOf.get(geo.id)!;
  const latK = k.get("lat")!, lonK = k.get("lon")!, altK = k.get("alt"), spK = k.get("speed"), sK = k.get("s");
  const tol = tolerance(rig);
  const others = res.quantities.filter((q) => q.sensorId !== geo.id && !q.raw && !q.hidden);
  const series = new Map(others.map((q) => [q.key, seriesOf(rows, q.key)]));
  return rows.filter((r) => r._s === geo.id && Number.isFinite(r[latK] as number) && Number.isFinite(r[lonK] as number)).map((r) => ({
    lat: r[latK] as number, lon: r[lonK] as number, ele: altK ? (r[altK] as number) : undefined, time: r.time as number, t: r.t,
    values: {
      ...(spK ? { speed: r[spK] as number } : {}), ...(sK ? { s: r[sK] as number } : {}),
      ...Object.fromEntries(others.map((q) => [q.key, interpAt(series.get(q.key)!, r.t, tol)])),
    },
  }));
}

export async function exportData(kind: ExportKind) {
  const st = get();
  if (!st.rows.length) { toast("Non ci sono dati da esportare."); return; }
  const exp = labInfo();
  const cols = columnsOf();
  const multi = st.rig.sensors.length > 1;
  const headers = [...cols.map((c) => c.head), ...(multi ? ["sensore"] : [])];
  const sensorName = new Map(st.rig.sensors.map((s) => [s.id, sensorLabel(s)]));
  const rows = selectedRows().map((r) => [...cols.map((c) => r[c.key]), ...(multi ? [sensorName.get(String(r._s)) ?? ""] : [])]);
  const part = st.selection ? `_${fmtVal(st.selection[0], 2)}-${fmtVal(st.selection[1], 2)}s`.replace(/,/g, ".") : "";
  const base = `mosaicusneo_${exp.id}_${stamp(new Date(st.session?.created ?? Date.now()))}${part}`;
  if (kind === "csv-it") return download(toCSV(headers, rows, { it: true }), `${base}_excel.csv`);
  if (kind === "csv") return download(toCSV(headers, rows, { it: false }), `${base}.csv`);
  if (kind === "png") return download(await stackPNG(), `${base}_grafici.png`);
  if (kind === "raw-csv" || kind === "raw-xlsx") {
    const t = rawTable(st.selection);
    if (!t.rows.length) { toast("Non ci sono letture grezze da esportare."); return; }
    return kind === "raw-csv"
      ? download(toCSV(t.headers, t.rows, { it: false }), `${base}_grezzi.csv`)
      : download(toXLSX([{ name: "Grezzi", rows: [t.headers, ...t.rows] }, ...(t.sheets.length > 1 ? t.sheets : [])]), `${base}_grezzi.xlsx`);
  }
  if (kind === "gpx" || kind === "geojson") {
    const pts = trackPoints(selectedRows());
    if (!pts.length) { toast("Nessun punto con la posizione GPS da esportare."); return; }
    const name = st.sessionName || exp.title;
    return kind === "gpx"
      ? download(toGPX(name, pts), `${base}.gpx`, "application/gpx+xml")
      : download(toGeoJSON(name, pts), `${base}.geojson`, "application/geo+json");
  }
  const source = st.session?.source;
  const info = [
    ["MosaicusNeo", `v${APP_VERSION}`],
    ["Lab", `${exp.title}${exp.subtitle ? ` — ${exp.subtitle}` : ""}`],
    ["Nome della misura", st.sessionName || st.session?.name || ""],
    ["Data", new Date(st.session?.created ?? Date.now()).toLocaleString("it-IT")],
    ["Sorgente", source === "simulatore" ? "simulatore" : `Arduino (firmware ${st.session?.fw ?? "?"})`],
    ["Tratto esportato", st.selection ? `${st.selection[0]} s – ${st.selection[1]} s` : "tutta la misura"],
    [],
    ["Sensore", "Tipo", "Pin", "Intervallo (ms)", "Opzioni"],
    ...st.rig.sensors.map((s) => {
      const def = SENSORS[s.type];
      return [sensorLabel(s), def.title, def.pins.map((p) => `${p.role}: ${pinName(s.pins[p.key])}`).join("; "), s.interval,
        def.options.map((o) => `${o.label}: ${o.type === "select" ? o.options?.find((x) => x[0] === s.options[o.key])?.[1] : s.options[o.key]}${o.unit ? ` ${o.unit}` : ""}`).join("; ")];
    }),
  ];
  const rawT = rawTable(st.selection);
  download(toXLSX([{ name: "Dati", rows: [headers, ...rows] }, { name: "Info", rows: info }, ...(rawT.rows.length ? [{ name: "Grezzi", rows: [rawT.headers, ...rawT.rows] }] : [])]), `${base}.xlsx`);
}

/** Un'unica immagine con tutti i grafici impilati, come si vedono a schermo. */
function stackPNG(): Promise<Blob> {
  const g = measureGroup();
  g.charts.forEach((c: { draw: () => void }) => c.draw());
  const cvs: HTMLCanvasElement[] = g.charts.map((c: { c: HTMLCanvasElement }) => c.c);
  const gap = Math.round(6 * (window.devicePixelRatio || 1));
  const out = document.createElement("canvas");
  out.width = Math.max(...cvs.map((c) => c.width));
  out.height = cvs.reduce((s, c) => s + c.height, 0) + gap * (cvs.length - 1);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--mz-chart-bg").trim() || "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of cvs) { ctx.drawImage(c, 0, y); y += c.height + gap; }
  return new Promise((res) => out.toBlob((b) => res(b!), "image/png"));
}

// ---------------------------------------------------------------------------
// Quaderno delle misure
// ---------------------------------------------------------------------------
export async function refreshSessions() {
  try {
    const list = (await repo.all("sessions")).filter(repo.visible)
      .map((s): SessionSummary => {
        const data = (s.raw as number[][] | undefined) ?? [];
        // formato 2: [slot, t_ms, …]; misure vecchie: il tempo è il primo campo
        const tOf = (f?: number[]) => (f ? (s.format === 2 ? f[1] / 1000 : f[0]) : NaN);
        const duration = data.length > 1 ? tOf(data[data.length - 1]) - tOf(data[0]) : 0;
        const rig = s.rig as Rig | undefined;
        return {
          id: s.id!, name: String(s.name), created: Number(s.created), n: data.length, cloud: !!s.owner, dirty: !!s.dirty,
          labId: String(s.experiment), labTitle: String(s.labTitle ?? labInfo(String(s.experiment)).title),
          duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
          sensors: rig?.sensors?.map((x) => SENSORS[x.type]?.short ?? x.type) ?? [],
          source: String(s.source ?? "arduino"),
        };
      })
      .sort((a, b) => b.created - a.created);
    set({ sessions: list });
  } catch { set({ sessions: [] }); }
}

interface StoredSession {
  id: number; format?: number; name: string; created: number; source: string; fw: string | null;
  experiment: string; rig?: Rig; raw: number[][]; params?: Record<string, number | string>;
}

/**
 * Carica una misura del Quaderno nella pagina Misura.
 * quiet: senza messaggi né pagina (per inviarla a Elaborazione o esportarla dal Quaderno).
 */
export async function openSession(id: number, { quiet = false } = {}): Promise<boolean> {
  if (get().running) { toast("Ferma la misura in corso prima di aprire una misura del Quaderno."); return false; }
  const s = (await repo.get("sessions", id)) as unknown as StoredSession | undefined;
  if (!s) return false;
  const labId = s.experiment;
  let rig: Rig, data: number[][];
  if (s.format === 2 && s.rig) {
    rig = { ...s.rig, id: s.rig.id || labId };
    data = s.raw;
  } else {
    // misura salvata prima del sistema a sensori: la converto
    const lg = LEGACY[s.experiment];
    if (!lg) { toast.error("Questa misura viene da un lab che non esiste più."); return false; }
    const preset = presetById(labId);
    const sensors = lg.rig(s.params ?? {}).sensors.map((x, i) => ({ ...x, id: preset ? `${labId}-${x.type}` : `${x.type}-${i}` }));
    rig = { id: labId, name: preset?.title ?? labId, sensors };
    data = s.raw.flatMap(lg.convert);
  }
  if (!quiet) showPage("misura");
  selectLab(presetById(labId) || get().customRigs.some((r) => r.id === labId) ? labId : "motion", { keepData: true });
  raw = data;
  const modified = !!presetById(rig.id) && JSON.stringify(rig.sensors) !== JSON.stringify(presetSensors(presetById(rig.id)!));
  applyRig(rig, modified, { keepData: true });
  set({ session: { id: s.id, name: s.name, created: s.created, source: s.source, fw: s.fw }, sessionName: s.name, selection: null });
  measureGroup().setSelection(null); measureGroup().fitAll();
  recompute();
  if (quiet) return true;
  showDragHint();
  toast(`Aperta «${s.name}». Se cambi le opzioni dei sensori, i dati vengono ricalcolati.`);
  return true;
}

/** Tutta la misura del Quaderno in Elaborazione (o il suo riquadro, se c'è già). */
export async function sendSessionToElab(id: number) {
  if (!(await openSession(id, { quiet: true }))) return;
  await sendSelection({ open: true });
}

/** Esporta una misura del Quaderno senza aprirla a mano. */
export async function exportSession(id: number, kind: ExportKind) {
  if (!(await openSession(id, { quiet: true }))) return;
  await exportData(kind);
}

export async function renameSession(id: number, name: string) {
  const clean = name.trim();
  if (!clean) return;
  const rec = await repo.get("sessions", id);
  if (!rec) return;
  await repo.save("sessions", { ...rec, name: clean });
  if (get().session?.id === id) set({ sessionName: clean, session: { ...get().session!, name: clean } });
  await refreshSessions();
}

export async function removeSession(id: number) {
  await repo.remove("sessions", id);
  const s = get().session;
  if (s?.id === id) set({ session: { ...s, id: undefined } });
  await refreshSessions();
}

// ---------------------------------------------------------------------------
// Percorso guidato: qual è il prossimo gesto
// ---------------------------------------------------------------------------
export function guideStep(st: LabState): GuideStep {
  if (instrumentById(st.labId) || !st.rig.sensors.length) return null;
  if (!st.linkKind) return "link";
  if (!st.ready) return "wait";
  if (st.running) return "stop";
  if (!st.rows.length) return "start";
  if (st.sent) return "go";
  return st.selection ? "send" : "pick";
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
let booted = false;
export async function boot() {
  if (booted) return;
  booted = true;
  setLim(get().lim);
  suggestLim();
  set({ customRigs: prefs.get<Rig[]>("mosaicus.rigs", []) });
  selectLab(prefs.get("mosaicus.lastLab", prefs.get("mosaicus.lastExp", serialSupported() ? "motion" : "synth")));
  await Promise.all([useWorkbench.getState().load(), refreshSessions()]);
  window.addEventListener("beforeunload", (e) => { if (get().running) { e.preventDefault(); e.returnValue = ""; } });
}

export { PRESETS, INSTRUMENTS };
