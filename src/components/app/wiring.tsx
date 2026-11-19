"use client";
// Schemi dei collegamenti, disegnati in SVG: seguono il tema (chiaro/scuro) e funzionano offline.

import { Lightbulb, Plug, TriangleExclamationPoint } from "lucide-react";
import type { Schematic, WiringBlock } from "@/lib/mosaicus/experiments";
import { cn } from "@/lib/utils";

const W5V = "#D6336C", WGND = "var(--tone-ink)", WSIG = "#2E8BC0";

function Board({ x, y, w, h, label, fill = "var(--tone-lime)" }: { x: number; y: number; w: number; h: number; label: string; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke="currentColor" strokeOpacity={0.5} />
      <text x={x + w / 2} y={y + 18} textAnchor="middle" fontWeight={600} fontSize={12}>{label}</text>
    </g>
  );
}
const Pin = ({ x, y, end, children, muted }: { x: number; y: number; end?: boolean; children: React.ReactNode; muted?: boolean }) => (
  <text x={x} y={y} textAnchor={end ? "end" : "start"} fontSize={11} opacity={muted ? 0.55 : 0.85}>{children}</text>
);
const Wire = ({ d, color, dash }: { d: string; color: string; dash?: boolean }) => (
  <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash ? "5 3" : undefined} />
);

function Hcsr04() {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label="Collegamenti HC-SR04: VCC a 5V, GND a GND, Trig al pin 12, Echo al pin 11">
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={72} end>GND</Pin><Pin x={92} y={94} end>pin 12</Pin><Pin x={92} y={116} end>pin 11</Pin>
      <Board x={200} y={6} w={96} h={120} label="HC-SR04" fill="var(--tone-sky)" />
      <Pin x={208} y={50}>VCC</Pin><Pin x={208} y={72}>GND</Pin><Pin x={208} y={94}>Trig</Pin><Pin x={208} y={116}>Echo</Pin>
      <Wire d="M100 46H200" color={W5V} /><Wire d="M100 68H200" color={WGND} />
      <Wire d="M100 90H200" color={WSIG} /><Wire d="M100 112H200" color={WSIG} dash />
    </svg>
  );
}

function Ntc() {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label="Partitore: termistore NTC tra 5V e A0, resistenza da 10 kilo-ohm tra A0 e GND">
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={82} end>A0</Pin><Pin x={92} y={114} end>GND</Pin>
      <Wire d="M100 46H230V52" color={W5V} />
      <rect x={180} y={52} width={100} height={20} rx={4} fill="var(--tone-rose)" stroke="#D6336C" />
      <text x={230} y={66} textAnchor="middle" fontSize={11}>NTC 10 kΩ</text>
      <Wire d="M100 78H230M230 72V84" color={WSIG} />
      <circle cx={230} cy={78} r={3.5} fill={WSIG} />
      <rect x={180} y={84} width={100} height={20} rx={4} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.5} />
      <text x={230} y={98} textAnchor="middle" fontSize={11}>10 kΩ</text>
      <Wire d="M230 104V110H100" color={WGND} />
    </svg>
  );
}

function Mic() {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label="Modulo microfono: più a 5V, G a GND, AO al pin A0">
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={76} end>GND</Pin><Pin x={92} y={102} end>A0</Pin>
      <Board x={200} y={6} w={96} h={120} label="microfono" fill="var(--tone-rose)" />
      <Pin x={208} y={50}>+</Pin><Pin x={208} y={76}>G</Pin><Pin x={208} y={102}>AO</Pin><Pin x={208} y={122} muted>DO (libero)</Pin>
      <Wire d="M100 46H200" color={W5V} /><Wire d="M100 72H200" color={WGND} /><Wire d="M100 98H200" color={WSIG} />
    </svg>
  );
}

function Coil() {
  return (
    <svg viewBox="0 0 300 150" role="img" aria-label="Due resistenze da 10 kilo-ohm tra 5V e GND fanno 2,5 V nel punto di mezzo; la bobina va dal punto di mezzo, attraverso 1 kilo-ohm, al pin A0">
      <Board x={4} y={6} w={80} h={138} label="Arduino" />
      <Pin x={76} y={44} end>5V</Pin><Pin x={76} y={134} end>GND</Pin><Pin x={76} y={92} end>A0</Pin>
      <Wire d="M84 40H130V48" color={W5V} />
      <rect x={116} y={48} width={28} height={22} rx={3} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.5} /><text x={130} y={63} textAnchor="middle" fontSize={10}>10k</text>
      <Wire d="M130 70V98" color={WSIG} />
      <rect x={116} y={98} width={28} height={22} rx={3} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.5} /><text x={130} y={113} textAnchor="middle" fontSize={10}>10k</text>
      <Wire d="M130 120V130H84" color={WGND} />
      <circle cx={130} cy={84} r={3.5} fill={WSIG} /><text x={138} y={80} fontSize={10}>2,5 V</text>
      <Wire d="M130 84H170V60H196" color={WSIG} />
      <path d="M196 60q8-14 16 0q8-14 16 0q8-14 16 0q8-14 16 0" fill="none" stroke="#D6336C" strokeWidth={2.5} />
      <text x={228} y={34} textAnchor="middle" fontSize={11}>bobina</text>
      <Wire d="M260 60H280V96" color={WSIG} />
      <rect x={234} y={96} width={46} height={18} rx={3} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.5} /><text x={257} y={109} textAnchor="middle" fontSize={10}>1k</text>
      <Wire d="M234 105H200V88H84" color={WSIG} dash />
    </svg>
  );
}

function Dht() {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label="Sensore DHT11: VCC a 5V, DATA al pin 2, GND a GND">
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={80} end>pin 2</Pin><Pin x={92} y={110} end>GND</Pin>
      <Board x={200} y={6} w={96} h={120} label="DHT11" fill="var(--tone-sky)" />
      {/* griglia del sensore */}
      <g opacity={0.35}>
        {[0, 1, 2].map((i) => <rect key={i} x={262} y={34 + i * 26} width={26} height={16} rx={2} fill="none" stroke="currentColor" />)}
      </g>
      <Pin x={208} y={50}>VCC (+)</Pin><Pin x={208} y={80}>DATA</Pin><Pin x={208} y={110}>GND (−)</Pin>
      <Wire d="M100 46H200" color={W5V} /><Wire d="M100 76H200" color={WSIG} /><Wire d="M100 106H200" color={WGND} />
      {/* pull-up per il sensore a 4 pin */}
      <Wire d="M150 46V54" color={W5V} />
      <rect x={140} y={54} width={20} height={14} rx={2} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="3 2" />
      <text x={150} y={64} textAnchor="middle" fontSize={8}>10k</text>
      <Wire d="M150 68V76" color={WSIG} dash />
      <circle cx={150} cy={76} r={3} fill={WSIG} />
    </svg>
  );
}

const SCHEMATICS: Record<Schematic, () => React.ReactElement> = { hcsr04: Hcsr04, ntc: Ntc, mic: Mic, coil: Coil, dht: Dht };

export function WiringBlocks({ blocks }: { blocks: WiringBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        const S = b.schematic ? SCHEMATICS[b.schematic] : null;
        const Icon = b.warn ? TriangleExclamationPoint : b.tip ? Lightbulb : Plug;
        return (
          <div key={i} className={cn("rounded-lg border p-3", b.warn && "border-destructive/40 bg-destructive/5", b.tip && "bg-accent/50")}>
            <h4 className={cn("mb-1.5 flex items-center gap-1.5 text-sm font-semibold", b.warn && "text-destructive")}>
              <Icon className="size-4" />{b.title}
            </h4>
            {S && <div className="my-2 text-foreground [&_svg]:h-auto [&_svg]:w-full [&_text]:fill-current"><S /></div>}
            {b.text && <p className="text-sm leading-relaxed text-muted-foreground">{b.text}</p>}
          </div>
        );
      })}
    </div>
  );
}
