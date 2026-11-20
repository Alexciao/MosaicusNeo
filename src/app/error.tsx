"use client";

import { CrashPanel } from "@/components/app/error-boundary";

// Errors outside the per-page boundaries (header, app start-up…). The root layout, and with it
// the language and the theme, is still there.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <CrashPanel error={error} where="app" retry={retry} fullPage />;
}
