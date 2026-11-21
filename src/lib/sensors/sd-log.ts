// MosaicusNeo — i file registrati da Arduino sulla scheda microSD (firmware 1.5).
//
// Il firmware scrive le stesse righe che manda all'app via cavo, con un'intestazione che dice
// quale progetto era configurato:
//   #MOSAICUSNEO,<fw>,SD                         (#MOSAICUS,<fw>,SD fino al firmware 1.8)
//   #PROJ,<id>                                   (id della configurazione mandata da «Prepara Arduino»)
//   #CFG,<slot>,<TIPO>,<ms>,<pinA>,<pinB>,<opz>  (una riga per sensore, come CFG,ADD)
//   #START
//   D,<slot>,<t_ms>,<valori…>
//   #STOP,<t_ms>                                  (solo se fermata con il pulsante)
// Le righe D diventano le stesse letture grezze [slot, t_ms, valori…] di una misura dal vivo.

import { SENSORS, type SensorType } from "./catalog";
import { makeSensor, resolveRig, firmwareCommands, type Rig, type SensorInstance } from "./rig";

export interface SdCfg { slot: number; type: string; ms: number; a: number; b: number; opt: number }
export interface SdLog { fw: string | null; proj: string | null; cfg: SdCfg[]; raw: number[][]; stopped: boolean; bad: number }

/** Legge un file della scheda SD; null se non è un file di MosaicusNeo. */
export function parseSdLog(text: string): SdLog | null {
  const lines = text.split(/\r?\n/);
  const head = lines.find((l) => l.trim());
  if (!head?.startsWith("#MOSAICUS")) return null;   // anche #MOSAICUSNEO (firmware 1.9 e successivi)
  const log: SdLog = { fw: head.split(",")[1] ?? null, proj: null, cfg: [], raw: [], stopped: false, bad: 0 };
  for (const l of lines) {
    if (l.startsWith("D,")) {
      const f = l.slice(2).split(",").map((v) => (v === "nan" ? NaN : Number(v)));
      // l'ultima riga può essere troncata (corrente staccata mentre Arduino scriveva): si scarta
      if (Number.isInteger(f[0]) && Number.isFinite(f[1]) && f.length > 2 && !l.endsWith(",")) log.raw.push(f);
      else log.bad++;
    } else if (l.startsWith("#PROJ,")) log.proj = l.slice(6).trim() || null;
    else if (l.startsWith("#CFG,")) {
      const [slot, type, ms, a, b, opt] = l.slice(5).split(",");
      log.cfg.push({ slot: Number(slot), type: type.trim(), ms: Number(ms), a: Number(a), b: Number(b), opt: Number(opt) || 0 });
    } else if (l.startsWith("#STOP")) log.stopped = true;
  }
  // fermata staccando la corrente: l'ultima riga può essere tagliata a metà di un numero
  // («512» scritto come «51») senza che si veda. La tolgo.
  if (!log.stopped && log.raw.length) { log.raw.pop(); log.bad++; }
  log.cfg.sort((x, y) => x.slot - y.slot);
  return log;
}

/** La configurazione del file corrisponde a quella di questo progetto (stessi sensori, stessi pin)? */
export function cfgMatches(rig: Rig, cfg: SdCfg[]) {
  const cmds = firmwareCommands(rig, resolveRig(rig)).filter((c) => c.startsWith("CFG,ADD,"));
  if (cmds.length !== cfg.length) return false;
  return cmds.every((c, i) => {
    const [, , slot, type, , a, b] = c.split(",");
    const k = cfg[i];
    return Number(slot) === k.slot && type === k.type && Number(a) === k.a && Number(b) === k.b;
  });
}

const BY_FW: Record<string, SensorType> = { NTC: "ntc", ANA: "analog", DHT: "dht", SONAR: "sonar", GPS: "gps", DS18: "ds18b20", GATE: "gate", HX711: "hx711", IMU: "imu", MLX: "mlx", SPS: "sps30" };

/** Ricostruisce i sensori dalla configurazione scritta nel file (con le opzioni di serie). */
export function sensorsFromCfg(cfg: SdCfg[]): SensorInstance[] {
  return cfg.flatMap((k) => {
    const type = k.type === "ANA" && k.opt & 1 ? "ldr" : BY_FW[k.type];
    if (!type) return [];
    const options: Record<string, string> = {};
    if (type === "ldr") options.orientation = k.opt & 2 ? "ldrgnd" : "ldr5v";
    if (type === "dht") options.model = k.opt === 22 ? "dht22" : "dht11";
    if (type === "gate") { options.blocked = k.opt & 1 ? "low" : "high"; options.pullup = k.opt & 2 ? "yes" : "no"; }
    if (type === "imu") { options.range = ["2", "4", "8", "16"][k.opt & 3]; options.addr = k.opt & 4 ? "69" : "68"; }
    const s = makeSensor(type, new Set(), { options, interval: k.ms || SENSORS[type].interval.def });
    for (const spec of SENSORS[type].pins) s.pins[spec.key] = spec.key === "a" ? k.a : spec.key === "b" ? k.b : s.pins[spec.key];
    return [s];
  });
}
