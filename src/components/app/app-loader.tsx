"use client";

import dynamic from "next/dynamic";

/**
 * Boot screen, shown (and pre-rendered in the static HTML) while the app bundle loads.
 * Static on purpose: the app usually loads before an entrance animation could play. A sliding bar
 * fades in only if loading takes longer than 600 ms. No translated text: the language is only known
 * in the browser, so the screen is identical on the server and on the client. Styles: `.mz-boot*`.
 */
function BootScreen() {
  return (
    <div className="mz-boot" role="status" aria-live="polite" aria-label="MosaicusNeo">
      <div className="mz-boot-grid" aria-hidden />
      <div className="mz-boot-glow" aria-hidden />

      <div className="mz-boot-stack">
        <div className="mz-boot-mark">
          {/* the app icon (public/icons/icon.svg), inline so it paints with the HTML */}
          <svg viewBox="0 0 64 64" width="88" height="88" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#18221f" />
            <polygon points="32,9 51.92,20.5 51.92,43.5 32,55 12.08,43.5 12.08,20.5" fill="#C6F432" fillOpacity="0.09" stroke="#C6F432" strokeWidth="3.6" strokeLinejoin="round" />
            <polyline points="19.5,41 27.5,32.5 35,37.5 45,24.5" fill="none" stroke="#C6F432" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <g fill="#C6F432" stroke="#C6F432" strokeWidth="1.2" strokeLinejoin="round">
              <polygon points="19.50,37.40 22.62,39.20 22.62,42.80 19.50,44.60 16.38,42.80 16.38,39.20" />
              <polygon points="27.50,28.90 30.62,30.70 30.62,34.30 27.50,36.10 24.38,34.30 24.38,30.70" />
              <polygon points="35.00,33.90 38.12,35.70 38.12,39.30 35.00,41.10 31.88,39.30 31.88,35.70" />
              <polygon points="45.00,19.30 49.50,21.90 49.50,27.10 45.00,29.70 40.50,27.10 40.50,21.90" />
            </g>
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
