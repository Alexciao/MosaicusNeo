// Piccole illustrazioni dell'occorrente (48 × 48): Arduino, breadboard, resistenze, ponticelli,
// scheda microSD, power bank, cavo JST. Stesso stile dello schema realistico: forme arrotondate,
// colori veri dei componenti, leggibili sia nel tema chiaro sia in quello scuro.

import type { ResValue } from "./rig-diagram";

export type PartArt = "arduino" | "breadboard" | "breadboard-xl" | "resistor" | "jumpers" | "microsd" | "powerbank" | "jst";

// codice dei colori: prima cifra, seconda cifra, moltiplicatore (come nello schema realistico)
const BANDS: Record<ResValue, string[]> = {
  "10k": ["#7c2d12", "#111", "#ea580c"], "1k": ["#7c2d12", "#111", "#dc2626"], "2k": ["#dc2626", "#111", "#dc2626"], "4k7": ["#eab308", "#7c3aed", "#dc2626"],
  "220": ["#dc2626", "#dc2626", "#7c2d12"], "100": ["#7c2d12", "#111", "#7c2d12"],
};

function Arduino() {
  return (
    <>
      <rect x={4} y={9} width={40} height={30} rx={3.5} fill="#0e7490" />
      <rect x={4} y={9} width={40} height={30} rx={3.5} fill="none" stroke="#164e63" strokeWidth={0.8} />
      {/* USB B e jack */}
      <rect x={1.5} y={14} width={9} height={8} rx={1} fill="#d4d4d8" stroke="#71717a" strokeWidth={0.6} />
      <rect x={2} y={28} width={7} height={7} rx={1} fill="#27272a" />
      {/* header */}
      <rect x={15} y={11} width={26} height={3.2} rx={0.6} fill="#18181b" />
      <rect x={19} y={33.8} width={22} height={3.2} rx={0.6} fill="#18181b" />
      {/* microcontrollore */}
      <rect x={21} y={20} width={16} height={7} rx={0.8} fill="#27272a" />
      <circle cx={13.5} cy={33} r={1.2} fill="#a3e635" />
      <text x={29} y={31.5} textAnchor="middle" fontSize={3.4} fontWeight={700} fill="#ecfeff" opacity={0.85}>UNO</text>
    </>
  );
}

function Breadboard({ xl }: { xl?: boolean }) {
  const cols = xl ? 9 : 6;
  const x0 = xl ? 5 : 9, w = xl ? 38 : 30, step = (w - 6) / (cols - 1);
  return (
    <>
      <rect x={x0} y={7} width={w} height={34} rx={2.5} fill="#f5f5f4" stroke="#a8a29e" strokeWidth={0.8} />
      <line x1={x0 + 2} y1={10} x2={x0 + w - 2} y2={10} stroke="#dc2626" strokeWidth={0.7} />
      <line x1={x0 + 2} y1={38} x2={x0 + w - 2} y2={38} stroke="#2563eb" strokeWidth={0.7} />
      <rect x={x0 + 1} y={23} width={w - 2} height={2} fill="#e7e5e4" />
      {Array.from({ length: cols }, (_, c) => (
        [13, 16.5, 20, 28, 31.5, 35].map((y) => <rect key={`${c}-${y}`} x={x0 + 3 + c * step - 0.8} y={y - 0.8} width={1.6} height={1.6} rx={0.3} fill="#57534e" opacity={0.7} />)
      ))}
    </>
  );
}

function Resistor({ value = "10k" }: { value?: ResValue }) {
  return (
    <g transform="rotate(-30 24 24)">
      <line x1={3} y1={24} x2={45} y2={24} stroke="#71717a" strokeWidth={1.6} strokeLinecap="round" />
      <rect x={13} y={18.5} width={22} height={11} rx={5} fill="#f3cf8e" stroke="#5c3d12" strokeWidth={0.9} />
      {BANDS[value].map((c, i) => <rect key={i} x={16.5 + i * 4} y={18.9} width={2.2} height={10.2} fill={c} />)}
      <rect x={30} y={18.9} width={2} height={10.2} fill="#ca8a04" />
      <rect x={15} y={20} width={18} height={1.6} rx={0.8} fill="#fff" opacity={0.4} />
    </g>
  );
}

function Jumpers() {
  const wire = (d: string, color: string) => (
    <g>
      <path d={d} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={3.6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </g>
  );
  const pin = (x: number, y: number, color: string) => <rect x={x - 2} y={y - 3} width={4} height={6} rx={0.8} fill={color} stroke="#000" strokeOpacity={0.4} strokeWidth={0.5} />;
  return (
    <>
      {wire("M8 38 C 8 18, 24 30, 24 10", "#dc2626")}
      {wire("M18 40 C 18 22, 34 30, 34 10", "#27272a")}
      {wire("M28 40 C 28 26, 42 30, 42 14", "#2563eb")}
      {pin(8, 38, "#dc2626")}{pin(24, 10, "#dc2626")}
      {pin(18, 40, "#3f3f46")}{pin(34, 10, "#3f3f46")}
      {pin(28, 40, "#2563eb")}{pin(42, 14, "#2563eb")}
    </>
  );
}

function MicroSd() {
  return (
    <>
      <path d="M15 6 h16 l4 5 v29 a2.5 2.5 0 0 1 -2.5 2.5 h-17 a2.5 2.5 0 0 1 -2.5 -2.5 v-31.5 a2.5 2.5 0 0 1 2 -2.5 z" fill="#27272a" />
      {[17, 20.5, 24, 27.5, 31].map((x) => <rect key={x} x={x} y={8} width={2} height={6} rx={0.5} fill="#eab308" />)}
      <rect x={15.5} y={20} width={17} height={14} rx={1.5} fill="#3f3f46" />
      <text x={24} y={29.5} textAnchor="middle" fontSize={5} fontWeight={800} fill="#e4e4e7">SD</text>
    </>
  );
}

function PowerBank() {
  return (
    <>
      <rect x={10} y={5} width={28} height={38} rx={5} fill="#3f3f46" />
      <rect x={10} y={5} width={28} height={38} rx={5} fill="none" stroke="#18181b" strokeWidth={0.8} />
      <rect x={19} y={2.5} width={10} height={3.5} rx={1} fill="#a1a1aa" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={15 + i * 5} y={34} width={3.4} height={2.6} rx={0.6} fill={i < 3 ? "#a3e635" : "#52525b"} />)}
      <path d="M25.5 13 l-5 9 h4 l-1.5 7 l5.5 -9.5 h-4 z" fill="#facc15" />
    </>
  );
}

function Jst() {
  return (
    <>
      <rect x={6} y={18} width={11} height={12} rx={1.5} fill="#f5f5f4" stroke="#a8a29e" strokeWidth={0.8} />
      {["#dc2626", "#27272a", "#2563eb", "#16a34a", "#eab308"].map((c, i) => (
        <path key={c} d={`M17 ${19.5 + i * 2.2} C 28 ${19.5 + i * 2.2}, 26 ${10 + i * 7}, 38 ${10 + i * 7}`} fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={37} y={8.5 + i * 7} width={6} height={3} rx={0.6} fill="#3f3f46" />)}
    </>
  );
}

export function PartThumb({ art, value, className }: { art: PartArt; value?: ResValue; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      {art === "arduino" ? <Arduino />
        : art === "breadboard" ? <Breadboard />
          : art === "breadboard-xl" ? <Breadboard xl />
            : art === "resistor" ? <Resistor value={value} />
              : art === "jumpers" ? <Jumpers />
                : art === "microsd" ? <MicroSd />
                  : art === "powerbank" ? <PowerBank />
                    : <Jst />}
    </svg>
  );
}
