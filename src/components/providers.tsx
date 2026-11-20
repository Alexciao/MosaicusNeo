"use client";

import { useEffect } from "react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { locale, messages } from "@/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { document.documentElement.lang = locale; }, []);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="mosaicus.theme">
        <TooltipProvider delay={400}>
          {children}
          <Toaster position="bottom-center" richColors={false} closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
