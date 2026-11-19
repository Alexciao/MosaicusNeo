"use client";
// Archivio locale "prima di tutto": le misure (Quaderno) e i riquadri (Elaborazione) vivono in
// IndexedDB, nel browser, e l'app funziona sempre anche senza account e senza rete.
// Ogni record ha qualche dato in più per la sincronizzazione:
//   cloudId  identificativo globale (UUID), lo stesso su tutti i dispositivi
//   owner    l'account a cui appartiene (null = creato senza account su questo dispositivo)
//   updated  ultima modifica (ms): vince la più recente
//   dirty    modificato qui e non ancora salvato nel cloud

import { getRecord, putRecord, deleteRecord, allRecords } from "@/lib/mosaicus/storage.js";

export type Store = "sessions" | "boxes";
export interface SyncMeta { id?: number; cloudId?: string; owner?: string | null; updated?: number; dirty?: boolean }
type Rec = SyncMeta & Record<string, unknown>;

let currentUser: string | null = null;
let onLocalChange: (() => void) | null = null;
let onDelete: ((store: Store, cloudId: string, owner: string) => void) | null = null;

/** Il modulo di sincronizzazione dice chi è collegato e vuole sapere delle modifiche. */
export function bindRepo(opts: { user: string | null; changed?: () => void; deleted?: (store: Store, cloudId: string, owner: string) => void }) {
  currentUser = opts.user;
  if (opts.changed) onLocalChange = opts.changed;
  if (opts.deleted) onDelete = opts.deleted;
}
export const repoUser = () => currentUser;

/** Un record è visibile se è di chi è collegato o se non è di nessuno (creato senza account). */
export const visible = (r: SyncMeta) => !r.owner || r.owner === currentUser;

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

/** Salva (nuovo o esistente) e lo segna da sincronizzare. Restituisce il record com'è stato scritto. */
export async function save<T extends Rec>(store: Store, rec: T): Promise<T & Required<Pick<SyncMeta, "id" | "cloudId">>> {
  const prev = rec.id ? ((await getRecord(store, rec.id)) as Rec | undefined) : undefined;
  const out = {
    ...rec,
    cloudId: rec.cloudId ?? prev?.cloudId ?? uuid(),
    owner: rec.owner ?? prev?.owner ?? currentUser ?? null,
    updated: Date.now(),
    dirty: true,
  } as T & SyncMeta;
  const id = (await putRecord(store, out)) as number;
  out.id = out.id ?? id;
  onLocalChange?.();
  return out as T & Required<Pick<SyncMeta, "id" | "cloudId">>;
}

/** Scrittura "silenziosa" dalla sincronizzazione: niente segno di modifica locale. */
export async function putQuiet(store: Store, rec: Rec) { return (await putRecord(store, rec)) as number; }

export const get = (store: Store, id: number) => getRecord(store, id) as Promise<Rec | undefined>;
export const all = (store: Store) => allRecords(store) as Promise<Rec[]>;

export async function remove(store: Store, id: number) {
  const prev = (await getRecord(store, id)) as Rec | undefined;
  await deleteRecord(store, id);
  // se era già nel cloud, la cancellazione deve arrivare anche agli altri dispositivi
  if (prev?.cloudId && prev.owner) onDelete?.(store, prev.cloudId, prev.owner);
  onLocalChange?.();
}
export const removeQuiet = (store: Store, id: number) => deleteRecord(store, id);
