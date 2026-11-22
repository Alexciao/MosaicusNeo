"use client";
// Colore e icona di un lab: i due selettori usati da «Colore e icona» e dalla finestra «Nuovo lab».

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { PROJECT_ICONS, PROJECT_TONES, type ProjectIconKey } from "@/lib/sensors/project-look";
import type { Tone } from "@/lib/sensors/types";
import { cn } from "@/lib/utils";
import { toneDot, toneFg } from "./tone";

export function ToneField({ id, tone, onChange, className }: { id: string; tone: Tone; onChange: (c: Tone) => void; className?: string }) {
  const t = useTranslations("rig.picker");
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <p id={`tone-${id}`} className="text-xs font-medium text-muted-foreground">{t("color")}</p>
      <div className="grid w-fit grid-cols-6 gap-2" role="radiogroup" aria-labelledby={`tone-${id}`}>
        {PROJECT_TONES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === tone} aria-label={t(`tones.${c}`)} title={t(`tones.${c}`)}
            onClick={() => onChange(c)}
            className={cn("grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-popover transition-[box-shadow,scale] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.94]",
              toneDot[c], c === tone && "ring-2 ring-foreground")}>
            {c === tone && <Check className="size-3.5 text-white dark:text-zinc-950" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function IconField({ id, icon, tone, onChange, className }: { id: string; icon: ProjectIconKey; tone: Tone; onChange: (k: ProjectIconKey) => void; className?: string }) {
  const t = useTranslations("rig.picker");
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <p id={`icon-${id}`} className="text-xs font-medium text-muted-foreground">{t("icon")}</p>
      <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-labelledby={`icon-${id}`}>
        {(Object.entries(PROJECT_ICONS) as [ProjectIconKey, LucideIcon][]).map(([key, I]) => (
          <button key={key} type="button" role="radio" aria-checked={key === icon} aria-label={t(`icons.${key}`)} title={t(`icons.${key}`)}
            onClick={() => onChange(key)}
            className={cn("grid aspect-square place-items-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
              key === icon ? cn("bg-foreground/[0.07]", toneFg[tone]) : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
            <I />
          </button>
        ))}
      </div>
    </div>
  );
}
