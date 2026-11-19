"use client";
// Schemi dei collegamenti in SVG, con i pin scelti nel progetto: seguono il tema e funzionano
// offline. In più la "mappa dei pin" di Arduino Uno con i sensori collegati.

import { Bluetooth, Lightbulb, Plug, TriangleExclamationPoint } from "lucide-react";
import type { Schematic, WiringBlock } from "@/lib/sensors/types";
import { SENSORS, pinName } from "@/lib/sensors/catalog";
import { sensorLabel, type Rig } from "@/lib/sensors/rig";
import { cn } from "@/lib/utils";

const W5V = "#D6336C", WGND = "var(--tone-ink)", WSIG = "#2E8BC0", WBT = "#7c3aed";
type P = Record<string, string>;

function Board({ x, y, w, h, label, fill = "var(--tone-lime)" }: { x: number; y: number; w: number; h: number; label: string; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke="currentColor" strokeOpacity={0.5} />
      <text x={x + w / 2} y={y + 18} textAnchor="middle" fontWeight={600} fontSize={12}>{label}</text>
    </g>
  );
}
const Pin = ({ x, y, end, children, muted }: { x: number; y: number; end?: boolean; children: React.ReactNode; muted?: boolean }) => (
  <text x={x} y={y} textAnchor={end ? "end" : "start"} fontSize={11} opacity={muted ? 0.55 : 0.9}>{children}</text>
);
const Wire = ({ d, color, dash }: { d: string; color: string; dash?: boolean }) => (
  <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash ? "5 3" : undefined} />
);
const Res = ({ x, y, w = 28, h = 18, label }: { x: number; y: number; w?: number; h?: number; label: string }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.5} />
    <text x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle" fontSize={10}>{label}</text>
  </g>
);

function Hcsr04({ p }: { p: P }) {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label={`HC-SR04: VCC a 5V, GND a GND, Trig a ${p.trig}, Echo a ${p.echo}`}>
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={72} end>GND</Pin><Pin x={92} y={94} end>{p.trig}</Pin><Pin x={92} y={116} end>{p.echo}</Pin>
      <Board x={200} y={6} w={96} h={120} label="HC-SR04" fill="var(--tone-sky)" />
      <Pin x={208} y={50}>VCC</Pin><Pin x={208} y={72}>GND</Pin><Pin x={208} y={94}>Trig</Pin><Pin x={208} y={116}>Echo</Pin>
      <Wire d="M100 46H200" color={W5V} /><Wire d="M100 68H200" color={WGND} />
      <Wire d="M100 90H200" color={WSIG} /><Wire d="M100 112H200" color={WSIG} dash />
    </svg>
  );
}

/** Partitore: componente tra 5 V e il pin, resistenza fissa tra il pin e GND (NTC, fotoresistenza). */
function Divider({ p, part, partFill }: { p: P; part: string; partFill: string }) {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label={`Partitore: ${part} tra 5V e ${p.sig}, resistenza da 10 kilo-ohm tra ${p.sig} e GND`}>
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={82} end>{p.sig}</Pin><Pin x={92} y={114} end>GND</Pin>
      <Wire d="M100 46H230V52" color={W5V} />
      <rect x={180} y={52} width={100} height={20} rx={4} fill={partFill} stroke="#D6336C" />
      <text x={230} y={66} textAnchor="middle" fontSize={11}>{part}</text>
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
      <Res x={116} y={48} h={22} label="10k" />
      <Wire d="M130 70V98" color={WSIG} />
      <Res x={116} y={98} h={22} label="10k" />
      <Wire d="M130 120V130H84" color={WGND} />
      <circle cx={130} cy={84} r={3.5} fill={WSIG} /><text x={138} y={80} fontSize={10}>2,5 V</text>
      <Wire d="M130 84H170V60H196" color={WSIG} />
      <path d="M196 60q8-14 16 0q8-14 16 0q8-14 16 0q8-14 16 0" fill="none" stroke="#D6336C" strokeWidth={2.5} />
      <text x={228} y={34} textAnchor="middle" fontSize={11}>bobina</text>
      <Wire d="M260 60H280V96" color={WSIG} />
      <Res x={234} y={96} w={46} label="1k" />
      <Wire d="M234 105H200V88H84" color={WSIG} dash />
    </svg>
  );
}

function Dht({ p }: { p: P }) {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label={`DHT: VCC a 5V, DATA a ${p.data}, GND a GND`}>
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={80} end>{p.data}</Pin><Pin x={92} y={110} end>GND</Pin>
      <Board x={200} y={6} w={96} h={120} label="DHT11/22" fill="var(--tone-sky)" />
      <g opacity={0.35}>{[0, 1, 2].map((i) => <rect key={i} x={262} y={34 + i * 26} width={26} height={16} rx={2} fill="none" stroke="currentColor" />)}</g>
      <Pin x={208} y={50}>VCC (+)</Pin><Pin x={208} y={80}>DATA</Pin><Pin x={208} y={110}>GND (−)</Pin>
      <Wire d="M100 46H200" color={W5V} /><Wire d="M100 76H200" color={WSIG} /><Wire d="M100 106H200" color={WGND} />
      <Wire d="M150 46V54" color={W5V} />
      <rect x={140} y={54} width={20} height={14} rx={2} fill="var(--muted)" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="3 2" />
      <text x={150} y={64} textAnchor="middle" fontSize={8}>10k</text>
      <Wire d="M150 68V76" color={WSIG} dash />
      <circle cx={150} cy={76} r={3} fill={WSIG} />
    </svg>
  );
}

function Gps({ p }: { p: P }) {
  return (
    <svg viewBox="0 0 300 132" role="img" aria-label={`GPS: TX del GPS a ${p.rx}, RX del GPS a ${p.tx} (facoltativo), VCC a 5V, GND a GND`}>
      <Board x={4} y={6} w={96} h={120} label="Arduino" />
      <Pin x={92} y={50} end>5V</Pin><Pin x={92} y={72} end>GND</Pin><Pin x={92} y={94} end>{p.rx}</Pin><Pin x={92} y={116} end>{p.tx}</Pin>
      <Board x={200} y={6} w={96} h={120} label="GPS NEO-7M" fill="var(--tone-lime)" />
      <Pin x={208} y={50}>VCC</Pin><Pin x={208} y={72}>GND</Pin><Pin x={208} y={94}>TX</Pin><Pin x={208} y={116}>RX</Pin><Pin x={250} y={116} muted>facolt.</Pin>
      <Wire d="M100 46H200" color={W5V} /><Wire d="M100 68H200" color={WGND} />
      <Wire d="M200 90H100" color={WSIG} /><Wire d="M100 112H200" color={WSIG} dash />
    </svg>
  );
}

function Analog({ p }: { p: P }) {
  return (
    <svg viewBox="0 0 300 110" role="img" aria-label={`Segnale analogico a ${p.sig}, massa in comune con GND`}>
      <Board x={4} y={6} w={96} h={98} label="Arduino" />
      <Pin x={92} y={50} end>{p.sig}</Pin><Pin x={92} y={84} end>GND</Pin>
      <Board x={200} y={6} w={96} h={98} label="segnale" fill="var(--tone-saffron)" />
      <Pin x={208} y={50}>uscita 0–5 V</Pin><Pin x={208} y={84}>massa</Pin>
      <Wire d="M100 46H200" color={WSIG} /><Wire d="M100 80H200" color={WGND} />
    </svg>
  );
}

function Hc06({ p }: { p: P }) {
  return (
    <svg viewBox="0 0 300 150" role="img" aria-label={`${p.name ?? "HC-06"}: TXD a D0, RXD da D1 attraverso un partitore da 1 e 2 kilo-ohm, VCC a 5V, GND a GND`}>
      <Board x={4} y={6} w={96} h={138} label="Arduino" />
      <Pin x={92} y={46} end>5V</Pin><Pin x={92} y={68} end>GND</Pin><Pin x={92} y={94} end>D0 (RX)</Pin><Pin x={92} y={122} end>D1 (TX)</Pin>
      <Board x={200} y={6} w={96} h={138} label={p.name ?? "HC-06"} fill="var(--tone-sky)" />
      <Pin x={208} y={46}>VCC</Pin><Pin x={208} y={68}>GND</Pin><Pin x={208} y={94}>TXD</Pin><Pin x={208} y={122}>RXD (3,3 V)</Pin>
      <Wire d="M100 42H200" color={W5V} /><Wire d="M100 64H200" color={WGND} />
      <Wire d="M200 90H100" color={WBT} />
      <Wire d="M100 118H120" color={WBT} dash /><Res x={120} y={111} w={24} h={14} label="1k" /><Wire d="M144 118H200" color={WBT} dash />
      <circle cx={170} cy={118} r={3} fill={WBT} />
      <Wire d="M170 118V126" color={WBT} dash /><Res x={158} y={126} w={24} h={14} label="2k" />
      <text x={190} y={137} fontSize={8} opacity={0.6}>GND</text>
    </svg>
  );
}

const SCHEMATICS: Record<Schematic, (props: { p: P }) => React.ReactElement> = {
  hcsr04: Hcsr04, ntc: ({ p }) => <Divider p={p} part="NTC 10 kΩ" partFill="var(--tone-rose)" />,
  ldr: ({ p }) => <Divider p={p} part="fotoresistenza" partFill="var(--tone-saffron)" />,
  mic: Mic, coil: Coil, dht: Dht, gps: Gps, analog: Analog, hc06: Hc06,
};

export function WiringBlocks({ blocks }: { blocks: WiringBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        const S = b.schematic ? SCHEMATICS[b.schematic] : null;
        const Icon = b.warn ? TriangleExclamationPoint : b.tip ? Lightbulb : b.schematic === "hc06" ? Bluetooth : Plug;
        return (
          <div key={i} className={cn("rounded-lg border p-3", b.warn && "border-destructive/40 bg-destructive/5", b.tip && "bg-muted/50")}>
            <h4 className={cn("mb-1.5 flex items-center gap-1.5 text-sm font-semibold", b.warn && "text-destructive")}>
              <Icon className="size-4" />{b.title}
            </h4>
            {S && <div className="my-2 max-w-sm text-foreground [&_svg]:h-auto [&_svg]:w-full [&_text]:fill-current"><S p={b.pins ?? {}} /></div>}
            {b.text && <p className="text-sm leading-relaxed text-muted-foreground">{b.text}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mappa dei pin di Arduino Uno
// ---------------------------------------------------------------------------
const COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

export function PinMap({ rig }: { rig: Rig }) {
  const arduino = rig.sensors;
  const use = new Map<number, { color: string; text: string }>();
  arduino.forEach((s, i) => {
    for (const spec of SENSORS[s.type].pins) use.set(s.pins[spec.key], { color: COLORS[i % COLORS.length], text: `${sensorLabel(s)} · ${spec.role}` });
  });
  const cell = (p: number, label = pinName(p)) => {
    const u = use.get(p);
    const reserved = p === 0 || p === 1;
    return (
      <div key={p} title={u?.text ?? (reserved ? "porta seriale (USB, Bluetooth)" : "libero")} className="flex flex-col items-center gap-1">
        <span className={cn("grid size-6 place-items-center rounded-full border text-[0.6rem] font-bold", reserved && "border-dashed opacity-50")}
          style={u ? { background: u.color, borderColor: u.color, color: "white" } : undefined}>
          {u ? "●" : ""}
        </span>
        <span className="text-[0.62rem] font-medium tabular text-muted-foreground">{label}</span>
      </div>
    );
  };
  if (!arduino.length) return null;
  return (
    <div className="rounded-lg border p-3">
      <h4 className="mb-2 text-sm font-semibold">Pin di Arduino Uno</h4>
      <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
        <div className="flex justify-between gap-0.5">{[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((p) => cell(p))}</div>
        <div className="flex justify-end gap-1.5">{[14, 15, 16, 17, 18, 19].map((p) => cell(p))}</div>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {arduino.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <b>{sensorLabel(s)}</b>
            <span className="text-muted-foreground">{SENSORS[s.type].pins.map((p) => `${p.role} ${pinName(s.pins[p.key])}`).join(" · ")}</span>
          </li>
        ))}
        <li className="text-muted-foreground">D0 e D1 restano liberi per il cavo USB e il Bluetooth. Ogni modulo ha anche VCC a 5 V e GND a GND.</li>
      </ul>
    </div>
  );
}
