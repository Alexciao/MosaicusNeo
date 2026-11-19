// MosaicusNeo — stato dei sensori ricavato dai dati che arrivano, durante la misura.
// Funziona con ogni firmware e con il simulatore. Il GPS senza fix NON è un errore: sta cercando i
// satelliti (succede sempre nei primi minuti, o al chiuso); lo è solo se non arriva nessun dato.

import { SENSORS } from "@/lib/sensors/catalog";
import { inputsOf, sensorLabel, type Rig, type Resolved } from "@/lib/sensors/rig";
import type { Row } from "@/lib/sensors/types";

export type LiveTone = "ok" | "search" | "error";
export interface LiveIssue { sensorId: string; tone: LiveTone; text: string; hint?: string }

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
      if (elapsedS > waitS) out.push({ sensorId: s.id, tone: "error", text: `${name}: nessun dato`, hint: def.phone ? (s.type === "psound" ? "consenti l'accesso al microfono" : "apri l'app sul telefono: i computer di solito non hanno questi sensori") : "controlla fili e pin" });
      continue;
    }
    const last = mine[0];
    switch (s.type) {
      case "gps": {
        const fix = num(last[k?.get("fix") ?? "fix"]), sats = num(last[k?.get("sats") ?? "sats"]);
        if (!(fix > 0)) out.push({ sensorId: s.id, tone: "search", text: `${name}: ricerca dei satelliti${Number.isFinite(sats) ? ` (${sats} in vista)` : ""}`, hint: "all'aperto, cielo libero: da 30 s a qualche minuto" });
        else out.push({ sensorId: s.id, tone: "ok", text: `${name}: posizione trovata${Number.isFinite(sats) ? ` · ${sats} satelliti` : ""}` });
        break;
      }
      case "dht": case "ds18b20": case "hx711": case "imu": {
        const okKey = k?.get("ok");
        const bad = okKey ? mine.slice(0, 3).every((r) => r[okKey] === false) : mine.slice(0, 3).every((r) => !Number.isFinite(num(r[k?.get(def.quantities(s.options)[0].key) ?? ""])));
        if (bad && mine.length >= 3) out.push({ sensorId: s.id, tone: "error", text: `${name}: non risponde`, hint: s.type === "ds18b20" ? "controlla la resistenza da 4,7 kΩ tra DATA e 5V" : s.type === "imu" ? "controlla SDA e SCL" : "controlla i fili" });
        break;
      }
      case "sonar": {
        const echoK = k?.get("echo") ?? "echo";
        if (mine.length >= 20 && mine.slice(0, 20).every((r) => num(r[echoK]) === 0)) out.push({ sensorId: s.id, tone: "search", text: `${name}: nessun eco`, hint: "serve un bersaglio piatto tra 5 cm e 3 m" });
        break;
      }
      case "ntc": {
        const adcK = k?.get("adc") ?? "adc";
        const a = num(last[adcK]);
        if (Number.isFinite(a) && (a < 2 || a > 1021)) out.push({ sensorId: s.id, tone: "error", text: `${name}: sonda staccata o in corto`, hint: "controlla il partitore" });
        break;
      }
    }
  }
  return out;
}
