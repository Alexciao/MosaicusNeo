// Versione dell'app e del firmware atteso su Arduino.
// Il firmware sta in firmware/mosaicusneo_firmware/ e viene copiato in public/ a ogni build.
export const APP_VERSION = "2.1.0";
export const FIRMWARE_VERSION = "1.3";
export const FIRMWARE_URL = "/firmware/mosaicusneo_firmware.ino";

/** Confronta due versioni "a.b.c": < 0 se a è più vecchia di b. */
export function cmpVersion(a: string, b: string) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
