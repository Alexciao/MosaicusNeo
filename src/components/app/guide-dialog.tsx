"use client";
// La guida di MosaicusNeo: un manuale a capitoli, passo passo, per chi non ha mai usato Arduino.
// Il capitolo «Collegare i sensori» genera lo schema e le istruzioni per i sensori scelti
// (o per il montaggio aperto). Gli altri punti dell'app possono aprirla a un capitolo preciso.

import { useEffect, useState } from "react";
import { create } from "zustand";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, Bluetooth, ChartLine, Check, Cloud, Copy, Cpu, Download, FlaskConical, LifeBuoy, Minus, Monitor, Plug, Presentation, Rocket, Share2,
  Siren, SlidersHorizontal, Smartphone, TriangleAlert, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SENSORS, ARDUINO_SENSORS, OUTPUTS, type SensorType } from "@/lib/sensors/catalog";
import { makeSensor } from "@/lib/sensors/rig";
import { useLab, openGuide, closeGuide, createRigFrom, setLim } from "@/lib/lab-store";
import { detectDevice, bluetoothAvailable, DEVICE_LABEL, OS_LABEL, BROWSER_LABEL, type GuideDevice, type DeviceInfo } from "@/lib/device";
import { APP_VERSION, FIRMWARE_URL, FIRMWARE_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/instruments/scope-panel";
import { WiringSteps, type BtModule } from "./rig-diagram";
import { WiringDiagram } from "./wiring-diagram";

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
// Dispositivo: rilevato, ma si può scegliere un altro (es. leggo dal PC, misurerò col telefono)
// ---------------------------------------------------------------------------
const DETECTED: DeviceInfo | null = typeof window !== "undefined" ? detectDevice() : null;
const useGuideDevice = create<{ device: GuideDevice }>(() => ({ device: DETECTED?.device ?? "pc" }));
const setGuideDevice = (device: GuideDevice) => useGuideDevice.setState({ device });
const useDev = () => useGuideDevice((s) => s.device);
const DEVICE_ICON: Record<GuideDevice, LucideIcon> = { pc: Monitor, android: Smartphone, ios: Smartphone, board: Presentation };
const DEVICES: GuideDevice[] = ["pc", "android", "ios", "board"];

function DevicePicker() {
  const dev = useDev();
  const items = Object.fromEntries(DEVICES.map((d) => [d, `${DEVICE_LABEL[d]}${d === DETECTED?.device ? " (questo)" : ""}`]));
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground sm:inline">Istruzioni per</span>
      <Select value={dev} onValueChange={(v) => v && setGuideDevice(v as GuideDevice)} items={items}>
        <SelectTrigger size="sm" aria-label="Istruzioni per quale dispositivo" className="w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DEVICES.map((d) => {
            const Icon = DEVICE_ICON[d];
            return <SelectItem key={d} value={d}><Icon /> {DEVICE_LABEL[d]}{d === DETECTED?.device && <span className="text-xs text-muted-foreground">· questo</span>}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Avviso quando si leggono le istruzioni di un dispositivo diverso da questo. */
function OtherDeviceNote() {
  const dev = useDev();
  if (!DETECTED || dev === DETECTED.device) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">Stai leggendo le istruzioni per: <B>{DEVICE_LABEL[dev].toLowerCase()}</B>. Questo dispositivo: {DEVICE_LABEL[DETECTED.device].toLowerCase()}.</span>
      <Button size="xs" variant="ghost" onClick={() => setGuideDevice(DETECTED.device)}>Torna al mio</Button>
    </div>
  );
}

type CheckState = "ok" | "no" | "warn" | "na";
function CheckRow({ state, title, children }: { state: CheckState; title: string; children?: React.ReactNode }) {
  const Icon = state === "ok" ? Check : state === "no" ? X : state === "warn" ? TriangleAlert : Minus;
  return (
    <li className="flex gap-3 py-2">
      <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
        state === "ok" ? "bg-success/15 text-success" : state === "no" ? "bg-destructive/10 text-destructive" : state === "warn" ? "bg-warning/25 text-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="size-3.5" strokeWidth={3} />
      </span>
      <div className="min-w-0"><p className="text-sm font-semibold">{title}</p>{children && <p className="text-sm text-muted-foreground">{children}</p>}</div>
    </li>
  );
}

/** Controlli veri su questo dispositivo: che cosa funziona qui e, se no, come rimediare. */
function DeviceChecks({ d }: { d: DeviceInfo }) {
  const [btOn, setBtOn] = useState<boolean | null>(null);
  useEffect(() => { let live = true; void bluetoothAvailable().then((v) => { if (live) setBtOn(v); }); return () => { live = false; }; }, []);
  const chromium = d.browser === "chrome" || d.browser === "edge" || d.browser === "opera";
  const mobile = d.os === "android" || d.os === "ios";

  const usb: [CheckState, string] = mobile
    ? ["na", d.os === "android" ? "Sul telefono il browser non può usare il cavo verso Arduino: si usa il Bluetooth." : "iPhone e iPad non permettono il cavo verso Arduino: si usa un modulo Bluetooth LE."]
    : d.serial ? ["ok", "Puoi collegare Arduino con il cavo USB."]
    : ["no", chromium ? "Il collegamento seriale è disattivato in questo browser: aggiorna Chrome o Edge." : `${BROWSER_LABEL[d.browser]} non permette di parlare con Arduino: apri questa pagina in Chrome o Edge.`];

  const ble: [CheckState, string] = d.bluetooth
    ? btOn === false ? ["warn", "Il browser lo supporta, ma il Bluetooth è spento o assente: accendilo nelle impostazioni."] : ["ok", "Puoi collegarti a un modulo Bluetooth LE (HM-10, AT-09, HC-08)."]
    : d.os === "ios" ? ["no", "Safari e gli altri browser di iPhone non danno il Bluetooth alle pagine web: installa il browser gratuito Bluefy (App Store) e apri lì MosaicusNeo."]
    : ["no", chromium ? "Bluetooth web non disponibile qui (su Linux va attivato in chrome://flags)." : `${BROWSER_LABEL[d.browser]} non ha il Bluetooth per le pagine web: usa Chrome o Edge.`];

  const hc06: [CheckState, string] = d.os === "ios" ? ["no", "L'HC-06 usa il Bluetooth classico, che iPhone e iPad non aprono alle app: serve un modulo BLE."]
    : d.os === "android" ? (d.serial ? ["ok", "Puoi usare l'HC-06: associalo prima nelle impostazioni Bluetooth (PIN 1234)."] : ["no", d.browser === "chrome" ? `Serve Chrome 138 o più recente (qui: ${d.version ?? "?"}): aggiornalo dal Play Store.` : "Serve Chrome per Android, versione 138 o più recente."])
    : d.serial ? ["warn", "Sul computer funziona solo se l'HC-06 è già associato nelle impostazioni Bluetooth del sistema; il BLE è più semplice."] : ["no", "Serve Chrome o Edge."];

  return (
    <ul className="divide-y rounded-lg border px-3">
      <CheckRow state={usb[0]} title="Cavo USB">{usb[1]}</CheckRow>
      <CheckRow state={ble[0]} title="Bluetooth LE">{ble[1]}</CheckRow>
      <CheckRow state={hc06[0]} title="Bluetooth HC-06">{hc06[1]}</CheckRow>
      <CheckRow state={d.secure ? "ok" : "no"} title="Connessione sicura">{d.secure ? "La pagina è in https: il browser permette USB e Bluetooth." : "Apri l'app dal suo indirizzo https: senza, il browser blocca USB e Bluetooth."}</CheckRow>
      <CheckRow state={d.standalone ? "ok" : "na"} title="Come app, anche offline">
        {d.standalone ? "MosaicusNeo è installata: si apre anche senza rete." : d.os === "ios" ? "Facoltativo: Condividi → «Aggiungi alla schermata Home»." : "Facoltativo: menu del browser → «Installa MosaicusNeo». Funziona anche senza rete."}
      </CheckRow>
    </ul>
  );
}

function PortHint({ os }: { os: string | null }) {
  if (os === "windows") return <>In alto, nel menu a tendina: <B>Arduino Uno</B> e la porta <B>COM3, COM4…</B> (quella che compare quando colleghi il cavo).</>;
  if (os === "mac") return <>In alto, nel menu a tendina: <B>Arduino Uno</B> e la porta <B>/dev/cu.usbmodem…</B> (o <B>/dev/cu.wchusbserial…</B> per i cloni).</>;
  if (os === "linux") return <>In alto: <B>Arduino Uno</B> e <B>/dev/ttyACM0</B> (o <B>/dev/ttyUSB0</B>). Se non hai i permessi: <code className="rounded bg-muted px-1">sudo usermod -aG dialout $USER</code>, poi esci e rientra.</>;
  if (os === "chromeos") return <>Sul Chromebook usa l&apos;<B>Arduino Cloud Editor</B> (con il suo plugin): scegli <B>Arduino Uno</B> e la porta che compare.</>;
  return <>In alto, nel menu a tendina: <B>Arduino Uno</B> e la porta (Windows: COM3, COM4…; Mac: /dev/cu.usbmodem…; Linux: /dev/ttyACM0).</>;
}

function ConnectHow() {
  const dev = useDev();
  return (
    <>
      {dev === "pc" && <>«Collega Arduino» e scegli la porta USB; con un modulo BLE: menu ▾ → «Bluetooth LE».</>}
      {(dev === "android" || dev === "board") && <>«Collega» → «Bluetooth» (HC-06, già associato) o menu ▾ → «Bluetooth LE».</>}
      {dev === "ios" && <>In Bluefy: «Collega» → menu ▾ → «Bluetooth LE» → «MosaicusNeo».</>}
      {" "}Aspetta <B>Arduino pronto</B>. Senza hardware: «Simulatore».
    </>
  );
}

/** Il percorso consigliato per il dispositivo scelto. */
function DevicePath() {
  const dev = useDev();
  const os = DETECTED?.device === "pc" ? DETECTED.os : null;
  if (dev === "pc") return (
    <Steps items={[
      ["Usa Chrome o Edge", "Firefox e Safari non possono parlare con Arduino."],
      ["Carica il firmware su Arduino", <>Una volta sola: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
      ["Collega i sensori", <>Schema generato per i tuoi sensori: <ChapterLink id="wiring">Collegare i sensori</ChapterLink>.</>],
      ["Collega Arduino con il cavo USB", <>«Collega Arduino» → scegli la porta{os === "windows" ? " (COM3, COM4…)" : os === "mac" ? " (/dev/cu.usbmodem…)" : os === "linux" ? " (/dev/ttyACM0)" : ""} → aspetta «Arduino pronto».</>],
      ["Misura e analizza", <>«Avvia», «Ferma», poi trascina sul grafico e «Analizza il tratto». Vedi <ChapterLink id="measure">Misurare</ChapterLink>.</>],
    ]} />
  );
  if (dev === "android") return (
    <Steps items={[
      ["Prima, da un computer: carica il firmware", <>Il telefono non può programmare Arduino. Una volta sola, da un PC: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
      ["Aggiungi un modulo Bluetooth", <>HC-06 (classico) o BLE (HM-10, AT-09, HC-08): si collegano allo stesso modo. Schema in <ChapterLink id="wiring">Collegare i sensori</ChapterLink> → «Con Bluetooth».</>],
      ["Configura il modulo (dal computer, una volta)", <>Arduino via USB, scheda «Collegamenti» → «Senza cavo: Bluetooth» → «Configura». Vedi <ChapterLink id="field">Sul campo e Bluetooth</ChapterLink>.</>],
      ["Sul telefono: Chrome", "HC-06: associa «MosaicusNeo» nelle impostazioni Bluetooth (PIN 1234), poi «Collega via Bluetooth». BLE: «Collega» → menu ▾ → «Bluetooth LE»."],
      ["Power bank su Arduino, poi misura", "Lo schermo resta acceso durante la misura; il Quaderno si salva ogni 30 secondi."],
    ]} />
  );
  if (dev === "ios") return (
    <>
      <Note kind="warn">Su iPhone e iPad servono un modulo <B>Bluetooth LE</B> (HM-10, AT-09/BT05, HC-08) e il browser gratuito <B>Bluefy</B>. Il cavo e l&apos;HC-06 non funzionano: è un limite di iOS, non dell&apos;app.</Note>
      <Steps items={[
        ["Prima, da un computer: carica il firmware", <>Una volta sola: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
        ["Collega il modulo BLE", <>Schema in <ChapterLink id="wiring">Collegare i sensori</ChapterLink> → «Con Bluetooth LE».</>],
        ["Configura il modulo (dal computer, una volta)", "Arduino via USB: «Collegamenti» → «Senza cavo: Bluetooth» → BLE → «Configura modulo BLE»."],
        ["Installa Bluefy e apri MosaicusNeo lì", "Dall'App Store. Poi scrivi l'indirizzo dell'app nella barra di Bluefy."],
        ["Collega e misura", "«Collega» → menu ▾ → «Bluetooth LE» → «MosaicusNeo». Arduino alimentato da un power bank."],
      ]} />
    </>
  );
  return (
    <Steps items={[
      ["Attiva la modalità LIM", <>Testi grandi e grafici più leggeri, pensati per le lavagne lente. <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => setLim(true)}>Attivala ora</button> (o dal menu Aspetto, in alto).</>],
      ["Scegli come avere i dati", "Le lavagne Android non usano il cavo verso Arduino. Tre strade: un modulo Bluetooth (come un telefono Android, con Chrome); oppure misura dal computer della classe e proietta quello; oppure accedi con lo stesso account: le misure fatte altrove compaiono nel Quaderno."],
      ["Con il Bluetooth", <>Firmware e configurazione del modulo si fanno una volta da un computer: <ChapterLink id="field">Sul campo e Bluetooth</ChapterLink>. Poi «Collega» → Bluetooth.</>],
      ["Per mostrare e discutere", "Quaderno → «Analizza»: i tratti vanno in Elaborazione, dove fit e tangenti si usano con le dita (trascina, tocca)."],
    ]} />
  );
}

function ShareLink() {
  const url = typeof location !== "undefined" ? location.origin : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const share = async () => {
    if (canShare) { try { await navigator.share({ title: "MosaicusNeo", url }); return; } catch { /* annullato */ } }
    try { await navigator.clipboard.writeText(url); toast.success("Link copiato."); } catch { toast(url); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <span className="min-w-0 flex-1">Userai un altro dispositivo? Apri lì questo indirizzo: <B>{url.replace(/^https?:\/\//, "")}</B></span>
      <Button size="sm" variant="outline" onClick={() => void share()}>{canShare ? <Share2 /> : <Copy />} {canShare ? "Condividi il link" : "Copia il link"}</Button>
    </div>
  );
}

function StartDevice() {
  const dev = useDev();
  const d = DETECTED;
  const okHere = !d || dev !== d.device || (d.device === "pc" ? d.serial : d.bluetooth);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H>Il tuo percorso: {DEVICE_LABEL[dev].toLowerCase()}</H>
        <ChapterLink id="device">Controlla il dispositivo →</ChapterLink>
      </div>
      {!okHere && <Note kind="warn">Su questo dispositivo manca qualcosa per collegarsi ad Arduino: il capitolo <ChapterLink id="device">Il tuo dispositivo</ChapterLink> dice che cosa e come rimediare.</Note>}
      <OtherDeviceNote />
      <DevicePath />
    </>
  );
}

// ---------------------------------------------------------------------------
// Capitoli
// ---------------------------------------------------------------------------
function YourDevice() {
  const dev = useDev();
  const d = DETECTED;
  const Icon = d ? DEVICE_ICON[d.device] : Monitor;
  return (
    <>
      {d && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <span className="grid size-10 place-items-center rounded-lg bg-tone-sky text-tone-ink"><Icon className="size-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold">Stai usando: {DEVICE_LABEL[d.device].toLowerCase()}</p>
            <p className="text-sm text-muted-foreground">{OS_LABEL[d.os]} · {BROWSER_LABEL[d.browser]}{d.version ? ` ${d.version}` : ""}</p>
          </div>
        </div>
      )}
      <H>Che cosa funziona qui</H>
      {d ? <DeviceChecks d={d} /> : <P>Non riesco a riconoscere il dispositivo.</P>}
      <H>Con che cosa misurerai?</H>
      <P>Le istruzioni seguono il dispositivo scelto qui (anche dal menu in alto, in ogni capitolo). Se leggi la guida dal computer ma misurerai con il telefono, scegli il telefono.</P>
      <div className="grid gap-2 sm:grid-cols-2">
        {DEVICES.map((x) => {
          const XIcon = DEVICE_ICON[x];
          return (
            <button key={x} type="button" onClick={() => setGuideDevice(x)} aria-pressed={dev === x}
              className={cn("flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors", dev === x ? "border-brand/50 bg-brand/8" : "hover:bg-muted")}>
              <XIcon className={cn("size-5 shrink-0", dev === x ? "text-brand" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1 font-semibold">{DEVICE_LABEL[x]}</span>
              {x === d?.device && <span className="rounded bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">questo</span>}
            </button>
          );
        })}
      </div>
      <H>Il tuo percorso: {DEVICE_LABEL[dev].toLowerCase()}</H>
      <DevicePath />
      {d && dev !== d.device && <ShareLink />}
      <H>Tutti i dispositivi a confronto</H>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Dispositivo</th><th className="p-2">Cavo USB</th><th className="p-2">Bluetooth</th></tr></thead>
          <tbody className="text-muted-foreground">
            {([
              ["pc", "Computer (Chrome, Edge)", "sì", "BLE sì; HC-06 se già associato"],
              ["android", "Android (Chrome)", "—", "HC-06 e BLE"],
              ["ios", "iPhone, iPad", "—", "solo BLE, nel browser gratuito Bluefy"],
              ["board", "Lavagna Android", "—", "come Android (Chrome)"],
            ] as const).map(([k, a, b, c]) => (
              <tr key={k} className={cn("border-t", k === dev && "bg-brand/5")}><td className="p-2 text-foreground">{a}</td><td className="p-2">{b}</td><td className="p-2">{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

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
      <StartDevice />
      <H>Il giro completo, in breve</H>
      <ol className="grid gap-2 text-sm sm:grid-cols-5">
        {[["1", "Firmware", "una volta sola"], ["2", "Esperimento", "elenco a sinistra"], ["3", "Collegamenti", "schema generato"], ["4", "Misura", "Avvia → Ferma"], ["5", "Analisi", "Quaderno → Elaborazione"]].map(([n, t, d]) => (
          <li key={n} className="rounded-lg border p-2.5"><span className="text-xs font-bold text-brand">{n}</span><p className="font-semibold">{t}</p><p className="text-xs text-muted-foreground">{d}</p></li>
        ))}
      </ol>
      <Note>Non hai ancora l&apos;hardware? Premi <B>Simulatore</B>: un Arduino finto produce dati realistici per ogni esperimento.</Note>
    </>
  );
}

function Firmware() {
  const dev = useDev();
  const os = DETECTED?.device === "pc" ? DETECTED.os : null;
  return (
    <>
      <P>Il firmware è il programma che gira su Arduino. Ce n&apos;è uno solo per tutti gli esperimenti: si carica una volta, poi è l&apos;app a dirgli quali sensori leggere.</P>
      {dev !== "pc" && <Note kind="warn">Il firmware si carica <B>da un computer</B> (Windows, Mac, Linux o Chromebook) con il cavo USB: {DEVICE_LABEL[dev].toLowerCase()} non può programmare Arduino. Dopo, misuri con {dev === "board" ? "la lavagna" : "il telefono"} via Bluetooth.</Note>}
      {DETECTED && DETECTED.device !== "pc" && <ShareLink />}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <Button render={<a href={FIRMWARE_URL} download="mosaicusneo_firmware.ino" />}><Download /> Scarica il firmware v{FIRMWARE_VERSION}</Button>
        <span className="text-xs text-muted-foreground">mosaicusneo_firmware.ino · nessuna libreria da installare</span>
      </div>
      <Steps items={[
        ["Installa l'IDE di Arduino", <>Dal sito arduino.cc → Software → «Arduino IDE 2» per il tuo sistema. Su un Chromebook o un computer della scuola senza permessi puoi usare l&apos;Arduino Cloud Editor.</>],
        ["Apri il file scaricato", <>Doppio clic su <B>mosaicusneo_firmware.ino</B>. L&apos;IDE chiede di metterlo in una cartella con lo stesso nome: rispondi <B>OK</B>.</>],
        ["Collega Arduino con il cavo USB", "Si accende il LED «ON». Se hai un modulo Bluetooth su D0, stacca ora il filo TXD del modulo."],
        ["Scegli scheda e porta", <PortHint key="port" os={os} />],
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
          {[...ARDUINO_SENSORS, ...OUTPUTS].map((t) => (
            <label key={t} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <Checkbox checked={picked.includes(t)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, t] : p.filter((x) => x !== t)))} />
              <span><B>{SENSORS[t].title}</B> <span className="text-muted-foreground">· {SENSORS[t].measures}</span></span>
            </label>
          ))}
        </div>
      )}
      {sensors.length || btMod ? (
        <>
          <WiringDiagram sensors={sensors} bt={btMod} />
          <p className="-mt-2 text-xs text-muted-foreground">Tratteggiato = facoltativo. I pin si cambiano nella scheda «Sensori» dell&apos;esperimento.</p>
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
        ["Collega Arduino", <ConnectHow key="connect" />],
        ["Dai un nome alla misura", "Nella scheda della misura, sopra il pulsante: es. «Gruppo 3 – piano inclinato». Se lo lasci vuoto, ci pensa l'app."],
        ["Avvia e ferma", "«Avvia»: i punti arrivano in tempo reale e le letture in evidenza si aggiornano. «Ferma» quando hai finito: la misura va nel Quaderno."],
        ["Scegli un tratto", "Trascina sul grafico: il tratto si colora su tutti i grafici. Doppio clic per annullare, pizzico o Ctrl + rotella per lo zoom."],
        ["Analizzalo", "«Analizza il tratto»: si apre Elaborazione sul nuovo riquadro. Il «+» accanto lo aggiunge senza cambiare pagina, per mandarne più d'uno."],
      ]} />
      <H>Altri comandi utili</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Grafici</B>: il menu sopra i grafici sceglie quali grandezze vedere; i «dati grezzi» sono le letture del sensore prima delle conversioni.</li>
        <li><B>Tabella</B> e <B>Esporta</B> (icone a destra): tutti i numeri, oppure Excel, CSV, immagine, GPX.</li>
        <li><B>Azzera</B> (mirino, con il sensore a ultrasuoni): la posizione attuale diventa lo zero.</li>
        <li><B>Quaderno</B> (pagina in alto): tutte le misure, da cercare e filtrare; «Apri» per rivederle in Misura, «Analizza» per mandarle intere a Elaborazione.</li>
        <li><B>Modalità LIM</B> (menu Aspetto, in alto): testi grandi e grafici più leggeri, per lavagne e PC lenti.</li>
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
  const dev = useDev();
  return (
    <>
      <OtherDeviceNote />
      {dev === "ios" && <Note kind="warn">Su iPhone e iPad: solo moduli <B>BLE</B> e solo nel browser <B>Bluefy</B>.</Note>}
      <P>Con un modulo Bluetooth e un power bank, Arduino si porta all&apos;aperto e si collega al telefono. Due tipi di modulo, collegati allo stesso modo (schema nel capitolo <ChapterLink id="wiring">Collegare i sensori</ChapterLink>, scegli «Con Bluetooth»).</P>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2" /><th className="p-2">HC-06 (classico)</th><th className="p-2">BLE (HM-10, AT-09, HC-08)</th></tr></thead>
          <tbody className="text-muted-foreground">
            <tr className={cn("border-t", (dev === "android" || dev === "board") && "bg-brand/5")}><td className="p-2 text-foreground">Android{dev === "board" ? " / LIM" : ""}</td><td className="p-2">sì (Chrome)</td><td className="p-2">sì (Chrome)</td></tr>
            <tr className={cn("border-t", dev === "ios" && "bg-brand/5")}><td className="p-2 text-foreground">iPhone / iPad</td><td className="p-2">no</td><td className="p-2">sì, con il browser Bluefy</td></tr>
            <tr className={cn("border-t", dev === "pc" && "bg-brand/5")}><td className="p-2 text-foreground">Computer</td><td className="p-2">se associato prima</td><td className="p-2">sì (Chrome, Edge)</td></tr>
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

function Outputs() {
  const rows: [string, string, string, string, string][] = [
    ["Acceso, l'app non è collegata", "ATTESA · APP", "#3b82f6", "blu, lampeggia", "1 bip ogni 3 s"],
    ["Collegato, fermo", "COLLEGATO · OK", "#3b82f6", "blu fisso", "1 bip ogni 3 s"],
    ["Misura avviata, GPS in ricerca", "CERCO GPS · 3 sat", "#eab308", "giallo, lampeggia", "2 bip ogni 3 s"],
    ["Un sensore non risponde", "PROBLEMA · DHT", "#ef4444", "rosso, lampeggia veloce", "3 bip ogni 3 s"],
    ["Sta misurando, tutto a posto", "REC 1:23 · 23.4°", "#22c55e", "verde fisso", "silenzio (un «bip-bip» quando ci arriva)"],
  ];
  return (
    <>
      <P>Un display, un LED RGB o un cicalino collegati ad Arduino dicono <B>da soli</B> in che stato è, anche quando il telefono è in tasca o lontano. Si aggiungono nella scheda «Sensori» → <B>Indicatori di stato</B>, con i pin che preferisci (schema e passi in «Collegamenti»). Servono il firmware v{FIRMWARE_VERSION} o più recente.</P>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Situazione</th><th className="p-2">Display</th><th className="p-2">LED</th><th className="p-2">Cicalino</th></tr></thead>
          <tbody className="text-muted-foreground">
            {rows.map(([a, b, c, d, e]) => (
              <tr key={a} className="border-t">
                <td className="p-2 text-foreground">{a}</td>
                <td className="p-2 font-mono text-xs">{b}</td>
                <td className="p-2"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} />{d}</span></td>
                <td className="p-2">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>In breve: <B>finché il cicalino suona, qualcosa non è pronto</B>. Quando smette, Arduino sta misurando e tutto va bene.</Note>
      <H>Il GPS «cerca», non è rotto</H>
      <P>Appena acceso, e ogni volta che è al chiuso, il GPS non ha ancora la posizione: sta cercando i satelliti. Per questo display e LED dicono «in ricerca» (giallo, 2 bip) e mostrano quanti satelliti vede. All&apos;aperto, con il cielo libero, ci vogliono da 30 secondi a qualche minuto. Se invece dal GPS non arriva proprio niente, è un problema di fili (rosso, 3 bip, «fili GPS?»).</P>
      <H>Da sapere</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Arduino ricorda gli indicatori: dalla misura successiva, appena acceso, mostra subito «in attesa dell&apos;app» (utile sul campo, prima di collegare il telefono).</li>
        <li>Durante la misura il display mostra la prima grandezza in grande e la seconda sotto, aggiornate ogni secondo.</li>
        <li>«Prova gli indicatori» (scheda Sensori, con Arduino collegato) fa cambiare colore al LED, suonare il cicalino e scrivere «CIAO» sul display.</li>
        <li>Nella scheda della misura l&apos;app mostra in piccolo che cosa stanno mostrando in quel momento display, LED e cicalino.</li>
        <li>Il cicalino si può zittire (opzione «Bip finché non è tutto pronto»). Display e accelerometro MPU-6050 possono stare sugli stessi due pin I2C (di solito A4 e A5).</li>
      </ul>
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
        <li><B>Dati grezzi</B> (CSV o Excel): le letture così come arrivano da Arduino (conteggi ADC, µs dell&apos;eco, byte del DHT, campi NMEA), una riga per lettura, con nomi di colonna semplici. Per script in Python, R o MATLAB.</li>
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
        <p>Se l&apos;app dice «cerco i satelliti», il GPS funziona: sta solo aspettando il segnale. Solo all&apos;aperto, lontano da palazzi alti; il primo fix può richiedere qualche minuto. Controlla che il TX del GPS vada sul pin «RX di Arduino» scelto nel montaggio.</p>
      </Faq>
      <Faq q="Il modulo Bluetooth non compare">
        <p>HC-06: va associato prima nelle impostazioni del telefono (PIN 1234 o 0000), e funziona solo su Android. BLE: compare dall&apos;app, non nelle impostazioni; se non trovi «MosaicusNeo», cerca HMSoft, BT05 o HC-08 (il modulo non è stato configurato). Su iPhone usa Bluefy, non Safari.</p>
        <p>Si collega ma non arriva nulla? Il modulo è ancora a 9600 baud: rifai «Configura» con il cavo USB.</p>
      </Faq>
      <Faq q="L'app è lenta">
        <p>Attiva la <B>modalità LIM</B> (menu Aspetto): oltre a ingrandire i testi spegne le animazioni e disegna i grafici con meno pixel, molto più leggera su lavagne e PC vecchi. Chiudi le altre schede pesanti; durante misure molto lunghe mostra meno grafici (menu «Grafici»).</p>
      </Faq>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Struttura
// ---------------------------------------------------------------------------
const CHAPTERS: { id: string; title: string; icon: LucideIcon; body: () => React.ReactElement }[] = [
  { id: "start", title: "Inizia qui", icon: Rocket, body: Start },
  { id: "device", title: "Il tuo dispositivo", icon: Smartphone, body: YourDevice },
  { id: "firmware", title: "Caricare il firmware", icon: Cpu, body: Firmware },
  { id: "wiring", title: "Collegare i sensori", icon: Plug, body: Wiring },
  { id: "measure", title: "Misurare", icon: FlaskConical, body: Measure },
  { id: "rigs", title: "Montaggi di sensori", icon: SlidersHorizontal, body: Rigs },
  { id: "analysis", title: "Elaborazione", icon: ChartLine, body: Analysis },
  { id: "field", title: "Sul campo e Bluetooth", icon: Bluetooth, body: Field },
  { id: "outputs", title: "Indicatori di stato", icon: Siren, body: Outputs },
  { id: "data", title: "Dati e account", icon: Cloud, body: Data },
  { id: "problems", title: "Problemi comuni", icon: LifeBuoy, body: Problems },
];

function ChapterLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => openGuide(id)}>{children}</button>;
}

export function GuideButton({ className }: { className?: string }) {
  return <Button variant="ghost" size="sm" className={className} aria-label="Guida" onClick={() => openGuide("start")}><BookOpen /> <span className="hidden sm:inline">Guida</span></Button>;
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
        <DialogHeader className="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3 pr-12">
          <DialogTitle className="mr-auto">Guida di MosaicusNeo</DialogTitle>
          <DevicePicker />
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
          <article key={current.id} className="mz-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
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
