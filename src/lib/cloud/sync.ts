"use client";
// Account e sincronizzazione con Supabase (facoltativi).
//
// Senza account tutto resta in questo browser. Con un account:
//  • a ogni modifica il record è segnato "dirty" e, poco dopo, salvato nel cloud (push)
//  • all'avvio, quando la scheda torna in primo piano, quando torna la rete e ogni minuto,
//    si scaricano le modifiche fatte dagli altri dispositivi (pull, a partire dall'ultima
//    ora vista sul server); in caso di conflitto vince la modifica più recente
//  • le misure create prima di accedere entrano nell'account
//  • uscendo, i dati dell'account spariscono da questo dispositivo (restano nel cloud)

import { create } from "zustand";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { cloudEnabled, supabase } from "./client";
import { all, bindRepo, get, putQuiet, removeQuiet, type Store } from "./repo";
import { onPrefChange } from "@/lib/prefs";
import { useWorkbench } from "@/lib/workbench-store";
import { refreshSessions, reloadParams } from "@/lib/lab-store";

export type CloudStatus = "off" | "idle" | "syncing" | "offline" | "error";
interface CloudState {
  enabled: boolean;
  ready: boolean;
  user: User | null;
  status: CloudStatus;
  lastSync: number | null;
  error: string | null;
  pending: number;
  recovery: boolean;
}

export const useCloud = create<CloudState>(() => ({
  enabled: cloudEnabled, ready: !cloudEnabled, user: null, status: "off", lastSync: null, error: null, pending: 0, recovery: false,
}));
const get_ = useCloud.getState;
const set = useCloud.setState;
const uid = () => get_().user?.id ?? null;

// ---------------------------------------------------------------------------
// Stato locale della sincronizzazione (per account)
// ---------------------------------------------------------------------------
const LS = {
  read<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } },
  write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* niente */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* niente */ } },
};
const cursorKey = (u: string, t: string) => `mosaicus.cloud.cursor.${u}.${t}`;
const TOMB = "mosaicus.cloud.tombstones";
const SETTINGS_TS = "mosaicus.cloud.settingsUpdated";
interface Tomb { table: Store; id: string; owner: string }

/** Preferenze che seguono l'account (non quelle del singolo dispositivo: tema, LIM, pagina). */
const SYNCED = ["mosaicus.rig", "mosaicus.visible.", "mosaicus.synth", "mosaicus.scope.", "mosaicus.mapKey"];
const isSynced = (k: string) => SYNCED.some((p) => k.startsWith(p));

// ---------------------------------------------------------------------------
// Push: locale → cloud
// ---------------------------------------------------------------------------
const strip = (r: Record<string, unknown>) => {
  const { id: _id, dirty: _d, owner: _o, cloudId: _c, ...data } = r;
  void _id; void _d; void _o; void _c;
  return data;
};

async function pushTable(table: Store, user: string) {
  const sb = supabase()!;
  const recs = (await all(table)).filter((r) => r.dirty && (!r.owner || r.owner === user));
  if (!recs.length) return 0;
  // i riquadri ricordano la misura di origine con il suo identificativo globale
  const sessionCloud = new Map<number, string>();
  if (table === "boxes") for (const s of await all("sessions")) if (s.id && s.cloudId) sessionCloud.set(s.id, s.cloudId);
  for (let i = 0; i < recs.length; i += 10) {
    const chunk = recs.slice(i, i + 10);
    const rows = chunk.map((r) => {
      const data = strip(r);
      if (table === "boxes" && typeof r.sessionId === "number") data.sessionCloudId = sessionCloud.get(r.sessionId) ?? null;
      return { id: r.cloudId!, user_id: user, data, deleted: false };
    });
    const { error } = await sb.from(table).upsert(rows);
    if (error) throw error;
    // segna come salvati solo i record che nel frattempo non sono cambiati
    for (const r of chunk) {
      const now = await get(table, r.id!);
      if (now && now.updated === r.updated) await putQuiet(table, { ...now, dirty: false, owner: user });
      else if (now && !now.owner) await putQuiet(table, { ...now, owner: user });
    }
  }
  return recs.length;
}

async function pushTombstones(user: string) {
  const list = LS.read<Tomb[]>(TOMB, []);
  const mine = list.filter((t) => t.owner === user);
  if (!mine.length) return;
  const sb = supabase()!;
  for (const table of ["sessions", "boxes"] as Store[]) {
    const ids = mine.filter((t) => t.table === table).map((t) => ({ id: t.id, user_id: user, data: {}, deleted: true }));
    if (ids.length) { const { error } = await sb.from(table).upsert(ids); if (error) throw error; }
  }
  LS.write(TOMB, list.filter((t) => t.owner !== user));
}

let settingsDirty = false;
async function pushSettings(user: string) {
  if (!settingsDirty) return;
  const values: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (isSynced(k)) values[k] = LS.read(k, null);
  }
  const updated = LS.read<number>(SETTINGS_TS, Date.now());
  const { error } = await supabase()!.from("settings").upsert({ user_id: user, data: { values, updated } });
  if (error) throw error;
  settingsDirty = false;
}

// ---------------------------------------------------------------------------
// Pull: cloud → locale
// ---------------------------------------------------------------------------
async function pullTable(table: Store, user: string) {
  const sb = supabase()!;
  let cursor = LS.read<string>(cursorKey(user, table), "1970-01-01T00:00:00Z");
  const local = await all(table);
  const byCloud = new Map(local.filter((r) => r.cloudId).map((r) => [r.cloudId!, r]));
  const sessionLocal = new Map<string, number>();
  if (table === "boxes") for (const s of await all("sessions")) if (s.cloudId && s.id) sessionLocal.set(s.cloudId, s.id);
  let changed = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select("id,data,deleted,updated_at").gt("updated_at", cursor).order("updated_at").limit(200);
    if (error) throw error;
    if (!data.length) break;
    for (const row of data as { id: string; data: Record<string, unknown>; deleted: boolean; updated_at: string }[]) {
      cursor = row.updated_at;
      const mine = byCloud.get(row.id);
      if (row.deleted) {
        if (mine?.id) { await removeQuiet(table, mine.id); changed++; }
        continue;
      }
      const remoteUpdated = Number(row.data.updated) || 0;
      if (mine && (mine.updated ?? 0) >= remoteUpdated) continue;          // la copia locale è uguale o più nuova
      const rec: Record<string, unknown> = { ...row.data, cloudId: row.id, owner: user, dirty: false };
      if (table === "boxes") {
        const sc = row.data.sessionCloudId as string | null | undefined;
        rec.sessionId = sc ? sessionLocal.get(sc) ?? null : null;
      }
      if (mine?.id) rec.id = mine.id; else delete rec.id;
      await putQuiet(table, rec);
      changed++;
    }
    LS.write(cursorKey(user, table), cursor);
    if (data.length < 200) break;
  }
  return changed;
}

async function pullSettings(user: string) {
  const { data, error } = await supabase()!.from("settings").select("data").eq("user_id", user).maybeSingle();
  if (error) throw error;
  const remote = data?.data as { values?: Record<string, unknown>; updated?: number } | undefined;
  if (!remote?.values) { settingsDirty = true; return false; }                // primo dispositivo: carico le mie
  const localTs = LS.read<number>(SETTINGS_TS, 0);
  if ((remote.updated ?? 0) <= localTs) { if ((remote.updated ?? 0) < localTs) settingsDirty = true; return false; }
  applying = true;
  for (const [k, v] of Object.entries(remote.values)) if (isSynced(k)) LS.write(k, v);
  applying = false;
  LS.write(SETTINGS_TS, remote.updated);
  return true;
}

// ---------------------------------------------------------------------------
// Ciclo di sincronizzazione
// ---------------------------------------------------------------------------
let running = false, again = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let applying = false;

async function countPending(user: string | null) {
  let n = 0;
  for (const t of ["sessions", "boxes"] as Store[]) n += (await all(t)).filter((r) => r.dirty && (!r.owner || r.owner === user)).length;
  return n;
}

export async function syncNow({ pull = true, quiet = true } = {}) {
  const user = uid();
  if (!user || !supabase()) return;
  if (running) { again = true; return; }
  running = true;
  set({ status: "syncing", error: null });
  try {
    await pushTable("sessions", user);
    await pushTable("boxes", user);
    await pushTombstones(user);
    let refreshed = false;
    if (pull) {
      const s = await pullTable("sessions", user);
      const b = await pullTable("boxes", user);
      const st = await pullSettings(user);
      if (s) await refreshSessions();
      if (b) await useWorkbench.getState().load();
      if (st) reloadParams();
      refreshed = !!(s || b);
    }
    await pushSettings(user);
    set({ status: "idle", lastSync: Date.now(), pending: await countPending(user) });
    if (!quiet && !refreshed) toast.success("Tutto sincronizzato.");
  } catch (e) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    set({ status: offline ? "offline" : "error", error: offline ? null : (e as Error).message, pending: await countPending(user) });
    if (!quiet) toast.error(offline ? "Sei offline: sincronizzo appena torna la rete." : `Sincronizzazione non riuscita: ${(e as Error).message}`);
  } finally {
    running = false;
    if (again) { again = false; void syncNow({ pull: false }); }
  }
}

function schedulePush() {
  if (!uid()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void syncNow({ pull: false }); }, 1500);
  void countPending(uid()).then((pending) => set({ pending }));
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
let started = false;
export function startCloud() {
  if (started) return;
  started = true;
  bindRepo({
    user: null,
    changed: schedulePush,
    deleted: (table, id, owner) => { LS.write(TOMB, [...LS.read<Tomb[]>(TOMB, []), { table, id, owner }]); },
  });
  onPrefChange((k) => {
    if (applying || !isSynced(k)) return;
    LS.write(SETTINGS_TS, Date.now());
    settingsDirty = true;
    schedulePush();
  });
  const sb = supabase();
  if (!sb) return;
  sb.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    const prev = uid();
    set({ user, ready: true, status: user ? get_().status === "off" ? "idle" : get_().status : "off" });
    bindRepo({ user: user?.id ?? null });
    if (event === "PASSWORD_RECOVERY") set({ recovery: true });
    if (user && user.id !== prev) void onSignedIn(user.id);
  });
  setInterval(() => { if (uid() && document.visibilityState === "visible") void syncNow(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && uid()) void syncNow(); });
  window.addEventListener("online", () => { if (uid()) void syncNow(); });
}

/** Dopo l'accesso: le misure create senza account entrano nell'account, poi sincronizzo tutto. */
async function onSignedIn(user: string) {
  let adopted = 0;
  for (const t of ["sessions", "boxes"] as Store[]) {
    for (const r of await all(t)) {
      if (!r.owner) { await putQuiet(t, { ...r, owner: user, dirty: true, updated: r.updated ?? Date.now() }); adopted++; }
    }
  }
  if (adopted) toast.success(`${adopted} ${adopted === 1 ? "elemento creato" : "elementi creati"} su questo dispositivo ${adopted === 1 ? "entra" : "entrano"} nel tuo account.`);
  await Promise.all([refreshSessions(), useWorkbench.getState().load()]);
  await syncNow();
}

const redirect = () => `${window.location.origin}/`;

export async function signIn(email: string, password: string) {
  const { error } = await supabase()!.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authError(error.message));
}
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase()!.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
  if (error) throw new Error(authError(error.message));
  return { needsConfirmation: !data.session };
}
export async function resetPassword(email: string) {
  const { error } = await supabase()!.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  if (error) throw new Error(authError(error.message));
}
export async function updatePassword(password: string) {
  const { error } = await supabase()!.auth.updateUser({ password });
  if (error) throw new Error(authError(error.message));
  set({ recovery: false });
}

/** Uscita: salvo nel cloud le ultime modifiche, poi tolgo i dati dell'account da questo dispositivo. */
export async function signOut({ force = false } = {}) {
  const user = uid();
  if (!user) return { ok: true };
  await syncNow({ pull: false });
  const pending = await countPending(user);
  if (pending && !force) return { ok: false, pending };
  for (const t of ["sessions", "boxes"] as Store[]) {
    for (const r of await all(t)) if (r.owner === user && !r.dirty && r.id) await removeQuiet(t, r.id);
  }
  for (const t of ["sessions", "boxes"]) LS.del(cursorKey(user, t));
  await supabase()!.auth.signOut();
  set({ user: null, status: "off", lastSync: null, pending: 0 });
  bindRepo({ user: null });
  await Promise.all([refreshSessions(), useWorkbench.getState().load()]);
  return { ok: true };
}

function authError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email o password non corretti.";
  if (m.includes("email not confirmed")) return "Prima conferma l'indirizzo email: trovi il link nella posta.";
  if (m.includes("already registered")) return "Esiste già un account con questa email: accedi.";
  if (m.includes("password should be")) return "La password deve avere almeno 6 caratteri.";
  if (m.includes("rate limit")) return "Troppi tentativi: riprova tra qualche minuto.";
  if (m.includes("fetch")) return "Non riesco a raggiungere il server: sei online?";
  return msg;
}
