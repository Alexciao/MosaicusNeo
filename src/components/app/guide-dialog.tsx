"use client";
// La guida di MosaicusNeo: un manuale a capitoli, passo passo, per chi non ha mai usato Arduino.
// Il capitolo «Collegare i sensori» genera lo schema e le istruzioni per i sensori scelti
// (o per il montaggio aperto). Gli altri punti dell'app possono aprirla a un capitolo preciso.

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, Bluetooth, ChartLine, Cloud, Cpu, Download, FlaskConical, LifeBuoy, Plug, Rocket, SlidersHorizontal, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SENSORS, ARDUINO_SENSORS, type SensorType } from "@/lib/sensors/catalog";
import { makeSensor } from "@/lib/sensors/rig";
import { useLab, openGuide, closeGuide, createRigFrom } from "@/lib/lab-store";
import { APP_VERSION, FIRMWARE_URL, FIRMWARE_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/instruments/scope-panel";
import { RigDiagram, WiringSteps, type BtModule } from "./rig-diagram";

// ---------------------------------------------------------------------------
// Mattoncini del testo
// ---------------------------------------------------------------------------
function Steps({ items }: { items: (string | [string, React.ReactNode])[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it, i) => {
        const [t, d] = typeof it === "string" ? [it, null] : it;
        return (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
            <div className="pt-0.5"><p className="font-semibold">{t}</p>{d && <div className="mt-0.5 text-sm text-muted-foreground">{d}</div>}</div>
          </li>
        );
      })}
    </ol>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-2 text-base font-semibold">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-foreground">{children}</b>;
function Note({ kind = "tip", children }: { kind?: "tip" | "warn"; children: React.ReactNode }) {
  return <div className={cn("rounded-lg border px-3 py-2 text-sm", kind === "warn" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/50")}>{children}</div>;
}
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">{q}</summary>
      <div className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Capitoli
// ---------------------------------------------------------------------------
function Start() {
  return (
    <>
      <P>MosaicusNeo trasforma un Arduino e qualche sensore in un laboratorio di fisica: misura, mostra i grafici in tempo reale, salva tutto e aiuta ad analizzare i dati. Funziona nel browser, anche senza rete.</P>
      <H>Che cosa serve</H>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        <li className="rounded-lg border p-3"><B>Arduino Uno</B> (o un clone, es. Elegoo UNO R3) con il suo cavo USB.</li>
        <li className="rounded-lg border p-3"><B>I sensori</B> del tuo esperimento, una breadboard e qualche filo (jumper).</li>
        <li className="rounded-lg border p-3"><B>Un computer</B> con Chrome o Edge, per caricare il firmware la prima volta e per misurare via cavo.</li>
        <li className="rounded-lg border p-3"><B>Facoltativo</B>: un modulo Bluetooth e un power bank per misurare senza cavo, con il telefono.</li>
      </ul>
      <H>In cinque passi</H>
      <Steps items={[
        ["Carica il firmware su Arduino", <>Una volta sola: vedi il capitolo <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
        ["Scegli l'esperimento", "Nell'elenco a sinistra (sul telefono: «Lab» nella barra in basso). Gli esperimenti pronti hanno già i sensori giusti."],
        ["Collega i sensori", <>Scheda «Collegamenti»: schema e istruzioni con i pin giusti. Vedi <ChapterLink id="wiring">Collegare i sensori</ChapterLink>.</>],
        ["Misura", "«Collega Arduino» → «Avvia» → «Ferma». La misura si salva da sola nel Quaderno."],
        ["Analizza", "Trascina sul grafico per scegliere un tratto, «Invia a Elaborazione», poi fit, rette, tangenti; infine «Esporta in Excel»."],
      ]} />
      <Note>Non hai ancora l&apos;hardware? Premi <B>Simulatore</B>: un Arduino finto produce dati realistici per ogni esperimento.</Note>
      <H>Dove funziona</H>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Dispositivo</th><th className="p-2">Via cavo USB</th><th className="p-2">Bluetooth</th></tr></thead>
          <tbody className="text-muted-foreground">
            <tr className="border-t"><td className="p-2 text-foreground">Computer (Chrome, Edge)</td><td className="p-2">sì</td><td className="p-2">BLE sì; HC-06 se già associato</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">Android (Chrome)</td><td className="p-2">—</td><td className="p-2">HC-06 e BLE</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">iPhone, iPad</td><td className="p-2">—</td><td className="p-2">solo BLE, nel browser gratuito Bluefy</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Firmware() {
  return (
    <>
      <P>Il firmware è il programma che gira su Arduino. Ce n&apos;è uno solo per tutti gli esperimenti: si carica una volta, poi è l&apos;app a dirgli quali sensori leggere.</P>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <Button render={<a href={FIRMWARE_URL} download="mosaicusneo_firmware.ino" />}><Download /> Scarica il firmware v{FIRMWARE_VERSION}</Button>
        <span className="text-xs text-muted-foreground">mosaicusneo_firmware.ino · nessuna libreria da installare</span>
      </div>
      <Steps items={[
        ["Installa l'IDE di Arduino", <>Dal sito arduino.cc → Software → «Arduino IDE 2» per il tuo sistema. Su un Chromebook o un computer della scuola senza permessi puoi usare l&apos;Arduino Cloud Editor.</>],
        ["Apri il file scaricato", <>Doppio clic su <B>mosaicusneo_firmware.ino</B>. L&apos;IDE chiede di metterlo in una cartella con lo stesso nome: rispondi <B>OK</B>.</>],
        ["Collega Arduino con il cavo USB", "Si accende il LED «ON». Se hai un modulo Bluetooth su D0, stacca ora il filo TXD del modulo."],
        ["Scegli scheda e porta", <>In alto, nel menu a tendina: <B>Arduino Uno</B> e la porta (Windows: COM3, COM4…; Mac: /dev/cu.usbmodem… o /dev/cu.wchusbserial…).</>],
        ["Premi «Carica» (la freccia →)", <>Dopo qualche secondo in basso compare <B>Caricamento completato</B>. I LED TX/RX lampeggiano durante il caricamento.</>],
        ["Controlla in MosaicusNeo", <>Chiudi l&apos;IDE (o il suo Monitor seriale), torna qui e premi <B>Collega Arduino</B>: scegli la porta. Lo stato diventa <B>Arduino pronto · firmware {FIRMWARE_VERSION}</B>.</>],
      ]} />
      <Note>Clone con chip CH340 e la porta non compare? Installa il driver CH340 (cerca «CH340 driver» con il nome del tuo sistema), poi ricollega il cavo.</Note>
      <Note kind="warn">Una porta seriale può essere aperta da un programma alla volta: se l&apos;IDE di Arduino ha il Monitor seriale aperto, MosaicusNeo non si collega (e viceversa).</Note>
    </>
  );
}

function Wiring() {
  const rig = useLab((s) => s.rig);
  const mine = rig.sensors.length > 0;
  const [mode, setMode] = useState<"rig" | "pick">(mine ? "rig" : "pick");
  const [picked, setPicked] = useState<SensorType[]>(mine ? [...new Set(rig.sensors.map((s) => s.type))] : ["dht"]);
  const [bt, setBt] = useState<"none" | "hc06" | "ble">("none");
  const sensors = mode === "rig" && mine ? rig.sensors : (() => { const taken = new Set<number>(); return picked.map((t) => makeSensor(t, taken)); })();
  const btMod: BtModule = bt === "none" ? null : bt;
  return (
    <>
      <P>Lo schema qui sotto si genera da solo per i sensori che ti servono, con i pin giusti. Le stesse istruzioni sono sempre nella scheda «Collegamenti» dell&apos;esperimento.</P>
      <div className="flex flex-wrap items-center gap-2">
        {mine && <Segmented label="Quali sensori" value={mode} onChange={setMode} items={[["rig", "Il mio montaggio"], ["pick", "Scegli i sensori"]]} />}
        <Select value={bt} onValueChange={(v) => v && setBt(v as typeof bt)} items={{ none: "Senza Bluetooth", hc06: "Con Bluetooth HC-06", ble: "Con Bluetooth LE (HM-10…)" }}>
          <SelectTrigger size="sm" className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Senza Bluetooth</SelectItem>
            <SelectItem value="hc06">Con Bluetooth HC-06</SelectItem>
            <SelectItem value="ble">Con Bluetooth LE (HM-10…)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(mode === "pick" || !mine) && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ARDUINO_SENSORS.map((t) => (
            <label key={t} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <Checkbox checked={picked.includes(t)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, t] : p.filter((x) => x !== t)))} />
              <span><B>{SENSORS[t].title}</B> <span className="text-muted-foreground">· {SENSORS[t].measures}</span></span>
            </label>
          ))}
        </div>
      )}
      {sensors.length || btMod ? (
        <>
          <div className="rounded-lg border bg-card p-3">
            <RigDiagram sensors={sensors} bt={btMod} className="h-auto w-full text-foreground [&_text]:fill-current" />
            <p className="mt-2 text-xs text-muted-foreground">Rosso = 5V · nero = GND · un colore per sensore · tratteggiato = facoltativo. I pin si cambiano nella scheda «Sensori» dell&apos;esperimento.</p>
          </div>
          <H>Passo passo</H>
          <Note>Prima di collegare: <B>stacca Arduino dal computer</B>. Ricontrolla i fili, poi ricollega.</Note>
          <WiringSteps sensors={sensors} bt={btMod} />
          <H>Regole d&apos;oro</H>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Tutti i GND devono essere collegati insieme (al GND di Arduino).</li>
            <li>Usa i fili rossi per i 5V e neri per GND: si ritrovano gli errori a colpo d&apos;occhio.</li>
            <li>Sulla breadboard le cinque buche di una stessa colonna sono collegate tra loro; le due righe lunghe ai bordi sono i «binari» per 5V e GND.</li>
            <li>Mai più di 5 V su un pin, mai la rete elettrica. D0 e D1 servono al cavo USB e al Bluetooth.</li>
          </ul>
          {mode === "pick" && !!picked.length && (
            <Button variant="outline" className="self-start" onClick={() => { createRigFrom(picked); closeGuide(); }}>
              <Wrench /> Crea un montaggio con questi sensori
            </Button>
          )}
        </>
      ) : <P>Scegli almeno un sensore.</P>}
    </>
  );
}

function Measure() {
  return (
    <>
      <Steps items={[
        ["Scegli l'esperimento", "Nell'elenco a sinistra. In alto vedi i sensori del montaggio con i loro pin."],
        ["Controlla i collegamenti", "Scheda «Collegamenti» (a destra, o in basso sul telefono): schema e istruzioni."],
        ["Collega Arduino", <>«Collega Arduino» e scegli la porta (o il dispositivo Bluetooth). Aspetta <B>Arduino pronto</B>. Senza hardware: «Simulatore».</>],
        ["Dai un nome alla misura", "Nella scheda della misura, sopra il pulsante: es. «Gruppo 3 – piano inclinato». Se lo lasci vuoto, ci pensa l'app."],
        ["Avvia e ferma", "«Avvia»: i punti arrivano in tempo reale e le letture in evidenza si aggiornano. «Ferma» quando hai finito: la misura va nel Quaderno."],
        ["Scegli un tratto", "Trascina sul grafico: il tratto si colora su tutti i grafici. Doppio clic per annullare, pizzico o Ctrl + rotella per lo zoom."],
        ["Invialo a Elaborazione", "«Invia il tratto a Elaborazione», poi la scheda Elaborazione in alto."],
      ]} />
      <H>Altri comandi utili</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Grafici</B>: il menu sopra i grafici sceglie quali grandezze vedere; i «dati grezzi» sono le letture del sensore prima delle conversioni.</li>
        <li><B>Tabella</B> e <B>Esporta</B> (icone a destra): tutti i numeri, oppure Excel, CSV, immagine, GPX.</li>
        <li><B>Azzera</B> (mirino, con il sensore a ultrasuoni): la posizione attuale diventa lo zero.</li>
        <li><B>Quaderno</B>: tutte le misure salvate; «Apri» per rivederle, anche cambiando le opzioni dei sensori (i dati si ricalcolano).</li>
        <li><B>Modalità LIM</B> (menu Aspetto, in alto): testi e grafici più grandi per la lavagna.</li>
      </ul>
    </>
  );
}

function Rigs() {
  return (
    <>
      <P>Un <B>montaggio</B> è l&apos;elenco dei sensori collegati ad Arduino, con i loro pin e ogni quanto leggerli. Fino a 6 sensori insieme, anche dello stesso tipo (es. due termistori per confrontare due tazze).</P>
      <Steps items={[
        ["Apri la scheda «Sensori»", "A destra (sul telefono: «Modifica sensori» sotto il titolo)."],
        ["Aggiungi o togli sensori", "«Aggiungi un sensore» mostra quelli disponibili e che cosa misurano."],
        ["Scegli i pin", "Ogni sensore ha i suoi menu: i pin già usati non si possono scegliere; i sensori analogici vanno su A0…A5."],
        ["Scegli il ritmo", "«Una lettura ogni … ms»: il DHT non va sotto 1000 ms, il GPS legge una volta al secondo, il sonar fino a 30 ms."],
        ["Opzioni", "Ogni sensore ha le sue (taratura, verso positivo, modello del DHT…); quelle meno usate sono in «Opzioni avanzate»."],
      ]} />
      <H>Esperimenti pronti e montaggi tuoi</H>
      <P>Gli esperimenti pronti si possono modificare: diventano una <B>versione personale</B>, con il pulsante «Ripristina» per tornare all&apos;originale. Con «Copia come montaggio» o «Nuovo montaggio di sensori» crei un montaggio libero, che trovi in «I miei montaggi» (e su tutti i tuoi dispositivi, se accedi con un account).</P>
      <Note>Se l&apos;app segnala un problema (pin doppio, troppi sensori…) il messaggio dice anche come risolverlo; «Avvia» resta spento finché c&apos;è un errore.</Note>
    </>
  );
}

function Analysis() {
  return (
    <>
      <P>Ogni tratto inviato diventa un <B>riquadro</B>, con il suo grafico e i suoi strumenti. Sopra il grafico scegli che cosa mettere sugli assi (anche una grandezza in funzione di un&apos;altra, es. T in funzione dell&apos;altitudine).</P>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["Tratto", "Trascina per scegliere la parte di dati su cui lavorare."],
          ["Retta a occhio", "Muovi le due maniglie finché la retta passa in mezzo ai punti (le frecce ⬆⬇ contano i punti sopra e sotto), poi tocca due punti della retta: l'app calcola Δy/Δx. «E il computer?» confronta con la retta dei minimi quadrati."],
          ["Tangente", "Tocca un punto della curva: pendenza istantanea (es. la velocità in quell'istante)."],
          ["Fit", "Scegli un modello: retta, parabola, esponenziale, sinusoide smorzata… L'app dà i parametri con l'incertezza e il loro significato fisico. «Il modello è giusto?» controlla i residui."],
          ["Righello", "Su un'onda: due linee su due creste, N periodi tra le due → T = Δt/N, f = 1/T."],
          ["Foglio dei dati", "Tutti i numeri; «Nuova colonna» calcola una grandezza con una formula (es. x^2, ln(T − 21), sqrt(L/g))."],
        ].map(([t, d]) => <div key={t} className="rounded-lg border p-3"><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>)}
      </div>
      <P>«Salva» conserva un risultato nel riquadro. Alla fine spunta i riquadri e premi <B>Esporta in Excel</B>: un foglio di riepilogo, uno con tutte le analisi e uno per riquadro.</P>
    </>
  );
}

function Field() {
  return (
    <>
      <P>Con un modulo Bluetooth e un power bank, Arduino si porta all&apos;aperto e si collega al telefono. Due tipi di modulo, collegati allo stesso modo (schema nel capitolo <ChapterLink id="wiring">Collegare i sensori</ChapterLink>, scegli «Con Bluetooth»).</P>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2" /><th className="p-2">HC-06 (classico)</th><th className="p-2">BLE (HM-10, AT-09, HC-08)</th></tr></thead>
          <tbody className="text-muted-foreground">
            <tr className="border-t"><td className="p-2 text-foreground">Android</td><td className="p-2">sì (Chrome)</td><td className="p-2">sì (Chrome)</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">iPhone / iPad</td><td className="p-2">no</td><td className="p-2">sì, con il browser Bluefy</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">Computer</td><td className="p-2">se associato prima</td><td className="p-2">sì (Chrome, Edge)</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">Prima di collegarsi</td><td className="p-2">associalo nelle impostazioni</td><td className="p-2">niente: si sceglie dall&apos;app</td></tr>
          </tbody>
        </table>
      </div>
      <H>Preparare il modulo (una volta sola)</H>
      <Steps items={[
        "Collega il modulo come nello schema (VCC 5V, GND, TXD → D0, RXD ← D1 con il partitore 1 kΩ / 2 kΩ).",
        ["Collega Arduino al computer con il cavo USB", "Il LED del modulo deve lampeggiare (nessun telefono collegato)."],
        ["In MosaicusNeo: «Collega Arduino»", "Poi scheda «Collegamenti» → «Senza cavo: Bluetooth» → scegli il tipo di modulo → «Configura»."],
        ["Aspetta il messaggio di conferma", "Il modulo ora si chiama «MosaicusNeo» e parla a 115200 baud, come Arduino."],
      ]} />
      <H>Misurare con il telefono</H>
      <Steps items={[
        ["Alimenta Arduino con un power bank", "Il cavo USB al power bank, non al computer."],
        ["Apri MosaicusNeo", <>Android: Chrome. iPhone/iPad: il browser gratuito <B>Bluefy</B> (App Store), con l&apos;indirizzo dell&apos;app.</>],
        ["Collega", <>HC-06: associa prima «MosaicusNeo» (PIN 1234) nelle impostazioni Bluetooth, poi «Collega via Bluetooth». BLE: «Collega» → menu ▾ → <B>Bluetooth LE</B> → «MosaicusNeo».</>],
        ["Avvia", "Lo schermo resta acceso durante la misura e il Quaderno si salva ogni 30 secondi: se il telefono si blocca, i dati non vanno persi."],
      ]} />
      <H>Il GPS</H>
      <P>All&apos;aperto, con il cielo libero, il primo fix richiede da 30 secondi a qualche minuto (il LED del modulo lampeggia quando ha la posizione). I punti senza posizione restano nella tabella ma non vanno sulla mappa. La mappa colora i punti con la grandezza scelta; esporta in GPX per Google Earth o Strava, in GeoJSON per QGIS.</P>
    </>
  );
}

function Data() {
  return (
    <>
      <H>Dove finiscono i dati</H>
      <P>Le misure (Quaderno) e i riquadri di Elaborazione restano <B>nel browser di questo dispositivo</B>, anche senza rete. Se cancelli i dati di navigazione si perdono: esporta quello che vuoi conservare.</P>
      <H>Account (facoltativo)</H>
      <P>Con «Accedi» crei un account con email e password: misure, riquadri, montaggi e preferenze si salvano nel cloud e li ritrovi su tutti i tuoi dispositivi. Le misure fatte prima di accedere entrano nell&apos;account. Uscendo, i dati dell&apos;account spariscono da quel dispositivo ma restano nel cloud: utile sui computer della scuola.</P>
      <H>Formati di export</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Excel (.xlsx)</B>: dati e un foglio con sensori, pin e opzioni usati.</li>
        <li><B>CSV per Excel in italiano</B> (virgola decimale) o <B>CSV standard</B> (Fogli Google, Python).</li>
        <li><B>Immagine</B> dei grafici, <B>GPX</B> e <B>GeoJSON</B> per le tracce GPS.</li>
      </ul>
    </>
  );
}

function Problems() {
  return (
    <div className="flex flex-col gap-2">
      <Faq q="«Collega Arduino» non mostra nessuna porta">
        <p>Usa Chrome o Edge su computer. Prova un altro cavo (alcuni cavi portano solo la corrente) o un&apos;altra porta USB. Con un clone CH340 serve il driver CH340. Chiudi l&apos;IDE di Arduino: tiene occupata la porta.</p>
      </Faq>
      <Faq q="«Firmware non trovato»">
        <p>Su Arduino non c&apos;è il firmware MosaicusNeo: caricalo (capitolo <ChapterLink id="firmware">Caricare il firmware</ChapterLink>). Se c&apos;è un modulo Bluetooth su D0, staccane il filo TXD mentre carichi.</p>
      </Faq>
      <Faq q="«Il firmware su Arduino è vecchio»">
        <p>Scarica di nuovo il firmware dalla guida e ricaricalo: le funzioni nuove (montaggi, Bluetooth LE) richiedono la v{FIRMWARE_VERSION}.</p>
      </Faq>
      <Faq q="Il DHT11 dà valori vuoti o «—»">
        <p>Controlla DATA sul pin giusto e VCC a 5V. Il sensore «nudo» a 4 piedini vuole la resistenza da 10 kΩ tra DATA e 5V. Non leggere più spesso di una volta al secondo (DHT22: ogni 2 s).</p>
      </Faq>
      <Faq q="Il sonar dà salti o punti mancanti">
        <p>Bersaglio piatto e abbastanza grande, tra 5 cm e 3 m, niente oggetti vicini al fascio. Le opzioni avanzate scartano i salti anomali e regolano la lisciatura di velocità e accelerazione.</p>
      </Faq>
      <Faq q="La temperatura del termistore è sbagliata di qualche grado">
        <p>Controlla la «posizione del termistore nel partitore» (tra 5V e il pin, o tra il pin e GND) e, nelle opzioni avanzate, R₀ e B del tuo termistore. Una correzione di taratura si somma a tutti i valori.</p>
      </Faq>
      <Faq q="Il GPS non trova la posizione">
        <p>Solo all&apos;aperto, lontano da palazzi alti; il primo fix può richiedere qualche minuto. Controlla che il TX del GPS vada sul pin «RX di Arduino» scelto nel montaggio.</p>
      </Faq>
      <Faq q="Il modulo Bluetooth non compare">
        <p>HC-06: va associato prima nelle impostazioni del telefono (PIN 1234 o 0000), e funziona solo su Android. BLE: compare dall&apos;app, non nelle impostazioni; se non trovi «MosaicusNeo», cerca HMSoft, BT05 o HC-08 (il modulo non è stato configurato). Su iPhone usa Bluefy, non Safari.</p>
        <p>Si collega ma non arriva nulla? Il modulo è ancora a 9600 baud: rifai «Configura» con il cavo USB.</p>
      </Faq>
      <Faq q="L'app è lenta">
        <p>Chiudi le altre schede pesanti; durante misure molto lunghe mostra meno grafici (menu «Grafici»). La modalità LIM ingrandisce tutto ma non rallenta.</p>
      </Faq>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Struttura
// ---------------------------------------------------------------------------
const CHAPTERS: { id: string; title: string; icon: LucideIcon; body: () => React.ReactElement }[] = [
  { id: "start", title: "Inizia qui", icon: Rocket, body: Start },
  { id: "firmware", title: "Caricare il firmware", icon: Cpu, body: Firmware },
  { id: "wiring", title: "Collegare i sensori", icon: Plug, body: Wiring },
  { id: "measure", title: "Misurare", icon: FlaskConical, body: Measure },
  { id: "rigs", title: "Montaggi di sensori", icon: SlidersHorizontal, body: Rigs },
  { id: "analysis", title: "Elaborazione", icon: ChartLine, body: Analysis },
  { id: "field", title: "Sul campo e Bluetooth", icon: Bluetooth, body: Field },
  { id: "data", title: "Dati e account", icon: Cloud, body: Data },
  { id: "problems", title: "Problemi comuni", icon: LifeBuoy, body: Problems },
];

function ChapterLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => openGuide(id)}>{children}</button>;
}

export function GuideButton({ className }: { className?: string }) {
  return <Button variant="ghost" size="sm" className={className} onClick={() => openGuide("start")}><BookOpen /> <span className="hidden sm:inline">Guida</span></Button>;
}

/** La finestra della guida (una sola per l'app; si apre con openGuide). */
export function GuideDialog() {
  const chapter = useLab((s) => s.guide);
  const current = CHAPTERS.find((c) => c.id === chapter) ?? CHAPTERS[0];
  const i = CHAPTERS.indexOf(current);
  const Body = current.body;
  return (
    <Dialog open={chapter != null} onOpenChange={(o) => { if (!o) closeGuide(); }}>
      <DialogContent className="flex h-[min(92svh,860px)] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Guida di MosaicusNeo</DialogTitle>
          <DialogDescription className="sr-only">Manuale passo passo: firmware, collegamenti, misure, analisi, Bluetooth.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav aria-label="Capitoli" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
            {CHAPTERS.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" onClick={() => openGuide(c.id)} aria-current={c === current ? "page" : undefined}
                  className={cn("flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors",
                    c === current ? "bg-brand/10 font-semibold text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <Icon className="size-4 shrink-0" /> {c.title}
                </button>
              );
            })}
          </nav>
          <article key={current.id} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <h2 className="text-xl font-bold tracking-tight">{current.title}</h2>
            <Body />
            <div className="mt-auto flex justify-between gap-2 border-t pt-4">
              {i > 0 ? <Button variant="ghost" size="sm" onClick={() => openGuide(CHAPTERS[i - 1].id)}>← {CHAPTERS[i - 1].title}</Button> : <span />}
              {i < CHAPTERS.length - 1 && <Button variant="outline" size="sm" onClick={() => openGuide(CHAPTERS[i + 1].id)}>{CHAPTERS[i + 1].title} →</Button>}
            </div>
            <p className="text-xs text-muted-foreground">
              MosaicusNeo v{APP_VERSION} · firmware v{FIRMWARE_VERSION} · basato su Mosaicus (© 2026 Ermes Ferdinando Rosi) · licenza MIT ·{" "}
              <a className="underline" href="https://github.com/Alexciao/MosaicusNeo" target="_blank" rel="noopener">codice sorgente</a>
            </p>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
