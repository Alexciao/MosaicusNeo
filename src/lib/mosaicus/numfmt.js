// MosaicusNeo — formattazione dei numeri all'italiana, veloce.
//
// Number.prototype.toLocaleString con le opzioni crea un Intl.NumberFormat a ogni chiamata
// (decine di microsecondi): nei grafici, che scrivono centinaia di etichette per fotogramma,
// era la prima causa di scatti. Qui i formattatori si creano una volta e si riusano.

const cache = new Map();

/** Formattatore it-IT con minDigits…maxDigits decimali (memorizzato). */
export function nf(minDigits, maxDigits, locale = 'it-IT') {
  const key = `${locale}|${minDigits}|${maxDigits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
    cache.set(key, f);
  }
  return f;
}

/** Numero con esattamente d decimali. */
export const fixed = (v, d, locale) => nf(d, d, locale).format(v);
/** Numero con al più d decimali. */
export const upTo = (v, d, locale) => nf(0, d, locale).format(v);
