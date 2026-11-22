"use client";
// Account e sincronizzazione con Supabase (facoltativi).
//
// Senza account tutto resta in questo browser. Con un account:
//  • a ogni modifica il record è segnato "dirty" e, poco dopo, salvato nel cloud (push)
//  • all'avvio, quando la scheda torna in primo piano, quando torna la rete e ogni minuto,
//    si scaricano le modifiche fatte dagli altri dispositivi (pull, a partire dall'ultima
//    ora vista sul server); in caso di conflitto vince la modifica più recente
//  • accedendo, i dati di questo dispositivo e quelli dell'account si uniscono: le misure create
//    prima di accedere entrano nell'account, lab personali e preferenze si uniscono voce per voce
//    (settings-merge.ts); non si cancella mai niente che l'utente non abbia cancellato
//  • uscendo, i dati dell'account spariscono da questo dispositivo (restano nel cloud)

import { create } from "zustand";
import { toast } from "@/lib/toast";
import type { User } from "@supabase/supabase-js";
import { cloudEnabled, supabase } from "./client";
import { all, bindRepo, get, putQuiet, removeQuiet, type Store } from "./repo";
import { onPrefChange } from "@/lib/prefs";
import { useWorkbench } from "@/lib/workbench-store";
import { refreshSessions, reloadParams } from "@/lib/lab-store";
import { t } from "@/i18n";
import { mergeSettings, RIGS_KEY, stable, type SettingsSide } from "./settings-merge";

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
// ore di modifica e lapidi delle singole preferenze e dei singoli lab personali (per l'unione)
const STAMPS = "mosaicus.cloud.stamps";
const GONE = "mosaicus.cloud.gone";
const RIG_STAMPS = "mosaicus.cloud.rigStamps";
const RIGS_GONE = "mosaicus.cloud.rigsGone";
/** com'era ogni lab personale l'ultima volta che l'ho visto: per capire quali sono cambiati */
const RIGS_SEEN = "mosaicus.cloud.rigsSeen";
interface Tomb { table: Store; id: string; owner: string }

/** Preferenze che seguono l'account (non quelle del singolo dispositivo: tema, LIM, pagina). */
const SYNCED = ["mosaicus.rig", "mosaicus.visible.", "mosaicus.synth", "mosaicus.scope.", "mosaicus.mapKey", "mosaicus.sd."];
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
  let changed = 0, added = 0;
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
      if (!mine) added++;
    }
    LS.write(cursorKey(user, table), cursor);
    if (data.length < 200) break;
  }
  return { changed, added };
}

type Stamps = Record<string, number>;
interface RemoteSettings { values?: Record<string, unknown>; updated?: number; stamps?: Stamps; gone?: Stamps; rigStamps?: Stamps; rigsGone?: Stamps }

function localSettings(): SettingsSide {
  const values: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (isSynced(k)) values[k] = LS.read(k, null);
  }
  return {
    values, fallback: LS.read<number>(SETTINGS_TS, 0),
    stamps: LS.read<Stamps>(STAMPS, {}), gone: LS.read<Stamps>(GONE, {}),
    rigStamps: LS.read<Stamps>(RIG_STAMPS, {}), rigsGone: LS.read<Stamps>(RIGS_GONE, {}),
  };
}

const rigsSeen = (list: unknown) =>
  Object.fromEntries((Array.isArray(list) ? list : []).filter((r) => r && typeof r.id === "string").map((r) => [r.id as string, stable(r)]));

/** Una preferenza sincronizzata è cambiata qui: ne segno l'ora (e, per i lab, quali sono cambiati). */
function stampPref(k: string, now: number) {
  const stamps = LS.read<Stamps>(STAMPS, {}), gone = LS.read<Stamps>(GONE, {});
  let present = false;
  try { present = localStorage.getItem(k) !== null; } catch { /* niente */ }
  if (present) { stamps[k] = now; delete gone[k]; } else { gone[k] = now; delete stamps[k]; }
  LS.write(STAMPS, stamps); LS.write(GONE, gone);
  if (k !== RIGS_KEY) return;
  const list = LS.read<unknown>(RIGS_KEY, []);
  const seen = LS.read<Record<string, string>>(RIGS_SEEN, {}), next = rigsSeen(list);
  const rs = LS.read<Stamps>(RIG_STAMPS, {}), rg = LS.read<Stamps>(RIGS_GONE, {});
  for (const [id, json] of Object.entries(next)) if (seen[id] !== json) { rs[id] = now; delete rg[id]; }
  for (const id of Object.keys(seen)) if (!(id in next)) { rg[id] = now; delete rs[id]; }
  LS.write(RIG_STAMPS, rs); LS.write(RIGS_GONE, rg); LS.write(RIGS_SEEN, next);
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/**
 * Preferenze: unisco quelle di questo dispositivo con quelle del cloud (voce per voce, vedi
 * settings-merge.ts), scrivo qui quello che manca e carico nel cloud l'unione se è diversa.
 */
async function syncSettings(user: string, pull: boolean) {
  if (!pull && !settingsDirty) return null;
  const sb = supabase()!;
  const { data, error } = await sb.from("settings").select("data").eq("user_id", user).maybeSingle();
  if (error) throw error;
  const remote = (data?.data ?? {}) as RemoteSettings;
  const local = localSettings();
  const m = mergeSettings(local, {
    values: remote.values ?? {}, fallback: remote.updated ?? 0,
    stamps: remote.stamps, gone: remote.gone, rigStamps: remote.rigStamps, rigsGone: remote.rigsGone,
  });
  // qui: scrivo solo le voci cambiate
  let localChanged = false;
  applying = true;
  try {
    for (const [k, v] of Object.entries(m.values)) if (!(k in local.values) || !same(local.values[k], v)) { LS.write(k, v); localChanged = true; }
    for (const k of Object.keys(local.values)) if (!(k in m.values)) { LS.del(k); localChanged = true; }
  } finally { applying = false; }
  LS.write(STAMPS, m.stamps); LS.write(GONE, m.gone);
  LS.write(RIG_STAMPS, m.rigStamps); LS.write(RIGS_GONE, m.rigsGone);
  LS.write(RIGS_SEEN, rigsSeen(m.values[RIGS_KEY]));
  const updated = Math.max(local.fallback, remote.updated ?? 0);
  LS.write(SETTINGS_TS, updated);
  // nel cloud: carico l'unione se è diversa da quella che c'è
  const next: RemoteSettings = { values: m.values, updated, stamps: m.stamps, gone: m.gone, rigStamps: m.rigStamps, rigsGone: m.rigsGone };
  settingsDirty = false;
  if (!data || !same({ ...remote, updated: 0 }, { ...next, updated: 0 }) || remote.updated !== updated) {
    const { error: e } = await sb.from("settings").upsert({ user_id: user, data: next });
    if (e) { settingsDirty = true; throw e; }
  }
  return { localChanged, fromLocal: m.fromLocal, fromRemote: m.fromRemote };
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

export interface SyncResult { pushed: number; added: number; fromLocal: number; fromRemote: number }

export async function syncNow({ pull = true, quiet = true } = {}): Promise<SyncResult | null> {
  const user = uid();
  if (!user || !supabase()) return null;
  if (running) { again = true; return null; }
  running = true;
  set({ status: "syncing", error: null });
  try {
    const pushed = (await pushTable("sessions", user)) + (await pushTable("boxes", user));
    await pushTombstones(user);
    let refreshed = false, added = 0;
    if (pull) {
      const s = await pullTable("sessions", user);
      const b = await pullTable("boxes", user);
      if (s.changed) await refreshSessions();
      if (b.changed) await useWorkbench.getState().load();
      refreshed = !!(s.changed || b.changed);
      added = s.added + b.added;
    }
    const st = await syncSettings(user, pull);
    if (st?.localChanged) reloadParams();
    set({ status: "idle", lastSync: Date.now(), pending: await countPending(user) });
    if (!quiet && !refreshed) toast.success(t("lab.cloud.synced"));
    return { pushed, added, fromLocal: st?.fromLocal ?? 0, fromRemote: st?.fromRemote ?? 0 };
  } catch (e) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    set({ status: offline ? "offline" : "error", error: offline ? null : (e as Error).message, pending: await countPending(user) });
    if (!quiet) toast.error(offline ? t("lab.cloud.offline") : t("lab.cloud.syncFailed", { msg: (e as Error).message }));
    return null;
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
  // la prima volta: i lab personali di adesso sono il punto di partenza per capire cosa cambia
  if (LS.read<Record<string, string> | null>(RIGS_SEEN, null) == null) LS.write(RIGS_SEEN, rigsSeen(LS.read<unknown>(RIGS_KEY, [])));
  onPrefChange((k) => {
    if (applying || !isSynced(k)) return;
    const now = Date.now();
    LS.write(SETTINGS_TS, now);
    stampPref(k, now);
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
    // SIGNED_IN = accesso appena fatto (all'apertura della pagina con la sessione già attiva arriva INITIAL_SESSION)
    if (user && user.id !== prev) void onSignedIn(user.id, event === "SIGNED_IN");
  });
  setInterval(() => { if (uid() && document.visibilityState === "visible") void syncNow(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && uid()) void syncNow(); });
  window.addEventListener("online", () => { if (uid()) void syncNow(); });
}

/**
 * Dopo l'accesso: i dati di questo dispositivo e quelli dell'account si uniscono. Le misure e i
 * riquadri creati senza account entrano nell'account; lab personali e preferenze si uniscono voce
 * per voce. Niente viene sovrascritto per intero e niente viene cancellato. Un avviso lo conferma,
 * ma solo se le due parti erano davvero diverse: altrimenti la sincronizzazione è silenziosa.
 */
async function onSignedIn(user: string, announce: boolean) {
  let adopted = 0;
  for (const t of ["sessions", "boxes"] as Store[]) {
    for (const r of await all(t)) {
      if (!r.owner) { await putQuiet(t, { ...r, owner: user, dirty: true, updated: r.updated ?? Date.now() }); adopted++; }
    }
  }
  // tutte le preferenze passano dall'unione, anche se qui non sono cambiate di recente
  settingsDirty = true;
  await Promise.all([refreshSessions(), useWorkbench.getState().load()]);
  while (running) await new Promise((r) => setTimeout(r, 100));       // aspetto una sincronizzazione già in corso
  const res = await syncNow();
  if (!announce && !adopted) return;
  if (!res) {
    // non raggiungo il cloud: i dati restano qui e si uniranno alla prossima sincronizzazione
    toast(t("lab.cloud.mergeLater"));
    return;
  }
  const local = adopted + res.fromLocal, remote = res.added + res.fromRemote;
  // dati uguali da tutte e due le parti: la sincronizzazione resta silenziosa
  if (!local && !remote) return;
  toast.success(t("lab.cloud.merged", { local, remote }));
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

/**
 * Cancellazione dell'account (GDPR, art. 17): il server elimina subito account, misure, riquadri e
 * preferenze (funzione delete_account, migrazione 20261119130000). Poi tolgo da questo dispositivo
 * tutte le copie dell'account, anche le modifiche non ancora sincronizzate: l'account non esiste più.
 */
export async function deleteAccount() {
  const sb = supabase()!;
  const user = uid();
  if (!user) return;
  const { error } = await sb.rpc("delete_account");
  if (error) {
    const missing = error.code === "PGRST202" || /could not find the function|does not exist/i.test(error.message);
    throw new Error(missing
      ? t("lab.cloud.deleteUnavailable")
      : authError(error.message));
  }
  for (const t of ["sessions", "boxes"] as Store[]) {
    for (const r of await all(t)) if (r.owner === user && r.id) await removeQuiet(t, r.id);
  }
  for (const t of ["sessions", "boxes"]) LS.del(cursorKey(user, t));
  LS.write(TOMB, LS.read<{ owner: string }[]>(TOMB, []).filter((t) => t.owner !== user));
  // l'utente non esiste più sul server: basta chiudere la sessione su questo dispositivo
  await sb.auth.signOut({ scope: "local" }).catch(() => {});
  set({ user: null, status: "off", lastSync: null, pending: 0 });
  bindRepo({ user: null });
  await Promise.all([refreshSessions(), useWorkbench.getState().load()]);
}

function authError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return t("lab.cloud.auth.invalidLogin");
  if (m.includes("email not confirmed")) return t("lab.cloud.auth.emailNotConfirmed");
  if (m.includes("already registered")) return t("lab.cloud.auth.alreadyRegistered");
  if (m.includes("password should be")) return t("lab.cloud.auth.passwordShort");
  if (m.includes("rate limit")) return t("lab.cloud.auth.rateLimit");
  if (m.includes("fetch")) return t("lab.cloud.auth.unreachable");
  return msg;
}
