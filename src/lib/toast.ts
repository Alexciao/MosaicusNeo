// Le notifiche dell'app: Sonner, con i messaggi lunghi divisi in titolo e descrizione.
// «Arduino scollegato durante la misura. I dati raccolti sono stati salvati.» diventa il titolo
// «Arduino scollegato durante la misura» con sotto la descrizione; «Misura salvata · 120 letture»
// lo stesso. Stessa API di `toast` di Sonner: basta importarlo da qui.

import { toast as sonner, type ExternalToast } from "sonner";

type Msg = Parameters<typeof sonner>[0];

function split(msg: Msg, opts?: ExternalToast): [Msg, ExternalToast | undefined] {
  if (typeof msg !== "string" || opts?.description) return [tidy(msg), opts];
  const cuts = [msg.indexOf(". "), msg.indexOf(" · ")].filter((i) => i >= 8);
  if (!cuts.length) return [tidy(msg), opts];
  const i = Math.min(...cuts);
  const sep = msg.startsWith(". ", i) ? 2 : 3;
  const head = msg.slice(0, i), rest = msg.slice(i + sep).trim();
  return [head, { ...opts, description: rest.charAt(0).toUpperCase() + rest.slice(1) }];
}

/** Titolo di una frase sola: senza il punto finale. */
function tidy(msg: Msg): Msg {
  return typeof msg === "string" && msg.endsWith(".") && !msg.endsWith("..") ? msg.slice(0, -1) : msg;
}

const wrap = <F extends (m: Msg, o?: ExternalToast) => string | number>(f: F) =>
  (m: Msg, o?: ExternalToast) => f(...split(m, o));

export const toast = Object.assign(wrap(sonner), {
  success: wrap(sonner.success),
  error: wrap(sonner.error),
  warning: wrap(sonner.warning),
  info: wrap(sonner.info),
  message: wrap(sonner.message),
  loading: wrap(sonner.loading),
  dismiss: sonner.dismiss,
  promise: sonner.promise,
  custom: sonner.custom,
});
