// MosaicusNeo — diagnostica della misura.
// Ogni problema visto durante la misura (sensore senza dati, che non risponde, GPS in ricerca,
// componente rifiutato dalla configurazione…) diventa una voce con quando è comparso, se è ancora
// presente e se si è risolto. Le voci restano dopo «Ferma», per rivederle e sistemare i collegamenti,
// fino alla misura successiva (o finché non si chiudono).

import { create } from "zustand";
import type { LiveIssue } from "./live-status";

export type DiagTone = "error" | "search";

export interface Diag {
  id: string;
  sensorId?: string;
  tone: DiagTone;
  /** il problema, senza il nome del componente */
  text: string;
  /** che cosa controllare */
  hint?: string;
  /** secondi dall'avvio: prima e ultima volta che è stato visto */
  first: number;
  last: number;
  active: boolean;
  /** quante volte è ricomparso dopo essersi risolto */
  repeats: number;
  /** testo quando si è risolto (es. «Posizione trovata») */
  okText?: string;
  /** voce nata prima dell'avvio (configurazione rifiutata) */
  setup?: boolean;
}

interface DiagState {
  items: Diag[];
  /** la misura a cui si riferiscono le voci è finita */
  ended: boolean;
}

export const useDiag = create<DiagState>(() => ({ items: [], ended: false }));
const get = useDiag.getState;
const set = useDiag.setState;

export function diagReset() { set({ items: [], ended: false }); }
export function diagDismiss() { set({ items: [], ended: false }); }

/** Un problema fuori dalla misura (configurazione rifiutata, misura non partita). */
export function diagAdd(d: Omit<Diag, "first" | "last" | "active" | "repeats">) {
  const items = get().items.filter((x) => x.id !== d.id);
  set({ items: [...items, { ...d, first: 0, last: 0, active: true, repeats: 0 }], ended: true });
}

/** Stato attuale dei sensori: aggiorna le voci (nuove, ancora presenti, risolte, ricomparse). */
export function diagUpdate(issues: LiveIssue[], elapsed: number) {
  const prev = get().items;
  const byId = new Map(prev.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const next: Diag[] = prev.map((d) => ({ ...d }));
  const idx = new Map(next.map((d, i) => [d.id, i]));
  for (const i of issues) {
    const id = `${i.sensorId}:${i.kind}`;
    const old = byId.get(id);
    if (i.tone === "ok") {
      // buone notizie: chiudono il problema dello stesso tipo, e ne ricordano l'esito
      if (old) next[idx.get(id)!] = { ...next[idx.get(id)!], okText: i.text, active: false };
      continue;
    }
    seen.add(id);
    if (!old) {
      next.push({ id, sensorId: i.sensorId, tone: i.tone, text: i.text, hint: i.hint, first: elapsed, last: elapsed, active: true, repeats: 0 });
      idx.set(id, next.length - 1);
    } else {
      const d = next[idx.get(id)!];
      next[idx.get(id)!] = { ...d, tone: i.tone, text: i.text, hint: i.hint, last: elapsed, active: true, repeats: d.active ? d.repeats : d.repeats + 1 };
    }
  }
  // non più segnalati: risolti
  for (let k = 0; k < next.length; k++) {
    const d = next[k];
    if (d.active && !d.setup && !seen.has(d.id)) next[k] = { ...d, active: false };
  }
  if (!same(prev, next)) set({ items: next });
}

/** Fine della misura: le voci restano, quelle ancora presenti sono «presenti allo stop». */
export function diagEnd() { set({ ended: true }); }

function same(a: Diag[], b: Diag[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.active !== y.active || x.text !== y.text || x.tone !== y.tone || x.okText !== y.okText || x.repeats !== y.repeats) return false;
    // l'ultima volta visto: basta aggiornarla ogni tanto
    if (Math.floor(x.last) !== Math.floor(y.last)) return false;
  }
  return true;
}
