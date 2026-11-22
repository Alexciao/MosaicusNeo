"use client";
// Nome, colore e icona di un lab: lo stesso blocco in «Nuovo lab» e in «Modifica il lab».

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { PROJECT_ICONS, PROJECT_TONES, type ProjectIconKey } from "@/lib/sensors/project-look";
import type { Tone } from "@/lib/sensors/types";
import { isPhoneWidth } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { toneBg, toneDot, toneFg } from "./tone";

/** La piastrella del lab (anteprima dal vivo), il nome, i colori e le icone. */
export function LabIdentityFields({ id, name, onName, tone, onTone, icon, onIcon, placeholder, onPaste }: {
  id: string; name: string; onName: (n: string) => void; tone: Tone; onTone: (c: Tone) => void; icon: ProjectIconKey; onIcon: (k: ProjectIconKey) => void;
  placeholder: string; onPaste?: React.ClipboardEventHandler<HTMLInputElement>;
}) {
  const t = useTranslations("rig.picker");
  const Icon = PROJECT_ICONS[icon];
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-colors [&_svg]:size-4", toneBg[tone], toneFg[tone])}><Icon /></span>
        <label htmlFor={`${id}-name`} className="sr-only">{t("projectName")}</label>
        <Input id={`${id}-name`} autoFocus={!isPhoneWidth()} value={name} maxLength={80} placeholder={placeholder}
          onChange={(e) => onName(e.target.value)} onPaste={onPaste}
          className="h-9 min-w-0 flex-1 text-[15px] font-medium md:text-[15px]" />
      </div>
      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <ToneField id={id} tone={tone} onChange={onTone} />
        <IconField id={id} icon={icon} tone={tone} onChange={onIcon} />
      </div>
    </>
  );
}

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
