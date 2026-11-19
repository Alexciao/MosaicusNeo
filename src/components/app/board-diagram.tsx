"use client";
// Schema dei collegamenti «realistico», nello stile di Tinkercad: l'Arduino Uno disegnato com'è
// (header con le scritte vere), una breadboard con i binari dell'alimentazione, i moduli dei
// sensori con il loro aspetto e i loro piedini nell'ordine giusto, e i fili colorati:
// rosso = 5V, nero = GND, un colore per sensore. Si genera dai sensori e dai pin scelti.

import { Fragment } from "react";
import { buildModules, type BtModule, type Mod } from "./rig-diagram";
import type { SensorInstance } from "@/lib/sensors/rig";

const P = 12;                 // passo dei fori della breadboard (0,1")
const HP = 11;                // passo degli header dell'Arduino (alla scala del disegno)
const AW = 300, AH = 214;     // Arduino Uno (68,6 × 53,3 mm)
const RED = "#dc2626", BLK = "#1f2937";

// header dell'Uno R3, da sinistra a destra (USB a sinistra)
const TOP_LABELS = ["SCL", "SDA", "AREF", "GND", "13", "12", "~11", "~10", "~9", "8", "", "7", "~6", "~5", "4", "~3", "2", "TX→1", "RX←0"];
const TOP_PINS: (number | string | null)[] = [null, null, null, "GND", 13, 12, 11, 10, 9, 8, null, 7, 6, 5, 4, 3, 2, 1, 0];
const BOT_LABELS = ["", "IOREF", "RESET", "3.3V", "5V", "GND", "GND", "Vin", "", "A0", "A1", "A2", "A3", "A4", "A5"];
const BOT_PINS: (number | string | null)[] = [null, null, null, null, "5V", "GND", null, null, null, 14, 15, 16, 17, 18, 19];

// disegno dei moduli: larghezza, altezza; onBoard = componenti sciolti sulla breadboard
const SIZE: Record<string, [number, number]> = {
  dht: [54, 88], sonar: [124, 72], gps: [80, 96], analog: [52, 60], ds18b20: [70, 84], gate: [66, 80], hx711: [62, 68],
  imu: [56, 68], oled: [58, 62], rgb: [46, 68], buzzer: [46, 64], hc06: [60, 96], ble: [60, 96],
};
const ON_BOARD = new Set(["ntc", "ldr"]);

type Pt = [number, number];
/** Filo ad angoli retti, con le curve arrotondate (come i fili di Tinkercad). */
function ortho(pts: Pt[], r = 5) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i < pts.length - 1) {
      const [px, py] = pts[i - 1], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const ax = x - ((x - px) / (l1 || 1)) * rr, ay = y - ((y - py) / (l1 || 1)) * rr;
      const bx = x + ((nx - x) / (l2 || 1)) * rr, by = y + ((ny - y) / (l2 || 1)) * rr;
      d += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
    } else d += ` L${x} ${y}`;
  }
  return d;
}

function Wire({ d, color, dashed }: { d: string; color: string; dashed?: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#000" strokeOpacity={0.28} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "6 4" : undefined} />
    </g>
  );
}
const End = ({ x, y, color }: { x: number; y: number; color: string }) => (
  <rect x={x - 2.6} y={y - 2.6} width={5.2} height={5.2} rx={1} fill={color} stroke="#000" strokeOpacity={0.35} strokeWidth={0.8} />
);

const BANDS: Record<string, string[]> = {
  "10k": ["#7c2d12", "#111", "#ea580c"], "1k": ["#7c2d12", "#111", "#dc2626"], "2k": ["#dc2626", "#111", "#dc2626"], "4k7": ["#eab308", "#7c3aed", "#dc2626"],
};
/** Resistenza orizzontale tra due fori. */
function Resistor({ x1, x2, y, value }: { x1: number; x2: number; y: number; value: keyof typeof BANDS }) {
  const mid = (x1 + x2) / 2, bw = Math.min(18, x2 - x1 - 6);
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#9ca3af" strokeWidth={1.6} />
      <rect x={mid - bw / 2} y={y - 3.6} width={bw} height={7.2} rx={3.2} fill="#d6c39a" stroke="#a8916a" strokeWidth={0.6} />
      {BANDS[value].map((c, i) => <rect key={i} x={mid - bw / 2 + 3.5 + i * 3.4} y={y - 3.6} width={1.8} height={7.2} fill={c} />)}
      <rect x={mid + bw / 2 - 4.5} y={y - 3.6} width={1.6} height={7.2} fill="#ca8a04" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// I disegni dei moduli (x, y = angolo in alto a sinistra)
// ---------------------------------------------------------------------------
function ModuleArt({ m, x, y, w, h }: { m: Mod; x: number; y: number; w: number; h: number }) {
  const pcb = (fill: string, stroke = "#00000055") => <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} stroke={stroke} />;
  const label = (t: string, yy: number, fill = "#fff", size = 7) => <text x={x + w / 2} y={yy} textAnchor="middle" fontSize={size} fontWeight={700} fill={fill} letterSpacing={0.3}>{t}</text>;
  const hole = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={2.4} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} />;
  switch (m.kind) {
    case "dht": {
      const model = m.options?.model === "dht22" ? "DHT22" : "DHT11";
      const fill = model === "DHT22" ? "#f8fafc" : "#3b82f6";
      return (
        <g>
          {pcb("#1e3a8a")}
          <rect x={x + 7} y={y + 5} width={w - 14} height={h - 30} rx={2} fill={fill} stroke="#0f172a55" />
          {Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) => (
            <rect key={`${r}-${c}`} x={x + 11 + c * ((w - 22) / 4)} y={y + 9 + r * ((h - 38) / 5)} width={(w - 22) / 4 - 3} height={(h - 38) / 5 - 3} rx={1} fill="#0f172a" opacity={0.55} />
          )))}
          {label(model, y + h - 24, "#e0e7ff", 6.5)}
        </g>
      );
    }
    case "sonar":
      return (
        <g>
          {pcb("#1d4ed8")}
          {[x + 30, x + w - 30].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy={y + 26} r={20} fill="#d1d5db" stroke="#6b7280" strokeWidth={1.2} />
              <circle cx={cx} cy={y + 26} r={15} fill="#374151" />
              <circle cx={cx} cy={y + 26} r={15} fill="url(#mesh)" />
            </g>
          ))}
          <rect x={x + w / 2 - 7} y={y + 8} width={14} height={7} rx={3} fill="#d1d5db" stroke="#6b7280" strokeWidth={0.6} />
          {label("HC-SR04", y + h - 24, "#dbeafe", 6.5)}
        </g>
      );
    case "gps":
      return (
        <g>
          {pcb("#1e40af")}
          <rect x={x + 12} y={y + 8} width={w - 24} height={w - 24} rx={3} fill="#d9c28c" stroke="#a38a52" />
          <circle cx={x + w / 2} cy={y + 8 + (w - 24) / 2} r={4} fill="#9ca3af" stroke="#6b7280" />
          <circle cx={x + w - 10} cy={y + h - 26} r={3} fill="#22c55e" />
          {label("GPS NEO-6M", y + h - 24, "#dbeafe", 6)}
        </g>
      );
    case "ds18b20":
      return (
        <g>
          <path d={`M${x + w / 2} ${y + h - 34} C ${x + w / 2} ${y + 18}, ${x + 6} ${y + 30}, ${x + 8} ${y + 8}`} fill="none" stroke="#111827" strokeWidth={5} strokeLinecap="round" />
          <rect x={x + 2} y={y - 6} width={13} height={22} rx={5} fill="#cbd5e1" stroke="#64748b" transform={`rotate(-12 ${x + 8} ${y + 5})`} />
          <rect x={x + 10} y={y + h - 36} width={w - 20} height={30} rx={3} fill="#15803d" stroke="#00000055" />
          {[0, 1, 2].map((i) => <rect key={i} x={x + 14 + i * ((w - 28) / 3)} y={y + h - 33} width={(w - 28) / 3 - 2} height={9} rx={1} fill="#16a34a" stroke="#14532d" strokeWidth={0.6} />)}
          <Resistor x1={x + 18} x2={x + w - 18} y={y + h - 15} value="4k7" />
          {label("DS18B20", y + 12, "currentColor", 6.5)}
        </g>
      );
    case "gate":
      return (
        <g>
          {pcb("#1d4ed8")}
          <path d={`M${x + 10} ${y + 6} h14 v28 h${w - 48} v-28 h14 v40 h-${w - 20} z`} fill="#111827" />
          <circle cx={x + 17} cy={y + 22} r={2.2} fill="#f87171" />
          <circle cx={x + w - 17} cy={y + 22} r={2.2} fill="#374151" />
          {label("FOTOCELLULA", y + h - 24, "#dbeafe", 5.6)}
        </g>
      );
    case "hx711":
      return (
        <g>
          {pcb("#15803d")}
          <rect x={x + w / 2 - 12} y={y + 12} width={24} height={14} rx={1.5} fill="#111827" />
          {Array.from({ length: 6 }, (_, i) => <rect key={i} x={x + w / 2 - 10 + i * 4} y={y + 9} width={1.6} height={3} fill="#cbd5e1" />)}
          {[0, 1, 2, 3].map((i) => hole(x + 10 + i * ((w - 20) / 3), y + 6))}
          {label("HX711", y + h - 24, "#dcfce7", 6.5)}
        </g>
      );
    case "imu":
      return (
        <g>
          {pcb("#1d4ed8")}
          <rect x={x + w / 2 - 9} y={y + 12} width={18} height={18} rx={1.5} fill="#111827" />
          <circle cx={x + w / 2 - 6} cy={y + 15} r={1.2} fill="#9ca3af" />
          <path d={`M${x + 8} ${y + 34} h10 m-3 -3 l3 3 -3 3 M${x + 8} ${y + 34} v-10 m-3 3 l3 -3 3 3`} stroke="#e0e7ff" strokeWidth={1} fill="none" />
          {label("GY-521", y + h - 24, "#dbeafe", 6.5)}
        </g>
      );
    case "oled":
      return (
        <g>
          {pcb("#0f172a")}
          <rect x={x + 6} y={y + 6} width={w - 12} height={h - 26} rx={2} fill="#020617" stroke="#334155" />
          <rect x={x + 10} y={y + 10} width={w - 20} height={7} fill="#e2e8f0" />
          <text x={x + 12} y={y + 15.8} fontSize={5.4} fontWeight={700} fill="#020617" fontFamily="monospace">PRONTO</text>
          <text x={x + w / 2} y={y + 28} textAnchor="middle" fontSize={9} fontWeight={700} fill="#e2e8f0" fontFamily="monospace">OK</text>
          {label("OLED 0,49\"", y + h - 12, "#94a3b8", 5.5)}
        </g>
      );
    case "rgb":
      return (
        <g>
          {pcb("#111827")}
          <defs>
            <radialGradient id="ledRgb" cx="40%" cy="35%" r="70%"><stop offset="0%" stopColor="#fff" /><stop offset="45%" stopColor="#a5f3fc" /><stop offset="75%" stopColor="#f0abfc" /><stop offset="100%" stopColor="#fca5a5" /></radialGradient>
          </defs>
          <circle cx={x + w / 2} cy={y + 22} r={13} fill="url(#ledRgb)" stroke="#e5e7eb" strokeWidth={1} opacity={0.95} />
          {label("RGB", y + h - 24, "#d1d5db", 6.5)}
        </g>
      );
    case "buzzer":
      return (
        <g>
          {pcb("#111827")}
          <circle cx={x + w / 2} cy={y + 22} r={15} fill="#0b0f19" stroke="#4b5563" strokeWidth={1.4} />
          <circle cx={x + w / 2} cy={y + 22} r={3} fill="#374151" />
          <text x={x + w / 2 - 11} y={y + 13} fontSize={8} fontWeight={700} fill="#e5e7eb">+</text>
          {label(m.options?.kind === "passive" ? "PASSIVO" : "BUZZER", y + h - 24, "#d1d5db", 5.6)}
        </g>
      );
    case "hc06":
    case "ble":
      return (
        <g>
          {pcb(m.kind === "ble" ? "#065f46" : "#1d4ed8")}
          <rect x={x + 8} y={y + 6} width={w - 16} height={h - 30} rx={2} fill={m.kind === "ble" ? "#047857" : "#2563eb"} stroke="#00000044" />
          <path d={`M${x + 12} ${y + 14} h${w - 24} v6 h-${w - 30} v6 h${w - 30} v6 h-${w - 24}`} fill="none" stroke="#fbbf24" strokeWidth={1.6} />
          <rect x={x + w / 2 - 8} y={y + 40} width={16} height={12} rx={1} fill="#111827" />
          {label(m.kind === "ble" ? "HM-10 BLE" : "HC-06", y + h - 24, "#e0f2fe", 6.5)}
        </g>
      );
    default:
      return (
        <g>
          {pcb("#475569")}
          {label("0–5 V", y + 22, "#f1f5f9", 8)}
          {label("SENSORE", y + h - 24, "#cbd5e1", 5.6)}
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// Arduino Uno
// ---------------------------------------------------------------------------
function ArduinoArt({ x, y, used }: { x: number; y: number; used: Map<string, string> }) {
  const topX0 = x + AW - 16 - 18 * HP, botX0 = x + AW - 16 - 14 * HP;
  const headerStrip = (x0: number, n: number, yy: number) => <rect x={x0 - HP / 2} y={yy - 5} width={n * HP} height={10} rx={1} fill="#111" />;
  return (
    <g>
      <rect x={x} y={y} width={AW} height={AH} rx={10} fill="#0f7a83" stroke="#0a5960" strokeWidth={1.5} />
      {/* fori di fissaggio */}
      {[[x + 14, y + 12], [x + 16, y + AH - 12], [x + AW - 12, y + 34], [x + AW - 12, y + AH - 30]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={5} fill="#f8fafc" stroke="#cbd5e1" />)}
      {/* USB-B e alimentazione */}
      <rect x={x - 12} y={y + 34} width={46} height={40} rx={2} fill="#cbd5e1" stroke="#64748b" />
      <rect x={x - 12} y={y + 44} width={10} height={20} fill="#94a3b8" />
      <rect x={x - 8} y={y + AH - 64} width={40} height={30} rx={3} fill="#111827" />
      <circle cx={x + 4} cy={y + AH - 49} r={6} fill="#1f2937" stroke="#374151" />
      {/* pulsante di reset, LED */}
      <rect x={x + 28} y={y + 14} width={14} height={14} rx={2} fill="#e5e7eb" stroke="#9ca3af" />
      <circle cx={x + 35} cy={y + 21} r={4} fill="#dc2626" />
      {[["L", "#f59e0b", 0], ["TX", "#fbbf24", 1], ["RX", "#fbbf24", 2]].map(([t, c, i]) => (
        <g key={t as string}>
          <rect x={x + 88} y={y + 30 + (i as number) * 10} width={7} height={4} rx={1} fill={c as string} opacity={0.85} />
          <text x={x + 98} y={y + 34 + (i as number) * 10} fontSize={5.5} fill="#e0f2f1">{t}</text>
        </g>
      ))}
      <rect x={x + AW - 54} y={y + 40} width={7} height={4} rx={1} fill="#22c55e" />
      <text x={x + AW - 44} y={y + 44} fontSize={5.5} fill="#e0f2f1">ON</text>
      {/* microcontrollore */}
      <rect x={x + 120} y={y + AH - 98} width={146} height={34} rx={2} fill="#111827" />
      {Array.from({ length: 14 }, (_, i) => (
        <Fragment key={i}>
          <rect x={x + 124 + i * 10.2} y={y + AH - 103} width={3.4} height={5} fill="#cbd5e1" />
          <rect x={x + 124 + i * 10.2} y={y + AH - 64} width={3.4} height={5} fill="#cbd5e1" />
        </Fragment>
      ))}
      <text x={x + 193} y={y + AH - 78} textAnchor="middle" fontSize={7} fill="#6b7280" fontFamily="monospace">ATMEGA328P</text>
      {/* marchio */}
      <g transform={`translate(${x + 150} ${y + 66})`}>
        <circle cx={-9} cy={0} r={8} fill="none" stroke="#e0f2f1" strokeWidth={3} />
        <circle cx={9} cy={0} r={8} fill="none" stroke="#e0f2f1" strokeWidth={3} />
        <text x={30} y={6} fontSize={20} fontWeight={800} fill="#e0f2f1" letterSpacing={1}>UNO</text>
      </g>
      <text x={x + 168} y={y + 90} fontSize={7} fill="#b2dfdb" letterSpacing={2}>ARDUINO</text>
      {/* header */}
      {headerStrip(topX0, 10, y + 10)}
      {headerStrip(topX0 + 11 * HP, 8, y + 10)}
      {headerStrip(botX0 + HP, 8, y + AH - 10)}
      {headerStrip(botX0 + 9 * HP, 6, y + AH - 10)}
      {TOP_LABELS.map((t, i) => t && (
        <g key={`t${i}`}>
          <rect x={topX0 + i * HP - 2} y={y + 8} width={4} height={4} fill={used.get(`t${i}`) ?? "#3f3f46"} />
          <text transform={`translate(${topX0 + i * HP + 2.2} ${y + 18}) rotate(90)`} fontSize={5.6} fill="#ecfeff">{t}</text>
        </g>
      ))}
      {BOT_LABELS.map((t, i) => t && (
        <g key={`b${i}`}>
          <rect x={botX0 + i * HP - 2} y={y + AH - 12} width={4} height={4} fill={used.get(`b${i}`) ?? "#3f3f46"} />
          <text transform={`translate(${botX0 + i * HP + 2.2} ${y + AH - 18}) rotate(-90)`} fontSize={5.6} fill="#ecfeff">{t}</text>
        </g>
      ))}
      <text x={topX0 + 4 * HP} y={y + 46} fontSize={6} fill="#b2dfdb">DIGITAL (PWM ~)</text>
      <text x={botX0 + 9 * HP} y={y + AH - 46} fontSize={6} fill="#b2dfdb">ANALOG IN</text>
      <text x={botX0 + 2 * HP} y={y + AH - 46} fontSize={6} fill="#b2dfdb">POWER</text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Lo schema
// ---------------------------------------------------------------------------
/** Colonne della breadboard occupate da ogni modulo, da sinistra a destra. */
function layoutColumns(mods: Mod[], first: number) {
  const out: { m: Mod; w: number; h: number; span: number; startCol: number; onBoard: boolean }[] = [];
  let col = first;
  for (const m of mods) {
    const onBoard = ON_BOARD.has(m.kind);
    const [w, h] = onBoard ? [5 * P, 0] : SIZE[m.kind] ?? [56, 56];
    const extra = m.rows.some((r) => r.via === "divider") ? 3 : 0;
    const span = onBoard ? 6 : Math.max(m.rows.length + 1 + extra, Math.ceil((w + 12) / P));
    out.push({ m, w, h, span, startCol: col, onBoard });
    col += span + 1;
  }
  return out;
}

interface Placed { m: Mod; x: number; y: number; w: number; h: number; pinX: number[]; startCol: number; span: number; onBoard: boolean }

export function BoardDiagram({ sensors, bt = null, className }: { sensors: SensorInstance[]; bt?: BtModule; className?: string }) {
  const mods = buildModules(sensors, bt);
  if (!mods.length) return null;

  // --- colonne della breadboard per ogni modulo
  const FIRST = 5;                                  // colonne 0–3: ponticelli dei binari e alimentazione
  const placedCols = layoutColumns(mods, FIRST);
  const last = placedCols[placedCols.length - 1];
  const nCols = Math.max(30, last.startCol + last.span + 2);
  const maxH = Math.max(40, ...placedCols.filter((p) => !p.onBoard).map((p) => p.h));

  // --- fili dei segnali: uno per piedino collegato a un pin di Arduino
  type Sig = { mi: number; ri: number; pin: number; color: string; dashed?: boolean };
  const sigs: Sig[] = [];
  mods.forEach((m, mi) => m.rows.forEach((r, ri) => { if (typeof r.conn === "number") sigs.push({ mi, ri, pin: r.conn, color: m.color, dashed: r.dashed }); }));
  const analog = sigs.filter((s) => s.pin >= 14);
  const nBottom = analog.length + 2;                // analogici + 5V + GND

  // --- geometria verticale
  const zoneBottom = 14 + maxH;
  const pinTip = zoneBottom + 9;
  const laneY = (i: number) => pinTip + 12 + i * 7;
  const bbTop = laneY(Math.max(0, sigs.length - 1)) + 18;
  const AX = 14 + analog.length * 7, AY = bbTop + 4;
  const bbX = AX + AW + 46;
  const colX = (c: number) => bbX + 14 + c * P;
  const R = {
    p1: bbTop + 12, n1: bbTop + 24, a: bbTop + 48, b: bbTop + 60, c: bbTop + 72, d: bbTop + 84, e: bbTop + 96,
    f: bbTop + 120, j: bbTop + 168, n2: bbTop + 192, p2: bbTop + 204,
  };
  const BH = 216, bbW = (nCols - 1) * P + 28;
  const bottomY0 = Math.max(AY + AH, bbTop + BH) + 14;
  const botLane = (k: number) => bottomY0 + k * 7;
  const H = botLane(nBottom - 1) + 14, W = bbX + bbW + 10;

  // --- moduli posizionati
  const placed: Placed[] = placedCols.map((p) => {
    const n = p.m.rows.length;
    const first = p.startCol + Math.floor((p.span - (p.onBoard ? 5 : n)) / 2);
    const pinX = p.onBoard ? [colX(first), colX(first + 2), colX(first + 4)] : p.m.rows.map((_, i) => colX(first + i));
    const mid = (pinX[0] + pinX[pinX.length - 1]) / 2;
    return { ...p, x: mid - p.w / 2, y: zoneBottom - p.h, pinX };
  });

  // --- pin dell'Arduino
  const topX0 = AX + AW - 16 - 18 * HP, botX0 = AX + AW - 16 - 14 * HP;
  const ardPin = (pin: number | string): { x: number; y: number; top: boolean; key: string } => {
    const ti = TOP_PINS.indexOf(pin);
    if (ti >= 0 && typeof pin === "number") return { x: topX0 + ti * HP, y: AY + 10, top: true, key: `t${ti}` };
    const bi = BOT_PINS.indexOf(pin);
    return { x: botX0 + bi * HP, y: AY + AH - 10, top: false, key: `b${bi}` };
  };
  const used = new Map<string, string>();

  // --- ordine delle corsie: chi parte più a destra sta più in basso (meno incroci)
  const srcOf = (s: Sig): Pt => {
    const p = placed[s.mi], r = p.m.rows[s.ri];
    if (p.onBoard) return [p.pinX[1], R.e];
    if (r.via === "divider") return [p.pinX[s.ri] - 2 * P, R.e];
    return [p.pinX[s.ri], pinTip];
  };
  const ordered = [...sigs].sort((a, b) => srcOf(a)[0] - srcOf(b)[0]);
  const laneOf = new Map(ordered.map((s, i) => [s, i]));
  const analogOrder = [...analog].sort((a, b) => srcOf(b)[0] - srcOf(a)[0]);

  const wires: React.ReactNode[] = [];
  const ends: React.ReactNode[] = [];
  const extras: React.ReactNode[] = [];

  // alimentazione: Arduino → binari in basso, ponticelli ai binari in alto
  const v5 = ardPin("5V"), gnd = ardPin("GND");
  used.set(v5.key, RED); used.set(gnd.key, BLK);
  const k5 = analog.length, kg = analog.length + 1;
  wires.push(<Wire key="p5" color={RED} d={ortho([[v5.x, v5.y], [v5.x, botLane(k5)], [colX(2), botLane(k5)], [colX(2), R.p2]])} />);
  wires.push(<Wire key="pg" color={BLK} d={ortho([[gnd.x, gnd.y], [gnd.x, botLane(kg)], [colX(3), botLane(kg)], [colX(3), R.n2]])} />);
  ends.push(<End key="e5a" x={colX(2)} y={R.p2} color={RED} />, <End key="ega" x={colX(3)} y={R.n2} color={BLK} />);
  wires.push(<Wire key="b5" color={RED} d={ortho([[colX(0), R.p2], [colX(0), R.p1]])} />);
  wires.push(<Wire key="bg" color={BLK} d={ortho([[colX(1), R.n2], [colX(1), R.n1]])} />);
  ends.push(<End key="b5a" x={colX(0)} y={R.p2} color={RED} />, <End key="b5b" x={colX(0)} y={R.p1} color={RED} />, <End key="bga" x={colX(1)} y={R.n2} color={BLK} />, <End key="bgb" x={colX(1)} y={R.n1} color={BLK} />);

  // moduli: alimentazione dritta ai binari in alto, segnali verso l'Arduino
  placed.forEach((p, mi) => {
    if (p.onBoard) {
      // partitore sulla breadboard: componente in alto, punto di mezzo, componente in basso
      const [xa, xm, xb] = p.pinX;
      const toGnd = p.m.options?.orientation === "ntcgnd" || p.m.options?.orientation === "ldrgnd";
      const part = (x1: number, x2: number, yy: number) => p.m.kind === "ntc"
        ? <g><line x1={x1} y1={yy} x2={x2} y2={yy} stroke="#9ca3af" strokeWidth={1.6} /><ellipse cx={(x1 + x2) / 2} cy={yy} rx={5} ry={4} fill="#1f2937" stroke="#7f1d1d" /></g>
        : <g><line x1={x1} y1={yy} x2={x2} y2={yy} stroke="#9ca3af" strokeWidth={1.6} /><circle cx={(x1 + x2) / 2} cy={yy} r={5.5} fill="#f59e0b" stroke="#92400e" /><path d={`M${(x1 + x2) / 2 - 3} ${yy - 2} q1.5 2 3 0 t3 0`} stroke="#7c2d12" fill="none" strokeWidth={0.8} /></g>;
      extras.push(<g key={`ob${mi}`}>
        {toGnd ? <Resistor x1={xa} x2={xm} y={R.c} value="10k" /> : part(xa, xm, R.c)}
        {toGnd ? part(xm, xb, R.d) : <Resistor x1={xm} x2={xb} y={R.d} value="10k" />}
        <text x={xm} y={R.e + 22} textAnchor="middle" fontSize={7} fontWeight={600} fill="#334155">{p.m.kind === "ntc" ? "NTC + 10 kΩ" : "LDR + 10 kΩ"}</text>
      </g>);
      wires.push(<Wire key={`o5${mi}`} color={RED} d={ortho([[xa, R.b], [xa, R.p1]])} />);
      wires.push(<Wire key={`og${mi}`} color={BLK} d={ortho([[xb, R.b], [xb, R.n1]])} />);
      ends.push(<End key={`o5e${mi}`} x={xa} y={R.b} color={RED} />, <End key={`oge${mi}`} x={xb} y={R.b} color={BLK} />);
      return;
    }
    p.m.rows.forEach((r, ri) => {
      const x = p.pinX[ri];
      if (r.conn === "5V" || r.conn === "GND") {
        const c = r.conn === "5V" ? RED : BLK, yy = r.conn === "5V" ? R.p1 : R.n1;
        wires.push(<Wire key={`pw${mi}-${ri}`} color={c} d={ortho([[x, pinTip], [x, yy]])} />);
        ends.push(<End key={`pwe${mi}-${ri}`} x={x} y={yy} color={c} />);
      }
      if (r.via === "divider") {
        // RXD del modulo: 1 kΩ dal pin D1, 2 kΩ verso GND → 3,3 V
        extras.push(<g key={`dv${mi}`}>
          <Resistor x1={x - 2 * P} x2={x} y={R.c} value="1k" />
          <Resistor x1={x} x2={x + 2 * P} y={R.b} value="2k" />
          <text x={x} y={R.e + 22} textAnchor="middle" fontSize={7} fontWeight={600} fill="#334155">1 kΩ + 2 kΩ</text>
        </g>);
        wires.push(<Wire key={`dvm${mi}`} color={p.m.color} d={ortho([[x, pinTip], [x, R.a]])} />);
        wires.push(<Wire key={`dvg${mi}`} color={BLK} d={ortho([[x + 2 * P, R.a], [x + 2 * P, R.n1]])} />);
        ends.push(<End key={`dve1${mi}`} x={x} y={R.a} color={p.m.color} />, <End key={`dve2${mi}`} x={x + 2 * P} y={R.a} color={BLK} />, <End key={`dve3${mi}`} x={x + 2 * P} y={R.n1} color={BLK} />);
      }
    });
  });

  // segnali
  sigs.forEach((s, i) => {
    const [sx, sy] = srcOf(s);
    const a = ardPin(s.pin);
    used.set(a.key, s.color);
    const ly = laneY(laneOf.get(s)!);
    let pts: Pt[];
    const fromBoard = placed[s.mi].onBoard;
    if (a.top) pts = [[sx, sy], [sx, ly], [a.x, ly], [a.x, a.y]];
    else if (fromBoard) {
      const k = analogOrder.indexOf(s);
      pts = [[sx, sy], [sx, botLane(k)], [a.x, botLane(k)], [a.x, a.y]];
    } else {
      const k = analogOrder.indexOf(s);
      const lx = AX - 8 - k * 7;
      pts = [[sx, sy], [sx, ly], [lx, ly], [lx, botLane(k)], [a.x, botLane(k)], [a.x, a.y]];
    }
    wires.push(<Wire key={`s${i}`} color={s.color} dashed={s.dashed} d={ortho(pts)} />);
    ends.push(<End key={`se${i}`} x={a.x} y={a.y} color={s.color} />);
    if (sy !== pinTip) ends.push(<End key={`ss${i}`} x={sx} y={sy} color={s.color} />);
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schema realistico dei collegamenti: Arduino, breadboard e sensori" className={className}>
      <defs>
        <pattern id="bbHoles" width={P} height={P} patternUnits="userSpaceOnUse" x={bbX + 14 - P / 2} y={bbTop + 48 - P / 2}>
          <rect x={P / 2 - 2.2} y={P / 2 - 2.2} width={4.4} height={4.4} rx={0.8} fill="#9aa3af" />
        </pattern>
        <pattern id="railHoles" width={P} height={P} patternUnits="userSpaceOnUse" x={bbX + 14 - P / 2} y={bbTop + 12 - P / 2}>
          <rect x={P / 2 - 2.2} y={P / 2 - 2.2} width={4.4} height={4.4} rx={0.8} fill="#9aa3af" />
        </pattern>
        <pattern id="mesh" width={3} height={3} patternUnits="userSpaceOnUse"><rect width={1.6} height={1.6} fill="#9ca3af" opacity={0.6} /></pattern>
      </defs>

      {/* breadboard */}
      <g>
        <rect x={bbX} y={bbTop} width={bbW} height={BH} rx={6} fill="#f1f3f5" stroke="#cbd2d9" />
        <rect x={bbX + 6} y={bbTop + 104} width={bbW - 12} height={8} rx={2} fill="#dde2e7" />
        {[[R.p1, RED, -8], [R.n1, "#2563eb", 8], [R.n2, "#2563eb", -8], [R.p2, RED, 8]].map(([yy, c, off], i) => (
          <line key={i} x1={bbX + 8} x2={bbX + bbW - 8} y1={(yy as number) + (off as number)} y2={(yy as number) + (off as number)} stroke={c as string} strokeWidth={1.4} />
        ))}
        <rect x={colX(0) - P / 2} y={R.p1 - P / 2} width={nCols * P} height={2 * P} fill="url(#railHoles)" />
        <rect x={colX(0) - P / 2} y={R.n2 - P / 2} width={nCols * P} height={2 * P} fill="url(#railHoles)" />
        <rect x={colX(0) - P / 2} y={R.a - P / 2} width={nCols * P} height={5 * P} fill="url(#bbHoles)" />
        <rect x={colX(0) - P / 2} y={R.f - P / 2} width={nCols * P} height={5 * P} fill="url(#bbHoles)" />
        <text x={bbX + 4} y={R.p1 + 2} fontSize={7} fontWeight={700} fill={RED}>+</text>
        <text x={bbX + 4} y={R.n1 + 3} fontSize={8} fontWeight={700} fill="#2563eb">−</text>
        <text x={bbX + 4} y={R.n2 + 3} fontSize={8} fontWeight={700} fill="#2563eb">−</text>
        <text x={bbX + 4} y={R.p2 + 2} fontSize={7} fontWeight={700} fill={RED}>+</text>
      </g>

      <ArduinoArt x={AX} y={AY} used={used} />
      {extras}

      {/* moduli e piedini */}
      {placed.map((p, mi) => !p.onBoard && (
        <g key={`m${mi}`}>
          <ModuleArt m={p.m} x={p.x} y={p.y} w={p.w} h={p.h} />
          {p.m.rows.map((r, ri) => (
            <g key={ri}>
              <rect x={p.pinX[ri] - 1.6} y={p.y + p.h - 2} width={3.2} height={11} fill="#d4a017" stroke="#92400e" strokeWidth={0.4} />
              <text transform={`translate(${p.pinX[ri] + 2.2} ${p.y + p.h - 5}) rotate(-90)`} fontSize={5.4} fontWeight={600} fill="#ffffffdd">{r.label.split(" ")[0].replace(/[()]/g, "")}</text>
            </g>
          ))}
        </g>
      ))}

      {wires}
      {ends}
    </svg>
  );
}
