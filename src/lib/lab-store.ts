"use client";
// Mosaicus — pagina Misura: esperimento scelto, collegamento (Arduino, telefono, simulatore),
// righe grezze → campioni → grandezze derivate, selezione, Quaderno delle misure, export.
//
// Lo stato "da mostrare" sta nello store zustand; gli oggetti imperativi (collegamento,
// gruppo di grafici su canvas, pannello dello strumento attivo) restano in variabili di modulo.

import { create } from "zustand";
import { toast } from "sonner";
import { EXPERIMENTS, QUANTITIES, byId, defaultParams, type Experiment, type Params, type Row } from "@/lib/mosaicus/experiments";
import { ChartGroup } from "@/lib/mosaicus/chart.js";
import { SerialLink, serialSupported } from "@/lib/mosaicus/serial.js";
import { SimulatedLink } from "@/lib/mosaicus/simulator.js";
import { PhoneLink } from "@/lib/mosaicus/phone.js";
import * as repo from "@/lib/cloud/repo";
import { toCSV, toXLSX, download } from "@/lib/mosaicus/export.js";
import { APP_VERSION, FIRMWARE_VERSION, cmpVersion } from "@/lib/version";
import { prefs, fmtVal, stamp } from "@/lib/prefs";
import { useWorkbench, type NewBox } from "@/lib/workbench-store";
import { toGPX, toGeoJSON, type TrackPoint } from "@/lib/mosaicus/geo";

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------
export interface Link {
  kind: "arduino" | "telefono" | "simulatore";
  scenario?: string;
  scopeSignal?: string;
  open(): Promise<void>;
  write(cmd: string): Promise<void>;
  close(): Promise<void>;
  onLine(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
}
export interface Session { id?: number; name: string; created: number; source: string; fw: string | null }
export interface SessionSummary { id: number; name: string; experiment: string; created: number; n: number; cloud?: boolean; dirty?: boolean }
export type StatusTone = "off" | "wait" | "on" | "err";
export type Page = "misura" | "elab";
export type GuideStep = "link" | "wait" | "start" | "stop" | "pick" | "send" | "go" | null;

/** Pannello di uno strumento (oscilloscopio, synth): riceve le righe che lo riguardano. */
export interface Instrument {
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

interface LabState {
  page: Page;
  expId: string;
  params: Params;
  linkKind: Link["kind"] | null;
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
}

const initialExp = () => byId(prefs.get("mosaicus.lastExp", serialSupported() ? "motion" : "synth")) ?? EXPERIMENTS[0];

export const useLab = create<LabState>(() => ({
  page: prefs.get<Page>("mosaicus.page", "misura") === "elab" ? "elab" : "misura",
  expId: "motion",
  params: {},
  linkKind: null,
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
}));

const get = useLab.getState;
const set = useLab.setState;
export const currentExp = (): Experiment => byId(get().expId) ?? EXPERIMENTS[0];

// ---------------------------------------------------------------------------
// Oggetti imperativi
// ---------------------------------------------------------------------------
let link: Link | null = null;
let raw: number[][] = [];
let instrument: Instrument | null = null;
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

export function registerInstrument(i: Instrument | null) { instrument = i; }

export function instrumentApi(exp: Experiment): InstrumentApi {
  return {
    mode: exp.source === "arduino" ? "arduino" : "audio",
    ready: () => !!link && get().ready,
    async send(cmd) {
      if (!link) return;
      if (link.kind === "simulatore") { link.scenario = exp.sim; link.scopeSignal = simSignal; }
      await link.write(cmd);
    },
    async sendBox(data, msg) {
      await useWorkbench.getState().addBox({ experiment: exp.id, expTitle: exp.title, sessionId: null, sessionName: "", ...data } as NewBox);
      toast.success(msg, { duration: 6000, action: { label: "Vai a Elaborazione →", onClick: () => goElab() } });
    },
    setSimSignal(sig) { simSignal = sig; if (link?.kind === "simulatore") link.scopeSignal = sig; },
  };
}

// ---------------------------------------------------------------------------
// Pagine
// ---------------------------------------------------------------------------
export function showPage(page: Page) {
  set({ page });
  prefs.set("mosaicus.page", page);
  window.scrollTo({ top: 0 });
}
export function goElab() { set({ sent: false }); showPage("elab"); }

export function setLim(on: boolean) {
  document.documentElement.classList.toggle("lim", on);
  prefs.set("mosaicus.lim", on);
  set({ lim: on });
}

// ---------------------------------------------------------------------------
// Esperimenti
// ---------------------------------------------------------------------------
export function selectExperiment(id: string, { keepData = false } = {}) {
  if (get().running) { toast("Ferma la misura prima di cambiare lab."); return; }
  // generatore e strumento musicale sono confluiti nel synth
  if (id === "generator" || id === "theremin") id = "synth";
  let exp = byId(id);
  if (!exp || exp.hidden) exp = byId(serialSupported() ? "motion" : "synth")!;
  prefs.set("mosaicus.lastExp", exp.id);
  const params = { ...defaultParams(exp), ...prefs.get<Params>(`mosaicus.params.${exp.id}`, {}) };
  const saved = prefs.get<string[] | null>(`mosaicus.visible.${exp.id}`, null);
  let visible = (saved || exp.defaultVisible || (exp.views[0] ? [exp.views[0].id] : [])).filter((v) => exp!.views.some((w) => w.id === v));
  if (!visible.length && exp.views[0]) visible = [exp.views[0].id];
  if (!keepData) raw = [];
  set({
    expId: exp.id, params, visible, viewId: visible[0] ?? null, selection: null, sent: false, dragHint: false, labsOpen: false,
    ...(keepData ? {} : { session: null, sessionName: "", rows: [], nRaw: 0 }),
  });
  measureGroup().setSelection(null); measureGroup().fitAll();
  if (!keepData) recompute();
  // se il dispositivo collegato non è quello giusto per questo esperimento, lo scollego
  const needPhone = exp.source === "phone";
  if (exp.source !== "audio" && link && link.kind !== "simulatore" && (link.kind === "telefono") !== needPhone) {
    void link.close();
    toast(needPhone ? "Questo esperimento usa i sensori del telefono: ho scollegato Arduino." : "Questo esperimento usa Arduino: ho disattivato i sensori del telefono.");
  }
  if (link?.kind === "simulatore" && get().ready) setStatus(simStatus(), "on");
}

/** Parametri del lab corrente riletti dalle preferenze (es. arrivate da un altro dispositivo). */
export function reloadParams() {
  const exp = currentExp();
  set({ params: { ...defaultParams(exp), ...prefs.get<Params>(`mosaicus.params.${exp.id}`, {}) } });
  recompute();
}

export function setParam(key: string, value: number | string) {
  const params = { ...get().params, [key]: value };
  set({ params });
  prefs.set(`mosaicus.params.${get().expId}`, params);
  recompute();
}
export function resetParams() {
  const params = defaultParams(currentExp());
  set({ params });
  prefs.set(`mosaicus.params.${get().expId}`, params);
  recompute();
}

export function toggleView(id: string) {
  const { visible } = get();
  const exp = currentExp();
  const on = visible.includes(id);
  if (on && visible.length === 1) { toast("Almeno un grafico deve restare visibile."); return; }
  const order = exp.views.map((v) => v.id);
  const next = on ? visible.filter((v) => v !== id) : [...visible, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  prefs.set(`mosaicus.visible.${exp.id}`, next);
  set({ visible: next, viewId: on ? (get().viewId === id ? next[0] : get().viewId) : id });
}

// ---------------------------------------------------------------------------
// Dati
// ---------------------------------------------------------------------------
export function recompute() {
  const exp = currentExp();
  if (!exp.parse || !exp.derive) { set({ rows: [], nRaw: raw.length }); return; }
  const { params } = get();
  const parsed = raw.map((f) => exp.parse!(f, params)).filter(Boolean) as Row[];
  set({ rows: exp.derive(parsed, params), nRaw: raw.length });
}

let pending = false;
function scheduleRecompute() {
  if (pending) return;
  pending = true;
  setTimeout(() => { pending = false; recompute(); }, 120);
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
  const e = currentExp();
  return `Simulatore · ${e.title.toLowerCase()}${e.simNote ? ` · ${e.simNote}` : ""}`;
};

export async function connect(kind: "device" | "sim") {
  const exp = currentExp();
  const l = (kind === "sim" ? new SimulatedLink() : exp.source === "phone" ? new PhoneLink() : new SerialLink()) as unknown as Link;
  if (kind === "sim") { l.scenario = exp.sim; l.scopeSignal = simSignal; }
  l.onLine(handleLine);
  l.onClose(() => {
    if (link !== l) return;
    const wasRunning = get().running;
    link = null;
    set({ linkKind: null, ready: false, running: false });
    stopKeepAlive();
    setStatus("Nessun dispositivo", "off");
    instrument?.linkChanged?.();
    if (wasRunning) { toast.warning("Dispositivo scollegato durante la misura: salvo i dati raccolti."); void autosave(); }
  });
  try {
    await l.open();
  } catch (err) {
    const e = err as Error;
    if (e?.name !== "NotFoundError") toast.error(l.kind === "telefono" ? `Sensori non disponibili: ${e.message}` : `Impossibile aprire la porta: ${e.message}`);
    return;
  }
  link = l;
  set({ linkKind: l.kind, ready: false });
  setStatus(kind === "sim" ? "Simulatore: avvio…" : l.kind === "telefono" ? "Telefono: avvio…" : "Arduino: attendo il firmware…", "wait");
  // L'Uno si riavvia quando si apre la porta: diamo tempo al bootloader, poi chiediamo l'identità.
  setTimeout(() => { if (link === l && !get().ready) void l.write("ID?"); }, 2200);
  setTimeout(() => {
    if (link === l && !get().ready) {
      setStatus("Firmware non trovato", "err");
      toast.error("Arduino risponde, ma non con il firmware Mosaicus. Caricalo con l'IDE di Arduino (pulsante «Guida» in alto).", { duration: 8000 });
    }
  }, 5000);
}

export async function disconnect() {
  if (get().running) await stop();
  await link?.close();
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
  const kind = link?.kind;
  if (line.startsWith("#MOSAICUS")) {
    const fw = line.split(",")[1] ?? null;
    set({ ready: true, fw });
    if (kind === "arduino" && fw && cmpVersion(fw, FIRMWARE_VERSION) < 0) {
      toast.warning(`Su Arduino c'è il firmware v${fw}: aggiornalo alla v${FIRMWARE_VERSION} (scaricalo dalla «Guida» e caricalo con l'IDE di Arduino).`, { duration: 10000 });
    }
    setStatus(kind === "simulatore" ? simStatus() : kind === "telefono" ? "Sensori del telefono pronti" : `Arduino pronto · firmware ${fw}`, "on");
    return;
  }
  if (line === "#BT,SETUP") { toast.info("Configuro l'HC-06: nome «Mosaicus», 115200 baud…"); return; }
  if (line === "#ACK,BT,SETUP") {
    toast.success("HC-06 configurato. Ora associa «Mosaicus» nelle impostazioni Bluetooth del telefono (PIN 1234). Se non compare, il LED dell'HC-06 lampeggiava? Riprova con il telefono lontano.", { duration: 12000 });
    return;
  }
  if (line.startsWith("#ERR")) {
    const what = line.slice(5);
    const old = /SCOPE|DHT|GPS|BT/.test(what);
    toast.error(kind === "telefono" ? `Telefono: ${what}`
      : old ? `Il firmware su Arduino è vecchio per questo lab: carica mosaicus_firmware.ino v${FIRMWARE_VERSION} con l'IDE di Arduino.`
        : `Arduino non ha capito il comando: ${what}`, { duration: 8000 });
    if (old && get().running) void stop();
    return;
  }
  if (line.startsWith("#")) return;
  if (instrument?.onLine?.(line)) return;
  if (!get().running) return;
  const exp = currentExp();
  if (line[0] === exp.lineType && line[1] === ",") {
    // un sensore può mancare (es. telefono senza giroscopio): basta che il tempo sia valido
    const f = line.slice(2).split(",").map((v) => (v === "nan" ? NaN : Number(v)));
    if (Number.isFinite(f[0])) { raw.push(f); scheduleRecompute(); }
  }
}

// ---------------------------------------------------------------------------
// Misura
// ---------------------------------------------------------------------------
export async function start() {
  const st = get();
  if (!st.ready || !link) return;
  const exp = currentExp();
  raw = [];
  measureGroup().setSelection(null); measureGroup().fitAll();
  const name = st.sessionName.trim() || `${exp.title} ${new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}`;
  set({ session: { name, created: Date.now(), source: link.kind, fw: st.fw }, sessionName: name, sent: false, running: true, selection: null, dragHint: false });
  recompute();
  if (link.kind === "simulatore") link.scenario = exp.sim;
  if (exp.command) await link.write(exp.command(st.params));
  startKeepAlive();
}

export async function stop() {
  if (!get().running) return;
  set({ running: false });
  stopKeepAlive();
  try {
    await link?.write("STOP");
    // con il GPS acceso la SoftwareSerial può far perdere qualche carattere del comando: lo ripeto
    if (currentExp().lineType === "G") { await new Promise((r) => setTimeout(r, 250)); await link?.write("STOP"); }
  } catch { /* scollegato */ }
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
  } catch { /* non supportato o negato: pazienza */ }
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

/** Configura l'HC-06 (nome e 115200 baud): solo con Arduino collegato via cavo USB. */
export async function bluetoothSetup() {
  if (!link || !get().ready) { toast("Prima collega Arduino con il cavo USB."); return; }
  if (get().running) { toast("Ferma la misura prima di configurare l'HC-06."); return; }
  await link.write("BT,SETUP");
}

function showDragHint() {
  const { rows, selection, running } = get();
  if (!rows.length || selection || running || currentExp().kind) return;
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
    name: st.sessionName.trim() || st.session.name,
    experiment: st.expId, created: st.session.created, source: st.session.source, fw: st.session.fw,
    params: { ...st.params }, raw, app: APP_VERSION,
  };
  try {
    const id = (await repo.save("sessions", rec)).id;
    set({ session: { ...st.session, id: st.session.id ?? id } });
    if (!quiet) toast.success(`Misura salvata nel Quaderno (${raw.length} punti).`);
    await refreshSessions();
  } catch (err) {
    toast.error(`Salvataggio non riuscito: ${(err as Error).message}`);
  }
}

export function setSessionName(name: string) { set({ sessionName: name }); }
export async function commitSessionName() { if (get().session?.id && !get().running) await autosave(true); }

export function zeroPosition() {
  const valid = get().rows.filter((r) => r.ok && Number.isFinite(r.d)).slice(-10).map((r) => r.d as number).sort((a, b) => a - b);
  if (!valid.length) { toast("Nessuna distanza valida da usare come origine."); return; }
  const med = valid[valid.length >> 1];
  setParam("origin", Math.round(med * 1000) / 1000);
  toast.success(`Origine impostata a ${fmtVal(med, 3)} m dal sensore.`);
}

// ---------------------------------------------------------------------------
// Invio a Elaborazione
// ---------------------------------------------------------------------------
export async function sendSelection() {
  const st = get();
  if (st.running) { toast("Ferma la misura prima di salvare un tratto."); return; }
  const exp = currentExp();
  const rows = selectedRows().filter((r) => r.ok !== false);
  if (rows.length < 3) { toast("Il tratto contiene troppo pochi punti validi."); return; }
  if (!get().session?.id) await autosave(true);
  // in Elaborazione vanno solo le grandezze fisiche, non i dati tecnici del sensore; le colonne vuote restano fuori
  const keys = exp.columns.map((c) => c.key).filter((k) => k !== "ok" && !QUANTITIES[k]?.raw && rows.some((r) => Number.isFinite(r[k] as number)));
  const columns = keys.map((k) => ({ key: k, sym: QUANTITIES[k]?.sym ?? k, unit: QUANTITIES[k]?.unit ?? "", name: QUANTITIES[k]?.name ?? k }));
  const view = exp.views.find((v) => v.id === st.viewId);
  const yView = view && !view.raw ? view : exp.views.find((v) => !v.raw)!;
  const t1 = rows[0].t, t2 = rows[rows.length - 1].t;
  const session = get().session;
  await useWorkbench.getState().addBox({
    title: `${exp.title} · ${fmtVal(t1, 2)}–${fmtVal(t2, 2)} s`,
    experiment: exp.id, expTitle: exp.title,
    sessionId: session?.id ?? null, sessionName: st.sessionName.trim() || session?.name || "",
    t1, t2, columns, yKey: keys.includes(yView.key) ? yView.key : keys.find((k) => k !== "t")!, xKey: "t",
    rows: rows.map((r) => Object.fromEntries(keys.map((k) => [k, Number.isFinite(r[k] as number) ? (r[k] as number) : NaN]))),
  });
  set({ sent: true });
  toast.success(`Tratto inviato (${rows.length} punti).`, { duration: 6000, action: { label: "Vai a Elaborazione →", onClick: () => goElab() } });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export type ExportKind = "xlsx" | "csv-it" | "csv" | "png" | "gpx" | "geojson";

/** Punti con una posizione valida, con le grandezze da portare nei file geografici. */
export function trackPoints(rows: Row[]): TrackPoint[] {
  return rows.filter((r) => Number.isFinite(r.lat as number) && Number.isFinite(r.lon as number)).map((r) => ({
    lat: r.lat as number, lon: r.lon as number, ele: r.alt as number, time: r.time as number, t: r.t,
    values: Object.fromEntries(["T", "RH", "Td", "speed", "s", "sats", "hdop"].filter((k) => k in r).map((k) => [k, r[k] as number])),
  }));
}
export async function exportData(kind: ExportKind) {
  const st = get();
  if (!st.rows.length) { toast("Non ci sono dati da esportare."); return; }
  const exp = currentExp();
  const cols = exp.columns;
  const headers = cols.map((c) => c.head);
  const rows = selectedRows().map((r) => cols.map((c) => r[c.key]));
  const part = st.selection ? `_${fmtVal(st.selection[0], 2)}-${fmtVal(st.selection[1], 2)}s`.replace(/,/g, ".") : "";
  const base = `mosaicus_${exp.id}_${stamp(new Date(st.session?.created ?? Date.now()))}${part}`;
  if (kind === "csv-it") return download(toCSV(headers, rows, { it: true }), `${base}_excel.csv`);
  if (kind === "csv") return download(toCSV(headers, rows, { it: false }), `${base}.csv`);
  if (kind === "png") return download(await stackPNG(), `${base}_grafici.png`);
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
    ["Mosaicus", `v${APP_VERSION}`],
    ["Lab", `${exp.title} — ${exp.subtitle}`],
    ["Nome della misura", st.sessionName || st.session?.name || ""],
    ["Data", new Date(st.session?.created ?? Date.now()).toLocaleString("it-IT")],
    ["Sorgente", source === "simulatore" ? "simulatore" : source === "telefono" ? "sensori del telefono" : `Arduino (firmware ${st.session?.fw ?? "?"})`],
    ["Tratto esportato", st.selection ? `${st.selection[0]} s – ${st.selection[1]} s` : "tutta la misura"],
    [],
    ["Parametro", "Valore", "Unità"],
    ...exp.params.map((p) => [p.label, p.type === "select" ? p.options?.find((o) => o[0] === st.params[p.key])?.[1] : st.params[p.key], p.unit || ""]),
  ];
  download(toXLSX([{ name: "Dati", rows: [headers, ...rows] }, { name: "Info", rows: info }]), `${base}.xlsx`);
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
      .map((s) => ({ id: s.id!, name: String(s.name), experiment: String(s.experiment), created: Number(s.created), n: (s.raw as unknown[] | undefined)?.length ?? 0, cloud: !!s.owner, dirty: !!s.dirty }))
      .sort((a, b) => b.created - a.created);
    set({ sessions: list });
  } catch { set({ sessions: [] }); }
}

export async function openSession(id: number) {
  if (get().running) { toast("Ferma la misura prima di aprire una misura del quaderno."); return; }
  const s = (await repo.get("sessions", id)) as (Record<string, never> & { id: number; experiment: string; raw: number[][]; params: Params; name: string; created: number; source: string; fw: string | null }) | undefined;
  if (!s) return;
  showPage("misura");
  selectExperiment(s.experiment, { keepData: true });
  const exp = currentExp();
  raw = s.raw;
  set({
    params: { ...defaultParams(exp), ...s.params },
    session: { id: s.id, name: s.name, created: s.created, source: s.source, fw: s.fw },
    sessionName: s.name, selection: null,
  });
  measureGroup().setSelection(null); measureGroup().fitAll();
  recompute();
  showDragHint();
  toast(`Aperta «${s.name}». Se cambi i parametri, i dati vengono ricalcolati.`);
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
  const exp = byId(st.expId);
  if (!exp || exp.kind || exp.source === "audio") return null;
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
  selectExperiment(initialExp().id);
  await Promise.all([useWorkbench.getState().load(), refreshSessions()]);
  window.addEventListener("beforeunload", (e) => { if (get().running) { e.preventDefault(); e.returnValue = ""; } });
}
