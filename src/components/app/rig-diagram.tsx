"use client";
// Schema dei collegamenti di un intero progetto, generato dai componenti e dai pin scelti:
// Arduino a sinistra con i pin usati, i moduli a destra, i fili colorati (rosso 5 V,
// nero GND, un colore per componente). Qui ci sono anche i piedini di ogni modulo e le note
// pratiche, usate dalla guida ai collegamenti.

import { useTranslations } from "next-intl";
import { t } from "@/i18n";
import { SENSORS, pinName, type SensorType } from "@/lib/sensors/catalog";
import type { SensorInstance } from "@/lib/sensors/rig";

export type BtModule = "hc06" | "ble" | null;
/** NC: piedino infilato nella breadboard ma senza filo; 3V3: il pin 3.3V di Arduino. */
export type Conn = "5V" | "GND" | "3V3" | "NC" | number;
/** Valori delle resistenze che compaiono negli schemi. */
export type ResValue = "10k" | "4k7" | "2k" | "1k" | "220" | "100";
export const OHMS: Record<ResValue, string> = { "10k": "10 kΩ", "4k7": t("rig.modules.ohms4k7"), "2k": "2 kΩ", "1k": "1 kΩ", "220": "220 Ω", "100": "100 Ω" };
export const BAND_NAMES: Record<ResValue, string> = {
  "10k": t("rig.modules.bandsBrownBlackOrange"), "4k7": t("rig.modules.bandsYellowVioletRed"), "2k": t("rig.modules.bandsRedBlackRed"),
  "1k": t("rig.modules.bandsBrownBlackRed"), "220": t("rig.modules.bandsRedRedBrown"), "100": t("rig.modules.bandsBrownBlackBrown"),
};
/**
 * via: il piedino passa da componenti in più sulla breadboard, perché il montaggio funzioni
 * così com'è anche con i sensori «nudi»:
 * • «pullup»: resistenza `res` tra il segnale e 5V (DHT, DS18B20);
 * • «series»: resistenza `res` in serie al pin (LED RGB, cicalino passivo);
 * • «divider»: partitore 1 kΩ + 2 kΩ che porta i 5 V di Arduino a 3,3 V (RX di Bluetooth e GPS).
 */
/** gap: colonna lasciata vuota tra due piedini (niente piedino, niente filo) */
export interface ModRow { label: string; conn: Conn; dashed?: boolean; note?: string; via?: "pullup" | "divider" | "series"; res?: ResValue; gap?: boolean }
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
      const ntc = s.type === "ntc";
      const part = ntc ? t("rig.modules.thermistor") : t("rig.modules.photoresistor");
      const toGnd = s.options.orientation === "ntcgnd" || s.options.orientation === "ldrgnd";
      return {
        title: title(ntc ? t("rig.modules.ntcTitle") : t("rig.modules.ldrTitle")), color,
        rows: [
          { label: toGnd ? "10 kΩ → 5V" : t("rig.modules.toV5", { part }), conn: "5V" },
          { label: t("rig.modules.midpoint"), conn: p("a") },
          { label: toGnd ? t("rig.modules.toGnd", { part }) : "10 kΩ → GND", conn: "GND" },
        ],
        notes: [
          ntc ? t("rig.modules.ntcNoPolarity") : t("rig.modules.ldrNoPolarity"),
          t(ntc ? "rig.modules.ntcPosition" : "rig.modules.ldrPosition", { side: toGnd ? "gnd" : "v5" }),
        ],
      };
    }
    case "dht":
      return {
        title: title(s.options.model === "dht22" ? "DHT22" : "DHT11"), color,
        // modulo a 3 piedini (VCC, DATA, GND) o sensore senza schedina a 4 (VCC, DATA, libero, GND)
        rows: [{ label: "VCC (+)", conn: "5V" }, { label: "DATA (out)", conn: p("a"), via: "pullup", res: "10k", note: t("rig.modules.pullTo5v", { ohms: OHMS["10k"] }) },
          ...(s.options.pkg === "bare" ? [{ label: "NC", conn: "NC" as const }] : []), { label: "GND (−)", conn: "GND" }],
        notes: [
          t("rig.modules.dhtNote"),
        ],
      };
    case "sonar":
      return {
        title: title("HC-SR04"), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "Trig", conn: p("a") }, { label: "Echo", conn: p("b") }, { label: "GND", conn: "GND" }],
        notes: [t("rig.modules.sonarNote")],
      };
    case "gps":
      return {
        title: title("GPS NEO-6M/7M"), color,
        // ordine dei piedini del GY-NEO6MV2 (e simili): VCC, RX, TX, GND
        rows: [{ label: "VCC", conn: "5V" }, { label: t("rig.modules.rxOptional"), conn: p("b"), dashed: true, via: "divider", note: t("rig.modules.divider") }, { label: "TX", conn: p("a") }, { label: "GND", conn: "GND" }],
        notes: [t("rig.modules.gpsNoteRx"), t("rig.modules.gpsNoteAntenna")],
      };
    case "analog":
      return {
        title: title(t("rig.modules.analogTitle")), color,
        rows: [{ label: t("rig.modules.output"), conn: p("a") }, { label: t("rig.modules.ground"), conn: "GND" }],
        notes: [t("rig.modules.analogNote")],
      };
    case "ds18b20":
      return {
        title: title(t("rig.modules.ds18b20Title")), color,
        rows: [{ label: t("rig.modules.wireRed"), conn: "5V" }, { label: t("rig.modules.wireYellow"), conn: p("a"), via: "pullup", res: "4k7", note: t("rig.modules.pullTo5v", { ohms: OHMS["4k7"] }) }, { label: t("rig.modules.wireBlack"), conn: "GND" }],
        notes: [t("rig.modules.ds18b20NoteWires"), t("rig.modules.ds18b20NotePullup")],
      };
    case "gate":
      return {
        title: title(t("rig.modules.gateTitle")), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "OUT (D0)", conn: p("a") }],
        notes: [
          p("a") === 2 || p("a") === 3 ? t("rig.modules.gateFast") : t("rig.modules.gateSlow"),
          t("rig.modules.gateInverted"),
        ],
      };
    case "hx711":
      return {
        title: title(t("rig.modules.hx711Title")), color,
        rows: [{ label: "VCC", conn: "5V" }, { label: "SCK", conn: p("b") }, { label: "DT (DOUT)", conn: p("a") }, { label: "GND", conn: "GND" }],
        notes: [t("rig.modules.hx711NoteWires"), t("rig.modules.hx711NoteCalibrate")],
      };
    case "imu":
      return {
        title: title("MPU-6050 (GY-521)"), color,
        // il GY-521 ha 8 piedini: vanno tutti nella breadboard, anche quelli che restano liberi
        rows: [
          { label: "VCC", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "SCL", conn: p("b") }, { label: "SDA", conn: p("a") },
          { label: "XDA", conn: "NC" }, { label: "XCL", conn: "NC" },
          s.options.addr === "69" ? { label: "AD0", conn: "3V3", note: "0x69" } : { label: "AD0", conn: "NC", note: "0x68" },
          { label: "INT", conn: "NC" },
        ],
        notes: [t("rig.modules.imuNoteOled"), t("rig.modules.imuNoteFix"), s.options.addr === "69" ? t("rig.modules.imuNoteAd0High") : t("rig.modules.imuNoteAd0Low")],
      };
    case "hc06":
    case "ble":
      { const m = btModule(s.type as "hc06" | "ble"); return { ...m, title: title(m.title), color }; }
    case "button":
      return {
        title: title(t("rig.modules.buttonTitle")), color,
        // a cavallo della scanalatura i due contatti che il pulsante collega stanno a due colonne di
        // distanza (i piedini a 0,2"): la colonna in mezzo resta vuota
        rows: [{ label: "1", conn: p("a") }, { label: "", conn: "NC", gap: true }, { label: "2", conn: "GND" }],
        notes: [
          t("rig.modules.buttonNoteLegs"),
          t("rig.modules.buttonNotePullup"),
          t("rig.modules.buttonNoteUse"),
        ],
      };
    case "sd":
      return {
        title: title(t("rig.modules.sdTitle")), color,
        rows: [{ label: "GND", conn: "GND" }, { label: "VCC", conn: "5V" }, { label: "MISO", conn: 12 }, { label: "MOSI", conn: 11 }, { label: "SCK", conn: 13 }, { label: "CS", conn: p("a") }],
        notes: [
          t("rig.modules.sdNoteModule"),
          t("rig.modules.sdNoteSpi"),
          t("rig.modules.sdNoteFat"),
        ],
      };
    case "mlx":
      return {
        title: title("MLX90614 (GY-906)"), color,
        rows: [{ label: "VIN", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "SCL", conn: p("b") }, { label: "SDA", conn: p("a") }],
        notes: [
          t("rig.modules.mlxNoteModule"),
          t("rig.modules.mlxNoteBus"),
          t("rig.modules.mlxNoteCone"),
          t("rig.modules.mlxNoteMetal"),
        ],
      };
    case "sps30":
      // connettore JST ZHR-5 (passo 1,5 mm): non entra nella breadboard, serve il cavo con i puntali
      return {
        title: title("Sensirion SPS30"), color,
        rows: [
          { label: "VDD (1)", conn: "5V" }, { label: "SDA (2)", conn: p("a") }, { label: "SCL (3)", conn: p("b") },
          { label: "SEL (4)", conn: "GND", note: t("rig.modules.spsSel") }, { label: "GND (5)", conn: "GND" },
        ],
        notes: [t("rig.modules.spsNoteCable"), t("rig.modules.spsNoteSel"), t("rig.modules.spsNoteShort"), t("rig.modules.spsNoteAir")],
      };
    case "oled":
      return {
        title: title(t("rig.modules.oledTitle")), color,
        rows: [{ label: "GND", conn: "GND" }, { label: "VCC", conn: "5V" }, { label: "SCL", conn: p("b") }, { label: "SDA", conn: p("a") }],
        notes: [t("rig.modules.oledNote")],
      };
    case "rgb":
      return {
        title: title(t("rig.modules.rgbTitle")), color,
        // LED RGB da 5 mm: R, comune (il piedino più lungo), G, B
        rows: [{ label: "R", conn: p("a"), via: "series", res: "220", note: "220 Ω" }, { label: s.options.common === "anode" ? t("rig.modules.commonAnode") : t("rig.modules.commonCathode"), conn: s.options.common === "anode" ? "5V" : "GND" }, { label: "G", conn: p("b"), via: "series", res: "220", note: "220 Ω" }, { label: "B", conn: p("c"), via: "series", res: "220", note: "220 Ω" }],
        notes: [t("rig.modules.rgbNoteCommon"), t("rig.modules.rgbNoteResistors")],
      };
    case "buzzer":
      return {
        title: title(s.options.kind === "passive" ? t("rig.modules.buzzerPassive") : t("rig.modules.buzzerActive")), color,
        rows: [s.options.kind === "passive" ? { label: "+ (S)", conn: p("a"), via: "series", res: "100", note: "100 Ω" } : { label: "+ (S)", conn: p("a") }, { label: "−", conn: "GND" }],
        notes: [
          t("rig.modules.buzzerNotePlus"),
          ...(s.options.kind === "passive" ? [t("rig.modules.buzzerNoteResistor")] : []), t("rig.modules.buzzerNoteKind")],
      };
  }
  return { title: title(SENSORS[s.type].short), color, rows: [], notes: [] };
}

function btModule(kind: Exclude<BtModule, null>): Mod {
  return {
    title: kind === "ble" ? "Bluetooth LE (HM-10, AT-09, HC-08)" : "Bluetooth HC-06", color: "#64748b", kind,
    rows: [{ label: "VCC", conn: "5V" }, { label: "GND", conn: "GND" }, { label: "TXD", conn: 0 }, { label: t("rig.modules.rxd33"), conn: 1, note: t("rig.modules.divider"), via: "divider" }],
    notes: [
      t("rig.modules.btNoteDivider"),
      t("rig.modules.btNoteUpload"),
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

/** I moduli da disegnare. Il Bluetooth è un componente come gli altri; `bt` serve solo a chi non lo ha nel progetto. */
export function buildModules(sensors: SensorInstance[], bt: BtModule = null) {
  let k = 0;
  const mods = sensors.map((s) => moduleOf(s, s.type === "hc06" || s.type === "ble" ? "#64748b" : COLORS[k++ % COLORS.length]));
  if (bt && !sensors.some((s) => s.type === "hc06" || s.type === "ble")) mods.push(btModule(bt));
  // L'SPS30 non ha resistenze di pull-up sulle linee I2C: se è l'unico dispositivo sul bus le
  // mettiamo noi (10 kΩ verso 5V). Display, MPU-6050 e MLX90614 hanno già le loro sulla schedina.
  sensors.forEach((s, i) => {
    if (s.type !== "sps30") return;
    const others = sensors.some((o) => o !== s && SENSORS[o.type].pins.some((q) => q.bus && (o.pins[q.key] === s.pins.a || o.pins[q.key] === s.pins.b)));
    if (others) return;
    mods[i] = { ...mods[i], rows: mods[i].rows.map((r) => (r.label.startsWith("SDA") || r.label.startsWith("SCL") ? { ...r, via: "pullup", res: "10k", note: t("rig.modules.pullTo5v", { ohms: OHMS["10k"] }) } : r)), notes: [...mods[i].notes, t("rig.modules.spsNotePullups")] };
  });
  return mods;
}

export function RigDiagram({ sensors, bt = null, className }: { sensors: SensorInstance[]; bt?: BtModule; className?: string }) {
  const tr = useTranslations("rig.modules");
  // le colonne vuote (gap) servono solo sulla breadboard
  const mods = buildModules(sensors, bt).map((m) => ({ ...m, rows: m.rows.filter((r) => !r.gap) }));
  if (!mods.length) return null;
  const ROW = 20, HEAD = 26, GAP = 12, AX = 6, AW = 112;
  // righe di Arduino: 5V, GND, poi i pin dei segnali nell'ordine dei moduli. Un pin usato da più
  // moduli (bus I2C) compare una volta sola: un filo da Arduino che si dirama verso ogni modulo.
  type Sig = { mod: number; row: number; color: string; dashed?: boolean };
  const nets = new Map<number | "3V3", Sig[]>();
  mods.forEach((m, mi) => m.rows.forEach((r, ri) => {
    if (typeof r.conn !== "number" && r.conn !== "3V3") return;
    nets.set(r.conn, [...(nets.get(r.conn) ?? []), { mod: mi, row: ri, color: m.color, dashed: r.dashed }]);
  }));
  const netList = [...nets];
  const netName = (pin: number | "3V3") => (pin === "3V3" ? "3.3V" : pin === 0 ? "D0 (RX)" : pin === 1 ? "D1 (TX)" : pinName(pin));
  const aRows: string[] = ["5V", "GND", ...netList.map(([pin]) => netName(pin))];
  const aY = (i: number) => 14 + HEAD + i * ROW + ROW / 2;
  const nCh = netList.length;
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
  const isRail = (c: Conn) => c === "5V" || c === "GND";
  const lastPowerY = Math.max(...mods.flatMap((m, mi) => m.rows.map((r, ri) => (isRail(r.conn) ? mY(mi, ri) : 0))));
  const BUS = "#0f766e";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("diagramAria")} className={className}>
      {/* Arduino */}
      <rect x={AX} y={14} width={AW} height={HEAD + aRows.length * ROW + 8} rx={8} fill="var(--tone-lime)" stroke="currentColor" strokeOpacity={0.45} />
      <text x={AX + AW / 2} y={14 + 18} textAnchor="middle" fontWeight={600} fontSize={12}>Arduino Uno</text>
      {aRows.map((r, i) => (
        <g key={i}>
          <circle cx={AX + AW} cy={aY(i)} r={3} fill={i === 0 ? RED : i === 1 ? BLACK : netList[i - 2][1].length > 1 ? BUS : netList[i - 2][1][0].color} />
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
            const isPow = isRail(r.conn), nc = r.conn === "NC";
            return (
              <g key={ri} opacity={nc ? 0.55 : undefined}>
                {isPow && <path d={`M${r.conn === "5V" ? R5 : RG} ${yy}H${MX}`} stroke={r.conn === "5V" ? RED : BLACK} strokeWidth={2.5} fill="none" />}
                {isPow && <circle cx={r.conn === "5V" ? R5 : RG} cy={yy} r={2.8} fill={r.conn === "5V" ? RED : BLACK} />}
                <circle cx={MX} cy={yy} r={3} fill={nc ? "none" : isPow ? (r.conn === "5V" ? RED : BLACK) : m.color} stroke={nc ? "currentColor" : undefined} />
                <text x={MX + 12} y={yy + 4} fontSize={10.5}>{r.label}</text>
                {(r.note || nc) && <text x={MX + MW - 8} y={yy + 4} textAnchor="end" fontSize={9} opacity={0.65}>{nc ? (r.note ? `${r.note} · ${tr("notConnected")}` : tr("notConnected")) : r.note}</text>}
              </g>
            );
          })}
        </g>
      ))}
      {/* fili dei segnali: il primo usa il canale più a destra, così non si incrociano */}
      {netList.map(([, list], i) => {
        const x = CH0 + (nCh - 1 - i) * CHS;
        const ya = aY(i + 2);
        if (list.length === 1) {
          const s = list[0], d = `M${AX + AW} ${ya}H${x}V${mY(s.mod, s.row)}H${MX}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="var(--card)" strokeWidth={6} strokeLinejoin="round" />
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={s.dashed ? "5 3" : undefined} />
            </g>
          );
        }
        // filo condiviso: tronco da Arduino al canale, poi un ramo (con il pallino di giunzione) per modulo
        const ys = list.map((s) => mY(s.mod, s.row));
        const y0 = Math.min(ya, ...ys), y1 = Math.max(ya, ...ys);
        const trunk = `M${AX + AW} ${ya}H${x} M${x} ${y0}V${y1}`;
        return (
          <g key={i}>
            <title>{tr("busJunction")}</title>
            <path d={trunk} fill="none" stroke="var(--card)" strokeWidth={6} strokeLinejoin="round" />
            {list.map((s, k) => <path key={`c${k}`} d={`M${x} ${ys[k]}H${MX}`} fill="none" stroke="var(--card)" strokeWidth={6} />)}
            <path d={trunk} fill="none" stroke={BUS} strokeWidth={2.5} strokeLinejoin="round" />
            {list.map((s, k) => <path key={k} d={`M${x} ${ys[k]}H${MX}`} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? "5 3" : undefined} />)}
            {ys.map((yy, k) => <circle key={`j${k}`} cx={x} cy={yy} r={3.2} fill={BUS} />)}
          </g>
        );
      })}
    </svg>
  );
}

export const sensorTitle = (type: SensorType) => SENSORS[type].title;
