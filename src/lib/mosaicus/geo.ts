// Mosaicus — geografia: dalle coordinate NMEA ai gradi, distanze, scala di colori, export GPX e GeoJSON.

/** NMEA "ggmm.mmmm" (gradi e primi, negativo a sud/ovest) → gradi decimali. */
export function nmeaToDeg(v: number) {
  if (!Number.isFinite(v)) return NaN;
  const a = Math.abs(v), deg = Math.floor(a / 100), min = a - deg * 100;
  return Math.sign(v) * (deg + min / 60);
}

/** Distanza in metri tra due punti (formula dell'emisenoverso, Terra sferica di raggio 6371 km). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Istante UTC (ms) da ora "hhmmss.ss" e data "ggmmaa" della frase RMC; NaN se mancano. */
export function nmeaTime(utc: number, date: number) {
  if (!Number.isFinite(utc) || !Number.isFinite(date) || date <= 0) return NaN;
  const d = String(Math.round(date)).padStart(6, "0");
  const hh = Math.floor(utc / 10000), mm = Math.floor((utc % 10000) / 100), ss = utc % 100;
  return Date.UTC(2000 + +d.slice(4, 6), +d.slice(2, 4) - 1, +d.slice(0, 2), hh, mm, 0, Math.round(ss * 1000));
}

/** Scala di colori "da freddo a caldo" (blu → ciano → verde → giallo → rosso), u in [0, 1]. */
export function heatColor(u: number) {
  const stops: [number, number, number][] = [[49, 54, 149], [69, 117, 180], [116, 173, 209], [171, 217, 233], [254, 224, 144], [253, 174, 97], [244, 109, 67], [215, 48, 39]];
  if (!Number.isFinite(u)) return "#9ca3af";
  const x = Math.min(1, Math.max(0, u)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface TrackPoint { lat: number; lon: number; ele?: number; time?: number; t: number; values: Record<string, number> }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v: number, d = 7) => (Number.isFinite(v) ? String(+v.toFixed(d)) : "");

/** GPX 1.1 (traccia) con temperatura e umidità come estensioni (Garmin TrackPointExtension per la temperatura). */
export function toGPX(name: string, pts: TrackPoint[]) {
  const seg = pts.map((p) => {
    const ext = Object.entries(p.values).filter(([, v]) => Number.isFinite(v));
    const atemp = p.values.T;
    return `      <trkpt lat="${num(p.lat)}" lon="${num(p.lon)}">` +
      (Number.isFinite(p.ele!) ? `<ele>${num(p.ele!, 1)}</ele>` : "") +
      (Number.isFinite(p.time!) ? `<time>${new Date(p.time!).toISOString()}</time>` : "") +
      (ext.length ? `<extensions>${Number.isFinite(atemp) ? `<gpxtpx:TrackPointExtension><gpxtpx:atemp>${num(atemp, 2)}</gpxtpx:atemp></gpxtpx:TrackPointExtension>` : ""}` +
        ext.map(([k, v]) => `<mosaicus:${k}>${num(v, 4)}</mosaicus:${k}>`).join("") + "</extensions>" : "") +
      "</trkpt>";
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mosaicus" xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:mosaicus="https://github.com/Alexciao/MosaicusNeo/gpx">
  <metadata><name>${esc(name)}</name></metadata>
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${seg}
    </trkseg>
  </trk>
</gpx>
`;
}

/** GeoJSON: un punto per misura (con tutte le grandezze) e la linea del percorso. */
export function toGeoJSON(name: string, pts: TrackPoint[]) {
  const coord = (p: TrackPoint) => (Number.isFinite(p.ele!) ? [p.lon, p.lat, p.ele!] : [p.lon, p.lat]);
  const clean = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number.isFinite(v) ? v : null]));
  return JSON.stringify({
    type: "FeatureCollection",
    name,
    features: [
      { type: "Feature", properties: { name, kind: "track" }, geometry: { type: "LineString", coordinates: pts.map(coord) } },
      ...pts.map((p) => ({
        type: "Feature",
        properties: { t: p.t, time: Number.isFinite(p.time!) ? new Date(p.time!).toISOString() : null, ...clean(p.values) },
        geometry: { type: "Point", coordinates: coord(p) },
      })),
    ],
  }, null, 1);
}
