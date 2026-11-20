"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_NAMES, locale, setLocale, type Locale } from "@/i18n";
import { useLab } from "@/lib/lab-store";

export const CHOICE = "justify-center px-1 py-1.5 data-checked:bg-accent data-checked:font-medium data-checked:ring-1 data-checked:ring-foreground/10 [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden";

/** Language choice, inside the settings menu: saves the choice and reloads the page. */
export function LanguageItems() {
  const t = useTranslations("common.language");
  const choose = (v: Locale) => {
    if (v === locale) return;
    // reloading would stop the measurement
    if (useLab.getState().running) { toast(t("stopFirst")); return; }
    setLocale(v);
  };
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={locale} onValueChange={(v) => choose(v as Locale)} className="grid gap-1 px-0.5 pb-1"
        style={{ gridTemplateColumns: `repeat(${Math.min(LOCALES.length, 3)}, minmax(0, 1fr))` }}>
        {LOCALES.map((l) => (
          <DropdownMenuRadioItem key={l} closeOnClick value={l} lang={l} className={CHOICE}>{LOCALE_NAMES[l]}</DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
