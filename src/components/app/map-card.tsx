"use client";
// Mappa della pagina Misura (lab con il GPS): punti colorati, legati alla selezione dei grafici,
// e un riepilogo del tratto (distanza, durata, dislivello, minimo/medio/massimo).

import { useState } from "react";
import { Bluetooth } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QUANTITIES, type Row } from "@/lib/mosaicus/experiments";
import { useLab, currentExp, measureGroup, bluetoothSetup } from "@/lib/lab-store";
import { fmtNum, prefs } from "@/lib/prefs";
import { Segmented } from "@/components/instruments/scope-panel";
import { TrackMap, type MapPoint } from "./track-map";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function rowInfo(r: Row): [string, string][] {
  const out: [string, string][] = [];
  const add = (label: string, v: unknown, unit: string, d = 1) => { if (isNum(v)) out.push([label, `${fmtNum(v, d)}${unit ? ` ${unit}` : ""}`]); };
  if (isNum(r.time)) out.push(["ora", new Date(r.time).toLocaleTimeString("it-IT")]);
  add("t", r.t, "s");
  add("temperatura", r.T, "°C");
  add("umidità", r.RH, "%", 0);
  add("punto di rugiada", r.Td, "°C");
  add("altitudine", r.alt, "m", 0);
  add("velocità", r.speed, "km/h");
  add("distanza", r.s, "m", 0);
  add("satelliti", r.sats, "", 0);
  out.push(["posizione", `${fmtNum(r.lat as number, 5)}, ${fmtNum(r.lon as number, 5)}`]);
  return out;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border bg-muted/40 px-3 py-1.5">
      <p className="text-[0.7rem] font-medium text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  );
}

export function MapCard() {
  const rows = useLab((s) => s.rows);
  const selection = useLab((s) => s.selection);
  const running = useLab((s) => s.running);
  const linkKind = useLab((s) => s.linkKind);
  const ready = useLab((s) => s.ready);
  const exp = currentExp();
  const keys = (exp.mapKeys ?? ["T"]).filter((k) => rows.some((r) => isNum(r[k])));
  const [want, setWant] = useState(() => prefs.get("mosaicus.mapKey", "T"));
  const key = keys.includes(want) ? want : keys[0] ?? "T";
  const q = QUANTITIES[key];

  const points: MapPoint[] = rows
    .filter((r) => isNum(r.lat) && isNum(r.lon))
    .map((r) => ({ lat: r.lat as number, lon: r.lon as number, t: r.t, v: r[key] as number, info: rowInfo(r) }));

  const stats = (() => {
    const [a, b] = selection ?? [-Infinity, Infinity];
    const sel = rows.filter((r) => r.t >= a && r.t <= b && isNum(r.lat));
    if (!sel.length) return null;
    const vals = sel.map((r) => r[key]).filter(isNum);
    const alts = sel.map((r) => r.alt).filter(isNum);
    let gain = 0;
    for (let i = 1; i < alts.length; i++) if (alts[i] - alts[i - 1] > 0.5) gain += alts[i] - alts[i - 1];
    const ss = sel.map((r) => r.s).filter(isNum);
    return {
      n: sel.length,
      dist: ss.length ? ss[ss.length - 1] - ss[0] : NaN,
      dur: sel[sel.length - 1].t - sel[0].t,
      min: vals.length ? Math.min(...vals) : NaN, max: vals.length ? Math.max(...vals) : NaN,
      mean: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : NaN,
      gain,
    };
  })();

  const unit = q?.unit ?? "";
  const mm = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${fmtNum(s, 0)} s`);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold">Mappa</h3>
        {keys.length > 1 && (
          <Segmented label="Colore dei punti" value={key} onChange={(k) => { setWant(k); prefs.set("mosaicus.mapKey", k); }}
            items={keys.map((k) => [k, QUANTITIES[k]?.sym ?? k, QUANTITIES[k]?.name])} />
        )}
        {linkKind === "arduino" && ready && !running && (
          <Button size="sm" variant="outline" onClick={() => void bluetoothSetup()} title="Da fare una volta, con Arduino collegato via USB e l'HC-06 non associato">
            <Bluetooth /> Configura HC-06
          </Button>
        )}
      </div>
      <TrackMap className="h-[clamp(300px,52vh,620px)]" points={points} label={q?.name ?? key} unit={unit}
        highlight={selection} follow={running} onPick={(t) => measureGroup().setHover(t)} />
      {stats && (
        <div className="flex flex-wrap gap-2">
          <Stat label={selection ? "punti nel tratto" : "punti con posizione"} value={String(stats.n)} />
          <Stat label="distanza" value={Number.isFinite(stats.dist) ? `${fmtNum(stats.dist, 0)} m` : "—"} />
          <Stat label="durata" value={mm(stats.dur)} />
          <Stat label="salita totale" value={`${fmtNum(stats.gain, 0)} m`} />
          <Stat label={`${q?.sym ?? key} min · medio · max`} value={`${fmtNum(stats.min, 1)} · ${fmtNum(stats.mean, 1)} · ${fmtNum(stats.max, 1)} ${unit}`} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Tocca un punto per i suoi valori · trascina su un grafico per evidenziare un tratto sulla mappa · le mappe servono la rete, i dati no.</p>
    </Card>
  );
}
