"use client";
// Informativa sulla privacy, dentro l'app: una finestra sul computer, un cassetto dal basso sul
// telefono. Si apre da accesso/registrazione, dal menu dell'account, dal menu Aspetto, dalla barra
// dei lab, dalla guida e dal piè di pagina; l'indirizzo /privacy porta qui (/?privacy).

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { REPO_URL, ISSUES_URL } from "@/lib/links";

const usePrivacy = create<{ open: boolean }>(() => ({ open: false }));
export const openPrivacy = () => usePrivacy.setState({ open: true });
const setOpen = (open: boolean) => usePrivacy.setState({ open });

const CONTACT = "alex.corazza@icloud.com";
// data dell'ultimo aggiornamento (mese da 0): il testo la scrive nella lingua dell'app
const UPDATED = new Date(2026, 10, 19);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_b]:font-semibold [&_b]:text-foreground">{children}</div>
    </section>
  );
}

function ext(href: string) {
  return function ExtLink(c: React.ReactNode) { return <a href={href} target="_blank" rel="noopener">{c}</a>; };
}
const tags = {
  b: (c: React.ReactNode) => <b>{c}</b>,
  mail: (c: React.ReactNode) => <a href={`mailto:${CONTACT}`}>{c}</a>,
  gh: ext(REPO_URL),
  osm: ext("https://osmfoundation.org/wiki/Privacy_Policy"),
  garante: ext("https://www.garanteprivacy.it"),
  contact: CONTACT,
};

function PrivacyText() {
  const t = useTranslations("app.privacy");
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">
        {t.rich("summary", { b: (c) => <b className="font-semibold">{c}</b> })}
      </div>

      <Section title={t("controller.title")}>
        <p><b>Alex Corazza</b> · <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
        <p>{t.rich("controller.p1", tags)}</p>
      </Section>

      <Section title={t("local.title")}>
        <p>{t("local.p1")}</p>
        <p>{t("local.p2")}</p>
      </Section>

      <Section title={t("sensors.title")}>
        <p>{t("sensors.p1")}</p>
        <p>{t("sensors.p2")}</p>
      </Section>

      <Section title={t("account.title")}>
        <p>{t("account.p1")}</p>
        <p>{t("account.p2")}</p>
        <p>{t("account.p3")}</p>
        <p>{t("account.p4")}</p>
      </Section>

      <Section title={t("providers.title")}>
        <p>{t.rich("providers.p1", tags)}</p>
        <p>{t("providers.p2")}</p>
      </Section>

      <Section title={t("cookies.title")}>
        <p>{t("cookies.p1")}</p>
      </Section>

      <Section title={t("retention.title")}>
        <p>{t("retention.p1")}</p>
        <p>{t.rich("retention.p2", tags)}</p>
        <p>{t.rich("retention.p3", tags)}</p>
      </Section>

      <Section title={t("rights.title")}>
        <p>{t("rights.p1")}</p>
        <p>{t.rich("rights.p2", tags)}</p>
      </Section>

      <Section title={t("changes.title")}>
        <p>{t("changes.p1")}</p>
      </Section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        {t("footer.license")} ·{" "}
        <a className="underline" href={REPO_URL} target="_blank" rel="noopener">{t("footer.source")}</a> ·{" "}
        <a className="underline" href={ISSUES_URL} target="_blank" rel="noopener">{t("footer.report")}</a>
      </p>
    </div>
  );
}

/** La finestra dell'informativa (una sola per l'app; si apre con openPrivacy). */
export function PrivacyDialog() {
  const open = usePrivacy((s) => s.open);
  const mobile = useIsMobile();
  const t = useTranslations("app.privacy");
  const title = t("title"), description = t("updated", { date: UPDATED });
  // il fuoco va al testo (si scorre con la tastiera), non al primo link: niente anello sull'email
  const body = useRef<HTMLDivElement>(null);
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <PrivacyText />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent initialFocus={body} className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div ref={body} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 outline-none">
          <PrivacyText />
        </div>
      </DialogContent>
    </Dialog>
  );
}
