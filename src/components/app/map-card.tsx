"use client";
// Mappa della pagina Misura (montaggi con un GPS): ogni posizione è un punto, colorato con la
// grandezza scelta. Le grandezze degli altri sensori (temperatura, umidità…) sono prese al
// momento di ogni posizione (interpolate). Legata alla selezione dei grafici, con un riepilogo.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { intlLocale } from "@/i18n";
import { Card } from "@/components/ui/card";
import { quantityOf } from "@/lib/sensors/quantities";
import { useLab, measureGroup, resolved, trackPoints } from "@/lib/lab-store";
import { fmtNum, prefs } from "@/lib/prefs";
import { Segmented } from "@/components/instruments/scope-panel";
import { TrackMap, type MapPoint } from "./track-map";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

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
  const rig = useLab((s) => s.rig);
  const selection = useLab((s) => s.selection);
  const running = useLab((s) => s.running);
  const t = useTranslations("app.map");
  const res = resolved(rig);
  const pts = trackPoints(rows, rig);
  const byKey = new Map(res.quantities.map((q) => [q.key, q]));
  // grandezze con cui colorare: quelle degli altri sensori, poi altitudine e velocità
  const keys = [...new Set(pts.flatMap((p) => Object.keys(p.values)))].filter((k) => k !== "s" && pts.some((p) => isNum(p.values[k])));
  if (pts.some((p) => isNum(p.ele))) keys.push("__alt");
  const [want, setWant] = useState(() => prefs.get("mosaicus.mapKey", "T"));
  const key = keys.includes(want) ? want : keys[0] ?? "__alt";
  const value = (p: (typeof pts)[number]) => (key === "__alt" ? p.ele ?? NaN : p.values[key]);
  const info = (k: string) => (k === "__alt" ? { sym: "h", name: t("altitude"), unit: "m" }
    : byKey.get(k) ?? { sym: quantityOf(k)?.sym ?? k, name: quantityOf(k)?.name ?? k, unit: quantityOf(k)?.unit ?? "" });
  const q = info(key);

  const points: MapPoint[] = pts.map((p) => ({
    lat: p.lat, lon: p.lon, t: p.t, v: value(p),
    info: [
      ...(isNum(p.time) ? [[t("time"), new Date(p.time).toLocaleTimeString(intlLocale)] as [string, string]] : []),
      ["t", `${fmtNum(p.t, 1)} s`],
      ...Object.entries(p.values).filter(([, v]) => isNum(v)).map(([k, v]) => { const i = info(k); return [i.name, `${fmtNum(v, 2)}${i.unit ? ` ${i.unit}` : ""}`] as [string, string]; }),
      ...(isNum(p.ele) ? [[t("altitude"), `${fmtNum(p.ele, 0)} m`] as [string, string]] : []),
      [t("position"), `${fmtNum(p.lat, 5)}, ${fmtNum(p.lon, 5)}`],
    ],
  }));

  const [a, b] = selection ?? [-Infinity, Infinity];
  const sel = pts.filter((p) => p.t >= a && p.t <= b);
  const vals = sel.map(value).filter(isNum);
  const alts = sel.map((p) => p.ele).filter(isNum);
  let gain = 0;
  for (let i = 1; i < alts.length; i++) if (alts[i] - alts[i - 1] > 0.5) gain += alts[i] - alts[i - 1];
  const ss = sel.map((p) => p.values.s).filter(isNum);
  const dur = sel.length ? sel[sel.length - 1].t - sel[0].t : 0;
  const mm = (s: number) => (s >= 60 ? t("minSec", { m: Math.floor(s / 60), s: Math.round(s % 60) }) : `${fmtNum(s, 0)} s`);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold">{t("title")}</h3>
        {keys.length > 1 && (
          <Segmented label={t("colorBy")} value={key} onChange={(k) => { setWant(k); prefs.set("mosaicus.mapKey", k); }}
            items={keys.map((k) => [k, info(k).sym, info(k).name])} />
        )}
      </div>
      <TrackMap className="h-[clamp(300px,52vh,620px)]" points={points} label={q.name} unit={q.unit}
        highlight={selection} follow={running} onPick={(t) => measureGroup().setHover(t)} />
      {!!sel.length && (
        <div className="flex flex-wrap gap-2">
          <Stat label={selection ? t("ptsSel") : t("ptsAll")} value={String(sel.length)} />
          <Stat label={t("distance")} value={ss.length ? `${fmtNum(ss[ss.length - 1] - ss[0], 0)} m` : "—"} />
          <Stat label={t("duration")} value={mm(dur)} />
          <Stat label={t("gain")} value={`${fmtNum(gain, 0)} m`} />
          {!!vals.length && <Stat label={t("minMeanMax", { sym: q.sym })} value={`${fmtNum(Math.min(...vals), 1)} · ${fmtNum(vals.reduce((x, y) => x + y, 0) / vals.length, 1)} · ${fmtNum(Math.max(...vals), 1)} ${q.unit}`} />}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </Card>
  );
}
