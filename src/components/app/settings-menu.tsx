"use client";
// Un solo menu per account e impostazioni: chi è collegato (e se è sincronizzato), tema, modalità LIM, link utili.
// Collegato: il pulsante è l'avatar con lo stato del cloud. Altrimenti: un ingranaggio, e accanto «Accedi» se l'account è disponibile.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Bug, CloudCheck, ExternalLink, LogIn, LogOut, Monitor, Moon, Presentation, RefreshCw, Settings2, ShieldCheck, Sun, Trash } from "lucide-react";
import { GithubMark } from "./github-mark";
import { REPO_URL, ISSUES_URL } from "@/lib/links";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLab, setLim } from "@/lib/lab-store";
import { syncNow, useCloud } from "@/lib/cloud/sync";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { AuthDialog, Avatar, DeleteAccountDialog, RecoveryDialog, logout, useAccount } from "./account-menu";
import { LanguageItems } from "./language-menu";
import { openPrivacy } from "./privacy-dialog";

// i tre temi come riquadri affiancati: un solo sguardo, un solo clic (le frecce su/giù li percorrono comunque)
const tile = "flex-col justify-center gap-1 px-1 py-2 text-xs data-checked:bg-accent data-checked:font-medium data-checked:ring-1 data-checked:ring-foreground/10 [&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden [&_svg:not([class*='size-'])]:size-[1.125rem]";

/** Vero per 500 ms dopo ogni sincronizzazione riuscita: il segno di spunta si accende del colore del marchio. */
function useSyncFlash() {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useCloud.subscribe((s, prev) => {
      if (!s.lastSync || s.lastSync === prev.lastSync) return;
      setFlash(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFlash(false), 500);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);
  return flash;
}

export function SettingsMenu() {
  const { enabled, ready, user, text, Icon, iconClass } = useAccount();
  const flash = useSyncFlash();
  const { theme = "system", setTheme } = useTheme();
  const lim = useLab((s) => s.lim);
  const t = useTranslations("app.appearance");
  const ta = useTranslations("app.account");
  const [signing, setSigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const signedIn = enabled && !!user;

  return (
    <>
      {enabled && !user && (
        <Button variant="ghost" size="sm" className="max-sm:w-8 max-sm:px-0" disabled={!ready} onClick={() => setSigning(true)} aria-label={ta("signIn")}>
          <LogIn /> <span className="hidden sm:inline">{ta("signIn")}</span>
        </Button>
      )}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger render={
            <DropdownMenuTrigger render={signedIn
              ? <Button variant="ghost" aria-label={t("accountLabel")} className="h-8 gap-2 rounded-full pr-2.5 pl-1" />
              : <Button variant="ghost" size="icon" aria-label={t("label")} className="text-muted-foreground hover:text-foreground" />} />
          }>
            {signedIn ? (
              <>
                {/* l'avatar con lo stato del cloud; l'ingranaggio dice che qui ci sono anche le impostazioni */}
                <span className="relative">
                  <Avatar email={user.email} />
                  <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-background ring-1 ring-border">
                    {/* a ogni sincronizzazione la spunta passa al colore del marchio e torna grigia (transizione:
                        una nuova sincronizzazione durante il ritorno riparte da dove si trova). starting: fa partire
                        dal grigio anche l'icona appena montata al posto della rotellina */}
                    <Icon className={cn("size-2.5 text-muted-foreground transition-colors duration-200 ease-[ease] starting:text-muted-foreground",
                      flash && Icon === CloudCheck && "text-brand", iconClass)} />
                  </span>
                </span>
                <Settings2 className="size-4 text-muted-foreground" />
              </>
            ) : <Settings2 />}
          </TooltipTrigger>
          <TooltipContent>{signedIn ? t("accountLabel") : t("label")}</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-72">
          {signedIn && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-2.5 px-1.5 py-1.5">
                  <Avatar email={user.email} className="size-9 text-sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{user.email}</span>
                    <span className="flex items-start gap-1 text-xs font-normal text-muted-foreground">
                      <Icon className={cn("mt-0.5 size-3.5 shrink-0", iconClass)} />
                      <span>{text}</span>
                    </span>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void syncNow({ quiet: false })}><RefreshCw /> {ta("menu.syncNow")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()}><LogOut /> {ta("menu.signOut")}</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(String(v))} className="grid grid-cols-3 gap-1 px-0.5 pb-1">
              <DropdownMenuRadioItem closeOnClick value="light" className={tile}><Sun /> {t("light")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem closeOnClick value="dark" className={tile}><Moon /> {t("dark")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem closeOnClick value="system" className={tile}><Monitor /> {t("system")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <LanguageItems />
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuCheckboxItem checked={lim} onCheckedChange={(v) => setLim(!!v)}
              className="gap-2.5 py-1.5 pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden">
              <Presentation />
              <span className="flex min-w-0 flex-1 flex-col">
                {t("lim")}
                <span className="text-xs text-muted-foreground">{t("limHint")}</span>
              </span>
              {/* solo aspetto: il clic è della voce */}
              <Switch size="sm" checked={lim} tabIndex={-1} aria-hidden className="pointer-events-none" />
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem render={<a href={REPO_URL} target="_blank" rel="noopener" />}><GithubMark /> {t("source")} <ExternalLink className="ml-auto size-3.5 text-muted-foreground" /></DropdownMenuItem>
            <DropdownMenuItem render={<a href={ISSUES_URL} target="_blank" rel="noopener" />}><Bug /> {t("report")} <ExternalLink className="ml-auto size-3.5 text-muted-foreground" /></DropdownMenuItem>
            <DropdownMenuItem onClick={openPrivacy}><ShieldCheck /> {t("privacy")}</DropdownMenuItem>
          </DropdownMenuGroup>

          {signedIn && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}><Trash /> {ta("menu.delete")}</DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <p className="px-1.5 pt-0.5 pb-1 text-xs text-muted-foreground tabular">MosaicusNeo {APP_VERSION}</p>
        </DropdownMenuContent>
      </DropdownMenu>

      {enabled && !user && <AuthDialog open={signing} onOpenChange={setSigning} />}
      {signedIn && <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} email={user.email ?? ""} />}
      {enabled && <RecoveryDialog />}
    </>
  );
}
