"use client";

import { useTranslations } from "next-intl";
import { REPO_URL, ISSUES_URL } from "@/lib/links";
import { cn } from "@/lib/utils";
import { GithubMark } from "./github-mark";
import { openPrivacy } from "./privacy-dialog";

/** Crediti e link in fondo alla pagina (nel Lab, da xl in su, in fondo alla colonna centrale). */
export function AppFooter({ className }: { className?: string }) {
  const t = useTranslations("app.footer");
  return (
    <footer className={cn("mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-6 text-xs text-muted-foreground", className)}>
      <span>{t("credits")}</span>
      <span className="flex items-center gap-4">
        <a className="inline-flex items-center gap-1 transition-colors hover:text-foreground" href={REPO_URL} target="_blank" rel="noopener"><GithubMark className="size-3" />GitHub</a>
        <a className="transition-colors hover:text-foreground" href={ISSUES_URL} target="_blank" rel="noopener">{t("report")}</a>
        <button type="button" className="transition-colors hover:text-foreground" onClick={openPrivacy}>{t("privacy")}</button>
      </span>
    </footer>
  );
}
