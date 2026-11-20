"use client";

import dynamic from "next/dynamic";

// L'app vive tutta nel browser (Web Serial, sensori, audio, IndexedDB): niente rendering sul server.
const MosaicusApp = dynamic(() => import("./mosaicus-app").then((m) => m.MosaicusApp), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <img src="/icons/icon.svg" alt="" width={36} height={36} className="animate-pulse rounded-lg" />
        <span className="text-sm font-medium">MosaicusNeo…</span>
      </div>
    </div>
  ),
});

export function AppLoader() {
  return <MosaicusApp />;
}
