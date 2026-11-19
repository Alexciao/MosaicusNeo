"use client";
// Schema dei collegamenti di un intero montaggio, generato dai sensori e dai pin scelti:
// Arduino a sinistra con i pin usati, i moduli a destra, i fili colorati (rosso 5 V,
// nero GND, un colore per sensore), più le istruzioni passo passo per ogni sensore.

import { SENSORS, pinName, type SensorType } from "@/lib/sensors/catalog";
import type { SensorInstance } from "@/lib/sensors/rig";

export type BtModule = "hc06" | "ble" | null;
type Conn = "5V" | "GND" | number;
interface ModRow { label: string; conn: Conn; dashed?: boolean; note?: string }
interface Mod { title: string; rows: ModRow[]; color: string; steps: string[] }

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#4d7c0f"];
const RED = "#dc2626", BLACK = "var(--foreground)";

/** Righe del modulo e istruzioni, per un sensore. */
function moduleOf(s: SensorInstance, color: string): Mod {
  const p = (k: string) => s.pins[k];
  const n = (k: string) => pinName(s.pins[k]);
  // titolo: il tipo di modulo, con davanti il nome dato dall'utente se diverso da quello di serie
  const custom = s.label?.trim() && s.label.trim() !== SENSORS[s.type].short ? s.label.trim() : "";
  const title = (kind: string) => (custom ? `${custom} · ${kind}` : kind);
  switch (s.type as SensorType) {
    case "ntc":
    case "ldr": {
      const part = s.type === "ntc" ? "termistore NTC" : "fotoresistenza";
      const toGnd = s.options.orientation === "ntcgnd" || s.options.orientation === "ldrgnd";
      return {
        title: title(s.type === "ntc" ? "Termistore NTC" : "Fotoresistenza"), color,
        rows: [
          { label: toGnd ? "10 kΩ → 5V" : `${part} → 5V`, conn: "5V" },
          { label: "punto di mezzo", conn: p("a") },
          { label: toGnd ? `${part} → GND` : "10 kΩ → GND", conn: "GND" },
        ],
        steps: [
          `Metti ${toGnd ? "la resistenza da 10 kΩ" : `il ${part}`} e ${toGnd ? `il ${part}` : "la resistenza da 10 kΩ"} in fila sulla breadboard: si toccano in un punto, il «punto di mezzo».`,
          `L'altro capo ${toGnd ? "della resistenza" : `del ${part}`} va a 5V di Arduino (filo rosso).`,
          `L'altro capo ${toGnd ? `del ${part}` : "della resistenza"} va a GND (filo nero).`,
          `Il punto di mezzo va al pin ${n("a")} (filo colorato).`,
        ],
      };
    }
    case "dht":
      return {
        title: title(s.options.model === "dht22" ? "DHT22" : "DHT11"), color,
        rows: [{ label: "VCC (+)", conn: "5V" }, { label: "DATA (out)", conn: p("a") }, { label: "GND (−)", conn: "GND" }],
        steps: [
          "Il modulo ha 3 piedini: + (VCC), out (DATA), − (GND). Il sensore «nudo» blu a 4 piedini: 1 VCC, 2 DATA, 3 libero, 4 GND.",
          "VCC a 5V (rosso), GND a GND (nero).",
          `DATA al pin ${n("a")}.`,
          "Solo per il sensore a 4 piedini: una resistenza da 10 kΩ tra DATA e 5V (il modulo a 3 piedini ce l'ha già).",
        ],
      };
    case "sonar":
      return {
        title: title("HC-SR04"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "Trig", conn: p("a") }, { label: "Echo", conn: p("b") }, { label: "GND", conn: "GND" }],
        steps: [
          "Piedini da sinistra, con i «occhi» verso di te: VCC, Trig, Echo, GND.",
          "VCC a 5V (rosso), GND a GND (nero).",
          `Trig al pin ${n("a")}, Echo al pin ${n("b")}.`,
          "Punta il sensore verso un bersaglio piatto, ad almeno 5 cm.",
        ],
      };
    case "gps":
      return {
        title: title("GPS NEO-6M/7M"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "TX", conn: p("a") }, { label: "RX (facolt.)", conn: p("b"), dashed: true }, { label: "GND", conn: "GND" }],
        steps: [
          "VCC a 5V (rosso), GND a GND (nero).",
          `TX del GPS al pin ${n("a")}: è il filo da cui Arduino riceve la posizione.`,
          `RX del GPS al pin ${n("b")}: facoltativo (Arduino non scrive al GPS), ma il pin resta riservato.`,
          "Antenna con la faccia di ceramica verso il cielo, all'aperto.",
        ],
      };
    case "analog":
      return {
        title: title("Segnale 0–5 V"), color,
        rows: [{ label: "uscita", conn: p("a") }, { label: "massa", conn: "GND" }],
        steps: [
          `L'uscita del sensore (0–5 V) va al pin ${n("a")}.`,
          "La massa del sensore va a GND di Arduino: le masse devono essere in comune.",
          "Mai più di 5 V sul pin, e mai la rete elettrica.",
        ],
      };
  }
  return { title: title(SENSORS[s.type].short), color, rows: [], steps: [] };
}

function btModule(kind: Exclude<BtModule, null>): Mod {
  const name = kind === "ble" ? "Bluetooth LE (HM-10 / AT-09)" : "Bluetooth HC-06";
  return {
    title: name, color: "#64748b",
    rows: [{ label: "VCC", conn: "5V" }, { label: "TXD", conn: 0 }, { label: "RXD (3,3 V)", conn: 1, note: "partitore" }, { label: "GND", conn: "GND" }],
    steps: [
      "VCC a 5V (rosso), GND a GND (nero).",
      "TXD del modulo a D0 (RX di Arduino).",
      "D1 (TX di Arduino) all'RXD del modulo attraverso un partitore: resistenza da 1 kΩ da D1 all'RXD, resistenza da 2 kΩ dall'RXD a GND. Così il modulo riceve 3,3 V invece di 5 V.",
      "Mentre carichi il firmware dall'IDE di Arduino, stacca il filo da D0: altrimenti il caricamento non riesce.",
    ],
  };
}

export function buildModules(sensors: SensorInstance[], bt: BtModule) {
  const mods = sensors.map((s, i) => moduleOf(s, COLORS[i % COLORS.length]));
  if (bt) mods.push(btModule(bt));
  return mods;
}

export function RigDiagram({ sensors, bt = null, className }: { sensors: SensorInstance[]; bt?: BtModule; className?: string }) {
  const mods = buildModules(sensors, bt);
  if (!mods.length) return null;
  const ROW = 20, HEAD = 26, GAP = 12, AX = 6, AW = 112;
  // righe di Arduino: 5V, GND, poi i pin dei segnali nell'ordine dei moduli
  const sig: { mod: number; row: number; pin: number; color: string; dashed?: boolean }[] = [];
  mods.forEach((m, mi) => m.rows.forEach((r, ri) => { if (typeof r.conn === "number") sig.push({ mod: mi, row: ri, pin: r.conn, color: m.color, dashed: r.dashed }); }));
  const aRows: string[] = ["5V", "GND", ...sig.map((s) => (s.pin === 0 ? "D0 (RX)" : s.pin === 1 ? "D1 (TX)" : pinName(s.pin)))];
  const aY = (i: number) => 14 + HEAD + i * ROW + ROW / 2;
  const nCh = sig.length;
  const CH0 = AX + AW + 14, CHS = 10;
  const R5 = CH0 + nCh * CHS + 14, RG = R5 + 12;
  const MX = RG + 26, MW = 168;
  // moduli in colonna
  const mTop: number[] = [];
  let y = 6;
  for (const m of mods) { mTop.push(y); y += HEAD + m.rows.length * ROW + 8 + GAP; }
  const mY = (mi: number, ri: number) => mTop[mi] + HEAD + ri * ROW + ROW / 2;
  const H = Math.max(y, 14 + HEAD + aRows.length * ROW + 16);
  const W = MX + MW + 6;
  const lastPowerY = Math.max(...mods.flatMap((m, mi) => m.rows.map((r, ri) => (typeof r.conn === "string" ? mY(mi, ri) : 0))));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schema dei collegamenti del montaggio" className={className}>
      {/* Arduino */}
      <rect x={AX} y={14} width={AW} height={HEAD + aRows.length * ROW + 8} rx={8} fill="var(--tone-lime)" stroke="currentColor" strokeOpacity={0.45} />
      <text x={AX + AW / 2} y={14 + 18} textAnchor="middle" fontWeight={600} fontSize={12}>Arduino Uno</text>
      {aRows.map((r, i) => (
        <g key={i}>
          <circle cx={AX + AW} cy={aY(i)} r={3} fill={i === 0 ? RED : i === 1 ? BLACK : sig[i - 2].color} />
          <text x={AX + AW - 8} y={aY(i) + 4} textAnchor="end" fontSize={11} fontWeight={500}>{r}</text>
        </g>
      ))}
      {/* binari dell'alimentazione */}
      <path d={`M${AX + AW} ${aY(0)}H${R5}V${Math.max(aY(0), lastPowerY)}`} fill="none" stroke={RED} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={`M${AX + AW} ${aY(1)}H${RG}V${Math.max(aY(1), lastPowerY)}`} fill="none" stroke={BLACK} strokeWidth={2.5} strokeLinejoin="round" />
      {/* moduli */}
      {mods.map((m, mi) => (
        <g key={mi}>
          <rect x={MX} y={mTop[mi]} width={MW} height={HEAD + m.rows.length * ROW + 8} rx={8} fill="var(--card)" stroke={m.color} strokeWidth={1.5} />
          <rect x={MX} y={mTop[mi]} width={6} height={HEAD + m.rows.length * ROW + 8} rx={3} fill={m.color} />
          <text x={MX + 14} y={mTop[mi] + 17} fontWeight={600} fontSize={11.5}>{m.title.length > 26 ? `${m.title.slice(0, 25)}…` : m.title}</text>
          {m.rows.map((r, ri) => {
            const yy = mY(mi, ri);
            const isPow = typeof r.conn === "string";
            return (
              <g key={ri}>
                {isPow && <path d={`M${r.conn === "5V" ? R5 : RG} ${yy}H${MX}`} stroke={r.conn === "5V" ? RED : BLACK} strokeWidth={2.5} fill="none" />}
                {isPow && <circle cx={r.conn === "5V" ? R5 : RG} cy={yy} r={2.8} fill={r.conn === "5V" ? RED : BLACK} />}
                <circle cx={MX} cy={yy} r={3} fill={isPow ? (r.conn === "5V" ? RED : BLACK) : m.color} />
                <text x={MX + 12} y={yy + 4} fontSize={10.5}>{r.label}</text>
                {r.note && <text x={MX + MW - 8} y={yy + 4} textAnchor="end" fontSize={9} opacity={0.65}>{r.note}</text>}
              </g>
            );
          })}
        </g>
      ))}
      {/* fili dei segnali: il primo usa il canale più a destra, così non si incrociano */}
      {sig.map((s, i) => {
        const x = CH0 + (nCh - 1 - i) * CHS;
        const ya = aY(i + 2), ym = mY(s.mod, s.row);
        const d = `M${AX + AW} ${ya}H${x}V${ym}H${MX}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="var(--card)" strokeWidth={6} strokeLinejoin="round" />
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={s.dashed ? "5 3" : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

/** Istruzioni passo passo, una lista per modulo. */
export function WiringSteps({ sensors, bt = null }: { sensors: SensorInstance[]; bt?: BtModule }) {
  const mods = buildModules(sensors, bt);
  return (
    <ol className="flex flex-col gap-3">
      {mods.map((m, i) => (
        <li key={i} className="rounded-lg border p-3">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <span className="size-3 rounded-full" style={{ background: m.color }} /> {m.title}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground marker:text-foreground">
            {m.steps.map((s, k) => <li key={k}>{s}</li>)}
          </ol>
        </li>
      ))}
    </ol>
  );
}

export const sensorTitle = (t: SensorType) => SENSORS[t].title;
