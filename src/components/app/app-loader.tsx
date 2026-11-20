"use client";

import dynamic from "next/dynamic";

// The hexagon nodes of the mark, in drawing order along the trace.
const NODES = [
  { x: 19.5, y: 41, r: 3.6 },
  { x: 27.5, y: 32.5, r: 3.6 },
  { x: 35, y: 37.5, r: 3.6 },
  { x: 45, y: 24.5, r: 5.2 },
];

const hex = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/**
 * Boot screen, shown (and pre-rendered in the static HTML) while the app bundle loads.
 * No translated text: the language is only known in the browser, so the screen stays the same
 * on the server and on the client. All motion lives in globals.css (`.mz-boot*`).
 */
function BootScreen() {
  return (
    <div className="mz-boot" role="status" aria-live="polite" aria-label="MosaicusNeo">
      <div className="mz-boot-grid" aria-hidden />
      <div className="mz-boot-glow" aria-hidden />

      <div className="mz-boot-stack">
        <div className="mz-boot-mark">
          <svg viewBox="0 0 64 64" width="88" height="88" aria-hidden>
            <rect width="64" height="64" rx="14" className="mz-boot-tile" />
            <polygon
              points="32,9 51.92,20.5 51.92,43.5 32,55 12.08,43.5 12.08,20.5"
              pathLength={1}
              className="mz-boot-hex"
            />
            <polyline points="19.5,41 27.5,32.5 35,37.5 45,24.5" pathLength={1} className="mz-boot-trace" />
            {NODES.map((n, i) => (
              <polygon
                key={i}
                points={hex(n.x, n.y, n.r)}
                className="mz-boot-node"
                style={{ "--i": i, transformOrigin: `${n.x}px ${n.y}px` } as React.CSSProperties}
              />
            ))}
          </svg>
        </div>

        <div className="mz-boot-word">
          Mosaicus<span>Neo</span>
        </div>

        <div className="mz-boot-bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  );
}

// L'app vive tutta nel browser (Web Serial, sensori, audio, IndexedDB): niente rendering sul server.
const MosaicusApp = dynamic(() => import("./mosaicus-app").then((m) => m.MosaicusApp), {
  ssr: false,
  loading: BootScreen,
});

export function AppLoader() {
  return <MosaicusApp />;
}
