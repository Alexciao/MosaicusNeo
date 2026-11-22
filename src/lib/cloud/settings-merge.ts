// Unione delle preferenze sincronizzate (questo dispositivo + cloud), senza perdere niente.
//
// Prima le preferenze erano un blocco unico e vinceva il più recente: accedendo da un browser con
// dei lab personali, quelli dell'account (o quelli del browser) sparivano. Ora:
//  • ogni preferenza ha la sua ora di modifica: vince la più recente, chiave per chiave
//  • i lab personali (mosaicus.rigs) si uniscono lab per lab: quelli presenti da una parte sola
//    restano, per quelli presenti da tutte e due vince la versione modificata per ultima
//  • si toglie qualcosa solo se l'utente l'ha cancellato (lapide) dopo l'ultima modifica
//  • le schede SD ricordate (mosaicus.sd.ids) sono l'unione delle due liste
// Senza ore (dati salvati da versioni precedenti) vale l'ora dell'ultima modifica del blocco.

export const RIGS_KEY = "mosaicus.rigs";
export const SD_IDS_KEY = "mosaicus.sd.ids";
const sdKey = (id: string) => `mosaicus.sd.${id}`;
/** Le lapidi più vecchie di così non servono più (tutti i dispositivi le hanno viste). */
const TOMB_TTL = 365 * 24 * 3600 * 1000;

type Stamps = Record<string, number>;
export interface SettingsSide {
  values: Record<string, unknown>;
  stamps?: Stamps;
  gone?: Stamps;
  rigStamps?: Stamps;
  rigsGone?: Stamps;
  /** ora da usare quando manca quella della singola voce */
  fallback: number;
}
export interface MergedSettings {
  values: Record<string, unknown>;
  stamps: Stamps;
  gone: Stamps;
  rigStamps: Stamps;
  rigsGone: Stamps;
  /** voci (lab personali, preferenze) che c'erano solo su questo dispositivo, o più recenti qui */
  fromLocal: number;
  /** voci che c'erano solo nel cloud, o più recenti nel cloud */
  fromRemote: number;
}

type RigLike = { id: string } & Record<string, unknown>;
const rigList = (v: unknown): RigLike[] =>
  Array.isArray(v) ? v.filter((r): r is RigLike => !!r && typeof r === "object" && typeof (r as RigLike).id === "string") : [];

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** JSON con le chiavi in ordine: il cloud (jsonb) non conserva l'ordine delle chiavi. */
export const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v) ?? "null";
const differs = (a: unknown, b: unknown) => stable(a) !== stable(b);

export function mergeSettings(L: SettingsSide, R: SettingsSide, now = Date.now()): MergedSettings {
  const out: MergedSettings = { values: {}, stamps: {}, gone: {}, rigStamps: {}, rigsGone: {}, fromLocal: 0, fromRemote: 0 };
  const ls = L.stamps ?? {}, rs = R.stamps ?? {}, lg = L.gone ?? {}, rg = R.gone ?? {};

  // --- preferenze semplici: la modifica più recente, chiave per chiave
  const keys = new Set([...Object.keys(L.values), ...Object.keys(R.values), ...Object.keys(lg), ...Object.keys(rg)]);
  keys.delete(RIGS_KEY);
  keys.delete(SD_IDS_KEY);
  for (const k of keys) {
    const inL = has(L.values, k), inR = has(R.values, k);
    const lt = inL ? ls[k] ?? L.fallback : -1;
    const rt = inR ? rs[k] ?? R.fallback : -1;
    const goneAt = Math.max(lg[k] ?? -1, rg[k] ?? -1);
    const stamp = Math.max(lt, rt);
    if ((inL || inR) && stamp >= goneAt) {
      out.values[k] = lt >= rt ? L.values[k] : R.values[k];
      out.stamps[k] = stamp;
      if (inL && !inR) out.fromLocal++;
      else if (inR && !inL) out.fromRemote++;
      else if (differs(L.values[k], R.values[k])) { if (lt >= rt) out.fromLocal++; else out.fromRemote++; }
    } else if (goneAt >= 0 && now - goneAt < TOMB_TTL) {
      out.gone[k] = goneAt;
    }
  }

  // --- lab personali: unione lab per lab
  const lRigs = rigList(L.values[RIGS_KEY]), rRigs = rigList(R.values[RIGS_KEY]);
  const lMap = new Map(lRigs.map((r) => [r.id, r])), rMap = new Map(rRigs.map((r) => [r.id, r]));
  const lrs = L.rigStamps ?? {}, rrs = R.rigStamps ?? {}, lrg = L.rigsGone ?? {}, rrg = R.rigsGone ?? {};
  const ids = [...new Set([...lRigs.map((r) => r.id), ...rRigs.map((r) => r.id)])];
  const rigs: RigLike[] = [];
  for (const id of ids) {
    const l = lMap.get(id), r = rMap.get(id);
    const lt = l ? lrs[id] ?? L.fallback : -1;
    const rt = r ? rrs[id] ?? R.fallback : -1;
    const stamp = Math.max(lt, rt);
    const goneAt = Math.max(lrg[id] ?? -1, rrg[id] ?? -1);
    if (goneAt > stamp) continue;                     // cancellato dall'utente dopo l'ultima modifica
    rigs.push((lt >= rt ? l : r)!);
    out.rigStamps[id] = stamp;
    if (l && !r) out.fromLocal++;
    else if (r && !l) out.fromRemote++;
    else if (differs(l, r)) { if (lt >= rt) out.fromLocal++; else out.fromRemote++; }
  }
  for (const id of new Set([...Object.keys(lrg), ...Object.keys(rrg)])) {
    if (has(out.rigStamps, id)) continue;
    const goneAt = Math.max(lrg[id] ?? -1, rrg[id] ?? -1);
    if (now - goneAt < TOMB_TTL) out.rigsGone[id] = goneAt;
  }
  if (rigs.length || has(L.values, RIGS_KEY) || has(R.values, RIGS_KEY)) {
    out.values[RIGS_KEY] = rigs;
    out.stamps[RIGS_KEY] = Math.max(ls[RIGS_KEY] ?? L.fallback, rs[RIGS_KEY] ?? R.fallback);
  }

  // --- schede SD: l'unione, dalla più recente, solo quelle di cui c'è ancora l'istantanea
  if (has(L.values, SD_IDS_KEY) || has(R.values, SD_IDS_KEY)) {
    const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const at = (id: string) => Number((out.values[sdKey(id)] as { at?: number } | null)?.at) || 0;
    const sd = [...new Set([...strs(L.values[SD_IDS_KEY]), ...strs(R.values[SD_IDS_KEY])])]
      .filter((id) => out.values[sdKey(id)] != null)
      .sort((a, b) => at(b) - at(a));
    out.values[SD_IDS_KEY] = sd;
    out.stamps[SD_IDS_KEY] = Math.max(ls[SD_IDS_KEY] ?? L.fallback, rs[SD_IDS_KEY] ?? R.fallback);
  }
  return out;
}
