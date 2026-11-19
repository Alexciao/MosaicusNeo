// Preferenze locali (localStorage): piccole comodità per chi usa questo browser.
type PrefListener = (key: string) => void;
const listeners = new Set<PrefListener>();
/** Avvisa quando cambia una preferenza (per la sincronizzazione delle impostazioni). */
export function onPrefChange(fn: PrefListener) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage non disponibile */
    }
    listeners.forEach((fn) => fn(key));
  },
};

export const fmtVal = (v: number, digits: number) =>
  Number.isFinite(v) ? v.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";

export const fmtNum = (v: number, d = 3) =>
  Number.isFinite(v) ? v.toLocaleString("it-IT", { maximumFractionDigits: d }) : "—";

export const fmtCell = (v: unknown) =>
  typeof v === "boolean" ? (v ? "✓" : "✗") : typeof v === "number" && Number.isFinite(v) ? (+v.toPrecision(6)).toLocaleString("it-IT", { maximumFractionDigits: 6 }) : "—";

export const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
};

export const isPhoneWidth = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
