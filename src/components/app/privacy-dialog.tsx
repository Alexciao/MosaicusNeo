"use client";
// Informativa sulla privacy, dentro l'app: una finestra sul computer, un cassetto dal basso sul
// telefono. Si apre da accesso/registrazione, dal menu dell'account, dal menu Aspetto, dalla barra
// dei lab, dalla guida e dal piè di pagina; l'indirizzo /privacy porta qui (/?privacy).

import { useRef } from "react";
import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { REPO_URL, ISSUES_URL } from "@/lib/links";

const usePrivacy = create<{ open: boolean }>(() => ({ open: false }));
export const openPrivacy = () => usePrivacy.setState({ open: true });
const setOpen = (open: boolean) => usePrivacy.setState({ open });

const CONTACT = "alex.corazza@icloud.com";
const UPDATED = "19 novembre 2026";
const TITLE = "Informativa sulla privacy";
const DESCRIPTION = `Ultimo aggiornamento: ${UPDATED}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_b]:font-semibold [&_b]:text-foreground">{children}</div>
    </section>
  );
}

function PrivacyText() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">
        <b className="font-semibold">In breve.</b> Senza account le tue misure restano nel browser del tuo dispositivo e non le riceve nessuno.
        Con un account (facoltativo) misure, riquadri, progetti e preferenze si salvano nel cloud per ritrovarli su altri dispositivi.
        Niente pubblicità, niente statistiche di utilizzo, niente profilazione.
      </div>

      <Section title="Titolare del trattamento">
        <p><b>Alex Corazza</b> · <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
        <p>Scrivi a questo indirizzo per domande sulla privacy o per esercitare i tuoi diritti. Il codice dell&apos;app è pubblico su <a href={REPO_URL} target="_blank" rel="noopener">GitHub</a>: puoi verificare che cosa fa con i dati.</p>
      </Section>

      <Section title="Dati che restano sul tuo dispositivo">
        <p>Misure del Quaderno, riquadri di Elaborazione, progetti, preferenze (tema, modalità LIM, ultime scelte) sono salvati nel browser (IndexedDB e localStorage). Non vengono inviati a nessuno se non accedi con un account.</p>
        <p>Li cancelli eliminando i dati del sito dalle impostazioni del browser. Esportali prima, se vuoi conservarli.</p>
      </Section>

      <Section title="Sensori, microfono, USB e Bluetooth">
        <p>I dati di Arduino (via cavo o Bluetooth), dei sensori di movimento e del microfono vengono elaborati nel browser. L&apos;audio del microfono non viene registrato né inviato: l&apos;app ne ricava solo frequenza e livello, o la forma d&apos;onda mostrata sullo schermo.</p>
        <p>Se usi un GPS collegato ad Arduino, le posizioni fanno parte della misura: restano sul dispositivo, oppure nel tuo account se accedi.</p>
      </Section>

      <Section title="Account (facoltativo)">
        <p>Per creare un account servono un indirizzo email e una password. Con l&apos;account vengono salvati nel cloud: misure, riquadri, progetti e preferenze dei lab. Ogni utente può leggere e modificare solo i propri dati.</p>
        <p>Usiamo l&apos;email solo per l&apos;accesso e per i messaggi necessari (conferma dell&apos;indirizzo, recupero della password). La password è gestita dal servizio di autenticazione e non è mai visibile in chiaro.</p>
        <p>Base giuridica: l&apos;esecuzione del servizio che chiedi creando l&apos;account (art. 6, par. 1, lett. b del GDPR).</p>
        <p>Se hai meno di 14 anni, crea un account solo con il consenso di un genitore o di chi ne fa le veci. L&apos;app funziona anche senza account.</p>
      </Section>

      <Section title="Fornitori">
        <p><b>Supabase</b> conserva account e dati sincronizzati, come responsabile del trattamento. <b>Vercel</b> ospita il sito e registra dati tecnici delle richieste (indirizzo IP, browser) per farlo funzionare e proteggerlo. Le mappe caricano le immagini da <b>OpenStreetMap</b>: il tuo indirizzo IP e la zona visualizzata arrivano ai loro server (<a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">informativa di OpenStreetMap</a>).</p>
        <p>Alcuni server possono trovarsi fuori dall&apos;Unione Europea: in quel caso il trasferimento avviene con le garanzie previste dal GDPR, come le clausole contrattuali standard.</p>
      </Section>

      <Section title="Cookie e archiviazione locale">
        <p>Non usiamo cookie di profilazione né strumenti di statistica. Il browser conserva solo ciò che serve al funzionamento: i dati dell&apos;app descritti sopra e, se accedi, la sessione dell&apos;account.</p>
      </Section>

      <Section title="Per quanto tempo">
        <p>I dati dell&apos;account restano finché l&apos;account esiste. Uscendo, spariscono da quel dispositivo ma restano nel cloud.</p>
        <p><b>Puoi eliminare l&apos;account in qualsiasi momento dall&apos;app</b>: menu dell&apos;account → «Elimina account». L&apos;account, l&apos;indirizzo email e tutti i dati sincronizzati (misure, riquadri, progetti, preferenze) vengono cancellati subito e definitivamente dal server, insieme alle loro copie sul dispositivo che usi. Sugli altri dispositivi le copie locali restano finché non esci dall&apos;account o non cancelli i dati del sito. Eventuali copie di sicurezza del fornitore vengono eliminate con la loro normale rotazione.</p>
        <p>Se non riesci ad accedere, chiedi la cancellazione a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </Section>

      <Section title="I tuoi diritti">
        <p>Puoi chiedere accesso, rettifica, cancellazione, limitazione e portabilità dei tuoi dati, e opporti al trattamento. Dall&apos;app puoi già esportare le misure in Excel o CSV ed eliminare l&apos;account con tutti i dati.</p>
        <p>Se ritieni che i tuoi dati siano trattati in modo non corretto, puoi presentare reclamo al <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">Garante per la protezione dei dati personali</a>.</p>
      </Section>

      <Section title="Modifiche">
        <p>Se questa informativa cambia, la data in alto viene aggiornata.</p>
      </Section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        MosaicusNeo · software libero con licenza MIT ·{" "}
        <a className="underline" href={REPO_URL} target="_blank" rel="noopener">codice sorgente su GitHub</a> ·{" "}
        <a className="underline" href={ISSUES_URL} target="_blank" rel="noopener">segnala un problema</a>
      </p>
    </div>
  );
}

/** La finestra dell'informativa (una sola per l'app; si apre con openPrivacy). */
export function PrivacyDialog() {
  const open = usePrivacy((s) => s.open);
  const mobile = useIsMobile();
  // il fuoco va al testo (si scorre con la tastiera), non al primo link: niente anello sull'email
  const body = useRef<HTMLDivElement>(null);
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
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
          <DialogTitle className="text-xl">{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div ref={body} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 outline-none">
          <PrivacyText />
        </div>
      </DialogContent>
    </Dialog>
  );
}
