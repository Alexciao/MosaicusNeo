"use client";
// MosaicusNeo — riquadri della pagina Elaborazione.
// Ogni tratto inviato da Misura (o da uno strumento) diventa un "riquadro": i suoi dati,
// gli assi scelti, le colonne calcolate con una formula e le analisi salvate.
// Lo stato vive qui (zustand) e si salva in IndexedDB poco dopo ogni modifica.

import { create } from "zustand";
import { toast } from "sonner";
import * as repo from "@/lib/cloud/repo";
import { compile } from "@/lib/mosaicus/formula.js";
import { toXLSX, download } from "@/lib/mosaicus/export.js";

export interface BoxColumn { key: string; sym: string; unit: string; name?: string }
export interface ComputedColumn { key: string; sym: string; unit: string; formula: string }
export interface Measure { label: string; value: number; sigma: number; unit: string }
export interface Analysis {
  id: number;
  kind: "fit" | "line" | "tangent" | "ruler";
  title: string;
  main: Measure;
  detail: string;
  eq: string;
  xKey: string;
  yKey: string;
  axes: string;
  hidden?: boolean;
  model?: string;
  r2?: number;
  n?: number;
  t1?: number;
  t2?: number;
  params?: { key: string; sym: string; value: number; sigma: number; unit: string }[];
  physics?: Measure[];
  curve?: { x: number[]; y: number[] };
  seg?: { x1: number; y1: number; x2: number; y2: number };
  span?: { x1: number; x2: number };
  spanLabel?: string;
}
export interface Box {
  id: number;
  created: number;
  checked: boolean;
  title: string;
  subtitle?: string;
  experiment: string;
  expTitle: string;
  sessionId: number | null;
  sessionName: string;
  t1: number;
  t2: number;
  tUnit?: string;
  wave?: boolean;
  columns: BoxColumn[];
  computed: ComputedColumn[];
  analyses: Analysis[];
  xKey: string;
  yKey: string;
  rows: Record<string, number>[];
}
export type NewBox = Omit<Box, "id" | "created" | "checked" | "computed" | "analyses"> & Partial<Pick<Box, "computed" | "analyses">>;

/** Righe del riquadro con le colonne calcolate; errors[key] = messaggio se la formula non va. */
export function computeRows(box: Box) {
  const rows = box.rows.map((r) => ({ ...r }));
  const avail = box.columns.map((c) => c.key);
  const errors: Record<string, string> = {};
  for (const c of box.computed) {
    try {
      const { fn } = compile(c.formula, avail);
      for (const r of rows) r[c.key] = fn(r);
    } catch (e) {
      errors[c.key] = (e as Error).message;
      for (const r of rows) r[c.key] = NaN;
    }
    avail.push(c.key);
  }
  return { rows, errors };
}

export const colInfo = (box: Box, key: string): BoxColumn =>
  box.columns.find((c) => c.key === key) || box.computed.find((c) => c.key === key) || { key, sym: key, unit: "" };
export const axisLabel = (c: { sym: string; unit: string }) => (c.unit ? `${c.sym} (${c.unit})` : c.sym);

interface WorkbenchState {
  boxes: Box[];
  loaded: boolean;
  focusId: number | null;
  load: () => Promise<void>;
  addBox: (data: NewBox) => Promise<Box>;
  updateBox: (id: number, patch: Partial<Box> | ((b: Box) => Partial<Box>)) => void;
  removeBox: (id: number) => Promise<void>;
  setAllChecked: (checked: boolean) => void;
  focus: (id: number | null) => void;
}

const timers = new Map<number, ReturnType<typeof setTimeout>>();
function persist(box: Box) {
  clearTimeout(timers.get(box.id));
  timers.set(box.id, setTimeout(() => {
    repo.save("boxes", box as unknown as Record<string, unknown>).catch((e: Error) => toast.error(`Salvataggio non riuscito: ${e.message}`));
  }, 250));
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  boxes: [],
  loaded: false,
  focusId: null,
  async load() {
    let boxes: Box[] = [];
    try { boxes = ((await repo.all("boxes")).filter(repo.visible) as unknown as Box[]).sort((a, b) => a.created - b.created); } catch { boxes = []; }
    set({ boxes, loaded: true });
  },
  async addBox(data) {
    const draft = { created: Date.now(), checked: true, computed: [], analyses: [], ...data };
    const box = (await repo.save("boxes", draft as unknown as Record<string, unknown>)) as unknown as Box;
    set({ boxes: [...get().boxes, box] });
    return box;
  },
  updateBox(id, patch) {
    const boxes = get().boxes.map((b) => {
      if (b.id !== id) return b;
      const next = { ...b, ...(typeof patch === "function" ? patch(b) : patch) };
      persist(next);
      return next;
    });
    set({ boxes });
  },
  async removeBox(id) {
    await repo.remove("boxes", id);
    set({ boxes: get().boxes.filter((b) => b.id !== id) });
  },
  setAllChecked(checked) {
    const boxes = get().boxes.map((b) => {
      const next = { ...b, checked };
      persist(next);
      return next;
    });
    set({ boxes });
  },
  focus(id) { set({ focusId: id }); },
}));

// ---------------------------------------------------------------------------
// Export dei riquadri spuntati: Riepilogo + Analisi + un foglio per riquadro
// ---------------------------------------------------------------------------
function sheetName(title: string, used: Set<string>) {
  const base = String(title).replace(/[[\]:*?/\\]/g, " ").slice(0, 28).trim() || "Riquadro";
  let name = base, k = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${k++}`;
  used.add(name.toLowerCase());
  return name;
}

export function exportCheckedBoxes() {
  const sel = useWorkbench.getState().boxes.filter((b) => b.checked);
  if (!sel.length) return;
  const used = new Set(["riepilogo", "analisi"]);
  const summary: unknown[][] = [["Riquadro", "Foglio", "Lab", "Misura di origine", "Da", "A", "Unità", "Punti", "Note", "Colonne calcolate"]];
  const analyses: unknown[][] = [["Riquadro", "Analisi", "Grafico", "Grandezza", "Valore", "Incertezza σ", "Unità", "Equazione", "Dettagli"]];
  const sheets: { name: string; rows: unknown[][] }[] = [];
  const sig = (s: number) => (Number.isFinite(s) ? s : "");
  for (const b of sel) {
    const name = sheetName(b.title, used);
    const cols = [...b.columns, ...b.computed];
    const { rows } = computeRows(b);
    sheets.push({ name, rows: [cols.map(axisLabel), ...rows.map((r) => cols.map((c) => r[c.key]))] });
    summary.push([b.title, name, b.expTitle, b.sessionName || "", b.t1, b.t2, b.tUnit || "s", b.rows.length, b.subtitle || "", b.computed.map((c) => `${c.sym} = ${c.formula}`).join("; ")]);
    for (const a of b.analyses) {
      analyses.push([b.title, a.title, a.axes, a.main.label, a.main.value, sig(a.main.sigma), a.main.unit, a.eq, a.detail]);
      for (const p of a.physics?.slice(1) || []) analyses.push([b.title, a.title, a.axes, p.label, p.value, sig(p.sigma), p.unit, "", ""]);
      for (const p of a.params || []) analyses.push([b.title, a.title, a.axes, `parametro ${p.sym}`, p.value, sig(p.sigma), p.unit, "", ""]);
    }
  }
  const all = [{ name: "Riepilogo", rows: summary }, ...(analyses.length > 1 ? [{ name: "Analisi", rows: analyses }] : []), ...sheets];
  const d = new Date(), p2 = (n: number) => String(n).padStart(2, "0");
  download(toXLSX(all), `mosaicusneo_elaborazione_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}.xlsx`);
  toast.success(`Esportati ${sel.length} riquadri in un unico file Excel.`);
}
