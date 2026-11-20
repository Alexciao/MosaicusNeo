"use client";
// Schema dei collegamenti «realistico», nello stile di Tinkercad, pensato per essere rifatto
// sul banco foro per foro:
// • l'Arduino Uno disegnato com'è, con le scritte vere sugli header;
// • una breadboard con le colonne numerate e le righe a…j, come quelle vere;
// • i moduli INFILATI nella breadboard (piedini nella riga e), i ponticelli che partono dalla
//   riga a della stessa colonna: corti verso i binari (rosso 5V, nero GND), colorati verso Arduino;
// • l'elenco dei fili «da foro a foro» (BoardSteps), generato dalla stessa disposizione;
// • i componenti che servono perché funzioni davvero così com'è: pull-up (DHT, DS18B20),
//   resistenze in serie (LED RGB, cicalino passivo), partitori per gli ingressi a 3,3 V.
// Si genera dai sensori e dai pin scelti.

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { buildModules, OHMS, type BtModule, type Mod, type ResValue } from "./rig-diagram";
import { makeSensor, type SensorInstance } from "@/lib/sensors/rig";
import type { SensorType } from "@/lib/sensors/catalog";

const P = 12;                 // passo dei fori della breadboard (0,1")
const HP = 11;                // passo degli header dell'Arduino (alla scala del disegno)
const AW = 300, AH = 214;     // Arduino Uno (68,6 × 53,3 mm)
const RED = "#dc2626", BLK = "#27272a", INK = "#52525b";
const LZ = 20;                // fascia in alto sui moduli con i nomi dei piedini

// header dell'Uno R3, da sinistra a destra (USB a sinistra)
const TOP_LABELS = ["SCL", "SDA", "AREF", "GND", "13", "12", "~11", "~10", "~9", "8", "", "7", "~6", "~5", "4", "~3", "2", "TX→1", "RX←0"];
const TOP_PINS: (number | string | null)[] = [null, null, null, "GND", 13, 12, 11, 10, 9, 8, null, 7, 6, 5, 4, 3, 2, 1, 0];
const BOT_LABELS = ["", "IOREF", "RESET", "3.3V", "5V", "GND", "GND", "Vin", "", "A0", "A1", "A2", "A3", "A4", "A5"];
const BOT_PINS: (number | string | null)[] = [null, null, null, null, "5V", "GND", null, null, null, 14, 15, 16, 17, 18, 19];

// disegno dei moduli: larghezza, altezza (piedini sul lato in alto); ntc e ldr sono componenti sciolti
const SIZE: Record<string, [number, number]> = {
  dht: [54, 86], sonar: [124, 76], gps: [80, 98], analog: [52, 66], ds18b20: [64, 92], gate: [66, 78], hx711: [62, 74],
  imu: [56, 70], mlx: [54, 66], oled: [58, 66], rgb: [54, 64], buzzer: [48, 64], hc06: [60, 96], ble: [60, 96],
  button: [40, 48], sd: [82, 94],
};
const ON_BOARD = new Set(["ntc", "ldr"]);

// righe della breadboard (y rispetto al bordo in alto)
const ROWS = { p1: 12, n1: 24, num1: 37.5, a: 50, b: 62, c: 74, d: 86, e: 98, gap: 110, f: 122, g: 134, h: 146, i: 158, j: 170, num2: 184, n2: 196, p2: 208 };
const BH = 220;
type RowKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
const LETTERS: RowKey[] = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

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

// Ogni filo, puntale, piedino e resistenza dice che cosa collega (attributo data-tip): un solo
// suggerimento in stile shadcn segue il mouse, o compare dove tocchi sul telefono. Il filo sotto il
// mouse si ingrossa.
function Wire({ d, color, dashed, title }: { d: string; color: string; dashed?: boolean; title?: string }) {
  return (
    <g className="group/wire cursor-help" data-tip={title} data-wire="">
      <path d={d} fill="none" stroke="transparent" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
      <path d={d} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={5.4} strokeLinecap="round" strokeLinejoin="round" className="transition-[stroke-width] group-hover/wire:[stroke-width:8] group-data-[on]/wire:[stroke-width:8]" />
      <path d={d} fill="none" stroke={color} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "7 4" : undefined} className="transition-[stroke-width] group-hover/wire:[stroke-width:5.6] group-data-[on]/wire:[stroke-width:5.6]" />
      {!dashed && <path d={d} fill="none" stroke="#fff" strokeOpacity={0.32} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}
/** Puntale del ponticello, infilato in un foro. */
const End = ({ x, y, color, title }: { x: number; y: number; color: string; title?: string }) => (
  <g className="cursor-help" data-tip={title}>
    <rect x={x - 3} y={y - 3} width={6} height={6} rx={1.2} fill={color} stroke="#000" strokeOpacity={0.45} strokeWidth={0.8} />
    <rect x={x - 1.2} y={y - 1.2} width={2.4} height={2.4} fill="#e5e7eb" opacity={0.8} />
  </g>
);

// codice dei colori: prima cifra, seconda cifra, moltiplicatore (più la fascia oro della tolleranza)
const BANDS: Record<ResValue, string[]> = {
  "10k": ["#7c2d12", "#111", "#ea580c"], "1k": ["#7c2d12", "#111", "#dc2626"], "2k": ["#dc2626", "#111", "#dc2626"], "4k7": ["#eab308", "#7c3aed", "#dc2626"],
  "220": ["#dc2626", "#dc2626", "#7c2d12"], "100": ["#7c2d12", "#111", "#7c2d12"],
};
/** Resistenza tra due fori (orizzontale o verticale): corpo grande, contorno scuro e ombra, per staccarsi dalla breadboard chiara. */
function Resistor({ x1, y1, x2, y2, value, title }: { x1: number; y1: number; x2: number; y2: number; value: ResValue; title?: string }) {
  const len = Math.hypot(x2 - x1, y2 - y1), ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const bw = Math.min(22, len - 4), bh = 9.5, bx = len / 2 - bw / 2;
  return (
    <g transform={`translate(${x1} ${y1}) rotate(${ang})`} className={title ? "cursor-help" : undefined} data-tip={title}>
      <line x1={0} y1={0.8} x2={len} y2={0.8} stroke="#000" strokeOpacity={0.18} strokeWidth={3} strokeLinecap="round" />
      <line x1={0} y1={0} x2={len} y2={0} stroke="#4b5563" strokeWidth={2} strokeLinecap="round" />
      <circle cx={0} cy={0} r={1.8} fill="#4b5563" />
      <circle cx={len} cy={0} r={1.8} fill="#4b5563" />
      <rect x={bx + 0.6} y={-bh / 2 + 1.4} width={bw} height={bh} rx={4} fill="#000" opacity={0.22} />
      <rect x={bx} y={-bh / 2} width={bw} height={bh} rx={4} fill="#f3cf8e" stroke="#5c3d12" strokeWidth={1.1} />
      {BANDS[value].map((c, i) => <rect key={i} x={bx + 4 + (i * (bw - 8)) / 4.2} y={-bh / 2 + 0.55} width={2.4} height={bh - 1.1} fill={c} />)}
      <rect x={bx + bw - 5} y={-bh / 2 + 0.55} width={2} height={bh - 1.1} fill="#ca8a04" />
      <rect x={bx + 2} y={-bh / 2 + 1.5} width={bw - 4} height={1.6} rx={0.8} fill="#fff" opacity={0.35} />
    </g>
  );
}
/** Termistore o fotoresistenza tra due fori in orizzontale. */
function Part({ kind, x1, x2, y, title }: { kind: "ntc" | "ldr"; x1: number; x2: number; y: number; title?: string }) {
  const cx = (x1 + x2) / 2;
  return (
    <g className={title ? "cursor-help" : undefined} data-tip={title}>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#a1a1aa" strokeWidth={1.6} strokeLinecap="round" />
      {kind === "ntc" ? (
        <g>
          <ellipse cx={cx} cy={y} rx={6} ry={4.6} fill="#1c1917" stroke="#7f1d1d" strokeWidth={0.8} />
          <ellipse cx={cx - 1.8} cy={y - 1.6} rx={2} ry={1.1} fill="#fff" opacity={0.3} />
        </g>
      ) : (
        <g>
          <circle cx={cx} cy={y} r={6.4} fill="#f59e0b" stroke="#92400e" strokeWidth={0.8} />
          <path d={`M${cx - 4} ${y - 2.6} h8 M${cx - 4} ${y} h8 M${cx - 4} ${y + 2.6} h8`} stroke="#7c2d12" strokeWidth={0.8} />
          <path d={`M${cx + 4} ${y - 2.6} v2.6 M${cx - 4} ${y} v2.6`} stroke="#7c2d12" strokeWidth={0.8} />
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// I disegni dei moduli (x, y = angolo in alto a sinistra; i piedini escono dal lato in alto)
// ---------------------------------------------------------------------------
export function ModuleArt({ kind, options, x, y, w, h, uid }: { kind: string; options?: Record<string, number | string>; x: number; y: number; w: number; h: number; uid: string }) {
  const pcb = (fill: string, hh = h) => (
    <g>
      <rect x={x + 1} y={y + 2} width={w} height={hh} rx={4} fill="#000" opacity={0.22} />
      <rect x={x} y={y} width={w} height={hh} rx={4} fill={fill} stroke="#00000066" strokeWidth={0.8} />
      <rect x={x + 1.5} y={y + 1.5} width={w - 3} height={hh - 3} rx={3} fill="none" stroke="#fff" strokeOpacity={0.12} />
    </g>
  );
  const label = (t: string, yy: number, fill = "#fff", size = 6.5) => <text x={x + w / 2} y={yy} textAnchor="middle" fontSize={size} fontWeight={700} fill={fill} letterSpacing={0.4}>{t}</text>;
  const hole = (cx: number, cy: number, r = 2.6) => <circle cx={cx} cy={cy} r={r} fill="#e4e4e7" stroke="#a1a1aa" strokeWidth={0.6} />;
  const chip = (cx: number, cy: number, s: number) => (
    <g>
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={1.2} fill="#18181b" />
      <circle cx={cx - s / 2 + 2.6} cy={cy - s / 2 + 2.6} r={0.9} fill="#52525b" />
    </g>
  );
  const top = y + LZ;
  switch (kind) {
    case "dht": {
      const dht22 = options?.model === "dht22";
      const body = dht22 ? "#f4f4f5" : "#3b82f6", slot = dht22 ? "#a1a1aa" : "#1e3a8a";
      const gw = w - 14, gh = h - LZ - 18;
      return (
        <g>
          {pcb("#1e3a8a")}
          <rect x={x + 7} y={top} width={gw} height={gh} rx={2.5} fill={body} stroke="#0f172a66" />
          {Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) => (
            <rect key={`${r}-${c}`} x={x + 10.5 + c * ((gw - 7) / 4)} y={top + 4 + r * ((gh - 8) / 5)} width={(gw - 7) / 4 - 2.5} height={(gh - 8) / 5 - 2.5} rx={1} fill={slot} opacity={0.7} />
          )))}
          {label(dht22 ? "DHT22" : "DHT11", y + h - 6, "#dbeafe", 6.5)}
        </g>
      );
    }
    case "sonar": {
      const cy = y + LZ + 26;
      return (
        <g>
          {pcb("#1d4ed8")}
          {[x + 31, x + w - 31].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy={cy + 1.5} r={22} fill="#000" opacity={0.25} />
              <circle cx={cx} cy={cy} r={22} fill="#d4d4d8" stroke="#71717a" strokeWidth={1.2} />
              <circle cx={cx} cy={cy} r={17} fill="#3f3f46" />
              <circle cx={cx} cy={cy} r={17} fill={`url(#${uid}mesh)`} />
              <circle cx={cx - 6} cy={cy - 7} r={5} fill="#fff" opacity={0.12} />
            </g>
          ))}
          <rect x={x + w / 2 - 8} y={top + 2} width={16} height={7} rx={3.5} fill="#d4d4d8" stroke="#71717a" strokeWidth={0.6} />
          <text x={x + w / 2} y={cy + 4} textAnchor="middle" fontSize={4.6} fontWeight={700} fill="#dbeafe">T   R</text>
          {label("HC-SR04", y + h - 5, "#dbeafe", 5.6)}
        </g>
      );
    }
    case "gps": {
      const s = w - 22;
      return (
        <g>
          {pcb("#1e40af")}
          <rect x={x + 11} y={top + 2} width={s} height={s} rx={3} fill="#b45309" opacity={0.25} />
          <rect x={x + 13} y={top} width={s - 4} height={s - 4} rx={3} fill="#e0c88f" stroke="#a38a52" />
          <rect x={x + 21} y={top + 8} width={s - 20} height={s - 20} rx={1.5} fill="#cdb173" stroke="#a38a52" strokeWidth={0.5} />
          <circle cx={x + w / 2} cy={top + (s - 4) / 2} r={3.4} fill="#a1a1aa" stroke="#71717a" />
          <circle cx={x + w - 9} cy={y + h - 9} r={2.6} fill="#22c55e" />
          <circle cx={x + w - 9} cy={y + h - 9} r={4.5} fill="#22c55e" opacity={0.25} />
          {label("GPS NEO-6M", y + h - 6, "#dbeafe", 5.6)}
        </g>
      );
    }
    case "ds18b20": {
      // sonda «nuda»: connettore a 3 vie con i fili rosso, giallo e nero; la resistenza da 4,7 kΩ è sulla breadboard
      const bh = LZ + 10, cx = x + w / 2, cw = 34;
      return (
        <g>
          <rect x={cx - cw / 2 + 1} y={y + 2} width={cw} height={bh} rx={2.5} fill="#000" opacity={0.22} />
          <rect x={cx - cw / 2} y={y} width={cw} height={bh} rx={2.5} fill="#18181b" stroke="#00000066" strokeWidth={0.8} />
          {["#dc2626", "#eab308", "#18181b"].map((c, i) => (
            <path key={c} d={`M${cx - 8 + i * 8} ${y + bh} C ${cx - 8 + i * 8} ${y + bh + 6}, ${cx} ${y + bh + 4}, ${cx} ${y + bh + 10}`} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" />
          ))}
          <path d={`M${cx} ${y + bh + 10} C ${cx} ${y + bh + 24}, ${x + 12} ${y + bh + 16}, ${x + 14} ${y + h - 18}`} fill="none" stroke="#18181b" strokeWidth={5} strokeLinecap="round" />
          <rect x={x + 8} y={y + h - 20} width={12} height={20} rx={4} fill="#d4d4d8" stroke="#71717a" />
          <rect x={x + 10} y={y + h - 18} width={3} height={16} rx={1.5} fill="#fff" opacity={0.5} />
          <text x={x + w - 4} y={y + h - 4} textAnchor="end" fontSize={6} fontWeight={700} fill={INK}>DS18B20</text>
        </g>
      );
    }
    case "gate": {
      const fy = top + 4, fh = h - LZ - 18;
      return (
        <g>
          {pcb("#1d4ed8")}
          <path d={`M${x + 8} ${fy} h${w - 16} v${fh} h-14 v-${fh - 12} h-${w - 44} v${fh - 12} h-14 z`} fill="#18181b" />
          <circle cx={x + 15} cy={fy + fh - 8} r={2.4} fill="#f87171" />
          <circle cx={x + w - 15} cy={fy + fh - 8} r={2.4} fill="#52525b" />
          <path d={`M${x + 19} ${fy + fh - 8} H${x + w - 19}`} stroke="#f87171" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.8} />
          {label("FOTOCELLULA", y + h - 5, "#dbeafe", 5.4)}
        </g>
      );
    }
    case "hx711":
      return (
        <g>
          {pcb("#15803d")}
          {chip(x + w / 2, top + 13, 16)}
          {Array.from({ length: 5 }, (_, i) => <rect key={i} x={x + w / 2 - 9 + i * 4.2} y={top + 2.5} width={1.6} height={3} fill="#d4d4d8" />)}
          {Array.from({ length: 5 }, (_, i) => <rect key={`b${i}`} x={x + w / 2 - 9 + i * 4.2} y={top + 21.5} width={1.6} height={3} fill="#d4d4d8" />)}
          {[0, 1, 2, 3].map((i) => <Fragment key={i}>{hole(x + 11 + i * ((w - 22) / 3), y + h - 18)}</Fragment>)}
          {["E+", "E−", "A−", "A+"].map((t, i) => <text key={t} x={x + 11 + i * ((w - 22) / 3)} y={y + h - 22} textAnchor="middle" fontSize={4} fill="#dcfce7">{t}</text>)}
          {["#dc2626", "#18181b", "#f4f4f5", "#16a34a"].map((c, i) => <rect key={c} x={x + 10 + i * ((w - 22) / 3)} y={y + h - 16} width={2} height={6} fill={c} />)}
          {label("HX711", y + h - 4, "#dcfce7", 5.6)}
        </g>
      );
    case "imu":
      return (
        <g>
          {pcb("#1d4ed8")}
          {chip(x + w / 2 + 6, top + 16, 15)}
          <path d={`M${x + 9} ${top + 30} h11 m-3 -3 l3 3 -3 3 M${x + 9} ${top + 30} v-11 m-3 3 l3 -3 3 3`} stroke="#e0e7ff" strokeWidth={1} fill="none" />
          <text x={x + 23} y={top + 32} fontSize={4.6} fill="#e0e7ff">X</text>
          <text x={x + 7} y={top + 15} fontSize={4.6} fill="#e0e7ff">Y</text>
          {hole(x + 7, y + h - 7, 2.4)}{hole(x + w - 7, y + h - 7, 2.4)}
          {label("GY-521", y + h - 5, "#dbeafe", 5.8)}
        </g>
      );
    case "button": {
      // pulsante a 4 piedini (12 mm) con il cappuccio colorato
      const s = Math.min(w - 8, h - LZ - 4), cx = x + w / 2, cy = top + 2 + s / 2;
      return (
        <g>
          <rect x={cx - s / 2 + 1} y={cy - s / 2 + 2} width={s} height={s} rx={2} fill="#000" opacity={0.25} />
          <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={2} fill="#3f3f46" stroke="#18181b" strokeWidth={0.8} />
          <rect x={cx - s / 2 + 2} y={cy - s / 2 + 2} width={s - 4} height={s - 4} rx={1.5} fill="#a1a1aa" />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => <circle key={i} cx={cx + dx * (s / 2 - 3.2)} cy={cy + dy * (s / 2 - 3.2)} r={1.1} fill="#52525b" />)}
          <circle cx={cx} cy={cy + 1} r={s * 0.3} fill="#000" opacity={0.3} />
          <circle cx={cx} cy={cy} r={s * 0.3} fill="#dc2626" stroke="#7f1d1d" strokeWidth={0.8} />
          <circle cx={cx - s * 0.09} cy={cy - s * 0.1} r={s * 0.1} fill="#fff" opacity={0.35} />
          <rect x={x + 2} y={y} width={w - 4} height={LZ - 2} rx={2} fill="#27272a" />
        </g>
      );
    }
    case "sd": {
      // modulo «Micro SD Card Adapter»: regolatore, traslatore di livello e lo zoccolo metallico
      const sx = x + 10, sy = top + 6, sw = w - 20, sh = h - LZ - 26;
      return (
        <g>
          {pcb("#1d4ed8")}
          <rect x={sx + 1} y={sy + 2} width={sw} height={sh} rx={2} fill="#000" opacity={0.25} />
          <rect x={sx} y={sy} width={sw} height={sh} rx={2} fill="#d4d4d8" stroke="#71717a" strokeWidth={0.8} />
          <rect x={sx + 3} y={sy + 3} width={sw - 6} height={2} rx={1} fill="#fff" opacity={0.5} />
          <path d={`M${sx + 8} ${sy + sh - 4} h${sw - 22} l6 -6 v-${sh - 18} h-${sw - 16} z`} fill="#18181b" />
          <text x={sx + sw / 2 - 2} y={sy + sh / 2 + 2} textAnchor="middle" fontSize={5} fontWeight={700} fill="#e4e4e7">microSD</text>
          {chip(x + 18, y + h - 14, 9)}
          {chip(x + w - 18, y + h - 14, 9)}
          {label("MICRO SD", y + h - 4, "#dbeafe", 5.4)}
        </g>
      );
    }
    case "mlx": {
      // GY-906: schedina blu con il sensore nel barattolino metallico (TO-39) e la finestrella ottica
      const cx = x + w / 2, cy = top + 17;
      return (
        <g>
          {pcb("#1d4ed8")}
          <circle cx={cx + 0.8} cy={cy + 1.8} r={14} fill="#000" opacity={0.28} />
          <circle cx={cx} cy={cy} r={14} fill="#d4d4d8" stroke="#71717a" strokeWidth={1.1} />
          <circle cx={cx} cy={cy} r={11} fill="#a1a1aa" stroke="#e4e4e7" strokeWidth={0.8} />
          <rect x={cx - 1.6} y={cy + 9.5} width={3.2} height={4} fill="#a1a1aa" />
          <circle cx={cx} cy={cy} r={5} fill="#0f172a" />
          <circle cx={cx} cy={cy} r={5} fill="none" stroke="#7c3aed" strokeOpacity={0.55} strokeWidth={1.2} />
          <circle cx={cx - 1.8} cy={cy - 1.8} r={1.4} fill="#fff" opacity={0.35} />
          <circle cx={cx - 5} cy={cy - 6} r={3} fill="#fff" opacity={0.18} />
          {label("GY-906", y + h - 5, "#dbeafe", 5.8)}
        </g>
      );
    }
    case "oled":
      return (
        <g>
          {pcb("#0f172a")}
          <rect x={x + 5} y={top} width={w - 10} height={h - LZ - 12} rx={2} fill="#020617" stroke="#334155" />
          <rect x={x + 9} y={top + 4} width={w - 18} height={7} fill="#7dd3fc" />
          <text x={x + 11} y={top + 9.6} fontSize={5.2} fontWeight={700} fill="#020617" fontFamily="monospace">PRONTO</text>
          <text x={x + w / 2} y={top + 24} textAnchor="middle" fontSize={10} fontWeight={700} fill="#7dd3fc" fontFamily="monospace">OK</text>
          {label("OLED 0,49\"", y + h - 4, "#94a3b8", 5)}
        </g>
      );
    case "rgb": {
      const cy = top + 18;
      return (
        <g>
          {pcb("#18181b")}
          <defs>
            <radialGradient id={`${uid}led`} cx="38%" cy="32%" r="72%"><stop offset="0%" stopColor="#fff" /><stop offset="40%" stopColor="#a5f3fc" /><stop offset="72%" stopColor="#f0abfc" /><stop offset="100%" stopColor="#fca5a5" /></radialGradient>
          </defs>
          <circle cx={x + w / 2} cy={cy} r={18} fill="#a5f3fc" opacity={0.12} />
          <circle cx={x + w / 2} cy={cy} r={12.5} fill={`url(#${uid}led)`} stroke="#e4e4e7" strokeWidth={1} />
          {label("RGB", y + h - 5, "#d4d4d8", 5.8)}
        </g>
      );
    }
    case "buzzer": {
      const cy = top + 19;
      return (
        <g>
          {pcb("#18181b")}
          <circle cx={x + w / 2} cy={cy} r={16} fill="#09090b" stroke="#52525b" strokeWidth={1.4} />
          <circle cx={x + w / 2} cy={cy} r={11} fill="none" stroke="#27272a" strokeWidth={0.8} />
          <circle cx={x + w / 2} cy={cy} r={3} fill="#3f3f46" />
          <text x={x + w / 2 - 12} y={cy - 8} fontSize={7} fontWeight={700} fill="#e4e4e7">+</text>
          {label(options?.kind === "passive" ? "PASSIVO" : "BUZZER", y + h - 5, "#d4d4d8", 5.4)}
        </g>
      );
    }
    case "hc06":
    case "ble": {
      const ble = kind === "ble";
      return (
        <g>
          {pcb(ble ? "#065f46" : "#1d4ed8")}
          <rect x={x + 7} y={top} width={w - 14} height={h - LZ - 12} rx={2} fill={ble ? "#047857" : "#2563eb"} stroke="#00000044" />
          {chip(x + w / 2, top + 14, 14)}
          <rect x={x + 12} y={top + 26} width={8} height={5} rx={0.8} fill="#a1a1aa" />
          <path d={`M${x + 12} ${y + h - 30} h${w - 24} v5 h-${w - 30} v5 h${w - 30} v5 h-${w - 24}`} fill="none" stroke="#fbbf24" strokeWidth={1.6} />
          {label(ble ? "HM-10 BLE" : "HC-06", y + h - 4, "#e0f2fe", 5.6)}
        </g>
      );
    }
    default: {
      const cy = top + 18;
      return (
        <g>
          {pcb("#475569")}
          <rect x={x + w / 2 - 13} y={cy - 13} width={26} height={26} rx={2} fill="#2563eb" stroke="#1e3a8a" />
          <circle cx={x + w / 2} cy={cy} r={8} fill="#e4e4e7" stroke="#a1a1aa" />
          <rect x={x + w / 2 - 1} y={cy - 7} width={2} height={7} fill="#71717a" />
          {label("0–5 V", y + h - 5, "#e2e8f0", 6)}
        </g>
      );
    }
  }
}

/** Disegnino di un componente, per il catalogo e l'elenco del montaggio. */
export function ComponentThumb({ type, options, className }: { type: SensorType | "hc06" | "ble"; options?: Record<string, number | string>; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (type === "pmotion" || type === "psound") {
    // un telefono: assi (movimento) oppure onde sonore (microfono)
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden>
        <rect x={13} y={3} width={22} height={42} rx={4.5} fill="#27272a" />
        <rect x={15} y={7} width={18} height={33} rx={1.5} fill="#0f172a" />
        <rect x={21} y={4.6} width={6} height={1.2} rx={0.6} fill="#52525b" />
        {type === "pmotion" ? (
          <g stroke="#a3e635" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 31 h10 m-2.6 -2.4 l2.6 2.4 -2.6 2.4" />
            <path d="M20 31 v-13 m-2.4 2.6 l2.4 -2.6 2.4 2.6" />
            <circle cx={20} cy={31} r={1.6} fill="#a3e635" stroke="none" />
          </g>
        ) : (
          <g stroke="#fb7185" strokeWidth={1.6} fill="none" strokeLinecap="round">
            <path d="M18 23.5 v1 M21 20 v8 M24 17 v14 M27 20.5 v7 M30 22.5 v3" />
          </g>
        )}
      </svg>
    );
  }
  if (ON_BOARD.has(type)) {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden>
        <path d="M17 4 V22 M31 4 V22" stroke="#a1a1aa" strokeWidth={2} strokeLinecap="round" />
        {type === "ntc" ? (
          <g>
            <ellipse cx={24} cy={29} rx={12} ry={10} fill="#1c1917" stroke="#7f1d1d" strokeWidth={1.4} />
            <ellipse cx={20} cy={25} rx={4} ry={2.4} fill="#fff" opacity={0.3} />
          </g>
        ) : (
          <g>
            <circle cx={24} cy={30} r={13} fill="#f59e0b" stroke="#92400e" strokeWidth={1.4} />
            <path d="M16 25 h16 v5 h-16 v5 h16" fill="none" stroke="#7c2d12" strokeWidth={1.4} />
            <circle cx={20} cy={24} r={3} fill="#fff" opacity={0.3} />
          </g>
        )}
      </svg>
    );
  }
  const [w, h] = SIZE[type] ?? [56, 56];
  const mod = buildModules([{ ...makeSensor(type), ...(options ? { options } : {}) }])[0];
  const n = mod?.rows.length ?? 0;
  const pad = 5, side = Math.max(w, h - 4) + pad * 2;
  const x0 = (side - w) / 2;
  return (
    <svg viewBox={`0 ${-9} ${side} ${side}`} className={className} aria-hidden>
      <defs><pattern id={`${uid}mesh`} width={3} height={3} patternUnits="userSpaceOnUse"><rect width={1.6} height={1.6} fill="#a1a1aa" opacity={0.6} /></pattern></defs>
      {Array.from({ length: n }, (_, i) => {
        const px = side / 2 + (i - (n - 1) / 2) * P;
        return <rect key={i} x={px - 1.8} y={-8} width={3.6} height={10} fill="#d4a017" stroke="#92400e" strokeWidth={0.4} />;
      })}
      <ModuleArt kind={type} options={options ?? mod?.options} x={x0} y={0} w={w} h={h} uid={uid} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Arduino Uno
// ---------------------------------------------------------------------------
function ArduinoArt({ x, y, used, uid, tips }: { x: number; y: number; used: Map<string, string>; uid: string; tips: Map<string, string[]> }) {
  const topX0 = x + AW - 16 - 18 * HP, botX0 = x + AW - 16 - 14 * HP;
  const header = (x0: number, n: number, yy: number) => (
    <g>
      <rect x={x0 - HP / 2} y={yy - 5.5} width={n * HP} height={11} rx={1} fill="#18181b" />
      <rect x={x0 - HP / 2} y={yy - 5.5} width={n * HP} height={2} rx={1} fill="#3f3f46" />
    </g>
  );
  const pinHole = (cx: number, cy: number, c?: string, tip?: string[]) => (
    <g className={tip ? "cursor-help" : undefined} data-tip={tip?.join("\n")}>
      <rect x={cx - 2.4} y={cy - 2.4} width={4.8} height={4.8} fill="#09090b" stroke="#3f3f46" strokeWidth={0.5} />
      {c && <rect x={cx - 2.4} y={cy - 2.4} width={4.8} height={4.8} fill={c} />}
    </g>
  );
  const outline = `M${x + 8} ${y} H${x + AW - 18} L${x + AW - 8} ${y + 10} V${y + 60} L${x + AW} ${y + 68} V${y + AH - 28} L${x + AW - 8} ${y + AH - 20} V${y + AH - 8} Q${x + AW - 8} ${y + AH} ${x + AW - 16} ${y + AH} H${x + 8} Q${x} ${y + AH} ${x} ${y + AH - 8} V${y + 8} Q${x} ${y} ${x + 8} ${y} Z`;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}uno`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#11939c" /><stop offset="100%" stopColor="#0b7179" /></linearGradient>
      </defs>
      <path d={outline} transform="translate(2 3)" fill="#000" opacity={0.22} />
      <path d={outline} fill={`url(#${uid}uno)`} stroke="#075a60" strokeWidth={1.4} />
      {/* fori di fissaggio */}
      {[[x + 15, y + 13], [x + 16, y + AH - 13], [x + AW - 24, y + 66], [x + AW - 20, y + AH - 40]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r={6} fill="#d4d4d8" /><circle cx={cx} cy={cy} r={3.6} fill="#fafafa" stroke="#a1a1aa" strokeWidth={0.6} /></g>
      ))}
      {/* USB-B */}
      <rect x={x - 14} y={y + 30} width={50} height={44} rx={2} fill="#d4d4d8" stroke="#71717a" />
      <rect x={x - 14} y={y + 30} width={50} height={6} rx={2} fill="#f4f4f5" opacity={0.6} />
      <rect x={x - 14} y={y + 42} width={12} height={20} rx={1} fill="#52525b" />
      <rect x={x - 12} y={y + 46} width={8} height={12} fill="#e4e4e7" />
      {/* jack di alimentazione */}
      <rect x={x - 10} y={y + AH - 68} width={46} height={34} rx={3} fill="#18181b" />
      <rect x={x - 10} y={y + AH - 68} width={46} height={5} rx={2} fill="#3f3f46" />
      <circle cx={x + 2} cy={y + AH - 51} r={7.5} fill="#27272a" stroke="#52525b" />
      <circle cx={x + 2} cy={y + AH - 51} r={2.4} fill="#a1a1aa" />
      {/* regolatore e condensatori */}
      <rect x={x + 44} y={y + AH - 66} width={16} height={12} rx={1} fill="#27272a" />
      {[[x + 52, y + AH - 36], [x + 70, y + AH - 36]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r={7} fill="#a1a1aa" stroke="#52525b" /><path d={`M${cx - 5} ${cy} h10`} stroke="#52525b" strokeWidth={1.2} /></g>
      ))}
      {/* reset, 16U2, quarzo */}
      <rect x={x + 48} y={y + 10} width={15} height={15} rx={2} fill="#d4d4d8" stroke="#a1a1aa" />
      <circle cx={x + 55.5} cy={y + 17.5} r={4.4} fill="#b91c1c" />
      <text x={x + 55.5} y={y + 31.5} textAnchor="middle" fontSize={4.6} fill="#e0f2f1">RESET</text>
      <rect x={x + 54} y={y + 54} width={18} height={18} rx={1.2} fill="#18181b" transform={`rotate(45 ${x + 63} ${y + 63})`} />
      <rect x={x + 76} y={y + 82} width={22} height={9} rx={4.5} fill="#e4e4e7" stroke="#a1a1aa" />
      {/* LED */}
      {[["L", "#f59e0b", 0], ["TX", "#fbbf24", 1], ["RX", "#fbbf24", 2]].map(([t, c, i]) => (
        <g key={t as string}>
          <rect x={x + 88} y={y + 30 + (i as number) * 10} width={8} height={4.4} rx={1} fill={c as string} />
          <text x={x + 99} y={y + 34.2 + (i as number) * 10} fontSize={5.5} fill="#e0f2f1">{t}</text>
        </g>
      ))}
      <rect x={x + AW - 66} y={y + 42} width={8} height={4.4} rx={1} fill="#22c55e" />
      <circle cx={x + AW - 62} cy={y + 44.2} r={5} fill="#22c55e" opacity={0.25} />
      <text x={x + AW - 55} y={y + 46.5} fontSize={5.5} fill="#e0f2f1">ON</text>
      {/* microcontrollore e zoccolo */}
      <rect x={x + 116} y={y + AH - 104} width={154} height={42} rx={2} fill="#3f3f46" opacity={0.55} />
      <rect x={x + 120} y={y + AH - 99} width={146} height={32} rx={2} fill="#18181b" />
      <path d={`M${x + 120} ${y + AH - 87} a4 4 0 0 1 0 8`} fill="#3f3f46" />
      {Array.from({ length: 14 }, (_, i) => (
        <Fragment key={i}>
          <rect x={x + 124 + i * 10.2} y={y + AH - 103} width={3.4} height={4} fill="#d4d4d8" />
          <rect x={x + 124 + i * 10.2} y={y + AH - 67} width={3.4} height={4} fill="#d4d4d8" />
        </Fragment>
      ))}
      <text x={x + 193} y={y + AH - 80} textAnchor="middle" fontSize={7} fill="#71717a" fontFamily="monospace">ATMEGA328P</text>
      {/* ICSP */}
      <g>
        {Array.from({ length: 6 }, (_, i) => <rect key={i} x={x + AW - 26 + (i % 2) * 7} y={y + 98 + Math.floor(i / 2) * 7} width={5} height={5} fill="#18181b" />)}
        <text x={x + AW - 22} y={y + 95} textAnchor="middle" fontSize={4.6} fill="#e0f2f1">ICSP</text>
      </g>
      {/* marchio */}
      <g transform={`translate(${x + 150} ${y + 66})`}>
        <circle cx={-9} cy={0} r={8} fill="none" stroke="#e0f2f1" strokeWidth={3} />
        <circle cx={9} cy={0} r={8} fill="none" stroke="#e0f2f1" strokeWidth={3} />
        <path d="M-12.5 0 h7 M5.5 0 h7 M9 -3.5 v7" stroke="#e0f2f1" strokeWidth={1.6} />
        <text x={30} y={7} fontSize={20} fontWeight={800} fill="#e0f2f1" letterSpacing={1}>UNO</text>
      </g>
      <text x={x + 168} y={y + 90} fontSize={7} fill="#b2dfdb" letterSpacing={2}>ARDUINO</text>
      {/* header */}
      {header(topX0, 10, y + 10)}
      {header(topX0 + 11 * HP, 8, y + 10)}
      {header(botX0 + HP, 8, y + AH - 10)}
      {header(botX0 + 9 * HP, 6, y + AH - 10)}
      {TOP_LABELS.map((t, i) => t && (
        <g key={`t${i}`}>
          {pinHole(topX0 + i * HP, y + 10, used.get(`t${i}`), tips.get(`t${i}`))}
          <text transform={`translate(${topX0 + i * HP + 2.2} ${y + 19}) rotate(90)`} fontSize={5.6} fontWeight={used.has(`t${i}`) ? 700 : 400} fill="#ecfeff">{t}</text>
        </g>
      ))}
      {BOT_LABELS.map((t, i) => t && (
        <g key={`b${i}`}>
          {pinHole(botX0 + i * HP, y + AH - 10, used.get(`b${i}`), tips.get(`b${i}`))}
          <text transform={`translate(${botX0 + i * HP + 2.2} ${y + AH - 19}) rotate(-90)`} fontSize={5.6} fontWeight={used.has(`b${i}`) ? 700 : 400} fill="#ecfeff">{t}</text>
        </g>
      ))}
      <text x={topX0 + 4 * HP} y={y + 48} fontSize={6} fill="#b2dfdb" letterSpacing={0.5}>DIGITAL (PWM ~)</text>
      <text x={botX0 + 9 * HP} y={y + AH - 46} fontSize={6} fill="#b2dfdb" letterSpacing={0.5}>ANALOG IN</text>
      <text x={botX0 + 2 * HP} y={y + AH - 46} fontSize={6} fill="#b2dfdb" letterSpacing={0.5}>POWER</text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// La disposizione: dove va ogni modulo, ogni filo, e l'elenco «da foro a foro»
// ---------------------------------------------------------------------------
export interface StepWire { color: string; from: string; to: string; part?: string; dashed?: boolean }
export interface StepGroup { title: string; color: string; place: string; wires: StepWire[]; mod?: Mod }

/** Dove sta il componente in più di un piedino: la resistenza va dalla colonna del piedino alla colonna `col`, nella riga `row`. */
interface Cond { col: number; row: RowKey }
interface Placed { m: Mod; x: number; y: number; w: number; h: number; pinX: number[]; pinCol: number[]; onBoard: boolean; cond: Map<number, Cond> }

const hole = (row: RowKey, col: number) => `${row}${col + 1}`;
export const ardName = (pin: number) => (pin >= 14 ? `A${pin - 14}` : pin === 0 ? "D0 (RX←0)" : pin === 1 ? "D1 (TX→1)" : `D${pin}`);

function layout(sensors: SensorInstance[], bt: BtModule) {
  const mods = buildModules(sensors, bt);
  if (!mods.length) return null;

  // --- colonne della breadboard: 0–3 per l'alimentazione, poi un modulo dopo l'altro
  const FIRST = 5;
  let col = FIRST;
  const cols = mods.map((m) => {
    const onBoard = ON_BOARD.has(m.kind);
    const [w, h] = onBoard ? [0, 0] : SIZE[m.kind] ?? [56, 56];
    const n = onBoard ? 5 : m.rows.length;
    // piedini con un componente in più: ognuno prende una colonna libera a destra dei piedini
    const conds = onBoard ? [] : m.rows.map((r, ri) => ({ r, ri })).filter((c) => c.r.via);
    const extra = conds.length ? conds.length + 1 : 0;
    const span = Math.max(n + extra, Math.ceil((w + 10) / P));
    const first = col + Math.floor((span - n - extra) / 2);
    // il piedino più a destra usa la colonna più vicina e la riga più in alto (b, poi c, d):
    // le resistenze si annidano senza incrociare i fili che salgono dalla riga a
    const cond = new Map<number, Cond>();
    [...conds].reverse().forEach((c, k) => cond.set(c.ri, { col: first + n + 1 + k, row: (["b", "c", "d"] as const)[Math.min(k, 2)] }));
    const out = { m, w, h, onBoard, first, n, span, start: col, cond };
    col += span + 1;
    return out;
  });
  const nCols = Math.max(30, col + 2);

  // --- fili dei segnali (con una resistenza in serie o un partitore, il filo parte dall'altro capo della resistenza)
  type Sig = { mi: number; ri: number; pin: number; color: string; dashed?: boolean; col: number };
  const sigs: Sig[] = [];
  cols.forEach((c, mi) => c.m.rows.forEach((r, ri) => {
    if (typeof r.conn !== "number") return;
    const sc = c.onBoard ? c.first + 2 : r.via === "divider" || r.via === "series" ? c.cond.get(ri)!.col : c.first + ri;
    sigs.push({ mi, ri, pin: r.conn, color: c.m.color, dashed: r.dashed, col: sc });
  }));
  const ordered = [...sigs].sort((a, b) => a.col - b.col);
  const laneOf = new Map(ordered.map((s, i) => [s, i]));
  const analog = ordered.filter((s) => s.pin >= 14);           // dal più basso al più alto
  const nA = analog.length;

  // --- geometria
  const nLanes = Math.max(1, sigs.length);
  const bbTop = 16 + nLanes * 7;
  const laneY = (k: number) => bbTop - 12 - k * 7;
  const AX = 22 + nA * 7, AY = bbTop + 3;
  const bbX = AX + AW + 44;
  const colX = (c: number) => bbX + 22 + c * P;
  const R = Object.fromEntries(Object.entries(ROWS).map(([k, v]) => [k, bbTop + v])) as Record<keyof typeof ROWS, number>;
  const bbW = (nCols - 1) * P + 44;
  const bodyTop = R.e + 7;
  const modBottom = Math.max(0, ...cols.map((c) => (c.onBoard ? 0 : bodyTop + c.h)));
  const bottomY0 = Math.max(AY + AH, bbTop + BH, modBottom) + 14;
  const botLane = (k: number) => bottomY0 + k * 7;
  const H = botLane(nA + 1) + 12, W = bbX + bbW + 10;

  const placed: Placed[] = cols.map((c) => {
    const pinCol = c.onBoard ? [c.first, c.first + 2, c.first + 4] : c.m.rows.map((_, i) => c.first + i);
    const pinX = pinCol.map(colX);
    const mid = (pinX[0] + pinX[pinX.length - 1]) / 2;
    return { m: c.m, w: c.w, h: c.h, onBoard: c.onBoard, pinCol, pinX, x: mid - c.w / 2, y: bodyTop, cond: c.cond };
  });

  // --- pin dell'Arduino
  const topX0 = AX + AW - 16 - 18 * HP, botX0 = AX + AW - 16 - 14 * HP;
  const ardPin = (pin: number | string) => {
    const ti = TOP_PINS.indexOf(pin);
    if (ti >= 0 && typeof pin === "number") return { x: topX0 + ti * HP, y: AY + 10, top: true, key: `t${ti}` };
    const bi = BOT_PINS.indexOf(pin);
    return { x: botX0 + bi * HP, y: AY + AH - 10, top: false, key: `b${bi}` };
  };
  const used = new Map<string, string>();
  // suggerimenti dei pin di Arduino (un pin può servire a più fili: SDA e SCL condivisi)
  const tips = new Map<string, string[]>();
  const tip = (key: string, t: string) => tips.set(key, [...(tips.get(key) ?? []), t]);

  const wires: React.ReactNode[] = [], ends: React.ReactNode[] = [], parts: React.ReactNode[] = [];
  const steps: StepGroup[] = [];
  const count = { red: 0, black: 0, signal: 0 };

  // --- alimentazione: Arduino → binari in basso, ponticelli ai binari in alto
  const v5 = ardPin("5V"), gnd = ardPin("GND");
  used.set(v5.key, RED); used.set(gnd.key, BLK);
  const T5 = "Filo rosso: 5V di Arduino → binario + in basso", TG = "Filo nero: GND di Arduino → binario − in basso";
  const TB5 = "Ponticello rosso: binario + in basso → binario + in alto", TBG = "Ponticello nero: binario − in basso → binario − in alto";
  tip(gnd.key, TG); tip(v5.key, T5);
  wires.push(<Wire key="pg" color={BLK} title={TG} d={ortho([[gnd.x, gnd.y], [gnd.x, botLane(nA)], [colX(2), botLane(nA)], [colX(2), R.n2]])} />);
  wires.push(<Wire key="p5" color={RED} title={T5} d={ortho([[v5.x, v5.y], [v5.x, botLane(nA + 1)], [colX(3), botLane(nA + 1)], [colX(3), R.p2]])} />);
  wires.push(<Wire key="b5" color={RED} title={TB5} d={ortho([[colX(0), R.p2], [colX(0), R.p1]])} />);
  wires.push(<Wire key="bg" color={BLK} title={TBG} d={ortho([[colX(1), R.n2], [colX(1), R.n1]])} />);
  for (const [k, xx, yy, c, t] of [["e5", colX(3), R.p2, RED, T5], ["eg", colX(2), R.n2, BLK, TG], ["b5a", colX(0), R.p2, RED, TB5], ["b5b", colX(0), R.p1, RED, TB5], ["bga", colX(1), R.n2, BLK, TBG], ["bgb", colX(1), R.n1, BLK, TBG]] as const)
    ends.push(<End key={k} x={xx} y={yy} color={c} title={t} />);
  steps.push({
    title: "Alimentazione", color: RED, place: "Porta 5V e GND sui binari: il binario rosso (+) è il 5V, quello blu (−) è il GND.",
    wires: [
      { color: RED, from: "5V di Arduino", to: "binario + in basso" },
      { color: BLK, from: "GND di Arduino", to: "binario − in basso" },
      { color: RED, from: "binario + in basso", to: "binario + in alto" },
      { color: BLK, from: "binario − in basso", to: "binario − in alto" },
    ],
  });

  const railName = (c: "5V" | "GND") => (c === "5V" ? "binario + in alto" : "binario − in alto");
  const groupOf = new Map<number, StepGroup>();

  // --- moduli e componenti
  placed.forEach((p, mi) => {
    const g: StepGroup = { title: p.m.title, color: p.m.color, place: "", wires: [], mod: p.m };
    groupOf.set(mi, g);
    steps.push(g);
    if (p.onBoard) {
      // partitore: un componente tra A e M (riga e), l'altro tra M e B (riga d)
      const [ca, cm, cb] = p.pinCol, [xa, xm, xb] = p.pinX;
      const kind = p.m.kind as "ntc" | "ldr";
      const name = kind === "ntc" ? "termistore" : "fotoresistenza";
      const toGnd = p.m.options?.orientation === "ntcgnd" || p.m.options?.orientation === "ldrgnd";
      parts.push(<g key={`ob${mi}`}>
        {toGnd ? <Resistor x1={xa} y1={R.e} x2={xm} y2={R.e} value="10k" title={`${p.m.title}: resistenza 10 kΩ tra ${hole("e", ca)} e ${hole("e", cm)} (verso 5V)`} />
          : <Part kind={kind} x1={xa} x2={xm} y={R.e} title={`${p.m.title}: ${name} tra ${hole("e", ca)} e ${hole("e", cm)} (verso 5V)`} />}
        {toGnd ? <Part kind={kind} x1={xm} x2={xb} y={R.d} title={`${p.m.title}: ${name} tra ${hole("d", cm)} e ${hole("d", cb)} (verso GND)`} />
          : <Resistor x1={xm} y1={R.d} x2={xb} y2={R.d} value="10k" title={`${p.m.title}: resistenza 10 kΩ tra ${hole("d", cm)} e ${hole("d", cb)} (verso GND)`} />}
        <text x={xm} y={R.g + 2} textAnchor="middle" fontSize={7} fontWeight={700} fill={INK}>{kind === "ntc" ? "NTC" : "LDR"} + 10 kΩ</text>
      </g>);
      g.place = toGnd
        ? `Resistenza da 10 kΩ tra ${hole("e", ca)} e ${hole("e", cm)}, ${name} tra ${hole("d", cm)} e ${hole("d", cb)}.`
        : `${name[0].toUpperCase()}${name.slice(1)} tra ${hole("e", ca)} e ${hole("e", cm)}, resistenza da 10 kΩ tra ${hole("d", cm)} e ${hole("d", cb)}.`;
      const t5 = `${p.m.title}: ${hole("a", ca)} → binario + in alto (5V)`, tg = `${p.m.title}: ${hole("a", cb)} → binario − in alto (GND)`;
      wires.push(<Wire key={`o5${mi}`} color={RED} title={t5} d={ortho([[xa, R.a], [xa, R.p1]])} />);
      wires.push(<Wire key={`og${mi}`} color={BLK} title={tg} d={ortho([[xb, R.a], [xb, R.n1]])} />);
      ends.push(<End key={`o5a${mi}`} x={xa} y={R.a} color={RED} title={t5} />, <End key={`o5b${mi}`} x={xa} y={R.p1} color={RED} title={t5} />,
        <End key={`oga${mi}`} x={xb} y={R.a} color={BLK} title={tg} />, <End key={`ogb${mi}`} x={xb} y={R.n1} color={BLK} title={tg} />);
      g.wires.push({ color: RED, from: hole("a", ca), to: railName("5V") }, { color: BLK, from: hole("a", cb), to: railName("GND") });
      return;
    }
    g.place = `Piedini nella riga e: ${p.m.rows.map((r, ri) => `${r.label.split(" ")[0].replace(/[()]/g, "")} in ${hole("e", p.pinCol[ri])}`).join(", ")}.`;
    p.m.rows.forEach((r, ri) => {
      const x = p.pinX[ri], c = p.pinCol[ri];
      if (r.conn === "5V" || r.conn === "GND") {
        const color = r.conn === "5V" ? RED : BLK, yy = r.conn === "5V" ? R.p1 : R.n1;
        const t = `${p.m.title} · ${r.label}: ${hole("a", c)} → ${railName(r.conn)} (${r.conn})`;
        wires.push(<Wire key={`pw${mi}-${ri}`} color={color} title={t} d={ortho([[x, R.a], [x, yy]])} />);
        ends.push(<End key={`pwa${mi}-${ri}`} x={x} y={R.a} color={color} title={t} />, <End key={`pwb${mi}-${ri}`} x={x} y={yy} color={color} title={t} />);
        g.wires.push({ color, from: hole("a", c), to: railName(r.conn) });
      }
      const cd = p.cond.get(ri);
      if (!cd) return;
      const RES = "#a16207", pin = r.label.split(" ")[0].replace(/[()]/g, "");
      const tx = colX(cd.col), ty = R[cd.row], pinName = typeof r.conn === "number" ? ardName(r.conn) : r.conn;
      if (r.via === "divider") {
        // ingresso a 3,3 V del modulo: 2 kΩ verso GND, 1 kΩ verso il ponticello che viene dal pin di Arduino
        parts.push(<g key={`dv${mi}-${ri}`}>
          <Resistor x1={x} y1={R.a} x2={x} y2={R.n1} value="2k" title={`Partitore del ${p.m.title}: resistenza 2 kΩ da ${hole("a", c)} (${pin}) al binario − (GND)`} />
          <Resistor x1={x} y1={ty} x2={tx} y2={ty} value="1k" title={`Partitore del ${p.m.title}: resistenza 1 kΩ tra ${hole(cd.row, c)} (${pin}) e ${hole(cd.row, cd.col)} (filo da ${pinName})`} />
        </g>);
        g.wires.push(
          { color: RES, from: hole("a", c), to: railName("GND"), part: "resistenza 2 kΩ" },
          { color: RES, from: hole(cd.row, c), to: hole(cd.row, cd.col), part: "resistenza 1 kΩ" },
        );
        return;
      }
      const v = r.res ?? (r.via === "pullup" ? "10k" : "220");
      const why = r.via === "pullup" ? "verso 5V" : `filo verso ${pinName}`;
      parts.push(<Resistor key={`rs${mi}-${ri}`} x1={x} y1={ty} x2={tx} y2={ty} value={v}
        title={`${p.m.title}: resistenza ${OHMS[v]} tra ${hole(cd.row, c)} (${pin}) e ${hole(cd.row, cd.col)} (${why})`} />);
      g.wires.push({ color: RES, from: hole(cd.row, c), to: hole(cd.row, cd.col), part: `resistenza ${OHMS[v]}${r.via === "pullup" ? " (pull-up)" : ""}` });
      if (r.via === "pullup") {
        // l'altro capo della resistenza va al binario + con un ponticello rosso
        const t = `${p.m.title} · pull-up di ${pin}: ${hole("a", cd.col)} → binario + in alto (5V)`;
        wires.push(<Wire key={`pu${mi}-${ri}`} color={RED} title={t} d={ortho([[tx, R.a], [tx, R.p1]])} />);
        ends.push(<End key={`pua${mi}-${ri}`} x={tx} y={R.a} color={RED} title={t} />, <End key={`pub${mi}-${ri}`} x={tx} y={R.p1} color={RED} title={t} />);
        g.wires.push({ color: RED, from: hole("a", cd.col), to: railName("5V") });
      }
    });
  });

  // --- segnali: dalla riga a, su fino alle corsie, poi ad Arduino
  for (const s of ordered) {
    const sx = colX(s.col), sy = R.a;
    const a = ardPin(s.pin);
    used.set(a.key, s.color);
    const ly = laneY(laneOf.get(s)!);
    let pts: Pt[];
    if (a.top) pts = [[sx, sy], [sx, ly], [a.x, ly], [a.x, a.y]];
    else {
      const r = analog.indexOf(s);
      const lx = AX - 12 - r * 7;
      pts = [[sx, sy], [sx, ly], [lx, ly], [lx, botLane(r)], [a.x, botLane(r)], [a.x, a.y]];
    }
    const k = `${s.mi}-${s.ri}`;
    const mod = placed[s.mi].m, row = mod.rows[s.ri];
    const t = `${mod.title} · ${placed[s.mi].onBoard ? "punto di mezzo" : row.label}: ${hole("a", s.col)} → ${ardName(s.pin)}${s.dashed ? " (facoltativo)" : ""}`;
    tip(a.key, t);
    wires.push(<Wire key={`s${k}`} color={s.color} dashed={s.dashed} title={t} d={ortho(pts)} />);
    ends.push(<End key={`sa${k}`} x={a.x} y={a.y} color={s.color} title={t} />, <End key={`sb${k}`} x={sx} y={sy} color={s.color} title={t} />);
    groupOf.get(s.mi)!.wires.push({ color: s.color, from: hole("a", s.col), to: ardName(s.pin), dashed: s.dashed, part: s.dashed ? "facoltativo" : undefined });
  }

  for (const g of steps) for (const w of g.wires) if (!w.part) { if (w.color === RED) count.red++; else if (w.color === BLK) count.black++; else count.signal++; }
  return { W, H, bbX, bbTop, bbW, nCols, R, colX, AX, AY, placed, wires, ends, parts, used, tips, steps, count };
}

type TipState = { text: string; x: number; y: number } | null;

/** Il suggerimento che segue il puntatore: un'ancora virtuale nel punto del mouse o del dito. */
function FollowTip({ channelRef }: { channelRef: React.RefObject<(t: TipState) => void> }) {
  const [tip, setTip] = useState<TipState>(null);
  useEffect(() => {
    channelRef.current = setTip;
    // sul telefono si chiude scorrendo
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => { channelRef.current = () => {}; window.removeEventListener("scroll", hide, true); };
  }, [channelRef]);
  return (
    <Tooltip open={!!tip} onOpenChange={(o) => { if (!o) setTip(null); }}>
      <TooltipContent side="top" sideOffset={14} className="pointer-events-none max-w-72 whitespace-pre-line text-left"
        anchor={tip ? { getBoundingClientRect: () => new DOMRect(tip.x, tip.y, 0, 0) } : undefined}>
        {tip?.text}
      </TooltipContent>
    </Tooltip>
  );
}

export function BoardDiagram({ sensors, bt = null, className }: { sensors: SensorInstance[]; bt?: BtModule; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const channel = useRef<(t: TipState) => void>(() => {});
  const pointer = useRef("mouse");
  const L = layout(sensors, bt);
  if (!L) return null;
  const tipAt = (e: React.PointerEvent | React.MouseEvent, keep = false) => {
    const el = (e.target as Element).closest?.("[data-tip]");
    // tocco: il filo scelto resta in evidenza (col mouse basta :hover)
    if (pointer.current !== "mouse") {
      const svg = e.currentTarget as SVGSVGElement;
      svg.querySelectorAll("[data-on]").forEach((n) => n.removeAttribute("data-on"));
      const wire = el?.closest("[data-wire]");
      if (wire) { wire.setAttribute("data-on", ""); svg.setAttribute("data-focus", ""); } else svg.removeAttribute("data-focus");
    }
    if (el) channel.current({ text: el.getAttribute("data-tip") ?? "", x: e.clientX, y: e.clientY });
    else if (!keep) channel.current(null);
    return !!el;
  };
  const { W, H, bbX, bbTop, bbW, nCols, R, colX, AX, AY, placed, wires, ends, parts, used, tips } = L;
  const gridX = colX(0) - P / 2, gridW = nCols * P;
  return (
    <>
    <FollowTip channelRef={channel} />
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schema realistico dei collegamenti: Arduino, breadboard e sensori"
      // con un filo in evidenza (mouse sopra, o toccato) gli altri si scuriscono un po'
      className={cn(className, "[&_g[data-wire]]:transition-[filter] [&:has(g[data-wire]:hover)_g[data-wire]:not(:hover)]:brightness-75 [&[data-focus]_g[data-wire]:not([data-on])]:brightness-75")}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      onPointerMove={(e) => { if (e.pointerType === "mouse") tipAt(e); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") channel.current(null); }}
      onPointerDown={(e) => { pointer.current = e.pointerType; }}
      // tocco: su un filo, un piedino o una resistenza mostra il suggerimento (e non apre lo schema
      // a tutto schermo); altrove il tocco fa quello di sempre
      onClick={(e) => { if (pointer.current !== "mouse" && tipAt(e)) { e.stopPropagation(); e.preventDefault(); } }}>
      <defs>
        <pattern id={`${uid}holes`} width={P} height={P} patternUnits="userSpaceOnUse" x={gridX} y={R.a - P / 2}>
          <rect x={P / 2 - 2.4} y={P / 2 - 2.4} width={4.8} height={4.8} rx={0.8} fill="#d4d4d8" />
          <rect x={P / 2 - 1.7} y={P / 2 - 1.5} width={3.4} height={3.4} rx={0.5} fill="#52525b" />
        </pattern>
        <pattern id={`${uid}rail`} width={P} height={P} patternUnits="userSpaceOnUse" x={gridX} y={R.p1 - P / 2}>
          <rect x={P / 2 - 2.4} y={P / 2 - 2.4} width={4.8} height={4.8} rx={0.8} fill="#d4d4d8" />
          <rect x={P / 2 - 1.7} y={P / 2 - 1.5} width={3.4} height={3.4} rx={0.5} fill="#52525b" />
        </pattern>
        <pattern id={`${uid}mesh`} width={3} height={3} patternUnits="userSpaceOnUse"><rect width={1.6} height={1.6} fill="#a1a1aa" opacity={0.6} /></pattern>
        <linearGradient id={`${uid}bb`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fafaf9" /><stop offset="100%" stopColor="#e7e5e4" /></linearGradient>
      </defs>

      {/* breadboard */}
      <g>
        <rect x={bbX + 2} y={bbTop + 3} width={bbW} height={BH} rx={7} fill="#000" opacity={0.15} />
        <rect x={bbX} y={bbTop} width={bbW} height={BH} rx={7} fill={`url(#${uid}bb)`} stroke="#d6d3d1" />
        <rect x={bbX + 8} y={R.gap - 5} width={bbW - 16} height={10} rx={2} fill="#d6d3d1" />
        <rect x={bbX + 8} y={R.gap - 5} width={bbW - 16} height={3} rx={1.5} fill="#a8a29e" opacity={0.4} />
        {[[R.p1 - 8, RED], [R.n1 + 8, "#2563eb"], [R.n2 - 8, "#2563eb"], [R.p2 + 8, RED]].map(([yy, c], i) => (
          <line key={i} x1={bbX + 14} x2={bbX + bbW - 14} y1={yy as number} y2={yy as number} stroke={c as string} strokeWidth={1.4} />
        ))}
        <rect x={gridX} y={R.p1 - P / 2} width={gridW} height={2 * P} fill={`url(#${uid}rail)`} />
        <rect x={gridX} y={R.n2 - P / 2} width={gridW} height={2 * P} fill={`url(#${uid}rail)`} />
        <rect x={gridX} y={R.a - P / 2} width={gridW} height={5 * P} fill={`url(#${uid}holes)`} />
        <rect x={gridX} y={R.f - P / 2} width={gridW} height={5 * P} fill={`url(#${uid}holes)`} />
        {[R.p1, R.p2].map((yy) => [bbX + 8, bbX + bbW - 8].map((xx) => <text key={`${yy}${xx}`} x={xx} y={yy + 2.5} textAnchor="middle" fontSize={8} fontWeight={700} fill={RED}>+</text>))}
        {[R.n1, R.n2].map((yy) => [bbX + 8, bbX + bbW - 8].map((xx) => <text key={`${yy}${xx}`} x={xx} y={yy + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#2563eb">−</text>))}
        {LETTERS.map((l) => [bbX + 11, bbX + bbW - 11].map((xx) => (
          <text key={`${l}${xx}`} x={xx} y={R[l] + 2.2} textAnchor="middle" fontSize={6} fontWeight={600} fill="#78716c">{l}</text>
        )))}
        {Array.from({ length: nCols }, (_, c) => (
          <Fragment key={c}>
            <text x={colX(c)} y={R.num1 + 2} textAnchor="middle" fontSize={(c + 1) % 5 === 0 || c === 0 ? 5.6 : 4.6} fontWeight={(c + 1) % 5 === 0 || c === 0 ? 700 : 400} fill="#78716c">{c + 1}</text>
            <text x={colX(c)} y={R.num2 + 2} textAnchor="middle" fontSize={(c + 1) % 5 === 0 || c === 0 ? 5.6 : 4.6} fontWeight={(c + 1) % 5 === 0 || c === 0 ? 700 : 400} fill="#78716c">{c + 1}</text>
          </Fragment>
        ))}
      </g>

      <ArduinoArt x={AX} y={AY} used={used} uid={uid} tips={tips} />
      {parts}

      {/* moduli infilati nella riga e */}
      {placed.map((p, mi) => !p.onBoard && (
        <g key={`m${mi}`}>
          <ModuleArt kind={p.m.kind} options={p.m.options} x={p.x} y={p.y} w={p.w} h={p.h} uid={uid} />
          {p.m.rows.map((r, ri) => (
            <g key={ri} className="cursor-help"
              data-tip={`${p.m.title} · piedino ${r.label}: foro ${hole("e", p.pinCol[ri])} → ${typeof r.conn === "number" ? ardName(r.conn) : r.conn === "5V" ? "binario + (5V)" : "binario − (GND)"}${r.via === "divider" ? " attraverso il partitore" : r.via === "series" ? ` attraverso ${OHMS[r.res ?? "220"]}` : r.via === "pullup" ? `, con ${OHMS[r.res ?? "10k"]} verso 5V` : ""}`}>
              <rect x={p.pinX[ri] - 1.8} y={R.e - 1} width={3.6} height={p.y - R.e + 3} fill="#d4a017" stroke="#92400e" strokeWidth={0.4} />
              <rect x={p.pinX[ri] - 3} y={p.y + 1} width={6} height={4} fill="#18181b" />
              <text transform={`translate(${p.pinX[ri] - 2} ${p.y + 7}) rotate(90)`} fontSize={5.2} fontWeight={700} fill="#ffffffe6">{r.label.split(" ")[0].replace(/[()]/g, "")}</text>
            </g>
          ))}
        </g>
      ))}

      {wires}
      {ends}
    </svg>
    </>
  );
}

/** La disposizione sulla breadboard senza il disegno: gruppi di fili «da foro a foro», quanti ponticelli, quante colonne. */
export function boardPlan(sensors: SensorInstance[], bt: BtModule = null) {
  const L = layout(sensors, bt);
  return L ? { groups: L.steps, count: L.count, nCols: L.nCols } : null;
}
