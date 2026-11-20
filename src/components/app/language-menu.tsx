"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_NAMES, locale, setLocale, type Locale } from "@/i18n";
import { useLab } from "@/lib/lab-store";

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
      <DropdownMenuRadioGroup value={locale} onValueChange={(v) => choose(v as Locale)}>
        {LOCALES.map((l) => (
          <DropdownMenuRadioItem key={l} closeOnClick value={l} lang={l}>{LOCALE_NAMES[l]}</DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
