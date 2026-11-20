"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_NAMES, locale, setLocale, type Locale } from "@/i18n";
import { useLab } from "@/lib/lab-store";

/** Language picker in the header: saves the choice and reloads the page. */
export function LanguageMenu() {
  const t = useTranslations("common.language");
  const choose = (v: Locale) => {
    if (v === locale) return;
    // reloading would stop the measurement
    if (useLab.getState().running) { toast(t("stopFirst")); return; }
    setLocale(v);
  };
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("label")} />} />}>
          <Languages />
        </TooltipTrigger>
        <TooltipContent>{t("label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={(v) => choose(v as Locale)}>
            {LOCALES.map((l) => (
              <DropdownMenuRadioItem key={l} closeOnClick value={l} lang={l}>{LOCALE_NAMES[l]}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
