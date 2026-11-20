"use client";
// MosaicusNeo — pagina Misura: il montaggio di sensori (da un esperimento pronto o libero), il
// collegamento (Arduino via cavo o Bluetooth, simulatore), le letture grezze → grandezze
// fisiche, la selezione, il Quaderno delle misure, l'export.
//
// Lo stato "da mostrare" sta nello store zustand; gli oggetti imperativi (collegamento, gruppo
// di grafici su canvas, pannello dello strumento attivo, sensori del dispositivo) restano in
// variabili di modulo.

import { create } from "zustand";
import { toast } from "@/lib/toast";
import { diagReset, diagAdd, diagUpdate, diagEnd } from "./diagnostics";
import { liveStatus } from "./live-status";
import type { LucideIcon } from "lucide-react";
import { ChartGroup } from "@/lib/mosaicus/chart.js";
import { SerialLink, serialSupported } from "@/lib/mosaicus/serial.js";
import { BleLink } from "@/lib/mosaicus/ble";
import { PhoneLink } from "@/lib/mosaicus/phone";
import { SimulatedLink, WARP, WARPS } from "@/lib/sensors/simulator";
import * as repo from "@/lib/cloud/repo";
import { toCSV, toXLSX, download } from "@/lib/mosaicus/export.js";
import { APP_VERSION, FIRMWARE_VERSION, cmpVersion } from "@/lib/version";
import { prefs, fmtVal, stamp } from "@/lib/prefs";
import { useWorkbench, type NewBox } from "@/lib/workbench-store";
import { toGPX, toGeoJSON, type TrackPoint } from "@/lib/mosaicus/geo";
import { SENSORS, pinName, type SensorType } from "@/lib/sensors/catalog";
import {
  resolveRig, validateRig, hasErrors, firmwareCommands, buildRows, alignRows, seriesOf, interpAt, tolerance,
  planAdd, type AddPlan, newId, normalizeRig, sensorLabel, LEGACY, inputsOf, outputsOf, isPhoneRig, firmwareNeeded, btOf, type Rig, type SensorInstance, type Resolved, type ResolvedQuantity,
} from "@/lib/sensors/rig";
import { parseSdLog, cfgMatches, sensorsFromCfg } from "@/lib/sensors/sd-log";
import { PRESETS, INSTRUMENTS, presetById, instrumentById, presetSensors, type Preset, type Instrument } from "@/lib/sensors/presets";
import type { Row, Tone } from "@/lib/sensors/types";
import { projectIcon, projectTone } from "@/lib/sensors/project-look";
import { t, intlLocale } from "@/i18n";
import { boardPlan } from "@/components/app/board-diagram";

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------
export interface Link {
  kind: "arduino" | "simulatore" | "telefono";
  /** come arriva Arduino: cavo/Bluetooth classico (Web Serial) o Bluetooth LE */
  transport?: "serial" | "ble";
  scenario?: string;
  scopeSignal?: string;
  warp?: number | null;
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
/** Stato riferito da Arduino (#ST). k/n: con più sensori in difficoltà il display li mostra a turno;
 *  bt: modulo Bluetooth configurato (0, 1 HC-06, 2 BLE); link: collegamento attuale (U USB, B Bluetooth).
 *  st: W attesa dell'app · I pronto · S in ricerca · E problema (slot -2 = scheda SD) · T misura ok · O oscilloscopio ·
 *  C configurazione rifiutata (slot -1 = accessorio; issue = motivo) · R scheda SD pronta, aspetta il pulsante ·
 *  L registrazione sulla scheda SD (firmware 1.5). */
export interface DeviceStatus { st: "W" | "I" | "S" | "E" | "T" | "O" | "C" | "R" | "L"; slot: number; issue: number; k: number; n: number; bt: number; link: "U" | "B"; at: number }

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
  /** scala del tempo del simulatore scelta (null = quella dello scenario) */
  simWarp: number | null;
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
  /** barra laterale dei lab aperta (sul computer; ricordato) */
  labsSidebar: boolean;
  /** capitolo della guida aperto (null = guida chiusa) */
  guide: string | null;
  /** stato riferito da Arduino e righe mandate al display */
  device: DeviceStatus | null;
  oledLines: [string, string];
  /** scheda aperta nel pannello laterale (Sensori, Collegamenti, Quaderno, Seriale) */
  sideTab: string;
  /** ultimo tratto inviato a Elaborazione: per riconoscerlo e aprirlo */
  lastSent: { key: string; boxId: number } | null;
  /** esito di «Prepara Arduino» per la scheda SD */
  sdCheck: { state: "busy" | "ok" | "err"; text: string } | null;
}

const EMPTY_RIG: Rig = { id: "empty", name: "", sensors: [] };

export const useLab = create<LabState>(() => ({
  simWarp: (WARPS as readonly number[]).includes(prefs.get<number>("mosaicus.simWarp", 0)) ? prefs.get<number>("mosaicus.simWarp", 0) : null,
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
  status: { text: t("lab.status.noDevice"), tone: "off" },
  sessions: null,
  serialLog: [],
  lim: prefs.get("mosaicus.lim", false),
  dragHint: false,
  labsOpen: false,
  labsSidebar: prefs.get("mosaicus.labsSidebar", true),
  guide: null,
  lastSent: null,
  sdCheck: null,
  device: null,
  oledLines: ["", ""],
  sideTab: prefs.get("mosaicus.sideTab", "sensors"),
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
  if (ins) return { kind: "instrument", id, title: ins.title, subtitle: ins.subtitle, topic: t("lab.info.toolsTopic"), icon: ins.icon, tone: ins.tone, instrument: ins };
  const r = customRigs.find((x) => x.id === id);
  return { kind: "custom", id, title: r?.name || t("lab.info.newProject"), subtitle: r ? rigSummary(r) : "", topic: t("lab.info.projectsTopic"), icon: projectIcon(r), tone: projectTone(r) };
}
export const rigSummary = (r: Rig) => r.sensors.length ? r.sensors.map(sensorLabel).join(" · ") : t("lab.info.noComponents");

let resolvedCache: { rig: Rig; res: Resolved } | null = null;
export function resolved(rig = get().rig): Resolved {
  if (resolvedCache?.rig !== rig) resolvedCache = { rig, res: resolveRig(rig) };
  return resolvedCache.res;
}

/** Grafici possibili: tutte le grandezze non nascoste del montaggio. */
export function viewsOf(rig = get().rig): View[] {
  const res = resolved(rig);
  const multi = inputsOf(rig).length > 1;
  return res.quantities.filter((q) => !q.hidden).map((q) => {
    const s = rig.sensors.find((x) => x.id === q.sensorId)!;
    return {
      id: q.key, key: q.key, sym: q.sym, line: q.line, raw: q.raw, sensorId: q.sensorId,
      label: q.raw ? t("lab.info.rawView", { sym: q.sym }) : `${q.sym}(t)`,
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
  const multi = inputsOf(rig).length > 1;
  return [
    { key: "t", head: "t (s)" },
    ...res.quantities.map((q) => {
      const s = rig.sensors.find((x) => x.id === q.sensorId)!;
      return { key: q.key, head: `${q.sym}${q.unit ? ` (${q.unit})` : ""}${multi ? ` · ${sensorLabel(s)}` : ""}` };
    }),
  ];
}
export const rigHas = (types: SensorType[], rig = get().rig) => rig.sensors.some((s) => types.includes(s.type));
export const needsArduino = (rig = get().rig) => inputsOf(rig).some((s) => !SENSORS[s.type].phone);
/** Il progetto usa i sensori del telefono: si collega con «Attiva i sensori», non con Arduino. */
export const needsPhone = (rig = get().rig) => isPhoneRig(rig);
export const hasMap = (rig = get().rig) => rigHas(["gps"], rig);
export const simScenario = () => labInfo().preset?.sim ?? (hasMap() ? "walk" : "free");

// ---------------------------------------------------------------------------
// Oggetti imperativi
// ---------------------------------------------------------------------------
let link: Link | null = null;
let raw: number[][] = [];
/** Coppie [t_ms di Arduino, ora del computer in ms], una ogni 2 s circa: servono per combinare due
 *  misure fatte con due Arduino (gli orologi delle schede vanno avanti a velocità leggermente diverse). */
let clock: number[][] = [];
/** Avvisa le altre schede del browser quando cambia il Quaderno. */
let tabs: BroadcastChannel | null = null;
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
      toast.success(msg, { duration: 6000, action: { label: t("lab.action.openInElab"), onClick: () => goElab(box.id) } });
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
export function setSideTab(tab: string) { set({ sideTab: tab }); prefs.set("mosaicus.sideTab", tab); }
/** Apre una scheda del pannello accanto alla misura (componenti, collegamenti…) e ci porta lì,
 *  con un lampo per farla trovare. */
function showSideTab(tab: string) {
  showPage("misura", { restoreScroll: false });
  setSideTab(tab);
  requestAnimationFrame(() => {
    const el = document.getElementById("side-panel");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.animate?.([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 4px color-mix(in oklab, var(--primary) 70%, transparent)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1400, easing: "ease-out", delay: 250 });
  });
}
/** I collegamenti (schema e passi). */
export const showWiring = () => showSideTab("wiring");
/** I componenti del progetto, nella stessa colonna dei collegamenti. */
export const showComponents = () => showSideTab("sensors");

/** Logo: torna alla pagina iniziale (Misura, in cima). */
export function goHome() {
  showPage("misura", { restoreScroll: false });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
/** Apre la guida a un capitolo (es. dal messaggio "firmware vecchio" o dalla sezione Bluetooth). */
export function setLabsSidebar(open: boolean) { set({ labsSidebar: open }); prefs.set("mosaicus.labsSidebar", open); }
/** Un esperimento pronto modificato (versione personale)? */
export const presetModified = (id: string) => !!presetById(id) && prefs.get<unknown>(rigKey(id), null) != null;

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
  toast(t("lab.lim.title"), {
    description: t("lab.lim.description"),
    duration: 12000,
    action: { label: t("lab.action.enable"), onClick: () => setLim(true) },
  });
}

export function setLim(on: boolean) {
  document.documentElement.classList.toggle("lim", on);
  prefs.set("mosaicus.lim", on);
  set({ lim: on });
  // sulla lavagna lo spazio conta: la barra dei lab si chiude (si riapre col pulsante accanto al titolo)
  if (on) setLabsSidebar(false);
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
  return { rig: custom ?? { id, name: t("lab.info.newProject"), sensors: [] }, modified: false };
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
  if (get().running) { toast(t("lab.toast.stopBeforeLab")); return; }
  if (id === "generator" || id === "theremin") id = "synth";
  const known = presetById(id) || instrumentById(id) || get().customRigs.some((r) => r.id === id);
  if (!known) id = serialSupported() ? "motion" : "synth";
  prefs.set("mosaicus.lastLab", id);
  if (!keepData) { raw = []; clock = []; }
  if (id !== get().labId) diagReset();
  set({
    labId: id, selection: null, sent: false, dragHint: false, labsOpen: false,
    ...(keepData ? {} : { session: null, sessionName: "", rows: [], nRaw: 0 }),
  });
  measureGroup().setSelection(null); measureGroup().fitAll();
  if (instrumentById(id)) { set({ rig: EMPTY_RIG, modified: false, visible: [], viewId: null }); return; }
  const { rig, modified } = loadRig(id);
  applyRig(rig, modified, { keepData });
}

/** Avviso del progetto «Modifica di …»: aspetta la fine dell'azione in corso. Se quell'azione mostra
 *  già una notifica (componente aggiunto, pin spostati) lo prende lei (takeFork), così ne compare una
 *  sola; altrimenti esce da solo. */
let pendingFork: string | null = null;
function noteFork(name: string) {
  pendingFork = name;
  queueMicrotask(() => { if (pendingFork) { toast(t("lab.toast.forked", { name: pendingFork })); pendingFork = null; } });
}
function takeFork() { const n = pendingFork; pendingFork = null; return n; }

/** Un esperimento pronto modificato diventa un progetto «Modifica di …» (l'originale resta com'è):
 *  colore dell'argomento, grafici scelti copiati. Restituisce il progetto, già salvato nell'elenco. */
function forkPreset(p: Preset, sensors: SensorInstance[]): Rig {
  const id = `rig-${newId()}`;
  const fork: Rig = { id, name: t("lab.info.editOf", { name: p.title }), tone: p.tone, sensors: sensors.map((s) => ({ ...s, options: { ...s.options }, pins: { ...s.pins } })) };
  const vis = prefs.get<string[] | null>(`mosaicus.visible.${p.id}`, null);
  if (vis) prefs.set(`mosaicus.visible.${id}`, vis);
  const list = [...get().customRigs, fork];
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  return fork;
}

/** Modifica del montaggio: un esperimento pronto diventa un progetto nuovo, un progetto si salva. */
function commitRig(rig: Rig) {
  if (get().running) { toast(t("lab.toast.stopBeforeComponents")); return false; }
  const p = presetById(rig.id);
  if (p) {
    const fork = forkPreset(p, rig.sensors);
    selectLab(fork.id, { keepData: true });
    noteFork(fork.name);
    return true;
  }
  {
    const list = get().customRigs.map((r) => (r.id === rig.id ? rig : r));
    set({ customRigs: list });
    prefs.set("mosaicus.rigs", list);
  }
  applyRig(rig, false, { keepData: true });
  return true;
}

export function updateSensor(id: string, patch: Partial<SensorInstance>) {
  const rig = get().rig;
  commitRig({ ...rig, sensors: rig.sensors.map((s) => (s.id === id ? { ...s, ...patch, ...(patch.options ? { options: { ...s.options, ...patch.options } } : {}) } : s)) });
}
/**
 * Come aggiungere il componente perché il circuito si possa montare davvero: pin liberati spostando
 * altri componenti, indirizzi I2C, posto sulla breadboard. ok: false spiega perché non si può.
 */
export function checkAdd(sensors: SensorInstance[], type: SensorType): AddPlan {
  const plan = planAdd(sensors, type);
  if (!plan.ok || SENSORS[type].phone) return plan;
  const board = boardPlan(plan.sensors.filter((s) => !SENSORS[s.type].phone));
  return board && !board.fits ? { ok: false, error: t("rig.editor.noRoom") } : plan;
}
/** Aggiunge con il piano di checkAdd. moved: i pin spostati per fargli posto, a parole (o null).
 *  null = non aggiunto (già avvisato). */
function applyAdd(rig: Rig, sensors: SensorInstance[], type: SensorType): { sensor: SensorInstance; moved: string | null } | null {
  const plan = checkAdd(sensors, type);
  if (!plan.ok) { toast.error(t("lab.toast.cantAdd", { name: SENSORS[type].title }), { description: plan.error, duration: 10000 }); return null; }
  if (!commitRig({ ...rig, sensors: plan.sensors })) return null;
  const list = [
    ...plan.moved.map((m) => t("lab.toast.pinMove", { sensor: sensorLabel(m.sensor), role: m.role, from: pinName(m.from), to: pinName(m.to) })),
    ...plan.readdressed.map((x) => t("lab.toast.addrMove", { sensor: sensorLabel(x), addr: String(x.options.addr) })),
  ].join(", ");
  return { sensor: plan.sensor!, moved: list ? t("lab.toast.pinsMoved", { list, name: SENSORS[type].title }) : null };
}
export function addSensor(type: SensorType) {
  const rig = get().rig;
  if (get().running) { toast(t("lab.toast.stopBeforeComponents")); return; }
  const added = applyAdd(rig, rig.sensors, type);
  const s = added?.sensor;
  if (added) {
    // una notifica sola: pin spostati e/o nuovo progetto «Modifica di …»
    const fork = takeFork();
    if (added.moved) toast.info(added.moved, { duration: 12000, description: fork ? t("lab.toast.forkedShort", { name: fork }) : undefined, action: { label: t("lab.action.wiring"), onClick: () => showWiring() } });
    else if (fork) toast(t("lab.toast.forked", { name: fork }));
  }
  if (s) {
    // la sua prima grandezza compare subito tra i grafici
    const first = viewsOf().find((v) => v.sensorId === s.id && !v.raw);
    if (first && !get().visible.includes(first.id)) { const visible = [...get().visible, first.id]; set({ visible }); prefs.set(`mosaicus.visible.${rig.id}`, visible); }
  }
}
/** Più componenti insieme (dal catalogo): uno dopo l'altro, poi una notifica sola. */
export function addSensors(types: SensorType[]) {
  if (get().running) { toast(t("lab.toast.stopBeforeComponents")); return; }
  const added: SensorInstance[] = [], moved: string[] = [];
  for (const type of types) {
    const rig = get().rig;                 // dopo il primo, può essere il progetto «Modifica di …»
    const r = applyAdd(rig, rig.sensors, type);
    if (!r) continue;
    added.push(r.sensor);
    if (r.moved) moved.push(r.moved);
  }
  // le prime grandezze compaiono subito tra i grafici
  const views = viewsOf();
  const extra = added.map((s) => views.find((v) => v.sensorId === s.id && !v.raw)?.id).filter((v): v is string => !!v && !get().visible.includes(v));
  if (extra.length) { const visible = [...get().visible, ...extra]; set({ visible }); prefs.set(`mosaicus.visible.${get().rig.id}`, visible); }
  const fork = takeFork();
  if (!added.length) return;
  toast.success(t("lab.toast.componentsAdded", { n: added.length }), {
    description: [fork ? t("lab.toast.forkedShort", { name: fork }) : null, ...moved].filter(Boolean).join(" ") || undefined,
    action: { label: t("lab.action.wiring"), onClick: () => showWiring() },
  });
}
export function removeSensor(id: string) {
  const rig = get().rig;
  commitRig({ ...rig, sensors: rig.sensors.filter((s) => s.id !== id) });
}
/** «Annulla» dopo removeSensor: rimette il componente al suo posto, se si è ancora sullo stesso progetto. */
export function restoreSensor(rigId: string, sensor: SensorInstance, index: number) {
  const rig = get().rig;
  if (rig.id !== rigId || get().running || rig.sensors.some((s) => s.id === sensor.id)) return;
  const sensors = [...rig.sensors];
  sensors.splice(Math.min(index, sensors.length), 0, sensor);
  commitRig({ ...rig, sensors });
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
  commitRig({ ...rig, name: name.trim() || t("lab.info.newProject") });
}
/** Nuovo montaggio libero (vuoto o copia del montaggio corrente). */
export function newRig({ copy = false } = {}) {
  if (get().running) { toast(t("lab.toast.stopFirst")); return; }
  const cur = get().rig;
  const rig: Rig = {
    id: `rig-${newId()}`,
    name: copy ? t("lab.info.copyOf", { name: labInfo().title }) : t("lab.info.newProject"),
    sensors: copy ? cur.sensors.map((s) => ({ ...s, id: newId(), options: { ...s.options }, pins: { ...s.pins } })) : [],
  };
  const list = [...get().customRigs, rig];
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  selectLab(rig.id);
  showComponents();
  return rig;
}

/** Rinomina un montaggio libero qualsiasi (anche non aperto). */
export function renameRigById(id: string, name: string) {
  const clean = name.trim() || t("lab.info.newProject");
  if (get().labId === id) { renameRig(clean); return; }
  const list = get().customRigs.map((r) => (r.id === id ? { ...r, name: clean } : r));
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
}
/** I progetti salvati, con i pin mancanti o non validi riassegnati (versioni vecchie, sincronizzazione). */
function loadRigs(): Rig[] {
  const raw = prefs.get<Rig[]>("mosaicus.rigs", []);
  const list = raw.map(normalizeRig);
  // versioni personali degli esperimenti pronti (prima di «Modifica di …»): diventano progetti
  let changed = list.some((r, i) => r !== raw[i]);
  for (const p of PRESETS) {
    const saved = prefs.get<SensorInstance[] | null>(rigKey(p.id), null);
    if (!saved) continue;
    const id = `rig-${newId()}`;
    list.push(normalizeRig({ id, name: t("lab.info.editOf", { name: p.title }), tone: p.tone, sensors: saved }));
    const vis = prefs.get<string[] | null>(`mosaicus.visible.${p.id}`, null);
    if (vis) prefs.set(`mosaicus.visible.${id}`, vis);
    prefs.set(rigKey(p.id), null);
    changed = true;
  }
  if (changed) prefs.set("mosaicus.rigs", list);
  return list;
}
/** Colore e icona di un progetto (si possono cambiare anche durante una misura: è solo aspetto). */
export function setRigLook(id: string, look: { tone?: Tone; icon?: string }) {
  const list = get().customRigs.map((r) => (r.id === id ? { ...r, ...look } : r));
  set({ customRigs: list, ...(get().rig.id === id ? { rig: { ...get().rig, ...look } } : {}) });
  prefs.set("mosaicus.rigs", list);
}
/** Copia di un montaggio libero, aperta subito. */
export function duplicateRig(id: string) {
  if (get().running) { toast(t("lab.toast.stopFirst")); return; }
  const src = get().customRigs.find((r) => r.id === id);
  if (!src) return;
  const rig: Rig = { id: `rig-${newId()}`, name: t("lab.info.copyOf", { name: src.name }), sensors: src.sensors.map((x) => ({ ...x, id: newId(), options: { ...x.options }, pins: { ...x.pins } })) };
  const list = [...get().customRigs, rig];
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  selectLab(rig.id);
}

export function deleteRig(id: string) {
  if (get().running && get().labId === id) { toast(t("lab.toast.stopBeforeDelete")); return; }
  const list = get().customRigs.filter((r) => r.id !== id);
  set({ customRigs: list });
  prefs.set("mosaicus.rigs", list);
  prefs.set(`mosaicus.visible.${id}`, null);
  if (get().labId === id) selectLab("motion");
}

/** Montaggi e versioni personali riletti dalle preferenze (es. arrivati da un altro dispositivo). */
export function reloadParams() {
  set({ customRigs: loadRigs() });
  if (get().running || instrumentById(get().labId)) return;
  const { rig, modified } = loadRig(get().labId);
  applyRig(rig, modified, { keepData: true });
}

export function toggleView(id: string) {
  const { visible, rig } = get();
  const on = visible.includes(id);
  if (on && visible.length === 1) { toast(t("lab.toast.keepOneChart")); return; }
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
/** Scala del tempo dello scenario (quella consigliata) e quella in uso. */
export const simDefaultWarp = () => WARP[simScenario()] ?? 1;
export const simWarpNow = () => get().simWarp ?? simDefaultWarp();
// la scala del tempo si vede nel suo pulsante, accanto allo stato: qui non si ripete
const simStatus = () => t("lab.status.simReady");
/** Sceglie la scala del tempo del simulatore: vale dalla prossima misura (null = quella dello scenario). */
export function setSimWarp(w: number | null) {
  if (get().running) { toast(t("lab.toast.stopFirst")); return; }
  // scegliere quella dello scenario equivale a «automatica»: cambiando lab torna la sua
  const v = w == null || w === simDefaultWarp() ? null : w;
  set({ simWarp: v });
  prefs.set("mosaicus.simWarp", v ?? 0);
  if (link?.kind === "simulatore") { link.warp = v; if (get().ready) setStatus(simStatus(), "on"); }
}

/** arduino = Web Serial (cavo USB, o HC-06 su Android); ble = modulo Bluetooth LE; sim = simulatore;
 *  phone = sensori del telefono o del computer, senza Arduino */
export async function connect(kind: "arduino" | "ble" | "sim" | "phone") {
  const l = (kind === "sim" ? new SimulatedLink() : kind === "ble" ? new BleLink() : kind === "phone" ? new PhoneLink() : new SerialLink()) as unknown as Link;
  if (kind === "sim") { l.scenario = simScenario(); l.scopeSignal = simSignal; l.warp = get().simWarp; }
  l.onLine(handleLine);
  l.onClose(() => {
    if (link !== l) return;
    const wasRunning = get().running;
    link = null;
    stopPing();
    set({ linkKind: null, transport: null, ready: false, device: null, sdCheck: null });
    setStatus(t("lab.status.noDevice"), "off");
    instrument?.linkChanged?.();
    if (wasRunning) {
      set({ running: false });
      stopKeepAlive();
      toast.warning(t(l.kind === "telefono" ? "lab.toast.phoneDisconnected" : "lab.toast.arduinoDisconnected"));
      void autosave();
    }
  });
  try {
    await l.open();
  } catch (err) {
    const e = err as Error;
    if (e?.name !== "NotFoundError") toast.error(t(kind === "ble" ? "lab.toast.bleError" : kind === "phone" ? "lab.toast.phoneError" : "lab.toast.portError", { msg: e.message }));
    return;
  }
  link = l;
  set({ linkKind: l.kind, transport: kind === "sim" || kind === "phone" ? null : kind === "ble" ? "ble" : "serial", ready: false });
  setStatus(t(kind === "sim" ? "lab.status.simStarting" : kind === "phone" ? "lab.status.phoneStarting" : "lab.status.waitingFirmware"), "wait");
  if (kind === "phone") return;              // il telefono risponde subito, niente firmware da cercare
  // l'Uno si riavvia quando si apre la porta USB: tempo al bootloader, poi chiedo l'identità
  // (via Bluetooth non si riavvia: la risposta arriva subito; lo chiedo due volte per sicurezza)
  setTimeout(() => { if (link === l && !get().ready) void l.write("ID?"); }, kind === "sim" ? 600 : kind === "ble" ? 400 : 2200);
  if (kind === "ble") setTimeout(() => { if (link === l && !get().ready) void l.write("ID?"); }, 1800);
  setTimeout(() => {
    if (link === l && !get().ready) {
      setStatus(t("lab.status.firmwareNotFound"), "err");
      toast.error(t("lab.toast.noFirmware"), { duration: 10000, action: { label: t("lab.action.howTo"), onClick: () => openGuide("firmware") } });
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
  if (line.length > 140) line = t("lab.info.serialTruncated", { head: line.slice(0, 120), n: line.split(",").length });
  logBuf.push(line);
  if (logBuf.length > 80) logBuf.shift();
  if (!logTimer) logTimer = setTimeout(() => { logTimer = null; set({ serialLog: [...logBuf] }); }, 200);
}

/** Collegati col cavo USB con un modulo Bluetooth nel progetto: sull'Uno il suo TXD su D0 copre i
 *  comandi che arrivano dal computer (Arduino parla, ma non sente). */
function d0Suspect() {
  const via = !!(link as unknown as { viaBluetooth?: boolean })?.viaBluetooth;
  return link?.kind === "arduino" && link.transport === "serial" && !via && !!btOf(get().rig);
}
function reportD0Blocked() {
  setStatus(t("lab.diag.d0Status"), "err");
  toast.error(t("lab.diag.d0Blocked"), { description: t("lab.diag.d0BlockedHint"), duration: 15000, action: { label: t("lab.action.wiring"), onClick: () => showWiring() } });
  diagAdd({ id: "d0", tone: "error", text: t("lab.diag.d0Blocked"), hint: t("lab.diag.d0BlockedHint"), setup: true });
}

let btNoReply = false;
function handleLine(line: string) {
  logSerial(line);
  if (waiter && waiter.match(line)) { const w = waiter; waiter = null; w.resolve(line); return; }
  const kind = link?.kind;
  if (line.startsWith("#MOSAICUS")) {
    const fw = line.split(",")[1] ?? null;
    set({ ready: true, fw });
    if (kind === "simulatore" || (fw && cmpVersion(fw, "1.2") >= 0)) startPing();
    // dalla 1.3 Arduino sa se è collegato via cavo o via Bluetooth, e lo scrive sul display
    if (kind === "arduino" && fw && cmpVersion(fw, "1.3") >= 0) {
      const bt = link?.transport === "ble" || !!(link as unknown as { viaBluetooth?: boolean })?.viaBluetooth;
      void link?.write(`LINK,${bt ? "B" : "U"}`);
    }
    if (kind === "arduino" && fw && cmpVersion(fw, FIRMWARE_VERSION) < 0) {
      toast.warning(t("lab.toast.oldFirmware", { fw, need: FIRMWARE_VERSION }), { duration: 10000, action: { label: t("lab.action.howTo"), onClick: () => openGuide("firmware") } });
    }
    setStatus(kind === "simulatore" ? simStatus() : kind === "telefono" ? t("lab.status.phoneReady") : t(link?.transport === "ble" ? "lab.status.arduinoReadyBle" : "lab.status.arduinoReady", { fw: String(fw) }), "on");
    // il saluto all'accensione arriva anche con D0 coperto: si controlla che Arduino senta davvero
    if (d0Suspect()) {
      const l = link;
      void request("ID?", (x) => x.startsWith("#MOSAICUS"), 1500).then((r) => { if (!r && link === l) reportD0Blocked(); });
    }
    return;
  }
  if (line === "#KEY") { onKey(); return; }
  if (line === "#BT,NOREPLY") { btNoReply = true; return; }
  if (line === "#BT,SETUP") { toast.info(t("lab.toast.btSetup")); return; }
  if (line === "#BT,PLUG") { toast.info(t("lab.toast.btPlug"), { duration: 30000 }); return; }
  if ((line === "#ACK,BT,SETUP,BLE" || line === "#ACK,BT,SETUP") && btNoReply) {
    btNoReply = false;
    toast.warning(t("lab.toast.btNoReply"), { duration: 14000 });
    return;
  }
  if (line === "#ACK,BT,SETUP,BLE") {
    toast.success(t("lab.toast.bleConfigured"), { duration: 14000 });
    return;
  }
  if (line === "#ACK,BT,SETUP") {
    toast.success(t("lab.toast.hc06Configured"), { duration: 12000 });
    return;
  }
  if (line.startsWith("#ERR,PHONE,")) { toast.error(line.slice(11), { duration: 8000 }); return; }
  if (line.startsWith("#ERR")) {
    const what = line.slice(5);
    toast.error(/SCOPE|BT|CFG|START/.test(what)
      ? t("lab.toast.fwOutdatedLoad", { v: FIRMWARE_VERSION })
      : t("lab.toast.unknownCommand", { what }), { duration: 8000 });
    return;
  }
  if (line.startsWith("#ST,")) {
    const [, st, slot, issue, k, n, bt, lk] = line.split(",");
    set({ device: { st: (st as DeviceStatus["st"]) || "I", slot: Number(slot), issue: Number(issue), k: Number(k) || 0, n: Number(n) || 0, bt: Number(bt) || 0, link: lk === "B" ? "B" : "U", at: Date.now() } });
    return;
  }
  if (line.startsWith("#")) return;
  if (instrument?.onLine?.(line)) return;
  if (!get().running) return;
  if (line.startsWith("D,")) {
    const f = line.slice(2).split(",").map((v) => (v === "nan" ? NaN : Number(v)));
    if (Number.isFinite(f[0]) && Number.isFinite(f[1])) {
      raw.push(f); scheduleRecompute();
      const now = Date.now();
      if (!clock.length || now - clock[clock.length - 1][1] >= 2000) clock.push([f[1], now]);
    }
  }
}

// ---------------------------------------------------------------------------
// Indicatori di stato (firmware 1.2): PING per dire ad Arduino che l'app c'è, righe del display
// ---------------------------------------------------------------------------
let pingTimer: ReturnType<typeof setInterval> | null = null;
function startPing() {
  stopPing();
  void link?.write("PING");
  // l'oscilloscopio occupa la seriale: lì non serve (Arduino mostra «oscilloscopio»)
  pingTimer = setInterval(() => { if (link && get().ready && !instrumentById(get().labId)) void link.write("PING"); }, 2000);
}
function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

/** Testo per il display 64×32: solo ASCII (il ° diventa il carattere 127 del firmware). */
function oledText(s: string, max: number) {
  return s.replace(/°/g, "\x7f").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[²]/g, "2").replace(/[³]/g, "3")
    .replace(/[^\x20-\x7f]/g, "").slice(0, max);
}
/** Valore compatto per il display: «23.4°», «48%», «1.25». */
function oledValue(q: ResolvedQuantity, v: number, max: number) {
  const unit = q.unit === "°C" ? "°" : q.unit === "%" ? "%" : "";
  for (let d = Math.min(q.digits, 3); d >= 0; d--) {
    const s = `${v.toFixed(d)}${unit}`;
    if (s.length <= max) return s;
  }
  return v.toPrecision(3).slice(0, max);
}
let oledTimer: ReturnType<typeof setInterval> | null = null;
/** Durante la misura: valore principale grande, secondo valore piccolo (una volta al secondo). */
function startOledFeed() {
  stopOledFeed();
  if (!outputsOf(get().rig).some((s) => s.type === "oled")) return;
  oledTimer = setInterval(() => {
    const st = get();
    if (!st.running || !link) return;
    const qs = readoutsOf().filter((q) => !q.raw);
    const last = (key: string) => { for (let i = st.rows.length - 1; i >= 0; i--) { const v = st.rows[i][key]; if (typeof v === "number" && Number.isFinite(v)) return v; } return NaN; };
    const [a, b] = qs;
    const big = a && Number.isFinite(last(a.key)) ? oledText(oledValue(a, last(a.key), 5), 5) : "";
    const small = b && Number.isFinite(last(b.key)) ? oledText(`${b.sym.replace(/[^\x20-\x7e]/g, "").slice(0, 3)} ${oledValue(b, last(b.key), 6)}`, 10) : "";
    const prev = st.oledLines;
    if (big !== prev[0]) void link.write(`OUT,L,1,${big}`);
    if (small !== prev[1]) void link.write(`OUT,L,2,${small}`);
    if (big !== prev[0] || small !== prev[1]) set({ oledLines: [big, small] });
  }, 1000);
}
function stopOledFeed() { if (oledTimer) { clearInterval(oledTimer); oledTimer = null; } set({ oledLines: ["", ""] }); }

/** Prova degli indicatori: colori, bip e scritta sul display (Arduino collegato, firmware 1.2). */
export async function testOutputs() {
  const st = get();
  if (!link || !st.ready) { toast(t("lab.toast.connectFirst")); return; }
  if (st.running) { toast(t("lab.toast.stopBeforeTest")); return; }
  if (link.kind !== "simulatore" && (!st.fw || cmpVersion(st.fw, "1.2") < 0)) {
    toast.error(t("lab.toast.outputsNeedFw"), { action: { label: t("lab.action.howTo"), onClick: () => openGuide("firmware") } }); return;
  }
  for (const cmd of firmwareCommands(st.rig, resolved(st.rig), { outputs: true }).filter((c) => c.startsWith("OUT"))) {
    const r = await request(cmd, (l) => l.startsWith("#ACK,OUT") || l.startsWith("#ERR"));
    if (!r || r.startsWith("#ERR")) { toast.error(r ? t("lab.toast.outputsRejectedWhy", { why: OUT_ERR[r.split(",")[2]] ?? r }) : t("lab.toast.outputsRejected")); return; }
  }
  const ok = await request("OUT,TEST", (l) => l.startsWith("#ACK,OUT,TEST"), 6000);
  toast[ok ? "success" : "error"](t(ok ? "lab.toast.testSent" : "lab.toast.testNoReply"));
}
// codici di errore del firmware: in inglese dalla v1.6, in italiano fino alla v1.5 (valgono tutti e due)
const OUT_ERR: Record<string, string> = {
  PIN: t("lab.outErr.PIN"), DUPLICATE: t("lab.outErr.DOPPIO"), TYPE: t("lab.outErr.TIPO"), FULL: t("lab.outErr.PIENO"), ARGS: t("lab.outErr.ARGOMENTI"),
  DOPPIO: t("lab.outErr.DOPPIO"), TIPO: t("lab.outErr.TIPO"), PIENO: t("lab.outErr.PIENO"), ARGOMENTI: t("lab.outErr.ARGOMENTI"),
};

const CFG_ERR: Record<string, string> = {
  PIN: t("lab.cfgErr.PIN"), ANALOG: t("lab.cfgErr.ANALOGICO"), DUPLICATE: t("lab.cfgErr.DOPPIO"),
  GPS: t("lab.cfgErr.GPS"), SLOT: t("lab.cfgErr.SLOT"), TYPE: t("lab.cfgErr.TIPO"), ARGS: t("lab.cfgErr.ARGOMENTI"),
  ANALOGICO: t("lab.cfgErr.ANALOGICO"), DOPPIO: t("lab.cfgErr.DOPPIO"), TIPO: t("lab.cfgErr.TIPO"), ARGOMENTI: t("lab.cfgErr.ARGOMENTI"),
};

/** Manda la configurazione (sensori e, se outputs, accessori) un comando alla volta. false: rifiutata. */
async function sendConfig(rig: Rig, res: Resolved, outputs: boolean) {
  for (const cmd of firmwareCommands(rig, res, { outputs })) {
    const reply = await request(cmd, (l) => l.startsWith("#ACK,CFG") || l.startsWith("#ACK,OUT") || l.startsWith("#ERR"));
    if (!reply) {
      if (d0Suspect()) { reportD0Blocked(); return false; }
      toast.error(t("lab.toast.cfgNoReply")); diagAdd({ id: "cfg:noreply", tone: "error", text: t("lab.diag.noReply"), hint: t("lab.toast.cfgNoReply"), setup: true }); return false;
    }
    if (reply.startsWith("#ERR")) {
      const parts = reply.split(",");
      if (parts[1] === "OUT") {
        const why = OUT_ERR[parts[2]] ?? parts[2];
        toast.error(t("lab.toast.accessoriesError", { why }));
        diagAdd({ id: "cfg:out", tone: "error", text: t("lab.diag.accessories"), hint: why.charAt(0).toUpperCase() + why.slice(1), setup: true });
        return false;
      }
      if (parts[1] !== "CFG") { toast.error(t("lab.toast.cfgFwOutdated", { v: FIRMWARE_VERSION }), { duration: 10000 }); return false; }
      const s = res.byCode.get(Number(parts[2]));
      const why = CFG_ERR[parts[3]] ?? parts[3];
      toast.error(t("lab.toast.componentError", { name: s ? sensorLabel(s) : t("lab.info.component"), why }));
      diagAdd({ id: `cfg:${parts[2]}`, sensorId: s?.id, tone: "error", text: t("lab.diag.rejected"), hint: why.charAt(0).toUpperCase() + why.slice(1), setup: true });
      return false;
    }
  }
  return true;
}

/** Si può premere Avvia? (montaggio valido e, se servono, Arduino o simulatore pronti) */
export function canStart(st = get()) {
  if (st.running || !inputsOf(st.rig).length) return false;
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
  if (hasErrors(issues)) { toast.error(issues.find((i) => i.level === "error")!.text); showComponents(); return; }
  if (!canStart()) return;
  diagReset();
  if (link) {
    const sim = link.kind === "simulatore";
    if (sim) link.scenario = simScenario();
    const need = firmwareNeeded(rig);
    const phone = link.kind === "telefono";
    if (!sim && !phone && st.fw && cmpVersion(st.fw, need) < 0) {
      const what = rig.sensors.filter((s) => { const v = SENSORS[s.type].since; return v && cmpVersion(st.fw!, v) < 0; }).map(sensorLabel).join(", ");
      toast.error(t("lab.toast.needFirmware", { what, need, fw: st.fw }), { duration: 12000, action: { label: t("lab.action.howTo"), onClick: () => openGuide("firmware") } });
      return;
    }
    const outputs = !phone && (sim || (!!st.fw && cmpVersion(st.fw, "1.2") >= 0));
    if (!(await sendConfig(rig, res, outputs))) return;
  }
  const exp = labInfo();
  raw = [];
  clock = [];
  measureGroup().setSelection(null); measureGroup().fitAll();
  // nome di partenza: «Misura 3 · 21:15» (il numero conta le misure di oggi di questo lab)
  const today = new Date().toDateString();
  const nToday = (st.sessions ?? []).filter((x) => x.labId === exp.id && new Date(x.created).toDateString() === today).length;
  const name = st.sessionName.trim() || t("app.run.defaultName", { n: nToday + 1, time: new Date().toLocaleTimeString(intlLocale, { hour: "numeric", minute: "2-digit" }) });
  set({ session: { name, created: Date.now(), source: link?.kind ?? "arduino", fw: st.fw }, sessionName: name, sent: false, running: true, selection: null, dragHint: false });
  recompute();
  if (link) {
    const ok = await request("START", (l) => l.startsWith("#ACK,START") || l.startsWith("#ERR,START"));
    if (!ok || ok.startsWith("#ERR")) {
      set({ running: false }); toast.error(t("lab.toast.notStarted"));
      diagAdd({ id: "start", tone: "error", text: t("lab.diag.notStarted"), hint: t("lab.toast.notStarted"), setup: true });
      return;
    }
  }
  startDiag();
  startKeepAlive();
  startOledFeed();
}

// controllo dei sensori ogni secondo: ciò che non va finisce nella diagnostica (e ci resta)
let diagTimer: ReturnType<typeof setInterval> | null = null;
function diagTick() {
  const st = get();
  if (!st.running) return;
  const elapsed = (Date.now() - (st.session?.created ?? Date.now())) / 1000;
  // gli istanti mostrati sono quelli della misura (col simulatore accelerato non coincidono con l'orologio)
  const tData = st.rows.length ? st.rows[st.rows.length - 1].t : 0;
  diagUpdate(liveStatus(st.rig, resolved(st.rig), st.rows, true, elapsed), Number.isFinite(tData) ? tData : elapsed);
}
function startDiag() { stopDiag(); diagTimer = setInterval(diagTick, 1000); }
function stopDiag() { if (diagTimer) { clearInterval(diagTimer); diagTimer = null; } diagTick(); }

export async function stop() {
  if (!get().running) return;
  stopDiag();
  diagEnd();
  set({ running: false });
  stopKeepAlive();
  stopOledFeed();
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
  if (!link || !get().ready || link.transport !== "serial") { toast(t("lab.toast.connectUsbFirst")); return; }
  if (get().running) { toast(t("lab.toast.stopBeforeModule")); return; }
  if (get().fw && cmpVersion(get().fw!, module === "ble" ? "1.1" : "0.4") < 0) {
    toast.error(t("lab.toast.moduleFwOutdated", { v: FIRMWARE_VERSION })); return;
  }
  // il comando si manda col filo TXD → D0 staccato (sull'Uno lo coprirebbe): se Arduino non
  // risponde subito, è quasi sempre attaccato
  const r = await request(module === "ble" ? "BT,SETUP,BLE" : "BT,SETUP", (l) => l === "#BT,SETUP", 1500);
  if (!r) { toast.error(t("lab.toast.btUnplugFirst"), { duration: 15000 }); return; }
  toast.info(t("lab.toast.btSetup"));
}

// ---------------------------------------------------------------------------
// Tutto è un componente: Bluetooth e scheda SD scelti dal menu «Collega» entrano nel progetto
// ---------------------------------------------------------------------------
/** Aggiunge il componente se manca (un solo modulo Bluetooth: sostituisce l'altro). true = aggiunto. */
export function ensureComponent(type: SensorType): boolean {
  const st = get();
  const rig = st.rig;
  if (instrumentById(st.labId) || isPhoneRig(rig) || rig.sensors.some((s) => s.type === type)) return false;
  const sensors = SENSORS[type].link ? rig.sensors.filter((s) => !SENSORS[s.type].link) : rig.sensors;
  const added = applyAdd(rig, sensors, type);
  if (!added) return false;
  const fork = takeFork();
  toast.success(t("lab.toast.componentAdded", { name: SENSORS[type].title }), {
    description: [fork ? t("lab.toast.forkedShort", { name: fork }) : null, added.moved, t("lab.toast.componentAddedHint")].filter(Boolean).join(" "),
    action: { label: t("lab.action.wiring"), onClick: () => showWiring() },
  });
  return true;
}

/** Collegamento scelto dal menu: il modulo Bluetooth corrispondente entra nel progetto. */
export async function connectVia(kind: "usb" | "hc06" | "ble") {
  if (kind !== "usb") ensureComponent(kind);
  await connect(kind === "ble" ? "ble" : "arduino");
}

/** Simulatore: preme il pulsante «su Arduino» (solo se il simulatore sa del pulsante, cioè dopo una configurazione). */
export function pressSimButton() {
  const l = link as unknown as { pressKey?: () => void } | null;
  if (link?.kind !== "simulatore" || !l?.pressKey) return;
  // il simulatore conosce il pulsante dopo OUT,ADD: alla prima pressione glielo dico
  void (async () => {
    if (!get().running) await sendConfig(get().rig, resolved(), true);
    l.pressKey!();
  })();
}

/** Il pulsante su Arduino (#KEY, firmware 1.5): fa come «Avvia» e «Ferma», qualunque sia il collegamento. */
function onKey() {
  const st = get();
  if (st.running) { void stop(); return; }
  if (canStart(st)) { void start(); return; }
  const issues = validateRig(st.rig);
  toast(hasErrors(issues) ? t("lab.toast.keyBlocked", { why: issues.find((i) => i.level === "error")!.text }) : t("lab.toast.keyIdle"));
}

// ---------------------------------------------------------------------------
// Scheda SD (firmware 1.5): «Prepara Arduino» manda e salva la configurazione; i file registrati
// si importano nel Quaderno
// ---------------------------------------------------------------------------
const SD_ERR: Record<string, string> = {
  CARD: t("lab.sd.err.CARD"),
  FAT32: t("lab.sd.err.FAT32"),
  FILE: t("lab.sd.err.FILE"),
  NOOUT: t("lab.sd.err.NOOUT"),
};
const SD_KEEP = 30;
export interface SdSnapshot { rig: Rig; labId: string; labTitle: string; at: number }

/** Attende che Arduino risponda dopo il collegamento (al massimo ms). */
async function waitReady(ms = 7000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (get().ready) return true; if (!link) return false; await new Promise((r) => setTimeout(r, 200)); }
  return get().ready;
}

/** Manda ad Arduino la configurazione, la salva (resta anche da spento) e prova la scheda SD. */
export async function prepareSd(): Promise<boolean> {
  const st = get();
  if (!link || !st.ready || link.kind === "telefono") { toast(t("lab.toast.connectUsbFirst")); return false; }
  if (st.running) { toast(t("lab.sd.stopBefore")); return false; }
  if (link.kind !== "simulatore" && (!st.fw || cmpVersion(st.fw, "1.5") < 0)) {
    toast.error(t("lab.sd.needFirmware", { fw: st.fw ?? "?" }), { duration: 12000, action: { label: t("lab.action.howTo"), onClick: () => openGuide("firmware") } });
    return false;
  }
  const rig = st.rig;
  const issues = validateRig(rig);
  if (hasErrors(issues)) { toast.error(issues.find((i) => i.level === "error")!.text); showComponents(); return false; }
  if (!rig.sensors.some((s) => s.type === "sd")) { toast(t("lab.sd.addFirst")); return false; }
  set({ sdCheck: { state: "busy", text: t("lab.sd.preparing") } });
  if (!(await sendConfig(rig, resolved(rig), true))) { set({ sdCheck: { state: "err", text: t("lab.sd.cfgRejected") } }); return false; }
  // istantanea del progetto: all'importazione i file sanno con quali opzioni interpretare i dati
  const id = newId();
  const ids = [id, ...prefs.get<string[]>("mosaicus.sd.ids", [])];
  for (const old of ids.slice(SD_KEEP)) prefs.remove?.(`mosaicus.sd.${old}`);
  prefs.set("mosaicus.sd.ids", ids.slice(0, SD_KEEP));
  prefs.set(`mosaicus.sd.${id}`, { rig: { id: rig.id, name: rig.name, sensors: rig.sensors }, labId: st.labId, labTitle: labInfo().title, at: Date.now() } satisfies SdSnapshot);
  const saved = await request(`CFG,SAVE,${id}`, (l) => l.startsWith("#ACK,CFG,SAVE") || l.startsWith("#ERR"));
  if (!saved || saved.startsWith("#ERR")) {
    set({ sdCheck: { state: "err", text: t("lab.sd.notSaved") } });
    toast.error(t("lab.sd.notSavedToast"));
    return false;
  }
  const test = await request("SD,TEST", (l) => l.startsWith("#SD,"), 8000);
  if (!test) { set({ sdCheck: { state: "err", text: t("lab.sd.testNoReply") } }); toast.error(t("lab.sd.testNoReplyToast")); return false; }
  const [, ok, code] = test.split(",");
  if (ok !== "OK") {
    const why = SD_ERR[code] ?? code;
    set({ sdCheck: { state: "err", text: t("lab.sd.error", { why }) } });
    toast.error(t("lab.sd.error", { why }), { duration: 14000 });
    return false;
  }
  const mb = Number(code);
  const button = rig.sensors.some((s) => s.type === "button");
  const how = t(button ? "lab.sd.howButton" : "lab.sd.howPower");
  const size = mb >= 1024 ? `${(mb / 1024).toLocaleString(intlLocale, { maximumFractionDigits: 1 })} GB` : `${mb} MB`;
  const text = mb > 0 ? t("lab.sd.readyCard", { size, how }) : t("lab.sd.ready", { how });
  set({ sdCheck: { state: "ok", text } });
  toast.success(t("lab.sd.readyToast"), { description: text, duration: 15000 });
  return true;
}

/** Dal menu «Collega»: aggiunge la scheda SD, collega Arduino col cavo e lo prepara. */
export async function recordOnSd() {
  ensureComponent("sd");
  setSideTab("sensors");
  if (!link) { await connect("arduino"); if (!(await waitReady())) return; }
  if (link?.kind === "simulatore" || link?.kind === "arduino") await prepareSd();
}

/** Importa nel Quaderno i file LOGnnnnn.CSV della scheda SD. */
export async function importSdFiles(files: File[]) {
  const existing = new Set((await repo.all("sessions").catch(() => [])).map((s) => String((s as { sdFile?: string }).sdFile ?? "")));
  let n = 0, lastId: number | null = null;
  for (const f of files) {
    const key = `${f.name}:${f.size}:${f.lastModified}`;
    if (existing.has(key)) { toast(t("lab.sd.alreadyIn", { file: f.name })); continue; }
    const log = parseSdLog(await f.text());
    if (!log) { toast.error(t("lab.sd.notMosaicus", { file: f.name })); continue; }
    if (!log.raw.length) { toast.warning(t("lab.sd.noReadings", { file: f.name })); continue; }
    const snap = log.proj ? prefs.get<SdSnapshot | null>(`mosaicus.sd.${log.proj}`, null) : null;
    const cur = get().rig;
    let rig: Rig, labId: string, labTitle: string;
    if (snap && cfgMatches(snap.rig, log.cfg)) ({ rig, labId, labTitle } = snap);
    else if (cfgMatches(cur, log.cfg)) { rig = cur; labId = get().labId; labTitle = labInfo().title; }
    else {
      // progetto sconosciuto (preparato su un altro dispositivo): sensori ricostruiti, opzioni di serie
      const sensors = sensorsFromCfg(log.cfg);
      if (!sensors.length) { toast.error(t("lab.sd.unknownSensors", { file: f.name })); continue; }
      rig = { id: `sd-${log.proj ?? newId()}`, name: t("lab.info.sdRecording"), sensors };
      labId = "sd"; labTitle = t("lab.info.sdRecording");
      toast.warning(t("lab.sd.unknownProject", { file: f.name }), { duration: 10000 });
    }
    const t1 = log.raw[log.raw.length - 1][1] / 1000;
    const rec = {
      format: 2, name: `${labTitle} · ${f.name.replace(/\.csv$/i, "")}`, experiment: labId, labTitle,
      rig: { id: rig.id, name: rig.name, sensors: rig.sensors }, created: Date.now(), source: "scheda SD", fw: log.fw,
      raw: log.raw, app: APP_VERSION, sdFile: key,
    };
    try {
      lastId = (await repo.save("sessions", rec)).id ?? lastId;
      n++;
      if (log.bad > 1) toast.warning(t("lab.sd.badRows", { file: f.name, n: log.bad }));
      else if (!Number.isFinite(t1)) toast.warning(t("lab.sd.badTimes", { file: f.name }));
    } catch (err) { toast.error(t("lab.sd.fileError", { file: f.name, msg: (err as Error).message })); }
  }
  await refreshSessions();
  if (n) {
    const id = lastId;
    toast.success(t("lab.sd.imported", { n }), id != null ? { action: { label: t("lab.action.open"), onClick: () => void openSession(id) } } : undefined);
  }
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
    raw, app: APP_VERSION, ...(clock.length ? { clock } : {}),
  };
  try {
    const id = (await repo.save("sessions", rec)).id;
    set({ session: { ...st.session, id: st.session.id ?? id } });
    tabs?.postMessage("saved");
    if (!quiet) toast.success(t("lab.toast.saved", { n: raw.length }));
    await refreshSessions();
  } catch (err) {
    toast.error(t("lab.toast.saveFailed", { msg: (err as Error).message }));
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
  if (!valid.length) { toast(t("lab.toast.noDistance")); return; }
  const med = valid[valid.length >> 1];
  updateSensor(s.id, { options: { origin: Math.round(med * 1000) / 1000 } });
  toast.success(t("lab.toast.originSet", { d: fmtVal(med, 3) }));
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
  if (st.running) { toast(t("lab.toast.stopBeforeSend")); return; }
  const already = sentBoxId(st);
  if (already != null) { if (open) goElab(already); else toast(t("lab.toast.alreadySent"), { action: { label: t("lab.action.open"), onClick: () => goElab(already) } }); return; }
  const key = selectionKey(st);
  const rig = st.rig, res = resolved(rig);
  const [t1s, t2s] = st.selection ?? [-Infinity, Infinity];
  // grandezze fisiche (non i dati tecnici) con almeno un valore nel tratto
  const inSel = st.rows.filter((r) => r.t >= t1s && r.t <= t2s);
  const keys = res.quantities.filter((q) => !q.raw && inSel.some((r) => Number.isFinite(r[q.key] as number))).map((q) => q.key);
  if (!keys.length) { toast(t("lab.toast.noValidData")); return; }
  // tempi del sensore del grafico attivo; le grandezze degli altri sensori vengono interpolate
  const view = viewsOf().find((v) => v.id === st.viewId && !v.raw);
  const baseSensor = view?.sensorId ?? res.quantities.find((q) => q.key === keys[0])!.sensorId;
  const own = new Set(res.quantities.filter((q) => q.sensorId === baseSensor).map((q) => q.key));
  const aligned = alignRows(st.rows, baseSensor, keys, own, tolerance(rig)).filter((r) => r.t >= t1s && r.t <= t2s && keys.some((k) => own.has(k) && Number.isFinite(r[k] as number)));
  if (aligned.length < 3) { toast(t("lab.toast.needThreePoints")); return; }
  if (!st.session?.id) await autosave(true);
  const byKey = new Map(res.quantities.map((q) => [q.key, q]));
  const columns = [{ key: "t", sym: "t", unit: "s", name: t("lab.export.time") }, ...keys.map((k) => ({ key: k, sym: byKey.get(k)!.sym, unit: byKey.get(k)!.unit, name: byKey.get(k)!.name }))];
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
  const mixed = inputsOf(rig).length > 1 && keys.some((k) => !own.has(k));
  if (open) {
    goElab(box.id);
    if (mixed) toast(t("lab.toast.interpolated"), { duration: 6000 });
  } else {
    toast.success(t(mixed ? "lab.toast.rangeAddedInterpolated" : "lab.toast.rangeAdded", { n: aligned.length }), { duration: 6000, action: { label: t("lab.action.open"), onClick: () => goElab(box.id) } });
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
  for (const s of inputsOf(rig)) for (const f of SENSORS[s.type].rawFields) if (!fields.includes(f)) fields.push(f);
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
  if (!st.rows.length) { toast(t("lab.toast.noData")); return; }
  const exp = labInfo();
  const cols = columnsOf();
  const multi = inputsOf(st.rig).length > 1;
  const headers = [...cols.map((c) => c.head), ...(multi ? [t("lab.export.sensor")] : [])];
  const sensorName = new Map(st.rig.sensors.map((s) => [s.id, sensorLabel(s)]));
  const rows = selectedRows().map((r) => [...cols.map((c) => r[c.key]), ...(multi ? [sensorName.get(String(r._s)) ?? ""] : [])]);
  const part = st.selection ? `_${fmtVal(st.selection[0], 2)}-${fmtVal(st.selection[1], 2)}s`.replace(/,/g, ".") : "";
  const base = `mosaicusneo_${exp.id}_${stamp(new Date(st.session?.created ?? Date.now()))}${part}`;
  if (kind === "csv-it") return download(toCSV(headers, rows, { it: true }), `${base}_excel.csv`);
  if (kind === "csv") return download(toCSV(headers, rows, { it: false }), `${base}.csv`);
  if (kind === "png") return download(await stackPNG(), `${base}_${t("lab.export.fileCharts")}.png`);
  if (kind === "raw-csv" || kind === "raw-xlsx") {
    const rt = rawTable(st.selection);
    if (!rt.rows.length) { toast(t("lab.toast.noRaw")); return; }
    const suffix = t("lab.export.fileRaw");
    return kind === "raw-csv"
      ? download(toCSV(rt.headers, rt.rows, { it: false }), `${base}_${suffix}.csv`)
      : download(toXLSX([{ name: t("lab.export.sheetRaw"), rows: [rt.headers, ...rt.rows] }, ...(rt.sheets.length > 1 ? rt.sheets : [])]), `${base}_${suffix}.xlsx`);
  }
  if (kind === "gpx" || kind === "geojson") {
    const pts = trackPoints(selectedRows());
    if (!pts.length) { toast(t("lab.toast.noGps")); return; }
    const name = st.sessionName || exp.title;
    return kind === "gpx"
      ? download(toGPX(name, pts), `${base}.gpx`, "application/gpx+xml")
      : download(toGeoJSON(name, pts), `${base}.geojson`, "application/geo+json");
  }
  const source = st.session?.source;
  const info = [
    ["MosaicusNeo", `v${APP_VERSION}`],
    [t("lab.export.experiment"), `${exp.title}${exp.subtitle ? ` — ${exp.subtitle}` : ""}`],
    [t("lab.export.sessionName"), st.sessionName || st.session?.name || ""],
    [t("lab.export.date"), new Date(st.session?.created ?? Date.now()).toLocaleString(intlLocale)],
    [t("lab.export.source"), source === "simulatore" ? t("lab.export.simulator") : t("lab.export.arduinoFw", { fw: st.session?.fw ?? "?" })],
    [t("lab.export.range"), st.selection ? t("lab.export.rangeValue", { a: String(st.selection[0]), b: String(st.selection[1]) }) : t("lab.export.wholeMeasurement")],
    [],
    [t("lab.export.component"), t("lab.export.type"), t("lab.export.pin"), t("lab.export.interval"), t("lab.export.options")],
    ...st.rig.sensors.map((s) => {
      const def = SENSORS[s.type];
      return [sensorLabel(s), def.title, def.pins.map((p) => `${p.role}: ${pinName(s.pins[p.key])}`).join("; "), s.interval,
        def.options.map((o) => `${o.label}: ${o.type === "select" ? o.options?.find((x) => x[0] === s.options[o.key])?.[1] : s.options[o.key]}${o.unit ? ` ${o.unit}` : ""}`).join("; ")];
    }),
  ];
  const rawT = rawTable(st.selection);
  download(toXLSX([{ name: t("lab.export.sheetData"), rows: [headers, ...rows] }, { name: t("lab.export.sheetInfo"), rows: info }, ...(rawT.rows.length ? [{ name: t("lab.export.sheetRaw"), rows: [rawT.headers, ...rawT.rows] }] : [])]), `${base}.xlsx`);
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
  experiment: string; labTitle?: string; rig?: Rig; raw: number[][]; params?: Record<string, number | string>;
  clock?: number[][];
}

/**
 * Carica una misura del Quaderno nella pagina Misura.
 * quiet: senza messaggi né pagina (per inviarla a Elaborazione o esportarla dal Quaderno).
 */
export async function openSession(id: number, { quiet = false } = {}): Promise<boolean> {
  if (get().running) { toast(t("lab.toast.stopBeforeOpen")); return false; }
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
    if (!lg) { toast.error(t("lab.toast.cannotOpen")); return false; }
    const preset = presetById(labId);
    const sensors = lg.rig(s.params ?? {}).sensors.map((x, i) => ({ ...x, id: preset ? `${labId}-${x.type}` : `${x.type}-${i}` }));
    rig = { id: labId, name: preset?.title ?? labId, sensors };
    data = s.raw.flatMap(lg.convert);
  }
  if (!quiet) showPage("misura");
  selectLab(presetById(labId) || get().customRigs.some((r) => r.id === labId) ? labId : "motion", { keepData: true });
  raw = data;
  clock = s.clock ?? [];
  const modified = !!presetById(rig.id) && JSON.stringify(rig.sensors) !== JSON.stringify(presetSensors(presetById(rig.id)!));
  applyRig(rig, modified, { keepData: true });
  set({ session: { id: s.id, name: s.name, created: s.created, source: s.source, fw: s.fw }, sessionName: s.name, selection: null });
  measureGroup().setSelection(null); measureGroup().fitAll();
  recompute();
  if (quiet) return true;
  showDragHint();
  toast(t("lab.toast.opened", { name: s.name }));
  return true;
}

// ---------------------------------------------------------------------------
// Combinare due misure fatte nello stesso momento con due Arduino (due progetti, due schede)
// ---------------------------------------------------------------------------
/** Misure che si possono combinare: registrate dal vivo (le misure della scheda SD non hanno l'ora vera). */
export const canCombine = (s: Pick<SessionSummary, "source">) => s.source !== "scheda SD";

/**
 * Tempo di Arduino (ms) → ora del computer (ms). Con le coppie dell'orologio: retta dei minimi quadrati
 * (corregge la deriva dell'oscillatore, fino a ±0,5 % sull'Uno), spostata sul ritardo minimo (le righe
 * arrivano sempre un po' dopo). Senza coppie (misure vecchie, o già combinate): inizio + t.
 */
function hostTimeOf(s: StoredSession): (tMs: number) => number {
  const c = s.clock;
  if (!c || c.length < 3) return (x) => s.created + x;
  const n = c.length, mx = c.reduce((a, p) => a + p[0], 0) / n, my = c.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of c) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxx > 0 ? sxy / sxx : 1;
  // una deriva oltre l'1 % non è un orologio: qualcosa è andato storto (pausa del browser…), niente correzione
  const slope = Math.abs(b - 1) < 0.01 ? b : 1;
  const a = my - slope * mx;
  const lag = Math.min(...c.map(([x, y]) => y - (a + slope * x)));
  return (x) => a + lag + slope * x;
}

/** Combina due misure del Quaderno sullo stesso asse dei tempi: una misura nuova, con i sensori di tutte e due. */
export async function combineSessions(aId: number, bId: number) {
  if (get().running) { toast(t("lab.toast.stopFirst")); return; }
  const [a, b] = (await Promise.all([repo.get("sessions", aId), repo.get("sessions", bId)])) as unknown as (StoredSession | undefined)[];
  if (!a || !b || a.format !== 2 || b.format !== 2 || !a.rig || !b.rig) { toast.error(t("lab.combine.cannot")); return; }
  if (!canCombine(a) || !canCombine(b)) { toast.error(t("lab.combine.noSd")); return; }
  const fa = hostTimeOf(a), fb = hostTimeOf(b);
  const span = (s: StoredSession, f: (x: number) => number) => [f(s.raw[0]?.[1] ?? 0), f(s.raw[s.raw.length - 1]?.[1] ?? 0)];
  const [a0, a1] = span(a, fa), [b0, b1] = span(b, fb);
  if (Math.min(a1, b1) <= Math.max(a0, b0)) { toast.error(t("lab.combine.noOverlap")); return; }
  const base = Math.min(fa(0), fb(0));
  // i codici dei sensori di B vengono dopo quelli di A (resolveRig li numera in quest'ordine)
  const shift = resolveRig(a.rig).arduino.length;
  const ids = new Set(a.rig.sensors.map((s) => s.id));
  const bSensors = b.rig.sensors.map((s) => (ids.has(s.id) ? { ...s, id: newId() } : s));
  const data = [
    ...a.raw.map((f) => [f[0], Math.round((fa(f[1]) - base) * 1000) / 1000, ...f.slice(2)]),
    ...b.raw.map((f) => [f[0] + shift, Math.round((fb(f[1]) - base) * 1000) / 1000, ...f.slice(2)]),
  ].sort((x, y) => x[1] - y[1]);
  const name = t("lab.combine.name", { a: a.name, b: b.name });
  const rec = {
    format: 2, name, experiment: a.experiment, labTitle: a.labTitle ?? labInfo(a.experiment).title,
    rig: { id: a.rig.id, name: a.rig.name, sensors: [...a.rig.sensors, ...bSensors] },
    created: base, source: "combined", fw: a.fw, raw: data, app: APP_VERSION, combined: [a.id, b.id],
  };
  try {
    const id = (await repo.save("sessions", rec)).id;
    tabs?.postMessage("saved");
    await refreshSessions();
    toast.success(t("lab.combine.done", { name }), {
      description: t("lab.combine.doneHint"), duration: 10000,
      action: { label: t("lab.action.analyze"), onClick: () => void sendSessionToElab(id) },
    });
  } catch (err) {
    toast.error(t("lab.toast.saveFailed", { msg: (err as Error).message }));
  }
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
  tabs?.postMessage("removed");
  const s = get().session;
  if (s?.id === id) set({ session: { ...s, id: undefined } });
  await refreshSessions();
}

// ---------------------------------------------------------------------------
// Percorso guidato: qual è il prossimo gesto
// ---------------------------------------------------------------------------
export function guideStep(st: LabState): GuideStep {
  if (instrumentById(st.labId) || !inputsOf(st.rig).length) return null;
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
  set({ customRigs: loadRigs() });
  selectLab(prefs.get("mosaicus.lastLab", prefs.get("mosaicus.lastExp", serialSupported() ? "motion" : "synth")));
  await Promise.all([useWorkbench.getState().load(), refreshSessions()]);
  window.addEventListener("beforeunload", (e) => { if (get().running) { e.preventDefault(); e.returnValue = ""; } });
  // Più schede del browser aperte (un progetto per Arduino): i progetti e il Quaderno restano allineati.
  // I progetti stanno in localStorage (evento «storage»), le misure in IndexedDB (avviso con BroadcastChannel).
  window.addEventListener("storage", (e) => {
    if (e.key !== "mosaicus.rigs" || get().running) return;
    const list = loadRigs();
    set({ customRigs: list });
    const mine = list.find((r) => r.id === get().labId);
    if (mine && JSON.stringify(mine.sensors) !== JSON.stringify(get().rig.sensors)) applyRig(mine, false, { keepData: true });
  });
  try {
    tabs = new BroadcastChannel("mosaicus.sessions");
    tabs.onmessage = () => { void refreshSessions(); };
  } catch { /* browser senza BroadcastChannel: il Quaderno si aggiorna al prossimo avvio */ }
}

export { PRESETS, INSTRUMENTS };
