// MosaicusNeo — stato dei sensori ricavato dai dati che arrivano, durante la misura.
// Funziona con ogni firmware e con il simulatore. Il GPS senza fix NON è un errore: sta cercando i
// satelliti (succede sempre nei primi minuti, o al chiuso); lo è solo se non arriva nessun dato.

import { SENSORS } from "@/lib/sensors/catalog";
import { inputsOf, sensorLabel, type Rig, type Resolved } from "@/lib/sensors/rig";
import type { Row } from "@/lib/sensors/types";
import { t } from "@/i18n";

export type LiveTone = "ok" | "search" | "error";
/** kind: che problema è (stabile, anche se il testo cambia: «3 satelliti», «4 satelliti»…) */
export interface LiveIssue { sensorId: string; kind: string; tone: LiveTone; text: string; hint?: string }

const num = (v: unknown) => (typeof v === "number" ? v : NaN);

export function liveStatus(rig: Rig, res: Resolved, rows: Row[], running: boolean, elapsedS: number): LiveIssue[] {
  if (!running) return [];
  const out: LiveIssue[] = [];
  for (const s of inputsOf(rig)) {
    const def = SENSORS[s.type];
    const k = res.keyOf.get(s.id);
    const mine: Row[] = [];
    for (let i = rows.length - 1; i >= 0 && mine.length < 25; i--) if (rows[i]._s === s.id) mine.push(rows[i]);
    const name = sensorLabel(s);
    const waitS = s.type === "gps" || s.type === "dht" || s.type === "ds18b20" ? 4 : 2;
    if (!mine.length) {
      if (def.events) continue;                       // la fotocellula scrive solo ai passaggi
      if (elapsedS > waitS) out.push({ sensorId: s.id, kind: "nodata", tone: "error", text: t("lab.live.noData", { name }), hint: def.phone ? (s.type === "psound" ? t("lab.live.hintMic") : t("lab.live.hintPhone")) : t("lab.live.hintWiresPins") });
      continue;
    }
    const last = mine[0];
    switch (s.type) {
      case "gps": {
        const fix = num(last[k?.get("fix") ?? "fix"]), sats = num(last[k?.get("sats") ?? "sats"]);
        if (!(fix > 0)) out.push({ sensorId: s.id, kind: "gps", tone: "search", text: Number.isFinite(sats) ? t("lab.live.gpsSearchingSats", { name, n: sats }) : t("lab.live.gpsSearching", { name }), hint: t("lab.live.gpsHint") });
        else out.push({ sensorId: s.id, kind: "gps", tone: "ok", text: Number.isFinite(sats) ? t("lab.live.gpsFixSats", { name, n: sats }) : t("lab.live.gpsFix", { name }) });
        break;
      }
      case "dht": case "ds18b20": case "hx711": case "imu": case "mlx": case "sps30": {
        const okKey = k?.get("ok");
        const bad = okKey ? mine.slice(0, 3).every((r) => r[okKey] === false) : mine.slice(0, 3).every((r) => !Number.isFinite(num(r[k?.get(def.quantities(s.options)[0].key) ?? ""])));
        if (bad && mine.length >= 3) out.push({ sensorId: s.id, kind: "noreply", tone: "error", text: t("lab.live.noReply", { name }), hint: s.type === "ds18b20" ? t("lab.live.hintDs18b20") : s.type === "imu" || s.type === "mlx" ? t("lab.live.hintI2c") : t("lab.live.hintWires") });
        break;
      }
      case "sonar": {
        const echoK = k?.get("echo") ?? "echo";
        if (mine.length >= 20 && mine.slice(0, 20).every((r) => num(r[echoK]) === 0)) out.push({ sensorId: s.id, kind: "echo", tone: "search", text: t("lab.live.noEcho", { name }), hint: t("lab.live.hintSonar") });
        break;
      }
      case "ntc": {
        const adcK = k?.get("adc") ?? "adc";
        const a = num(last[adcK]);
        if (Number.isFinite(a) && (a < 2 || a > 1021)) out.push({ sensorId: s.id, kind: "ntc", tone: "error", text: t("lab.live.ntcFault", { name }), hint: t("lab.live.hintDivider") });
        break;
      }
    }
  }
  return out;
}
