"use client";
// Schema dei collegamenti di un intero progetto, generato dai componenti e dai pin scelti:
// Arduino a sinistra con i pin usati, i moduli a destra, i fili colorati (rosso 5 V,
// nero GND, un colore per componente). Qui ci sono anche i piedini di ogni modulo e le note
// pratiche, usate dalla guida ai collegamenti.

import { SENSORS, pinName, type SensorType } from "@/lib/sensors/catalog";
import type { SensorInstance } from "@/lib/sensors/rig";

export type BtModule = "hc06" | "ble" | null;
type Conn = "5V" | "GND" | number;
/** Valori delle resistenze che compaiono negli schemi. */
export type ResValue = "10k" | "4k7" | "2k" | "1k" | "220" | "100";
export const OHMS: Record<ResValue, string> = { "10k": "10 kΩ", "4k7": "4,7 kΩ", "2k": "2 kΩ", "1k": "1 kΩ", "220": "220 Ω", "100": "100 Ω" };
export const BAND_NAMES: Record<ResValue, string> = {
  "10k": "marrone, nero, arancio", "4k7": "giallo, viola, rosso", "2k": "rosso, nero, rosso", "1k": "marrone, nero, rosso", "220": "rosso, rosso, marrone", "100": "marrone, nero, marrone",
};
/**
 * via: il piedino passa da componenti in più sulla breadboard, perché il montaggio funzioni
 * così com'è anche con i sensori «nudi»:
 * • «pullup»: resistenza `res` tra il segnale e 5V (DHT, DS18B20);
 * • «series»: resistenza `res` in serie al pin (LED RGB, cicalino passivo);
 * • «divider»: partitore 1 kΩ + 2 kΩ che porta i 5 V di Arduino a 3,3 V (RX di Bluetooth e GPS).
 */
export interface ModRow { label: string; conn: Conn; dashed?: boolean; note?: string; via?: "pullup" | "divider" | "series"; res?: ResValue }
/** kind: il disegno del modulo nello schema realistico (tipo di componente, o "hc06"/"ble");
 *  notes: consigli pratici che non si ricavano dall'elenco dei fili */
export interface Mod { title: string; rows: ModRow[]; color: string; notes: string[]; kind: string; options?: Record<string, number | string> }

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#4d7c0f"];
const RED = "#dc2626", BLACK = "var(--foreground)";

function moduleOf(s: SensorInstance, color: string): Mod {
  return { ...moduleRows(s, color), kind: s.type, options: s.options };
}
function moduleRows(s: SensorInstance, color: string): Omit<Mod, "kind"> {
  const p = (k: string) => s.pins[k];
  // titolo: il tipo di modulo, con davanti il nome dato dall'utente se diverso da quello di serie
  const custom = s.label?.trim() && s.label.trim() !== SENSORS[s.type].short ? s.label.trim() : "";
  const title = (kind: string) => (custom ? `${custom} · ${kind}` : kind);
  switch (s.type as SensorType) {
    case "ntc":
    case "ldr": {
      const part = s.type === "ntc" ? "termistore" : "fotoresistenza";
      const toGnd = s.options.orientation === "ntcgnd" || s.options.orientation === "ldrgnd";
      return {
        title: title(s.type === "ntc" ? "Termistore NTC" : "Fotoresistenza"), color,
        rows: [
          { label: toGnd ? "10 kΩ → 5V" : `${part} → 5V`, conn: "5V" },
          { label: "punto di mezzo", conn: p("a") },
          { label: toGnd ? `${part} → GND` : "10 kΩ → GND", conn: "GND" },
        ],
        notes: [
          `${part[0].toUpperCase()}${part.slice(1)} e resistenza non hanno un verso.`,
          `Il ${part} è ${toGnd ? "verso GND" : "verso 5V"}: deve corrispondere all'opzione «Posizione» nella scheda Componenti.`,
        ],
      };
    }
    case "dht":
      return {
        title: title(s.options.model === "dht22" ? "DHT22" : "DHT11"), color,
        rows: [{ label: "VCC (+)", conn: "5V" }, { label: "DATA (out)", conn: p("a"), via: "pullup", res: "10k", note: "10 kΩ a 5V" }, { label: "GND (−)", conn: "GND" }],
        notes: [
          "La resistenza da 10 kΩ tra DATA e 5V è indispensabile col sensore senza schedina (4 piedini: 1 VCC, 2 DATA, 3 libero, 4 GND). Il modulo a 3 piedini ce l'ha già, ma lasciarla non fa danni e rende il segnale più robusto con i fili lunghi.",
        ],
      };
    case "sonar":
      return {
        title: title("HC-SR04"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "Trig", conn: p("a") }, { label: "Echo", conn: p("b") }, { label: "GND", conn: "GND" }],
        notes: ["Punta il sensore verso un bersaglio piatto, tra 5 cm e 3 m."],
      };
    case "gps":
      return {
        title: title("GPS NEO-6M/7M"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "TX", conn: p("a") }, { label: "RX (facolt.)", conn: p("b"), dashed: true, via: "divider", note: "partitore" }, { label: "GND", conn: "GND" }],
        notes: ["Il filo RX (tratteggiato) è facoltativo, ma il pin resta riservato. Se lo colleghi, passa dal partitore 1 kΩ + 2 kΩ: l'RX del modulo regge solo 3,3 V.", "Antenna con la ceramica verso il cielo. Il primo fix all'aperto richiede da 30 s a qualche minuto."],
      };
    case "analog":
      return {
        title: title("Segnale 0–5 V"), color,
        rows: [{ label: "uscita", conn: p("a") }, { label: "massa", conn: "GND" }],
        notes: ["Mai più di 5 V sul pin e mai la rete elettrica."],
      };
    case "ds18b20":
      return {
        title: title("Sonda DS18B20"), color,
        rows: [{ label: "rosso (VCC)", conn: "5V" }, { label: "giallo (DATA)", conn: p("a"), via: "pullup", res: "4k7", note: "4,7 kΩ a 5V" }, { label: "nero (GND)", conn: "GND" }],
        notes: ["Fili della sonda: rosso VCC, giallo DATA, nero GND.", "Senza la resistenza da 4,7 kΩ tra DATA e 5V la sonda non risponde. Se la tua ha la schedina con i morsetti, ce l'ha già."],
      };
    case "gate":
      return {
        title: title("Fotocellula"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "OUT (D0)", conn: p("a") }],
        notes: [
          p("a") === 2 || p("a") === 3 ? "Su D2 e D3 gli istanti sono precisi al microsecondo." : "Su D2 o D3 gli istanti sarebbero più precisi (al microsecondo).",
          "Se gli istanti risultano invertiti, cambia «Quando il raggio è interrotto» nelle opzioni.",
        ],
      };
    case "hx711":
      return {
        title: title("HX711 + cella di carico"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "SCK", conn: p("b") }, { label: "DT (DOUT)", conn: p("a") }, { label: "GND", conn: "GND" }],
        notes: ["Cella sull'HX711: rosso E+, nero E−, bianco A−, verde A+. Se il peso cresce al contrario, scambia bianco e verde.", "Per tarare, pesa una massa nota e regola «conteggi per grammo»."],
      };
    case "imu":
      return {
        title: title("MPU-6050 (GY-521)"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "SCL", conn: p("b") }, { label: "SDA", conn: p("a") }],
        notes: ["Un display OLED può stare sugli stessi pin SDA e SCL.", "Fissa bene il modulo all'oggetto: se si muove, misura le sue vibrazioni."],
      };
    case "oled":
      return {
        title: title("Display OLED 0,49\""), color,
        rows: [{ label: "GND", conn: "GND" }, { label: "VCC", conn: "5V" }, { label: "SCL", conn: p("b") }, { label: "SDA", conn: p("a") }],
        notes: ["Controlla l'ordine stampato sul modulo: su alcuni VCC e GND sono invertiti."],
      };
    case "rgb":
      return {
        title: title("LED RGB"), color,
        rows: [{ label: "R", conn: p("a"), via: "series", res: "220", note: "220 Ω" }, { label: "G", conn: p("b"), via: "series", res: "220", note: "220 Ω" }, { label: "B", conn: p("c"), via: "series", res: "220", note: "220 Ω" }, { label: s.options.common === "anode" ? "+ (comune)" : "− (comune)", conn: s.options.common === "anode" ? "5V" : "GND" }],
        notes: ["Il piedino più lungo è il comune.", "Le resistenze da 220 Ω su ogni colore proteggono il LED e i pin di Arduino. Se il tuo modulo le ha già, lasciarle rende solo il LED un po' meno luminoso."],
      };
    case "buzzer":
      return {
        title: title(s.options.kind === "passive" ? "Cicalino passivo" : "Cicalino attivo"), color,
        rows: [s.options.kind === "passive" ? { label: "+ (S)", conn: p("a"), via: "series", res: "100", note: "100 Ω" } : { label: "+ (S)", conn: p("a") }, { label: "−", conn: "GND" }],
        notes: [
          "Il + è il piedino più lungo (o «S» sul modulo).",
          ...(s.options.kind === "passive" ? ["La resistenza da 100 Ω limita la corrente: un cicalino passivo senza schedina chiede al pin più di quanto possa dare."] : []), "Collegato a 5V, il cicalino attivo suona; quello passivo fa solo un clic. Imposta il tipo nelle opzioni."],
      };
  }
  return { title: title(SENSORS[s.type].short), color, rows: [], notes: [] };
}

function btModule(kind: Exclude<BtModule, null>): Mod {
  return {
    title: kind === "ble" ? "Bluetooth LE (HM-10, AT-09, HC-08)" : "Bluetooth HC-06", color: "#64748b", kind,
    rows: [{ label: "VCC", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "TXD", conn: 0 }, { label: "RXD (3,3 V)", conn: 1, note: "partitore", via: "divider" }],
    notes: [
      "L'RXD del modulo regge 3,3 V: le resistenze da 1 kΩ e 2 kΩ abbassano i 5 V di D1.",
      "Mentre carichi il firmware dall'IDE, stacca il filo su D0.",
    ],
  };
}

/** Le resistenze che servono al montaggio, per valore. */
export function resistorsOf(mods: Mod[]) {
  const out: Partial<Record<ResValue, number>> = {};
  const add = (v: ResValue) => { out[v] = (out[v] ?? 0) + 1; };
  for (const m of mods) {
    if (m.kind === "ntc" || m.kind === "ldr") add("10k");
    for (const r of m.rows) {
      if (r.via === "divider") { add("1k"); add("2k"); } else if (r.via && r.res) add(r.res);
    }
  }
  return out;
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

export const sensorTitle = (t: SensorType) => SENSORS[t].title;
