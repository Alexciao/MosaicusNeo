"use client";

import { useEffect, useState } from "react";
import { isChunkError, recordCrash, reloadOnce } from "@/lib/crash";
import { locale } from "@/i18n";

// Last resort: the root layout itself failed (so no styles, theme or translations). It replaces
// Next's default "This page couldn't load": reloads on its own once if a file of the app was
// missing (new deploy), otherwise shows the error so it can be reported.
const TEXT = {
  en: { title: "MosaicusNeo couldn’t start", body: "Reload to try again. Your saved data is safe.", reload: "Reload" },
  it: { title: "MosaicusNeo non è partito", body: "Ricarica per riprovare. I dati salvati sono al sicuro.", reload: "Ricarica" },
};

export default function GlobalError({ error }: { error: unknown; retry: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const e = recordCrash(error, "root");
    if (isChunkError(error) && reloadOnce()) return;
    queueMicrotask(() => setMessage(e.message));
  }, [error]);
  const t = TEXT[locale] ?? TEXT.en;
  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", colorScheme: "light dark", background: "Canvas", color: "CanvasText" }}>
        <title>MosaicusNeo</title>
        {message !== null && (
          <div role="alert" style={{ maxWidth: 420, minWidth: 0, padding: 24 }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>{t.title}</h1>
            <p style={{ margin: "0 0 12px", opacity: 0.75 }}>{t.body}</p>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", opacity: 0.6, margin: "0 0 16px" }}>{message}</pre>
            <button type="button" onClick={() => location.reload()} style={{ font: "inherit", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>{t.reload}</button>
          </div>
        )}
      </body>
    </html>
  );
}
