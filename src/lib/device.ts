// MosaicusNeo — che dispositivo e che browser sta usando la persona, e che cosa può fare.
// Serve alla guida per mostrare subito le istruzioni giuste (con la possibilità di sceglierne altre).

import { t } from "@/i18n";

export type GuideDevice = "pc" | "android" | "ios" | "board";
export type Os = "windows" | "mac" | "linux" | "chromeos" | "android" | "ios" | "other";
export type BrowserName = "chrome" | "edge" | "opera" | "samsung" | "firefox" | "safari" | "bluefy" | "other";

export interface DeviceInfo {
  os: Os;
  browser: BrowserName;
  /** versione principale del browser (Chrome/Edge), se nota */
  version: number | null;
  device: GuideDevice;
  touch: boolean;
  /** Web Serial: cavo USB (computer) o HC-06 (Android, Chrome 138+) */
  serial: boolean;
  /** Web Bluetooth presente nel browser */
  bluetooth: boolean;
  secure: boolean;
  standalone: boolean;
}

export const DEVICE_LABEL: Record<GuideDevice, string> = {
  pc: t("engine.device.pc"),
  android: t("engine.device.android"),
  ios: t("engine.device.ios"),
  board: t("engine.device.board"),
};

export const OS_LABEL: Record<Os, string> = {
  windows: "Windows", mac: "macOS", linux: "Linux", chromeos: "ChromeOS", android: "Android", ios: "iOS / iPadOS", other: t("engine.device.unknownOs"),
};

export const BROWSER_LABEL: Record<BrowserName, string> = {
  chrome: "Chrome", edge: "Edge", opera: "Opera", samsung: "Samsung Internet", firefox: "Firefox", safari: "Safari", bluefy: "Bluefy", other: t("engine.device.unknownBrowser"),
};

export function detectDevice(): DeviceInfo {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean }; standalone?: boolean };
  const ua = nav.userAgent;
  const platform = nav.userAgentData?.platform ?? "";
  const touch = (nav.maxTouchPoints ?? 0) > 1;

  // iPadOS si presenta come un Mac: lo tradisce il touch
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch);
  const os: Os = ios ? "ios"
    : /Android/i.test(ua) || platform === "Android" ? "android"
    : /CrOS/.test(ua) || platform === "Chrome OS" ? "chromeos"
    : /Windows/.test(ua) || platform === "Windows" ? "windows"
    : /Macintosh|Mac OS X/.test(ua) || platform === "macOS" ? "mac"
    : /Linux/.test(ua) || platform === "Linux" ? "linux" : "other";

  const browser: BrowserName = /Bluefy/i.test(ua) ? "bluefy"
    : /Edg(e|A|iOS)?\//.test(ua) ? "edge"
    : /OPR\/|Opera/.test(ua) ? "opera"
    : /SamsungBrowser/.test(ua) ? "samsung"
    : /Firefox|FxiOS/.test(ua) ? "firefox"
    : /Chrome|CriOS/.test(ua) ? "chrome"
    : /Safari/.test(ua) ? "safari" : "other";
  const m = ua.match(/(?:Chrome|CriOS|Edg)\/(\d+)/);

  // lavagna: Android, touch, schermo grande (le LIM sono 55–86", spesso 4K)
  const big = Math.max(screen.width, screen.height) * Math.min(window.devicePixelRatio || 1, 2) >= 1900 && Math.min(screen.width, screen.height) >= 900;
  const device: GuideDevice = os === "ios" ? "ios" : os === "android" ? (big && !nav.userAgentData?.mobile ? "board" : "android") : "pc";

  return {
    os, browser, version: m ? Number(m[1]) : null, device, touch,
    serial: "serial" in navigator,
    bluetooth: "bluetooth" in navigator,
    secure: window.isSecureContext,
    standalone: matchMedia("(display-mode: standalone)").matches || !!nav.standalone,
  };
}

/** Il Bluetooth del dispositivo è acceso e disponibile? (null = non si può sapere) */
export async function bluetoothAvailable(): Promise<boolean | null> {
  const bt = (navigator as Navigator & { bluetooth?: { getAvailability?: () => Promise<boolean> } }).bluetooth;
  if (!bt?.getAvailability) return null;
  try { return await bt.getAvailability(); } catch { return null; }
}
