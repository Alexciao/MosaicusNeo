// MosaicusNeo — stile condiviso dei disegni su canvas.
//
// I grafici leggono colori e dimensioni dalle variabili CSS della radice (--mz-*), così
// seguono il tema chiaro/scuro e la modalità LIM. Qui: il carattere da usare sul canvas
// (quello caricato da next/font, il cui nome di famiglia è generato) e un osservatore che
// avvisa quando cambiano le classi della radice (tema, LIM).

const FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Famiglia del carattere dell'interfaccia, utilizzabile in ctx.font. */
let fontCache = null, scaleCache = null;
export function canvasFont() {
  if (typeof document === 'undefined') return FALLBACK;
  return (fontCache ??= getComputedStyle(document.body).fontFamily || FALLBACK);
}

/** Fattore di scala dei testi: 1 con il carattere di base (16 px), di più in modalità LIM. */
export function rootScale() {
  if (typeof document === 'undefined') return 1;
  return (scaleCache ??= (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16);
}

/** Modalità LIM = anche «prestazioni leggere» (lavagne Android lente con schermi 4K). */
export function lowPower() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('lim');
}
/**
 * Densità di pixel dei canvas: in LIM 1 (su una lavagna 4K con dpr 2 sono 4 volte meno pixel da
 * disegnare, invisibile da lontano); altrove al massimo 2.
 */
export function canvasDpr() {
  if (typeof window === 'undefined') return 1;
  return lowPower() ? 1 : Math.min(window.devicePixelRatio || 1, 2);
}

const listeners = new Set();
let observer = null;

/** Chiama cb quando cambiano tema o modalità LIM. Restituisce la funzione per smettere. */
export function onStyleChange(cb) {
  listeners.add(cb);
  if (!observer && typeof MutationObserver !== 'undefined') {
    // Solo tema e LIM (classi della radice) contano: i menu e le finestre cambiano lo «style»
    // della radice (blocco dello scorrimento) e prima facevano ridimensionare tutti i grafici.
    let last = document.documentElement.className;
    observer = new MutationObserver(() => {
      const now = document.documentElement.className;
      if (now === last) return;
      last = now;
      fontCache = scaleCache = null;
      // un fotogramma dopo: le variabili CSS sono già aggiornate
      requestAnimationFrame(() => listeners.forEach((fn) => fn()));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }
  return () => listeners.delete(cb);
}
