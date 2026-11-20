// MosaicusNeo — crash recovery.
// When a component throws while rendering, React unmounts everything up to the nearest error
// boundary. Without one the whole app is replaced by Next's "This page couldn't load" screen.
// The boundaries (per page, app/error.tsx, app/global-error.tsx) use these helpers to:
//  • reload once when the error is a missing chunk (a new version was deployed while the tab was open);
//  • re-render once on their own (transient errors, e.g. an extension or automatic translation that
//    edited the page under React);
//  • remember the last errors in this browser, so they can be copied into a bug report.

const LOG_KEY = "mosaicus.crashes";
const RELOAD_KEY = "mosaicus.crashReloadAt";
const MAX_LOG = 10;

export interface CrashEntry {
  at: string;
  where: string;
  message: string;
  stack?: string;
  url: string;
  ua: string;
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack };
  try {
    return { message: typeof error === "string" ? error : JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/** A file of the app could not be loaded: almost always a new deploy (or the network dropped). */
export function isChunkError(error: unknown): boolean {
  const { message } = describe(error);
  return (
    (error instanceof Error && error.name === "ChunkLoadError") ||
    /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load chunk/i.test(message)
  );
}

/** Saves the error in this browser (last few only) and in the console. Returns the entry. */
export function recordCrash(error: unknown, where: string): CrashEntry {
  const entry: CrashEntry = {
    at: new Date().toISOString(),
    where,
    ...describe(error),
    url: typeof location === "undefined" ? "" : location.href,
    ua: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
  console.error(`[MosaicusNeo] crash in ${where}:`, error);
  try {
    const log: CrashEntry[] = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    log.push(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
  } catch { /* storage not available */ }
  return entry;
}

/** The saved errors, oldest first. */
export function crashLog(): CrashEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Reloads the page, at most once every 30 s (so a broken deploy can't cause a reload loop). */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/**
 * Remembers when each boundary last retried on its own: one automatic retry per boundary
 * every 15 s, so an error that happens on every render shows the panel instead of looping.
 */
const lastAutoRetry = new Map<string, number>();
export function mayAutoRetry(where: string): boolean {
  const now = Date.now();
  if (now - (lastAutoRetry.get(where) ?? 0) < 15_000) return false;
  lastAutoRetry.set(where, now);
  return true;
}

/** Plain-text details for a bug report. */
export function crashReport(entry: CrashEntry): string {
  return [
    `When: ${entry.at}`,
    `Where: ${entry.where}`,
    `Page: ${entry.url}`,
    `Browser: ${entry.ua}`,
    "",
    entry.message,
    entry.stack ?? "",
  ].join("\n").trim();
}
