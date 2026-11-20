"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ISSUES_URL } from "@/lib/links";
import { crashReport, isChunkError, mayAutoRetry, recordCrash, reloadOnce, type CrashEntry } from "@/lib/crash";

/**
 * What a boundary does with an error: saves it, then reloads once (missing chunk = new deploy) or
 * re-renders once on its own. Returns the saved entry if the panel has to be shown.
 */
function useRecovery(error: unknown, where: string, retry: () => void): CrashEntry | null {
  const [entry, setEntry] = useState<CrashEntry | null>(null);
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (handled.current === error) return;
    handled.current = error;
    const e = recordCrash(error, where);
    if (isChunkError(error) && reloadOnce()) return;
    if (mayAutoRetry(where)) { retry(); return; }
    // shown after the effect, not during it (no cascading render)
    queueMicrotask(() => setEntry(e));
  }, [error, where, retry]);
  return entry;
}

/** The panel shown in place of the broken part, with the way out and the details for a report. */
export function CrashPanel({ error, where, retry, fullPage }: { error: unknown; where: string; retry: () => void; fullPage?: boolean }) {
  const t = useTranslations("app.crash");
  const entry = useRecovery(error, where, retry);
  const [copied, setCopied] = useState(false);
  if (!entry) return null; // recovering on its own
  const copy = () => {
    navigator.clipboard?.writeText(crashReport(entry)).then(() => setCopied(true), () => {});
  };
  return (
    <div role="alert" className={fullPage ? "flex min-h-svh items-center justify-center p-4" : "mx-auto max-w-xl p-4 py-12"}>
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground">
        <TriangleAlert aria-hidden className="size-5 text-destructive" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{fullPage ? t("page") : t("body")}</p>
        </div>
        <pre className="max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs break-words whitespace-pre-wrap text-muted-foreground">{entry.message}</pre>
        <div className="flex flex-wrap gap-2">
          <Button onClick={retry}>{t("retry")}</Button>
          <Button variant="outline" onClick={() => location.reload()}>{t("reload")}</Button>
          <Button variant="ghost" onClick={copy}>{copied ? t("copied") : t("copy")}</Button>
          <Button variant="ghost" render={<a href={ISSUES_URL} target="_blank" rel="noopener" />}>{t("report")}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Keeps an error in one part of the app (a page, a dialog) from taking down everything else:
 * the rest stays usable and a measurement in progress keeps running.
 */
export class ErrorBoundary extends Component<{ where: string; children: ReactNode }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };
  static getDerivedStateFromError(error: unknown) { return { error, failed: true }; }
  retry = () => this.setState({ error: null, failed: false });
  render() {
    if (this.state.failed) return <CrashPanel error={this.state.error} where={this.props.where} retry={this.retry} />;
    return this.props.children;
  }
}
