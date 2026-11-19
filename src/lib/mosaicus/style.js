// Mosaicus — stile condiviso dei disegni su canvas.
//
// I grafici leggono colori e dimensioni dalle variabili CSS della radice (--mz-*), così
// seguono il tema chiaro/scuro e la modalità LIM. Qui: il carattere da usare sul canvas
// (quello caricato da next/font, il cui nome di famiglia è generato) e un osservatore che
// avvisa quando cambiano le classi della radice (tema, LIM).

const FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Famiglia del carattere dell'interfaccia, utilizzabile in ctx.font. */
export function canvasFont() {
  if (typeof document === 'undefined') return FALLBACK;
  return getComputedStyle(document.body).fontFamily || FALLBACK;
}

/** Fattore di scala dei testi: 1 con il carattere di base (16 px), di più in modalità LIM. */
export function rootScale() {
  if (typeof document === 'undefined') return 1;
  return (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
}

const listeners = new Set();
let observer = null;

/** Chiama cb quando cambiano tema o modalità LIM. Restituisce la funzione per smettere. */
export function onStyleChange(cb) {
  listeners.add(cb);
  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      // un fotogramma dopo: le variabili CSS sono già aggiornate
      requestAnimationFrame(() => listeners.forEach((fn) => fn()));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  }
  return () => listeners.delete(cb);
}
