"use client";

import dynamic from "next/dynamic";
import { LogoMark } from "./logo";

/**
 * Boot screen, shown (and pre-rendered in the static HTML) while the app bundle loads.
 * Static on purpose: the app usually loads before an entrance animation could play. A sliding bar
 * fades in only if loading takes longer than 100 ms. No translated text: the language is only known
 * in the browser, so the screen is identical on the server and on the client. Styles: `.mz-boot*`.
 */
function BootScreen() {
  return (
    <div className="mz-boot" role="status" aria-live="polite" aria-label="MosaicusNeo">
      <div className="mz-boot-grid" aria-hidden />
      <div className="mz-boot-glow" aria-hidden />

      <div className="mz-boot-stack">
        <div className="mz-boot-mark">
          {/* the mark (logo.tsx), inline so it paints with the HTML */}
          <LogoMark size={56} />
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
