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
const RED = "#dc2626";

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
        rows: [
          ...(s.options.pkg === "signalFirst" ? [] : [{ label: "VCC (+)", conn: "5V" as const }]),
          { label: "DATA (out)", conn: p("a"), via: "pullup", res: "10k", note: t("rig.modules.pullTo5v", { ohms: OHMS["10k"] }) },
          ...(s.options.pkg === "signalFirst" ? [{ label: "VCC (+)", conn: "5V" as const }] : []),
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
    case "oled96":
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

/**
 * Mappa dei pin: una riga per collegamento, il pin di Arduino a sinistra e il piedino del modulo a
 * destra, uniti da un filo dritto del suo colore (rosso 5V, inchiostro GND, arancione 3.3V, il colore
 * del modulo per i segnali). Niente canali né incroci: si legge riga per riga. Le resistenze in più
 * (pull-up, serie, partitore) sono un'etichetta sul filo.
 */
export function RigDiagram({ sensors, bt = null, className }: { sensors: SensorInstance[]; bt?: BtModule; className?: string }) {
  const tr = useTranslations("rig.modules");
  // le colonne vuote (gap) servono solo sulla breadboard
  const mods = buildModules(sensors, bt).map((m) => ({ ...m, rows: m.rows.filter((r) => !r.gap) }));
  if (!mods.length) return null;
  const ROW = 24, HEAD = 30, GAP = 10, PAD = 8;
  const AX = PAD + 86;            // fine (a destra) dei nomi dei pin di Arduino
  const W1 = AX + 10, W2 = W1 + 168, MX = W2 + 12;
  const W = MX + 200 + PAD;
  const V33 = "#ea580c";
  const pinOf = (c: Conn) => (c === "5V" ? "5V" : c === "GND" ? "GND" : c === "3V3" ? "3.3V" : c === "NC" ? "" : c === 0 ? "D0 (RX)" : c === 1 ? "D1 (TX)" : pinName(c));
  const colorOf = (m: Mod, r: ModRow) => (r.conn === "5V" ? RED : r.conn === "GND" ? "currentColor" : r.conn === "3V3" ? V33 : m.color);
  const viaOf = (r: ModRow) => r.via === "divider" ? "1 kΩ + 2 kΩ" : r.note ?? (r.via === "series" && r.res ? OHMS[r.res] : undefined);
  const tops: number[] = [];
  let y = PAD;
  for (const m of mods) { tops.push(y); y += HEAD + m.rows.length * ROW + 8 + GAP; }
  const H = y - GAP + PAD;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("diagramAria")} className={className}>
      {mods.map((m, mi) => {
        const top = tops[mi];
        const h = HEAD + m.rows.length * ROW + 8;
        return (
          <g key={mi}>
            <rect x={PAD} y={top} width={W - PAD * 2} height={h} rx={8} fill="none" stroke="currentColor" strokeOpacity={0.14} />
            <line x1={PAD} x2={W - PAD} y1={top + HEAD} y2={top + HEAD} stroke="currentColor" strokeOpacity={0.1} />
            <text x={AX} y={top + 19} textAnchor="end" fontSize={10.5} fontWeight={500} opacity={0.55}>Arduino</text>
            <circle cx={MX + 4} cy={top + 15} r={4} fill={m.color} />
            <text x={MX + 14} y={top + 19} fontSize={12} fontWeight={600}>{m.title.length > 28 ? `${m.title.slice(0, 27)}…` : m.title}</text>
            {m.rows.map((r, ri) => {
              const yy = top + HEAD + 4 + ri * ROW + ROW / 2;
              const nc = r.conn === "NC";
              const c = colorOf(m, r);
              const via = nc ? undefined : viaOf(r);
              const mid = (W1 + W2) / 2, vw = via ? Math.min(160, via.length * 5.4 + 14) : 0;
              return (
                <g key={ri}>
                  {!nc && <text x={AX} y={yy + 4} textAnchor="end" fontSize={11} fontWeight={600} fontFamily="ui-monospace, monospace">{pinOf(r.conn)}</text>}
                  {nc ? (
                    <text x={mid} y={yy + 4} textAnchor="middle" fontSize={10} opacity={0.5}>{tr("notConnected")}</text>
                  ) : (
                    <>
                      <line x1={W1} x2={W2} y1={yy} y2={yy} stroke={c} strokeOpacity={r.conn === "GND" ? 0.8 : 1} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={r.dashed ? "6 4" : undefined} />
                      <circle cx={W1} cy={yy} r={3} fill={c} fillOpacity={r.conn === "GND" ? 0.8 : 1} />
                      <circle cx={W2} cy={yy} r={3} fill={c} fillOpacity={r.conn === "GND" ? 0.8 : 1} />
                      {via && (
                        <g>
                          <rect x={mid - vw / 2} y={yy - 8} width={vw} height={16} rx={4} fill="var(--card)" stroke="currentColor" strokeOpacity={0.2} />
                          <text x={mid} y={yy + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={500}>{via}</text>
                        </g>
                      )}
                    </>
                  )}
                  <text x={MX} y={yy + 4} fontSize={11} opacity={nc ? 0.5 : 1}>{r.label}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export const sensorTitle = (type: SensorType) => SENSORS[type].title;
