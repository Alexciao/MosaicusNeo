"use client";
// Mappa interattiva di una traccia GPS: ogni punto è una misura, colorata con il valore scelto
// (temperatura, umidità, altitudine…). Leaflet con le mappe di OpenStreetMap.

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { heatColor } from "@/lib/mosaicus/geo";
import { fmtNum } from "@/lib/prefs";
import { cn } from "@/lib/utils";

export interface MapPoint { lat: number; lon: number; t: number; v: number; info: [string, string][] }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function TrackMap({ points, label, unit, highlight, follow, onPick, className }: {
  points: MapPoint[]; label: string; unit: string; highlight?: [number, number] | null; follow?: boolean;
  onPick?: (t: number) => void; className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ path: L.Polyline; dots: L.LayerGroup; renderer: L.Canvas } | null>(null);
  const fitted = useRef(false);
  const pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; }, [onPick]);

  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) if (Number.isFinite(p.v)) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
    if (!Number.isFinite(lo)) return null;
    if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
    return [lo, hi] as [number, number];
  }, [points]);

  // creazione della mappa
  useEffect(() => {
    // in modalità LIM (lavagne lente) niente animazioni di zoom e dissolvenze delle mattonelle
    const lite = document.documentElement.classList.contains("lim");
    const m = L.map(el.current!, { zoomControl: true, attributionControl: true, preferCanvas: true, zoomAnimation: !lite, fadeAnimation: !lite, markerZoomAnimation: !lite }).setView([42.5, 12.5], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "mz-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);
    const renderer = L.canvas({ padding: 0.3 });
    const path = L.polyline([], { color: "#71717a", weight: 3, opacity: 0.55, renderer }).addTo(m);
    const dots = L.layerGroup().addTo(m);
    map.current = m; layers.current = { path, dots, renderer };
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => { ro.disconnect(); m.remove(); map.current = null; layers.current = null; fitted.current = false; };
  }, []);

  // punti
  useEffect(() => {
    const m = map.current, ly = layers.current;
    if (!m || !ly) return;
    ly.path.setLatLngs(points.map((p) => [p.lat, p.lon]));
    ly.dots.clearLayers();
    const [lo, hi] = range ?? [0, 1];
    const inSel = (t: number) => !highlight || (t >= highlight[0] && t <= highlight[1]);
    for (const p of points) {
      const on = inSel(p.t);
      const c = L.circleMarker([p.lat, p.lon], {
        renderer: ly.renderer, radius: on ? 6 : 4, weight: 1, color: "#ffffff",
        fillColor: heatColor((p.v - lo) / (hi - lo)), fillOpacity: on ? 0.95 : 0.25, opacity: on ? 0.9 : 0.2,
      });
      c.bindPopup(`<table class="mz-pop">${p.info.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`);
      c.on("click", () => pick.current?.(p.t));
      c.addTo(ly.dots);
    }
    if (points.length && !fitted.current) {
      fitted.current = true;
      if (points.length === 1) m.setView([points[0].lat, points[0].lon], 17);
      else m.fitBounds(ly.path.getBounds(), { padding: [24, 24], maxZoom: 18 });
    } else if (follow && points.length) {
      const last = points[points.length - 1];
      if (!m.getBounds().pad(-0.15).contains([last.lat, last.lon])) m.panTo([last.lat, last.lon]);
    }
    if (!points.length) fitted.current = false;
  }, [points, range, highlight, follow]);

  const recenter = () => {
    const m = map.current, ly = layers.current;
    if (!m || !ly || !points.length) return;
    if (highlight) {
      const sel = points.filter((p) => p.t >= highlight[0] && p.t <= highlight[1]);
      if (sel.length > 1) { m.fitBounds(L.latLngBounds(sel.map((p) => [p.lat, p.lon])), { padding: [24, 24], maxZoom: 18 }); return; }
    }
    m.fitBounds(ly.path.getBounds(), { padding: [24, 24], maxZoom: 18 });
  };

  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg border", className)}>
      <div ref={el} className="absolute inset-0 z-0" />
      {!points.length && (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center bg-background/40 p-6 text-center text-sm font-medium text-muted-foreground">
          Nessuna posizione. All&apos;aperto il GPS trova i satelliti in 30 s – qualche minuto.
        </div>
      )}
      <Button size="icon-sm" variant="outline" onClick={recenter} aria-label="Centra la traccia" title="Centra la traccia"
        className="absolute top-2.5 right-2.5 z-[500] bg-background shadow-sm">
        <LocateFixed />
      </Button>
      {range && (
        <div className="absolute bottom-6 left-2.5 z-[500] rounded-md border bg-background/95 px-2.5 py-1.5 text-xs shadow-sm">
          <p className="mb-1 font-medium">{label}{unit ? ` (${unit})` : ""}</p>
          <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 8 }, (_, i) => heatColor(i / 7)).join(",")})` }} />
          <div className="mt-0.5 flex justify-between tabular text-muted-foreground"><span>{fmtNum(range[0], 1)}</span><span>{fmtNum(range[1], 1)}</span></div>
        </div>
      )}
    </div>
  );
}
