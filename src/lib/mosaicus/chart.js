// MosaicusNeo — grafici su <canvas>, senza librerie esterne.
//
// ChartGroup collega più grafici impilati che condividono l'asse dei tempi:
// stesso intervallo visibile (zoom), stessa selezione, stesso mirino.
// Interazioni: trascinare = selezionare un intervallo · doppio clic = annullare
// la selezione · pizzico sul trackpad / due dita sulla LIM / Ctrl+rotella = zoom
// · scorrimento orizzontale o due dita = spostarsi lungo il tempo.
//
// Strumenti (pagina Elaborazione): con chart.tool = 'pick' un clic sceglie il punto
// misurato più vicino (onPick) e i punti già scelti si possono trascinare (onAnchorMove),
// sempre agganciati ai dati. chart.overlays disegna rette, triangoli Δy/Δx, punti, curve.

// margini: in alto la riga del titolo dell'asse verticale (orizzontale, non ruotato),
// in basso le tacche e il titolo dell'asse dei tempi
const PAD = { l: 40, r: 16, t: 26, b: 40 };
const PAD_COMPACT_B = 8;
const MARK_MAX = 200;      // oltre tanti punti visibili, nelle serie «linea + punti» restano solo le linee
import { canvasFont, rootScale, onStyleChange, canvasDpr, lowPower } from './style.js';
import { fixed, upTo } from './numfmt.js';

// =====================================================================
export class ChartGroup {
  /** @param {{ onSelect?: (sel: [number, number] | null) => void, onActivate?: (chart: any) => void, includeZero?: boolean }} [opts] */
  constructor({ onSelect, onActivate, includeZero = true } = {}) {
    this.charts = [];
    this.includeZero = includeZero;
    this.xRange = null;     // null = adatta ai dati
    this.selection = null;  // [t1, t2]
    this.hoverT = null;
    this.onSelect = onSelect;
    this.onActivate = onActivate;
    this._dead = false;
    this._raf = 0;
    // Disegno su richiesta: un fotogramma si chiede solo quando qualcosa è cambiato
    // (prima ogni gruppo girava a 60 fps anche da fermo o nascosto).
    this._frame = () => {
      this._raf = 0;
      if (this._dead) return;
      for (const c of this.charts) if (c._dirty) c.draw();
    };
    this._offStyle = onStyleChange(() => this.refreshStyle());
  }
  add(chart) { this.charts.push(chart); chart.group = this; this._ext = null; chart.invalidate(); return chart; }
  remove(chart) { chart.destroy(); this.charts = this.charts.filter((c) => c !== chart); this.invalidate(); }
  clear() { for (const c of this.charts) c.destroy(); this.charts = []; this._ext = null; }
  /** Ferma il ciclo di disegno: da chiamare quando il gruppo non serve più. */
  destroy() { this.clear(); this._dead = true; if (this._raf) cancelAnimationFrame(this._raf); this._offStyle?.(); }
  /** Chiede un fotogramma (uno solo, anche se lo chiedono più grafici). */
  schedule() { if (!this._raf && !this._dead) this._raf = requestAnimationFrame(this._frame); }
  invalidate() { for (const c of this.charts) c.invalidate(); }
  refreshStyle() { for (const c of this.charts) c.refreshStyle(); }

  /** Estensione dei tempi di tutti i dati (con lo 0 incluso, come in partenza). */
  dataExtent() {
    if (this._ext) return this._ext;
    return (this._ext = this._computeExtent());
  }
  _computeExtent() {
    let x0 = Infinity, x1 = -Infinity;
    for (const c of this.charts) for (const s of c.series) for (const x of s.x) {
      if (isFinite(x)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    if (!isFinite(x0)) return [0, 10];
    if (this.includeZero) x0 = Math.min(0, x0);
    if (x1 - x0 < 1e-9) x1 = x0 + 1;
    return [x0, x1];
  }
  currentRange() { return this.xRange ?? this.dataExtent(); }

  setRange(a, b) {
    const [d0, d1] = this.dataExtent();
    const span = d1 - d0;
    let w = b - a;
    if (w >= span * 1.001) { this.xRange = null; this.invalidate(); return; }
    w = Math.max(w, span * 1e-4, 1e-6);
    // non uscire dai dati
    if (a < d0) { a = d0; } if (a + w > d1) { a = d1 - w; }
    this.xRange = [a, a + w];
    this.invalidate();
  }
  zoomAt(t, factor) {
    const [a, b] = this.currentRange();
    const f = (t - a) / (b - a);
    const w = (b - a) * factor;
    this.setRange(t - f * w, t - f * w + w);
  }
  zoomCenter(factor) { const [a, b] = this.currentRange(); this.zoomAt((a + b) / 2, factor); }
  pan(dt) { const [a, b] = this.currentRange(); this.setRange(a + dt, b + dt); }
  fitAll() { this.xRange = null; this.invalidate(); }
  zoomToSelection() {
    if (!this.selection) return false;
    const [a, b] = this.selection, m = (b - a) * 0.05;
    this.setRange(a - m, b + m);
    return true;
  }
  setSelection(sel, notify = false) {
    this.selection = sel; this.invalidate();
    if (notify && this.onSelect) this.onSelect(sel);
  }
  setHover(t) {
    if (t === this.hoverT) return;
    this.hoverT = t;
    for (const c of this.charts) c.invalidateHover();
  }
}

// =====================================================================
export class Chart {
  constructor(canvas, { compact = false } = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.compact = compact;     // grafico intermedio della pila: niente etichette dell'asse t
    this.series = [];
    this.fit = null;
    this.xLabel = '';
    this.yLabel = '';
    this.group = null;
    this.active = true;      // grafico attivo della pila: titolo in inchiostro, gli altri attenuati
    this.overlays = [];      // disegni sopra i dati: segment, triangle, anchor, curve
    this.tool = 'select';    // 'select' | 'pick'
    this.onPick = null;      // (indice del punto) => void
    this.onAnchorMove = null;// (id dell'ancora, indice del punto) => void   — ancore agganciate ai dati
    this.onAnchorDrag = null;// (id dell'ancora, x, y) => void               — ancore libere (free: true)
    this.onClickXY = null;   // (x, y) => void: clic sul grafico in coordinate dei dati (se definito, sostituisce onPick)
    this.hover = null;
    this._drag = null;
    this._pointers = new Map();
    this._pinch = null;
    this._bounds = null;
    this._dirty = true;
    this._css = getComputedStyle(document.documentElement);
    this._colors = new Map();
    this._base = document.createElement('canvas');   // dati, griglia, etichette: ridisegnati solo se cambiano
    this._bctx = this._base.getContext('2d');
    this._baseDirty = true;
    this.refreshStyle(false);

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas);
    this._handlers = [
      ['pointerdown', (e) => this._down(e)],
      ['pointermove', (e) => this._move(e)],
      ['pointerup', (e) => this._up(e)],
      ['pointercancel', (e) => this._up(e)],
      ['pointerleave', () => { this.hover = null; this.group?.setHover(null); }],
      ['dblclick', () => { if (this.tool === 'select') this.group?.setSelection(null, true); }],
      ['wheel', (e) => this._wheel(e)],
    ];
    for (const [type, fn] of this._handlers) canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
    this.resize();
    document.fonts?.ready.then(() => this.invalidate()); // ridisegna quando il font è pronto
  }

  destroy() {
    this._ro.disconnect(); this._dead = true;
    for (const [type, fn] of this._handlers) this.c.removeEventListener(type, fn);
  }

  /** Scala testi e margini con la dimensione del font della radice (modalità LIM). */
  refreshStyle(redraw = true) {
    const k = rootScale();
    this.k = k;
    this.lite = lowPower();   // LIM: punti quadrati (molto più veloci dei cerchi)
    this._colors?.clear();
    this.pad = { l: PAD.l * k, r: PAD.r * k, t: PAD.t * k, b: (this.compact ? PAD_COMPACT_B : PAD.b) * k };
    if (redraw) this.resize();
  }

  color(name) {
    let v = this._colors.get(name);
    if (v === undefined) { v = this._css.getPropertyValue(name).trim() || '#333'; this._colors.set(name, v); }
    return v;
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = canvasDpr();
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    // anche lo strato di base: un grafico nuovo su una tela già misurata (cambio di lab o di grafici)
    // ha il buffer ancora a 300×150
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    if (this._base.width !== W || this._base.height !== H) { this._base.width = W; this._base.height = H; }
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.invalidate();
  }

  invalidate() { if (!this._dead) { this._dirty = true; this._baseDirty = true; this.group?.schedule(); } }
  invalidateHover() { if (!this._dead) { this._dirty = true; this.group?.schedule(); } }

  setData({ series, xLabel, yLabel }) {
    this.series = series; this.xLabel = xLabel; this.yLabel = yLabel;
    if (this.group) { this.group._ext = null; this.group.invalidate(); } else this.invalidate();
  }
  setFit(fit) { this.fit = fit; this.invalidate(); }
  setActive(on) { if (this.active !== on) { this.active = on; this.invalidate(); } }
  setOverlays(list) { this.overlays = list || []; this.invalidate(); }

  /** Indice del punto della prima serie più vicino (in pixel) a (px, py). */
  nearestIndex(px, py, maxDist = Infinity) {
    const s = this.series[0]; if (!s || !this._bounds) return -1;
    let best = -1, bd = maxDist * maxDist;
    for (let i = 0; i < s.x.length; i++) {
      if (!isFinite(s.x[i]) || !isFinite(s.y[i])) continue;
      const dx = this.sx(s.x[i]) - px, dy = this.sy(s.y[i]) - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---------- geometria ----------
  computeBounds() {
    const [x0, x1] = this.group ? this.group.currentRange() : [0, 1];
    let y0 = Infinity, y1 = -Infinity;
    for (const s of this.series) {
      for (let i = 0; i < s.x.length; i++) {
        const x = s.x[i], y = s.y[i];
        if (!isFinite(x) || !isFinite(y) || x < x0 || x > x1) continue;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!isFinite(y0)) { y0 = 0; y1 = 1; }
    if (y1 - y0 < 1e-9) { const m = Math.abs(y0) * 0.05 || 0.5; y0 -= m; y1 += m; }
    const py = (y1 - y0) * 0.08;
    return { x0, x1, y0: y0 - py, y1: y1 + py };
  }
  plotW() { return this.w - this.pad.l - this.pad.r; }
  plotH() { return this.h - this.pad.t - this.pad.b; }
  sx(x) { const b = this._bounds; return this.pad.l + ((x - b.x0) / (b.x1 - b.x0)) * this.plotW(); }
  sy(y) { const b = this._bounds; return this.h - this.pad.b - ((y - b.y0) / (b.y1 - b.y0)) * this.plotH(); }
  ix(px) { const b = this._bounds; return b.x0 + ((px - this.pad.l) / this.plotW()) * (b.x1 - b.x0); }
  iy(py) { const b = this._bounds; return b.y0 + ((this.h - this.pad.b - py) / this.plotH()) * (b.y1 - b.y0); }
  /** Passo della griglia (in unità dei dati) sui due assi, come disegnata. */
  gridSteps() {
    const b = this._bounds;
    return { x: niceTicks(b.x0, b.x1, this._xTickTarget()).step, y: niceTicks(b.y0, b.y1, this._yTickTarget()).step };
  }
  /** Quante tacche cercare sui due assi: da 3 a 6 in verticale, una ogni ~80 px in orizzontale. */
  _yTickTarget() { return Math.min(6, Math.max(3, Math.floor(this.plotH() / (34 * this.k)))); }
  _xTickTarget() { return Math.max(3, Math.floor(this.plotW() / (80 * this.k))); }

  // ---------- disegno ----------
  draw() {
    this._dirty = false;
    if (this._dead || !this.w) return;
    if (this._baseDirty) { this._baseDirty = false; this._drawBase(); }
    const g = this.ctx, dpr = this.dpr, k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'copy';
    g.drawImage(this._base, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawHover(g, k);
  }

  /** Strato di base: sfondo, selezione, griglia, etichette, dati, fit, disegni. */
  _drawBase() {
    const g = this._bctx, dpr = this.dpr, k = this.k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = this.color('--mz-chart-bg');
    g.fillRect(0, 0, this.w, this.h);
    const b = (this._bounds = this.computeBounds());
    const font = `500 ${12 * k}px ${canvasFont()}`;
    g.font = font;
    const top = this.pad.t, bottom = this.h - this.pad.b;

    // selezione (condivisa)
    const sel = this.group?.selection;
    if (sel) {
      g.fillStyle = this.color('--mz-sel');
      const a = this.sx(sel[0]), c = this.sx(sel[1]);
      g.fillRect(Math.min(a, c), top, Math.abs(c - a), bottom - top);
    }

    // griglia e tacche
    g.strokeStyle = this.color('--mz-grid'); g.fillStyle = this.color('--mz-muted'); g.lineWidth = 1;
    // margine sinistro adattivo: quanto basta per le etichette delle tacche (il titolo sta sopra)
    const yt = niceTicks(b.y0, b.y1, this._yTickTarget());
    const wLab = Math.max(...yt.values.map((v) => g.measureText(tickLabel(v, yt.step)).width), 0);
    this._wantL = Math.max(PAD.l * k, wLab + 16 * k);
    let L = this._wantL;
    if (this.group) {
      // nei grafici impilati il margine è uguale per tutti: i tempi restano allineati in verticale
      L = Math.max(...this.group.charts.map((c) => c._wantL || 0));
      if (L !== this._lastGroupL) { this._lastGroupL = L; this.group.charts.forEach((c) => { if (c !== this) c.invalidate(); }); }
    }
    this.pad.l = L;
    const xt = niceTicks(b.x0, b.x1, this._xTickTarget());
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const v of xt.values) {
      const X = Math.round(this.sx(v)) + 0.5;
      g.beginPath(); g.moveTo(X, top); g.lineTo(X, bottom); g.stroke();
      if (!this.compact) g.fillText(tickLabel(v, xt.step), X, bottom + 6 * k);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of yt.values) {
      const Y = Math.round(this.sy(v)) + 0.5;
      g.beginPath(); g.moveTo(this.pad.l, Y); g.lineTo(this.w - this.pad.r, Y); g.stroke();
      g.fillText(tickLabel(v, yt.step), this.pad.l - 8 * k, Y);
    }
    // assi: solo sinistro e in basso (niente cornice: la griglia basta)
    g.strokeStyle = this.color('--mz-axis'); g.lineWidth = 1;
    const AL = Math.round(this.pad.l) + 0.5, AB = Math.round(bottom) + 0.5;
    g.beginPath(); g.moveTo(AL, top); g.lineTo(AL, AB); g.lineTo(this.w - this.pad.r, AB); g.stroke();
    // titoli: quello verticale in orizzontale, in alto a sinistra; quello dei tempi in basso al centro
    g.fillStyle = this.color(this.active ? '--mz-ink' : '--mz-muted');
    fillRich(g, this.yLabel, 2 * k, top - 9 * k, { size: 12 * k, weight: this.active ? 600 : 500 });
    if (!this.compact) {
      g.fillStyle = this.color('--mz-muted');
      fillRich(g, this.xLabel, this.pad.l + this.plotW() / 2, this.h - 5 * k, { size: 12 * k, align: 'center' });
    }

    // area dati (ritaglio)
    g.save();
    g.beginPath(); g.rect(this.pad.l, top, this.plotW(), bottom - top); g.clip();
    for (const s of this.series) {
      g.strokeStyle = g.fillStyle = s.color || this.color('--mz-accent');
      let visible = 0;
      for (let i = 0; i < s.x.length; i++) if (s.x[i] >= b.x0 && s.x[i] <= b.x1) visible++;
      if (s.mode !== 'points') {
        g.lineWidth = (s.width || 1.5) * Math.sqrt(k); g.lineJoin = 'round'; g.beginPath();
        let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i]) || !isFinite(s.x[i])) { pen = false; continue; }
          const X = this.sx(s.x[i]), Y = this.sy(s.y[i]);
          pen ? g.lineTo(X, Y) : g.moveTo(X, Y); pen = true;
        }
        g.stroke();
      }
      // «both»: linea con piccoli punti finché sono pochi; «points»: solo punti (dati sparsi, misure)
      if (s.mode === 'points' || (s.mode === 'both' && visible <= MARK_MAX)) {
        const r = (s.mode === 'both' ? 2 : visible > 1500 ? 1.4 : 2.4) * Math.sqrt(k);
        // un solo percorso per tutti i punti: un fill invece di migliaia
        g.beginPath();
        if (visible > 4000 || this.lite) {
          for (let i = 0; i < s.x.length; i++) {
            if (!isFinite(s.y[i]) || !isFinite(s.x[i]) || s.x[i] < b.x0 || s.x[i] > b.x1) continue;
            g.rect(this.sx(s.x[i]) - r, this.sy(s.y[i]) - r, 2 * r, 2 * r);
          }
        } else {
          for (let i = 0; i < s.x.length; i++) {
            if (!isFinite(s.y[i]) || !isFinite(s.x[i]) || s.x[i] < b.x0 || s.x[i] > b.x1) continue;
            const X = this.sx(s.x[i]), Y = this.sy(s.y[i]);
            g.moveTo(X + r, Y); g.arc(X, Y, r, 0, 2 * Math.PI);
          }
        }
        g.fill();
      }
    }
    if (this.fit) {
      g.strokeStyle = this.color('--mz-fit'); g.lineWidth = 2.8 * Math.sqrt(k); g.setLineDash([7, 4]);
      g.beginPath();
      this.fit.x.forEach((x, i) => { const X = this.sx(x), Y = this.sy(this.fit.y[i]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.stroke(); g.setLineDash([]);
    }
    this._drawOverlays(g, b, k, top, bottom);
    g.restore();
  }

  /** Strato del mirino: linea all'istante del puntatore e lettura del punto più vicino. */
  _drawHover(g, k) {
    const b = this._bounds; if (!b) return;
    const top = this.pad.t, bottom = this.h - this.pad.b;
    g.save();
    g.beginPath(); g.rect(this.pad.l, top, this.plotW(), bottom - top); g.clip();
    // mirino condiviso: linea verticale all'istante sotto il puntatore
    const ht = this.group?.hoverT;
    if (ht != null && ht >= b.x0 && ht <= b.x1) {
      const X = Math.round(this.sx(ht)) + 0.5;
      g.strokeStyle = this.color('--mz-ink'); g.globalAlpha = 0.35; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(X, top); g.lineTo(X, bottom); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }
    g.restore();

    // lettura del punto più vicino all'istante del mirino (su tutti i grafici)
    if (ht != null && this.series[0]) {
      const s = this.series[0];
      const best = nearestSorted(s.x, s.y, ht);
      if (best >= 0 && Math.abs(this.sx(s.x[best]) - this.sx(ht)) < 30 * k) {
        const X = this.sx(s.x[best]), Y = this.sy(s.y[best]);
        g.strokeStyle = this.color('--mz-ink'); g.lineWidth = 1.5;
        g.beginPath(); g.arc(X, Y, 5 * Math.sqrt(k), 0, 2 * Math.PI); g.stroke();
        const txt = this.hover ? `${this.xSym || 't'} = ${fmtNum(s.x[best])}   ${s.label || 'y'} = ${fmtNum(s.y[best])}` : `${s.label || 'y'} = ${fmtNum(s.y[best])}`;
        const tw = measureRich(g, txt, 12 * k) + 16 * k, th = 24 * k;
        let bx = X + 10 * k; if (bx + tw > this.w - this.pad.r) bx = X - 10 * k - tw;
        bx = Math.max(this.pad.l, bx);
        const by = Math.min(Math.max(top + 4, Y - th - 8 * k), bottom - th - 2);
        g.fillStyle = this.color('--mz-tip-bg');
        g.beginPath(); if (g.roundRect) g.roundRect(bx, by, tw, th, 5 * k); else g.rect(bx, by, tw, th); g.fill();
        g.fillStyle = this.color('--mz-tip-ink');
        fillRich(g, txt, bx + 8 * k, by + th / 2, { size: 12 * k, baseline: 'middle' });
      }
    }
  }

  _drawOverlays(g, b, k, top, bottom) {
    const L = this.pad.l, R = this.w - this.pad.r;
    for (const o of this.overlays) {
      g.save();
      g.strokeStyle = g.fillStyle = o.color || this.color('--mz-fit');
      g.lineWidth = (o.width || 2.2) * Math.sqrt(k);
      if (o.dash) g.setLineDash(o.dash);
      if (o.type === 'segment') {
        let { x1, y1, x2, y2 } = o;
        if (o.extend && x2 !== x1) {           // retta estesa a tutto il grafico
          const m = (y2 - y1) / (x2 - x1);
          const xa = b.x0, xb = b.x1;
          y1 = y1 + m * (xa - x1); x1 = xa; y2 = y1 + m * (xb - xa); x2 = xb;
        }
        g.beginPath(); g.moveTo(this.sx(x1), this.sy(y1)); g.lineTo(this.sx(x2), this.sy(y2)); g.stroke();
      } else if (o.type === 'curve') {
        g.beginPath();
        o.x.forEach((x, i) => { const X = this.sx(x), Y = this.sy(o.y[i]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
        g.stroke();
      } else if (o.type === 'triangle') {
        // cateti del triangolo: Δx orizzontale, Δy verticale
        const X1 = this.sx(o.x1), Y1 = this.sy(o.y1), X2 = this.sx(o.x2), Y2 = this.sy(o.y2);
        g.setLineDash([]); g.lineWidth = 1.8 * Math.sqrt(k);
        g.beginPath(); g.moveTo(X1, Y1); g.lineTo(X2, Y1); g.lineTo(X2, Y2); g.stroke();
        const pill = (txt, cx, cy, align) => {
          const tw = measureRich(g, txt, 12.5 * k) + 12 * k, th = 20 * k;
          let bx = align === 'center' ? cx - tw / 2 : align === 'left' ? cx : cx - tw;
          bx = Math.min(Math.max(bx, L + 2), R - tw - 2);
          const by = Math.min(Math.max(cy - th / 2, top + 2), bottom - th - 2);
          g.fillStyle = this.color('--mz-card'); g.globalAlpha = 0.92; g.fillRect(bx, by, tw, th); g.globalAlpha = 1;
          g.strokeStyle = o.color || this.color('--mz-fit'); g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
          g.fillStyle = this.color('--mz-ink'); fillRich(g, txt, bx + 6 * k, by + th / 2, { size: 12.5 * k, baseline: 'middle' });
        };
        if (o.dxLabel) pill(o.dxLabel, (X1 + X2) / 2, Y1 + (Y2 < Y1 ? 14 : -14) * k, 'center');
        if (o.dyLabel) pill(o.dyLabel, X2 + (X2 >= X1 ? 8 : -8) * k, (Y1 + Y2) / 2, X2 >= X1 ? 'left' : 'right');
      } else if (o.type === 'vline') {
        // cursore verticale (righello): linea a tutta altezza, maniglia in basso, etichetta in alto
        const X = Math.round(this.sx(o.x)) + 0.5, r = 9 * Math.sqrt(k);
        g.setLineDash([]); g.lineWidth = 2 * Math.sqrt(k);
        g.beginPath(); g.moveTo(X, top); g.lineTo(X, bottom); g.stroke();
        g.globalAlpha = 0.18; g.beginPath(); g.arc(X, bottom - r * 1.6, r * 1.9, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
        g.beginPath(); g.arc(X, bottom - r * 1.6, r, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
        if (o.label) {
          g.fillStyle = o.color || this.color('--mz-fit');
          const right = X > R - 30 * k;
          fillRich(g, o.label, X + (right ? -5 : 5) * k, top + 4 * k, { size: 13 * k, align: right ? 'right' : 'left', baseline: 'top' });
        }
      } else if (o.type === 'span') {
        // intervallo tra due cursori con la freccia ↔ e la scritta
        const X1 = this.sx(o.x1), X2 = this.sx(o.x2), Y = top + 30 * k;
        g.globalAlpha = 0.12; g.fillRect(Math.min(X1, X2), top, Math.abs(X2 - X1), bottom - top); g.globalAlpha = 1;
        g.setLineDash([]); g.lineWidth = 1.6 * Math.sqrt(k);
        g.beginPath(); g.moveTo(X1, Y); g.lineTo(X2, Y); g.stroke();
        const ah = 6 * k, s = X2 >= X1 ? 1 : -1;
        g.beginPath(); g.moveTo(X1 + s * ah, Y - ah * 0.6); g.lineTo(X1, Y); g.lineTo(X1 + s * ah, Y + ah * 0.6); g.stroke();
        g.beginPath(); g.moveTo(X2 - s * ah, Y - ah * 0.6); g.lineTo(X2, Y); g.lineTo(X2 - s * ah, Y + ah * 0.6); g.stroke();
        if (o.label) {
          const tw = measureRich(g, o.label, 12.5 * k) + 12 * k, th = 20 * k;
          const bx = Math.min(Math.max((X1 + X2) / 2 - tw / 2, L + 2), R - tw - 2), by = Y + 6 * k;
          g.fillStyle = this.color('--mz-card'); g.globalAlpha = 0.92; g.fillRect(bx, by, tw, th); g.globalAlpha = 1;
          g.strokeStyle = o.color; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, tw - 1, th - 1);
          g.fillStyle = this.color('--mz-ink'); fillRich(g, o.label, bx + 6 * k, by + th / 2, { size: 12.5 * k, baseline: 'middle' });
        }
      } else if (o.type === 'anchor' && o.handle) {
        const X = this.sx(o.x), Y = this.sy(o.y), r = 9 * Math.sqrt(k);
        g.setLineDash([]);
        g.fillStyle = o.color || this.color('--mz-green'); g.globalAlpha = 0.18;
        g.beginPath(); g.arc(X, Y, r * 1.9, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
        g.beginPath(); g.arc(X, Y, r, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
      } else if (o.type === 'anchor') {
        const X = this.sx(o.x), Y = this.sy(o.y), r = 7 * Math.sqrt(k);
        g.setLineDash([]);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X, Y, r, 0, 2 * Math.PI); g.fill();
        g.strokeStyle = o.color || this.color('--mz-fit'); g.lineWidth = 3 * Math.sqrt(k);
        g.beginPath(); g.arc(X, Y, r, 0, 2 * Math.PI); g.stroke();
        if (o.label) {
          g.fillStyle = o.color || this.color('--mz-fit');
          fillRich(g, o.label, X + r + 2, Y - r, { size: 13 * k, baseline: 'bottom' });
        }
      }
      g.restore();
    }
  }

  // ---------- interazione ----------
  _pos(e) { const r = this.c.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }

  _down(e) {
    if (!this._bounds || !this.group) return;
    this.group.onActivate?.(this);
    const p = this._pos(e);
    this._pointers.set(e.pointerId, p);
    this.c.setPointerCapture(e.pointerId);
    if (this._pointers.size === 2) {
      // due dita: zoom e spostamento (annulla un'eventuale selezione in corso)
      this._drag = null;
      const [p1, p2] = [...this._pointers.values()];
      const mid = (p1.px + p2.px) / 2;
      this._pinch = { d0: Math.max(20, Math.abs(p1.px - p2.px)), t0: this.ix(mid), range0: this.group.currentRange() };
      return;
    }
    if (p.px < this.pad.l) return;
    if (this.tool === 'pick') {
      // vicino a un punto già scelto? allora lo si trascina
      const r = 22 * this.k; // generoso: si prende anche col dito
      const a = this.overlays.find((o) => o.type === 'anchor' && o.id && Math.hypot(this.sx(o.x) - p.px, this.sy(o.y) - p.py) < r)
        || this.overlays.find((o) => o.type === 'vline' && o.id && Math.abs(this.sx(o.x) - p.px) < r * 0.8);
      this._pick = { px: p.px, py: p.py, anchor: a ? a.id : null, free: !!a?.free || a?.type === 'vline', moved: false };
      return;
    }
    this._drag = { x: this.ix(p.px), moved: false };
  }

  _move(e) {
    const p = this._pos(e);
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, p);
    if (this._pinch && this._pointers.size === 2) {
      const [p1, p2] = [...this._pointers.values()];
      const d = Math.max(20, Math.abs(p1.px - p2.px));
      const [a0, b0] = this._pinch.range0;
      const w = (b0 - a0) * (this._pinch.d0 / d);
      const frac = ((p1.px + p2.px) / 2 - this.pad.l) / this.plotW();
      const a = this._pinch.t0 - frac * w;
      this.group.setRange(a, a + w);
      return;
    }
    this.hover = p;
    this.group?.setHover(p.px >= this.pad.l ? this.ix(p.px) : null);
    if (this._pick) {
      if (Math.hypot(p.px - this._pick.px, p.py - this._pick.py) > 4) this._pick.moved = true;
      if (this._pick.anchor && this._pick.moved) {
        if (this._pick.free && this.onAnchorDrag) {
          const px = Math.min(Math.max(p.px, this.pad.l), this.w - this.pad.r);
          const py = Math.min(Math.max(p.py, this.pad.t), this.h - this.pad.b);
          this.onAnchorDrag(this._pick.anchor, this.ix(px), this.iy(py));
        } else if (this.onAnchorMove) {
          const i = this.nearestIndex(p.px, p.py);
          if (i >= 0) this.onAnchorMove(this._pick.anchor, i);
        }
      }
      return;
    }
    if (this._drag) {
      const x = this.ix(p.px);
      if (Math.abs(this.sx(x) - this.sx(this._drag.x)) > 4) this._drag.moved = true;
      if (this._drag.moved) this.group.setSelection([this._drag.x, x]);
    }
  }

  _up(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
    if (this._pick) {
      const pk = this._pick; this._pick = null;
      if (!pk.moved && !pk.anchor && this.onClickXY) { this.onClickXY(this.ix(pk.px), this.iy(pk.py)); return; }
      if (!pk.moved && !pk.anchor && this.onPick) {
        const i = this.nearestIndex(pk.px, pk.py, 60 * this.k);
        if (i >= 0) this.onPick(i);
      }
      return;
    }
    if (this._drag && this._drag.moved && this.group.selection) {
      const [a, b] = this.group.selection;
      this.group.setSelection([Math.min(a, b), Math.max(a, b)], true);
    }
    this._drag = null;
  }

  _wheel(e) {
    if (!this._bounds || !this.group) return;
    // Pizzico sul trackpad (arriva come rotella con ctrlKey) o Ctrl/Cmd + rotella: zoom.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const t = this.ix(this._pos(e).px);
      this.group.zoomAt(t, Math.exp(e.deltaY * 0.01));
      return;
    }
    // Scorrimento orizzontale (trackpad o Maiusc+rotella): spostamento nel tempo.
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (dx && this.group.xRange) {
      e.preventDefault();
      const [a, b] = this.group.currentRange();
      this.group.pan((dx / this.plotW()) * (b - a));
    }
    // altrimenti la rotella fa scorrere la pagina, come al solito
  }
}

// ---------- utilità ----------
/** Tacche «tonde» (passi 1, 2, 5 × 10ⁿ), circa maxTicks e mai meno di 3 dentro l'intervallo. */
export function niceTicks(lo, hi, maxTicks) {
  const span = hi - lo;
  if (!(span > 0) || !isFinite(span)) return { values: [lo], step: 1 };
  const NICE = [1, 2, 5, 10];
  const raw = span / Math.max(1, maxTicks);
  let mag = Math.pow(10, Math.floor(Math.log10(raw)));
  let idx = NICE.findIndex((n) => raw / mag <= n + 1e-9);
  const make = (step) => {
    const values = [];
    for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) {
      const v = i * step;
      values.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return { values, step };
  };
  let res = make(NICE[idx] * mag);
  // troppo poche etichette (intervallo stretto rispetto al passo): si scende al passo tondo più piccolo
  for (let guard = 0; res.values.length < 3 && guard < 6; guard++) {
    idx--; if (idx < 0) { idx = 2; mag /= 10; }
    res = make(NICE[idx] * mag);
  }
  return res;
}
function tickLabel(v, step) {
  // decimali che servono al passo (con passi 1/2/5 bastano quelli della sua potenza di 10);
  // il segno meno è quello tipografico (−), non il trattino
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return fixed(v, Math.min(d, 20)).replace(/^-(?=\d)/, '\u2212');
}

// ---------- testo con pedici ----------
// Nei simboli «_» seguito da un solo carattere è un pedice (a_z, ω_x): sul canvas lo si scrive più
// piccolo e abbassato, come in un testo scientifico.
const SUB_RE = /_([A-Za-z0-9])(?![A-Za-z0-9])/g;
function richParts(txt) {
  const out = []; let last = 0, m;
  SUB_RE.lastIndex = 0;
  while ((m = SUB_RE.exec(txt))) {
    if (m.index > last) out.push({ t: txt.slice(last, m.index) });
    out.push({ t: m[1], sub: true });
    last = SUB_RE.lastIndex;
  }
  if (last < txt.length) out.push({ t: txt.slice(last) });
  return out;
}
/** Larghezza di un testo con pedici (stesso carattere di fillRich). */
export function measureRich(g, txt, size, weight = 500) {
  let w = 0;
  for (const p of richParts(String(txt ?? ''))) {
    g.font = `${weight} ${p.sub ? size * 0.72 : size}px ${canvasFont()}`;
    w += g.measureText(p.t).width;
  }
  return w;
}
/** Scrive un testo con pedici. align: left | center | right; baseline: alphabetic | middle. */
export function fillRich(g, txt, x, y, { size, weight = 500, align = 'left', baseline = 'alphabetic' }) {
  const parts = richParts(String(txt ?? ''));
  const total = measureRich(g, txt, size, weight);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  g.textAlign = 'left'; g.textBaseline = baseline;
  for (const p of parts) {
    const sz = p.sub ? size * 0.72 : size;
    g.font = `${weight} ${sz}px ${canvasFont()}`;
    g.fillText(p.t, cx, y + (p.sub ? size * 0.26 : 0));
    cx += g.measureText(p.t).width;
  }
}
function fmtNum(x) {
  if (!isFinite(x)) return '—';
  const a = Math.abs(x);
  return upTo(x, a >= 100 ? 1 : a >= 10 ? 2 : 3);
}
/** Indice del valore valido più vicino a t in un vettore di tempi crescenti (lineare se non ordinato). */
function nearestSorted(xs, ys, t) {
  const n = xs.length; if (!n) return -1;
  let lo = 0, hi = n - 1;
  if (xs[0] <= xs[hi]) {
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= t) lo = m; else hi = m; }
    let best = Math.abs(xs[lo] - t) <= Math.abs(xs[hi] - t) ? lo : hi;
    if (isFinite(ys[best])) return best;
    for (let d = 1; d < n; d++) {          // salta eventuali buchi
      if (best - d >= 0 && isFinite(ys[best - d])) return best - d;
      if (best + d < n && isFinite(ys[best + d])) return best + d;
    }
    return -1;
  }
  let best = -1, bd = Infinity;
  for (let i = 0; i < n; i++) { if (!isFinite(ys[i])) continue; const d = Math.abs(xs[i] - t); if (d < bd) { bd = d; best = i; } }
  return best;
}
