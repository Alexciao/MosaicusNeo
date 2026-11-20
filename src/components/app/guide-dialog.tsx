"use client";
// La guida di MosaicusNeo: un manuale a capitoli, passo passo, per chi non ha mai usato Arduino.
// Il capitolo «Collegare i componenti» genera lo schema e le istruzioni per i componenti scelti
// (o per il progetto aperto). Gli altri punti dell'app possono aprirla a un capitolo preciso.

import { useEffect, useState } from "react";
import { create } from "zustand";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, Bluetooth, ChartLine, Check, Cloud, Copy, Cpu, Download, FlaskConical, LifeBuoy, MemoryStick, Minus, Monitor, Plug, Presentation, Rocket, Share2,
  Siren, SlidersHorizontal, Smartphone, TriangleAlert, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SENSORS, COMPONENTS, type SensorType } from "@/lib/sensors/catalog";
import { makeSensor } from "@/lib/sensors/rig";
import { useLab, openGuide, closeGuide, createRigFrom, setLim } from "@/lib/lab-store";
import { detectDevice, bluetoothAvailable, DEVICE_LABEL, OS_LABEL, BROWSER_LABEL, type GuideDevice, type DeviceInfo } from "@/lib/device";
import { APP_VERSION, FIRMWARE_URL, FIRMWARE_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/instruments/scope-panel";
import { WiringGuide } from "./wiring-diagram";
import { openPrivacy } from "./privacy-dialog";
import { GithubMark } from "./github-mark";
import { REPO_URL, ISSUES_URL, FIRMWARE_SOURCE_URL } from "@/lib/links";

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
    ? ["na", d.os === "android" ? "Il browser del telefono non usa il cavo verso Arduino: collegati via Bluetooth." : "iPhone e iPad non permettono il cavo verso Arduino: serve un modulo Bluetooth LE."]
    : d.serial ? ["ok", "Puoi collegare Arduino con il cavo USB."]
    : ["no", chromium ? "Collegamento seriale disattivato in questo browser: aggiorna Chrome o Edge." : `${BROWSER_LABEL[d.browser]} non comunica con Arduino: apri questa pagina in Chrome o Edge.`];

  const ble: [CheckState, string] = d.bluetooth
    ? btOn === false ? ["warn", "Supportato, ma il Bluetooth è spento o assente: attivalo nelle impostazioni."] : ["ok", "Puoi collegarti a un modulo Bluetooth LE (HM-10, AT-09, HC-08)."]
    : d.os === "ios" ? ["no", "I browser di iPhone non danno il Bluetooth alle pagine web: installa Bluefy (gratuito, App Store) e apri lì MosaicusNeo."]
    : ["no", chromium ? "Bluetooth web non disponibile (su Linux va attivato in chrome://flags)." : `${BROWSER_LABEL[d.browser]} non supporta il Bluetooth web: usa Chrome o Edge.`];

  const hc06: [CheckState, string] = d.os === "ios" ? ["no", "L'HC-06 usa il Bluetooth classico, che iPhone e iPad non supportano: serve un modulo BLE."]
    : d.os === "android" ? (d.serial ? ["ok", "Puoi usare l'HC-06: associalo prima nelle impostazioni Bluetooth (PIN 1234)."] : ["no", d.browser === "chrome" ? `Serve Chrome 138 o successivo (qui: ${d.version ?? "?"}): aggiornalo dal Play Store.` : "Serve Chrome per Android 138 o successivo."])
    : d.serial ? ["warn", "Funziona solo se l'HC-06 è già associato nelle impostazioni Bluetooth del sistema. Un modulo BLE non richiede associazione."] : ["no", "Serve Chrome o Edge."];

  return (
    <ul className="divide-y rounded-lg border px-3">
      <CheckRow state={usb[0]} title="Cavo USB">{usb[1]}</CheckRow>
      <CheckRow state={ble[0]} title="Bluetooth LE">{ble[1]}</CheckRow>
      <CheckRow state={hc06[0]} title="Bluetooth HC-06">{hc06[1]}</CheckRow>
      <CheckRow state={d.secure ? "ok" : "no"} title="Connessione sicura">{d.secure ? "Pagina in https: USB e Bluetooth consentiti." : "Apri l'app dal suo indirizzo https: senza, il browser blocca USB e Bluetooth."}</CheckRow>
      <CheckRow state={d.standalone ? "ok" : "na"} title="Installata come app">
        {d.standalone ? "Si apre anche senza rete." : d.os === "ios" ? "Facoltativo: Condividi → «Aggiungi alla schermata Home»." : "Facoltativo: menu del browser → «Installa MosaicusNeo». Poi si apre anche senza rete."}
      </CheckRow>
    </ul>
  );
}

function PortHint({ os }: { os: string | null }) {
  if (os === "windows") return <>Nel menu in alto: <B>Arduino Uno</B> e la porta <B>COM3, COM4…</B> che compare quando colleghi il cavo.</>;
  if (os === "mac") return <>Nel menu in alto: <B>Arduino Uno</B> e la porta <B>/dev/cu.usbmodem…</B> (cloni: <B>/dev/cu.wchusbserial…</B>).</>;
  if (os === "linux") return <>Nel menu in alto: <B>Arduino Uno</B> e <B>/dev/ttyACM0</B> (o <B>/dev/ttyUSB0</B>). Senza permessi: <code className="rounded bg-muted px-1">sudo usermod -aG dialout $USER</code>, poi esci e rientra.</>;
  if (os === "chromeos") return <>Usa l&apos;<B>Arduino Cloud Editor</B> con il suo plugin: scegli <B>Arduino Uno</B> e la porta che compare.</>;
  return <>Nel menu in alto: <B>Arduino Uno</B> e la porta (Windows: COM3, COM4…; Mac: /dev/cu.usbmodem…; Linux: /dev/ttyACM0).</>;
}

function ConnectHow() {
  const dev = useDev();
  return (
    <>
      {dev === "pc" && <>«Collega Arduino» e scegli la porta USB. Con un modulo BLE: menu ▾ → «Bluetooth LE».</>}
      {(dev === "android" || dev === "board") && <>HC-06 già associato: «Collega via Bluetooth». Modulo BLE: menu ▾ → «Bluetooth LE».</>}
      {dev === "ios" && <>In Bluefy: «Collega via Bluetooth LE» → «MosaicusNeo».</>}
      {" "}Attendi <B>Arduino pronto</B>. Senza hardware: «Simulatore».
    </>
  );
}

/** Il percorso consigliato per il dispositivo scelto. */
function DevicePath() {
  const dev = useDev();
  const os = DETECTED?.device === "pc" ? DETECTED.os : null;
  if (dev === "pc") return (
    <Steps items={[
      ["Usa Chrome o Edge", "Firefox e Safari non comunicano con Arduino."],
      ["Carica il firmware", <>Una volta sola: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
      ["Collega i componenti", <>Segui lo schema: <ChapterLink id="wiring">Collegare i componenti</ChapterLink>.</>],
      ["Collega Arduino con il cavo USB", <>«Collega Arduino» → scegli la porta{os === "windows" ? " (COM3, COM4…)" : os === "mac" ? " (/dev/cu.usbmodem…)" : os === "linux" ? " (/dev/ttyACM0)" : ""} → attendi «Arduino pronto».</>],
      ["Misura e analizza", <>«Avvia», «Ferma», seleziona un tratto sul grafico e «Analizza il tratto». Vedi <ChapterLink id="measure">Misurare</ChapterLink>.</>],
    ]} />
  );
  if (dev === "android") return (
    <Steps items={[
      ["Da un computer: carica il firmware", <>Il telefono non programma Arduino. Una volta sola: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
      ["Aggiungi un modulo Bluetooth", <>HC-06 o BLE (HM-10, AT-09, HC-08): è un componente come gli altri, in «Aggiungi un componente» → <B>Bluetooth</B> (o dal menu ▾ di «Collega»). Lo schema lo include.</>],
      ["Dal computer: configura il modulo", <>Una volta sola, con Arduino via USB: <ChapterLink id="field">Sul campo e Bluetooth</ChapterLink>.</>],
      ["Sul telefono, in Chrome: collega", "HC-06: associa «MosaicusNeo» nelle impostazioni Bluetooth (PIN 1234), poi «Collega via Bluetooth». BLE: menu ▾ → «Bluetooth LE»."],
      ["Alimenta Arduino con un power bank e misura", "Lo schermo resta acceso durante la misura. Il Quaderno si salva ogni 30 s."],
    ]} />
  );
  if (dev === "ios") return (
    <>
      <Note kind="warn">Su iPhone e iPad servono un modulo <B>Bluetooth LE</B> (HM-10, AT-09/BT05, HC-08) e il browser gratuito <B>Bluefy</B>. Cavo e HC-06 non funzionano: è un limite di iOS.</Note>
      <Steps items={[
        ["Da un computer: carica il firmware", <>Una volta sola: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>.</>],
        ["Collega il modulo BLE", <>Aggiungi il componente <B>Bluetooth LE</B> (in «Aggiungi un componente» → <B>Bluetooth</B>): lo schema lo include.</>],
        ["Dal computer: configura il modulo", <>Una volta sola, con Arduino via USB: <ChapterLink id="field">Sul campo e Bluetooth</ChapterLink>.</>],
        ["Installa Bluefy e apri MosaicusNeo", "Dall'App Store. Scrivi l'indirizzo dell'app nella barra di Bluefy."],
        ["Collega e misura", "Arduino sul power bank, poi «Collega via Bluetooth LE» → «MosaicusNeo»."],
      ]} />
    </>
  );
  return (
    <Steps items={[
      ["Attiva la modalità LIM", <>Testi grandi e grafici più leggeri per le lavagne lente. <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => setLim(true)}>Attivala ora</button> (anche dal menu Aspetto, in alto).</>],
      ["Scegli da dove arrivano i dati", "La lavagna non usa il cavo verso Arduino. Puoi: usare un modulo Bluetooth (come su Android, con Chrome); misurare dal computer di classe e proiettarlo; accedere con lo stesso account e aprire dal Quaderno le misure fatte altrove."],
      ["Con il Bluetooth", <>Firmware e configurazione del modulo si fanno una volta da un computer: <ChapterLink id="field">Sul campo e Bluetooth</ChapterLink>.</>],
      ["Per discutere i dati in classe", "Quaderno → «Analizza»: in Elaborazione fit e tangenti si usano anche al tocco."],
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
      <span className="min-w-0 flex-1">Sull&apos;altro dispositivo apri questo indirizzo: <B>{url.replace(/^https?:\/\//, "")}</B></span>
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
      {!okHere && <Note kind="warn">Questo dispositivo non può ancora collegarsi ad Arduino. Cosa manca e come rimediare: <ChapterLink id="device">Il tuo dispositivo</ChapterLink>.</Note>}
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
      <H>Con quale dispositivo misuri</H>
      <P>Le istruzioni della guida seguono questa scelta (modificabile anche dal menu in alto). Se leggi dal computer ma misuri con il telefono, scegli il telefono.</P>
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
      <H>Confronto dei dispositivi</H>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Dispositivo</th><th className="p-2">Cavo USB</th><th className="p-2">Bluetooth</th></tr></thead>
          <tbody className="text-muted-foreground">
            {([
              ["pc", "Computer (Chrome, Edge)", "sì", "BLE sì; HC-06 se già associato"],
              ["android", "Android (Chrome)", "—", "HC-06 e BLE"],
              ["ios", "iPhone, iPad", "—", "solo BLE, nel browser Bluefy"],
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
      <P>MosaicusNeo legge i sensori collegati ad Arduino, mostra i grafici in tempo reale, salva le misure e le analizza. Funziona nel browser, anche senza rete.</P>
      <H>Che cosa serve</H>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        <li className="rounded-lg border p-3"><B>Arduino Uno</B> o un clone (es. Elegoo UNO R3), con il cavo USB.</li>
        <li className="rounded-lg border p-3"><B>I componenti</B> dell&apos;esperimento, una breadboard e cavetti jumper.</li>
        <li className="rounded-lg border p-3"><B>Un computer</B> con Chrome o Edge: serve per caricare il firmware e per misurare via cavo.</li>
        <li className="rounded-lg border p-3"><B>Facoltativo</B>: modulo Bluetooth e power bank, per misurare senza cavo con il telefono.</li>
      </ul>
      <StartDevice />
      <H>I passaggi</H>
      <ol className="grid gap-2 text-sm sm:grid-cols-5">
        {[["1", "Firmware", "una volta sola"], ["2", "Esperimento", "elenco a sinistra"], ["3", "Collegamenti", "segui lo schema"], ["4", "Misura", "Avvia → Ferma"], ["5", "Analisi", "Elaborazione"]].map(([n, t, d]) => (
          <li key={n} className="rounded-lg border p-2.5"><span className="text-xs font-bold text-brand">{n}</span><p className="font-semibold">{t}</p><p className="text-xs text-muted-foreground">{d}</p></li>
        ))}
      </ol>
      <Note>Senza hardware premi <B>Simulatore</B>: genera dati realistici per ogni esperimento.</Note>
    </>
  );
}

function Firmware() {
  const dev = useDev();
  const os = DETECTED?.device === "pc" ? DETECTED.os : null;
  return (
    <>
      <P>Il firmware è il programma che gira su Arduino. È uno solo per tutti gli esperimenti: lo carichi una volta, poi l&apos;app gli indica quali componenti leggere.</P>
      {dev !== "pc" && <Note kind="warn">Il firmware si carica <B>da un computer</B> (Windows, Mac, Linux o Chromebook) con il cavo USB: {DEVICE_LABEL[dev].toLowerCase()} non programma Arduino. Poi misuri con {dev === "board" ? "la lavagna" : "il telefono"} via Bluetooth.</Note>}
      {DETECTED && DETECTED.device !== "pc" && <ShareLink />}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <Button render={<a href={FIRMWARE_URL} download="mosaicusneo_firmware.ino" />}><Download /> Scarica il firmware v{FIRMWARE_VERSION}</Button>
        <Button variant="outline" render={<a href={FIRMWARE_SOURCE_URL} target="_blank" rel="noopener" />}><GithubMark className="size-4" /> Codice su GitHub</Button>
        <span className="text-xs text-muted-foreground">mosaicusneo_firmware.ino · nessuna libreria da installare</span>
      </div>
      <Steps items={[
        ["Installa Arduino IDE 2", <>Da arduino.cc → Software. Su Chromebook o su computer senza permessi di installazione usa l&apos;Arduino Cloud Editor.</>],
        ["Apri il file scaricato", <>Apri <B>mosaicusneo_firmware.ino</B>. Se l&apos;IDE chiede di spostarlo in una cartella con lo stesso nome, conferma con <B>OK</B>.</>],
        ["Collega Arduino con il cavo USB", "Si accende il LED «ON». Se c'è un modulo Bluetooth su D0, stacca ora il suo filo TXD."],
        ["Scegli scheda e porta", <PortHint key="port" os={os} />],
        ["Premi «Carica» (freccia →)", <>I LED TX/RX lampeggiano; dopo qualche secondo compare <B>Caricamento completato</B>.</>],
        ["Verifica in MosaicusNeo", <>Chiudi l&apos;IDE, premi <B>Collega Arduino</B> e scegli la porta. Lo stato diventa <B>Arduino pronto · firmware {FIRMWARE_VERSION}</B>.</>],
      ]} />
      <Note>Clone con chip CH340 e nessuna porta? Installa il driver CH340 per il tuo sistema e ricollega il cavo.</Note>
      <Note kind="warn">La porta seriale si apre da un solo programma alla volta: con il Monitor seriale dell&apos;IDE aperto, MosaicusNeo non si collega, e viceversa.</Note>
    </>
  );
}

function Wiring() {
  const rig = useLab((s) => s.rig);
  const mine = rig.sensors.length > 0;
  const [mode, setMode] = useState<"rig" | "pick">(mine ? "rig" : "pick");
  const [picked, setPicked] = useState<SensorType[]>(mine ? [...new Set(rig.sensors.map((s) => s.type))] : ["dht"]);
  const sensors = mode === "rig" && mine ? rig.sensors : (() => { const taken = new Set<number>(); return picked.map((t) => makeSensor(t, taken)); })();
  return (
    <>
      <P>Schema, materiale e passi dipendono dai componenti e dai pin scelti. La stessa guida è nella scheda «Collegamenti». Bluetooth, scheda SD e pulsante sono componenti come gli altri: aggiungili al progetto (o sceglili qui sotto) e schema e passi si aggiornano.</P>
      {mine && <Segmented label="Quali componenti" value={mode} onChange={setMode} items={[["rig", "Progetto aperto"], ["pick", "Scegli i componenti"]]} />}
      {(mode === "pick" || !mine) && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {COMPONENTS.filter((t) => !SENSORS[t].phone).map((t) => (
            <label key={t} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <Checkbox checked={picked.includes(t)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, t] : p.filter((x) => x !== t)))} />
              <span><B>{SENSORS[t].title}</B> <span className="text-muted-foreground">· {SENSORS[t].measures}</span></span>
            </label>
          ))}
        </div>
      )}
      <WiringGuide sensors={sensors} />
      {mode === "pick" && !!picked.length && (
        <Button variant="outline" className="self-start" onClick={() => { createRigFrom(picked); closeGuide(); }}>
          <Wrench /> Crea un progetto con questi componenti
        </Button>
      )}
      <H>La breadboard</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>I cinque fori di una colonna (a–e oppure f–j) sono collegati tra loro; il solco centrale li separa.</li>
        <li>I binari laterali corrono per tutta la lunghezza: rosso (+) per il 5V, blu (−) per il GND.</li>
        <li>D0 e D1 sono riservati al cavo USB e al Bluetooth: non collegarci componenti.</li>
      </ul>
    </>
  );
}

function Measure() {
  return (
    <>
      <Steps items={[
        ["Scegli l'esperimento", "Dall'elenco a sinistra. In alto compaiono i componenti con i loro pin."],
        ["Controlla i collegamenti", "Scheda «Collegamenti» (a destra; sul telefono in basso)."],
        ["Collega Arduino", <ConnectHow key="connect" />],
        ["Dai un nome alla misura", "Sopra il pulsante «Avvia», es. «Gruppo 3 · piano inclinato». Se lo lasci vuoto: titolo dell'esperimento con data e ora."],
        ["Avvia e ferma", "Con «Avvia» i punti arrivano in tempo reale. Con «Ferma» la misura viene salvata nel Quaderno."],
        ["Seleziona un tratto", "Trascina sul grafico: il tratto si evidenzia su tutti i grafici. Doppio clic per annullare; pizzico o Ctrl + rotella per lo zoom."],
        ["Analizzalo", "«Analizza il tratto» apre Elaborazione sul nuovo riquadro. Il «+» accanto aggiunge il riquadro senza cambiare pagina."],
      ]} />
      <H>Altri comandi</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Grafici</B>: il menu sopra i grafici sceglie le grandezze. I «dati grezzi» sono le letture prima delle conversioni.</li>
        <li><B>Tabella</B> ed <B>Esporta</B> (icone a destra): i valori numerici, o file Excel, CSV, immagine, GPX.</li>
        <li><B>Azzera</B> (mirino, con il sensore a ultrasuoni): la posizione attuale diventa lo zero.</li>
        <li><B>Quaderno</B>: tutte le misure, con ricerca e filtri. «Apri» la riporta in Misura, «Analizza» la manda intera in Elaborazione.</li>
        <li><B>Modalità LIM</B> (menu Aspetto): testi grandi e grafici più leggeri, per lavagne e PC lenti.</li>
      </ul>
    </>
  );
}

function Rigs() {
  return (
    <>
      <P>Ogni esperimento e ogni progetto ha un elenco di <B>componenti</B>: sensori, display, LED e cicalino, ciascuno con i suoi pin e il suo ritmo di lettura. Fino a 6 sensori insieme, anche dello stesso tipo (es. due termistori per confrontare due tazze).</P>
      <H>Progetti</H>
      <P>Un <B>progetto</B> è un insieme di componenti scelto da te. Lo trovi in <B>«I miei progetti»</B>, in cima alla barra laterale:</P>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Nuovo progetto</B>: parti da zero.</li>
        <li><B>Copia come progetto</B> (in un esperimento, scheda «Componenti»): parti dai suoi componenti.</li>
        <li>Con un account, i progetti sono disponibili su tutti i tuoi dispositivi.</li>
      </ul>
      <P>Se modifichi un esperimento pronto ottieni una <B>versione personale</B>; «Ripristina» torna all&apos;originale.</P>
      <H>Modificare i componenti</H>
      <Steps items={[
        ["Apri la scheda «Componenti»", "A destra; sul telefono, il pulsante sotto il titolo."],
        ["Aggiungi o togli componenti", "«Aggiungi un componente» apre il catalogo: cerca per nome o grandezza, filtra per categoria."],
        ["Scegli i pin", "I pin già occupati non sono selezionabili. I sensori analogici vanno su A0…A5."],
        ["Scegli il ritmo", "«Una lettura ogni … ms». Limiti: DHT almeno 1000 ms, GPS una lettura al secondo, sonar fino a 30 ms."],
        ["Regola le opzioni", "Taratura, verso positivo, modello del DHT… Le meno usate sono in «Opzioni avanzate»."],
      ]} />
      <H>Sensori del telefono</H>
      <P>Senza Arduino si possono usare l&apos;accelerometro, il giroscopio e il microfono del telefono: esperimenti nella sezione «Telefono, senza Arduino» in fondo all&apos;elenco, oppure categoria «Telefono, senza Arduino» in «Aggiungi un componente». Apri l&apos;app sul telefono (Chrome su Android, Safari su iPhone) e premi <B>Attiva i sensori</B>; su iPhone conferma il permesso. Non si mescolano con i componenti di Arduino nello stesso progetto.</P>
      <Note>Con un errore nei componenti (pin doppio, troppi sensori…) «Avvia» resta disattivato; il messaggio indica come correggerlo.</Note>
    </>
  );
}

function Analysis() {
  return (
    <>
      <P>Ogni tratto inviato da Misura o dal Quaderno diventa un <B>riquadro</B>, con grafico, strumenti e dati. Sopra il grafico scegli le grandezze sugli assi, anche una in funzione dell&apos;altra (es. T in funzione dell&apos;altitudine).</P>
      <H>Strumenti</H>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["Tratto", "Trascina per scegliere i dati. Statistiche del tratto: media ± errore della media (s/√n), deviazione standard s, minimo e massimo, variazione Δy e rapporto medio Δy/Δx (es. velocità media)."],
          ["Retta a occhio", "Sposta le due maniglie finché la retta passa tra i punti (⬆⬇ contano i punti sopra e sotto), poi tocca due punti della retta per leggere Δy/Δx. «Confronta con i minimi quadrati» la confronta con la retta dei minimi quadrati."],
          ["Tangente", "Tocca un punto della curva: pendenza in quel punto, es. la velocità istantanea."],
          ["Fit", "Scegli un modello (retta, parabola, esponenziale, sinusoide smorzata…): parametri con incertezza e significato fisico. «Verifica i residui» mostra i residui. «Confronta tutti i modelli»: tabella con s, R² e giudizio sui residui; il migliore è evidenziato."],
          ["Righello", "Su un'onda: metti le due linee su due creste e indica quanti periodi N ci sono tra loro. T = Δt/N, f = 1/T."],
          ["Foglio dei dati", "Tutti i valori. «Nuova colonna» calcola una grandezza da una formula (es. x^2, ln(T − 21), sqrt(L/g))."],
        ].map(([t, d]) => <div key={t} className="rounded-lg border p-3"><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>)}
      </div>
      <H>Risultati e riquadri</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Salva</B> aggiunge un risultato al riquadro. L&apos;icona a occhio lo mostra o lo nasconde sul grafico.</li>
        <li>Un riquadro si può comprimere o <B>duplicare</B>, per provare un&apos;altra analisi sugli stessi dati.</li>
        <li>Spunta i riquadri e premi <B>Esporta in Excel</B>: un foglio di riepilogo, uno con tutti i risultati e uno per riquadro.</li>
      </ul>
    </>
  );
}

function SdChapter() {
  return (
    <>
      <P>Con una <B>scheda microSD</B> Arduino misura da solo, alimentato da un power bank o da una pila: niente computer, niente telefono, anche per ore. Con un <B>pulsante</B> decidi tu quando iniziare e fermare. Sono componenti come gli altri: li aggiungi da «Aggiungi un componente» (gruppi <B>Memoria</B> e <B>Comandi</B>) o dal menu ▾ di «Collega» → <B>Registra sulla scheda SD</B>.</P>
      <H>Che cosa serve</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Un modulo microSD con regolatore («Micro SD Card Adapter»): va a 5V. Usa sempre D10 (CS), D11 (MOSI), D12 (MISO) e D13 (SCK): sposta su altri pin i componenti che li usavano.</li>
        <li>Una scheda microSD formattata <B>FAT32</B>, fino a 32 GB (quelle più grandi escono in exFAT: riformattale in FAT32).</li>
        <li>Facoltativo: un pulsante tra un pin digitale e GND (nessuna resistenza).</li>
        <li>Il firmware v{FIRMWARE_VERSION}.</li>
      </ul>
      <H>Registrare</H>
      <Steps items={[
        ["Prepara Arduino (una volta per progetto)", <>Arduino collegato con il cavo USB: nella scheda del componente <B>Scheda SD</B> premi <B>Prepara Arduino</B>. Arduino riceve sensori, pin e ritmi, li salva (restano anche da spento) e prova la scheda.</>],
        ["Alimentalo senza computer", "Stacca il cavo e collega un power bank alla presa USB, o una pila da 9 V al jack."],
        ["Avvia e ferma", <>Con il pulsante: premi per iniziare, premi di nuovo per fermare; ogni registrazione è un file nuovo (LOG00001.CSV, LOG00002.CSV…). Senza pulsante: registra da quando lo accendi a quando lo spegni. Arduino salva ogni 2 s: staccando la corrente perdi al massimo gli ultimi istanti.</>],
        ["Importa nel Quaderno", <>Metti la scheda nel computer e premi <B>Importa dalla scheda SD</B> (nel Quaderno o nella scheda del componente): ogni file diventa una misura, con le grandezze, i grafici e l&apos;Elaborazione di sempre.</>],
      ]} />
      <Note>Il display, il LED e il cicalino dicono che cosa succede: «SD PRONTA · PREMI» aspetta il pulsante, «SD 1:23 · REC» sta registrando, «PROBLEMA · SD» se la scheda manca o non è FAT32.</Note>
      <H>Il pulsante con l&apos;app</H>
      <P>Con l&apos;app collegata, via cavo o Bluetooth, il pulsante fa come «Avvia» e «Ferma»: comodo quando le mani servono all&apos;esperimento. Se colleghi l&apos;app mentre Arduino registra sulla scheda, la registrazione si chiude e si misura come sempre.</P>
    </>
  );
}

function Field() {
  const dev = useDev();
  return (
    <>
      <OtherDeviceNote />
      {dev === "ios" && <Note kind="warn">Su iPhone e iPad: solo moduli <B>BLE</B> e solo nel browser <B>Bluefy</B>.</Note>}
      <P>Con un modulo Bluetooth e un power bank misuri all&apos;aperto, con il telefono. Il modulo è un componente: aggiungi <B>Bluetooth HC-06</B> o <B>Bluetooth LE</B> al progetto (oppure sceglilo dal menu ▾ di «Collega»: entra da solo nei componenti), e schema e passi lo includono. I due tipi si collegano agli stessi pin, D0 e D1 (vedi <ChapterLink id="wiring">Collegare i componenti</ChapterLink>).</P>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2" /><th className="p-2">HC-06 (classico)</th><th className="p-2">BLE (HM-10, AT-09, HC-08)</th></tr></thead>
          <tbody className="text-muted-foreground">
            <tr className={cn("border-t", (dev === "android" || dev === "board") && "bg-brand/5")}><td className="p-2 text-foreground">Android{dev === "board" ? " / LIM" : ""}</td><td className="p-2">sì (Chrome)</td><td className="p-2">sì (Chrome)</td></tr>
            <tr className={cn("border-t", dev === "ios" && "bg-brand/5")}><td className="p-2 text-foreground">iPhone / iPad</td><td className="p-2">no</td><td className="p-2">sì, con il browser Bluefy</td></tr>
            <tr className={cn("border-t", dev === "pc" && "bg-brand/5")}><td className="p-2 text-foreground">Computer</td><td className="p-2">se associato prima</td><td className="p-2">sì (Chrome, Edge)</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">Prima di collegarsi</td><td className="p-2">associalo nelle impostazioni</td><td className="p-2">nulla: si sceglie dall&apos;app</td></tr>
          </tbody>
        </table>
      </div>
      <H>Configurare il modulo (una volta sola)</H>
      <Steps items={[
        ["Collega il modulo come nello schema", "VCC a 5V, GND a GND, TXD → D0, RXD ← D1 attraverso il partitore 1 kΩ / 2 kΩ."],
        ["Collega Arduino al computer con il cavo USB", "Il LED del modulo lampeggia: nessun telefono è collegato."],
        ["«Collega Arduino»", "Attendi «Arduino pronto»."],
        ["Premi «Configura»", "In «Collegamenti», con Bluetooth attivo, nel passo del modulo Bluetooth."],
        ["Attendi la conferma", "Il modulo ora si chiama «MosaicusNeo» e comunica a 115200 baud, come Arduino."],
      ]} />
      <H>Misurare con il telefono</H>
      <Steps items={[
        ["Alimenta Arduino con un power bank", "Il cavo USB va al power bank, non al computer."],
        ["Apri MosaicusNeo", <>Android: Chrome. iPhone e iPad: <B>Bluefy</B> (gratuito, App Store), con l&apos;indirizzo dell&apos;app.</>],
        ["Collega", <>HC-06: associa «MosaicusNeo» nelle impostazioni Bluetooth (PIN 1234), poi «Collega via Bluetooth». BLE: menu ▾ → <B>Bluetooth LE</B> → «MosaicusNeo» (su iPhone: «Collega via Bluetooth LE»).</>],
        ["Avvia", "Lo schermo resta acceso durante la misura e il Quaderno si salva ogni 30 s: se il telefono si blocca, i dati restano."],
      ]} />
      <H>GPS</H>
      <P>Il primo fix richiede da 30 secondi a qualche minuto, all&apos;aperto e con il cielo libero; il LED del modulo lampeggia quando ha la posizione. I punti senza posizione restano in tabella ma non compaiono sulla mappa. La mappa colora i punti secondo la grandezza scelta. Esporta in GPX (Google Earth, Strava) o GeoJSON (QGIS).</P>
    </>
  );
}

function Outputs() {
  const rows: [string, string, string, string, string][] = [
    ["Acceso, l'app non è collegata", "ATTESA · APP · USB v1.5 (con un modulo Bluetooth: USB/BT 1.5)", "#3b82f6", "blu, lampeggia", "1 bip ogni 3 s"],
    ["Collegato, fermo", "COLLEGATO · OK (via Bluetooth: «BT»)", "#3b82f6", "blu fisso", "1 bip ogni 3 s"],
    ["Un componente è stato rifiutato", "CONFIG · DHT · pin doppio", "#ef4444", "rosso, lampeggia veloce", "3 bip ogni 3 s"],
    ["Misura avviata, GPS in ricerca", "CERCO GPS · 3 sat", "#eab308", "giallo, lampeggia", "2 bip ogni 3 s"],
    ["Un sensore non risponde", "PROBLEMA · DHT", "#ef4444", "rosso, lampeggia veloce", "3 bip ogni 3 s"],
    ["Più sensori in difficoltà", "PROBL 1/2 · DHT · #2 fili?", "#ef4444", "segue il più grave", "segue il più grave"],
    ["Sta misurando, tutto a posto", "REC 1:23 · 23.4°", "#22c55e", "verde fisso", "silenzio (un «bip-bip» quando ci arriva)"],
  ];
  return (
    <>
      <P>Display, LED RGB e cicalino mostrano lo stato di Arduino senza guardare il telefono. Si aggiungono come gli altri componenti: scheda «Componenti» → <B>Aggiungi un componente</B>, categoria «Display, LED, suoni». Richiedono il firmware v{FIRMWARE_VERSION} o successivo.</P>
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
      <Note><B>Finché il cicalino suona, qualcosa non è pronto.</B> Quando tace, Arduino sta misurando regolarmente.</Note>
      <H>GPS in ricerca</H>
      <P>Appena acceso, o al chiuso, il GPS cerca i satelliti: giallo, 2 bip, e sul display il numero di satelliti visti. All&apos;aperto il fix arriva in 30 secondi o qualche minuto. Se dal GPS non arriva alcun dato, controlla i fili: rosso, 3 bip, «fili GPS?».</P>
      <H>Più sensori, configurazione e Bluetooth</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Se più sensori hanno un problema, il display li mostra a turno ogni 2,5 secondi, prima gli errori e poi quelli in ricerca: «PROBL 1/2», «PROBL 2/2». LED e cicalino seguono sempre il più grave.</li>
        <li>Con due sensori dello stesso tipo, il display indica quale con il numero: «#2» è il secondo DHT nell&apos;elenco dei componenti.</li>
        <li>Se Arduino rifiuta un componente (pin doppio, pin non analogico, secondo GPS), il display mostra «CONFIG» con il motivo finché non correggi i pin e riavvii la misura.</li>
        <li>In attesa dell&apos;app il display mostra come collegarsi e la versione del firmware: «USB v1.5». Il Bluetooth è facoltativo: dopo «Configura» nel passo Bluetooth, se il modulo risponde, Arduino lo ricorda e il display mostra «USB/BT 1.5».</li>
      </ul>
      <Note>Queste funzioni richiedono il firmware v{FIRMWARE_VERSION}.</Note>
      <H>Dettagli</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Arduino memorizza gli indicatori: alle accensioni successive mostra subito «in attesa dell&apos;app», anche prima di collegare il telefono.</li>
        <li>Durante la misura il display mostra la prima grandezza in grande e la seconda sotto, aggiornate ogni secondo.</li>
        <li>«Prova display, LED e cicalino» (scheda «Componenti», con Arduino collegato) cambia colore al LED, fa suonare il cicalino e scrive «CIAO» sul display.</li>
        <li>La scheda della misura riporta in piccolo che cosa mostrano in quel momento display, LED e cicalino.</li>
        <li>Per silenziare il cicalino: opzione «Bip finché non è tutto pronto» → no.</li>
        <li>Display, accelerometro MPU-6050 e termometro a infrarossi MLX90614 possono condividere i due pin I2C (di solito A4 e A5).</li>
      </ul>
    </>
  );
}

function Data() {
  return (
    <>
      <H>Dove sono salvati</H>
      <P>Misure del Quaderno e riquadri di Elaborazione restano <B>nel browser di questo dispositivo</B>, anche senza rete. Cancellando i dati di navigazione si perdono: esporta ciò che vuoi conservare.</P>
      <H>Account (facoltativo)</H>
      <P>Con «Accedi» crei un account con email e password. Misure, riquadri, progetti e preferenze vengono salvati nel cloud e sono disponibili su tutti i tuoi dispositivi; anche le misure fatte prima di accedere passano all&apos;account. Quando esci, i dati spariscono dal dispositivo ma restano nel cloud: adatto ai computer della scuola.</P>
      <P>Per eliminare l&apos;account: menu dell&apos;account → <B>Elimina account</B>. Account e dati nel cloud vengono cancellati subito e per sempre; esporta prima quello che vuoi conservare.</P>
      <H>Formati di esportazione</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li><B>Excel (.xlsx)</B>: i dati e un foglio con componenti, pin e opzioni usati.</li>
        <li><B>CSV per Excel in italiano</B> (virgola decimale) o <B>CSV standard</B> (Fogli Google, Python).</li>
        <li><B>Immagine</B> dei grafici; <B>GPX</B> e <B>GeoJSON</B> per le tracce GPS.</li>
        <li><B>Dati grezzi</B> (CSV o Excel): le letture come arrivano da Arduino (conteggi ADC, µs dell&apos;eco, byte del DHT, campi NMEA), una riga per lettura. Per script in Python, R o MATLAB.</li>
      </ul>
    </>
  );
}

function Problems() {
  return (
    <div className="flex flex-col gap-2">
      <Faq q="«Collega Arduino» non mostra nessuna porta">
        <p>Browser non supportato, cavo solo di ricarica, driver mancante o porta occupata. Usa Chrome o Edge su computer; prova un altro cavo o un&apos;altra porta USB; con un clone CH340 installa il driver CH340; chiudi l&apos;IDE di Arduino.</p>
      </Faq>
      <Faq q="«Firmware non trovato»">
        <p>Su Arduino non c&apos;è il firmware MosaicusNeo. Caricalo: <ChapterLink id="firmware">Caricare il firmware</ChapterLink>. Con un modulo Bluetooth su D0, stacca il filo TXD durante il caricamento.</p>
      </Faq>
      <Faq q="«Il firmware su Arduino è vecchio»">
        <p>Le funzioni recenti (progetti, Bluetooth LE) richiedono la v{FIRMWARE_VERSION}. Scarica di nuovo il firmware e ricaricalo.</p>
      </Faq>
      <Faq q="Il DHT11 dà valori vuoti o «—»">
        <p>Collegamento errato o letture troppo frequenti. Verifica DATA sul pin scelto e VCC a 5V; il sensore senza modulo (4 piedini) richiede 10 kΩ tra DATA e 5V. Leggi al massimo una volta al secondo (DHT22: ogni 2 s).</p>
      </Faq>
      <Faq q="Il sonar dà salti o punti mancanti">
        <p>L&apos;eco si perde o rimbalza su altri oggetti. Usa un bersaglio piatto e ampio, tra 5 cm e 3 m, con il fascio libero. Nelle opzioni avanzate puoi scartare i salti anomali e regolare la lisciatura di velocità e accelerazione.</p>
      </Faq>
      <Faq q="La temperatura del termistore è sbagliata di qualche grado">
        <p>Configurazione diversa dal circuito reale. Verifica la «posizione del termistore nel partitore» (tra 5V e il pin, o tra il pin e GND) e, nelle opzioni avanzate, R₀ e B del termistore. Una correzione di taratura si somma a tutti i valori.</p>
      </Faq>
      <Faq q="Il GPS non trova la posizione">
        <p>Con «cerco i satelliti» il GPS funziona, ma non ha ancora segnale: spostati all&apos;aperto, lontano da edifici alti, e attendi qualche minuto. Se non arriva alcun dato, verifica che il TX del GPS sia sul pin «RX di Arduino» scelto.</p>
      </Faq>
      <Faq q="Il modulo Bluetooth non compare">
        <p>HC-06: non è associato o il dispositivo non lo supporta. Associalo nelle impostazioni del telefono (PIN 1234 o 0000); funziona solo su Android.</p>
        <p>BLE: si cerca dall&apos;app, non dalle impostazioni. Se «MosaicusNeo» non c&apos;è, il modulo non è configurato: cerca HMSoft, BT05 o HC-08. Su iPhone usa Bluefy, non Safari.</p>
        <p>Si collega ma non arrivano dati: il modulo è ancora a 9600 baud. Ripeti «Configura» con il cavo USB (<ChapterLink id="field">Sul campo e Bluetooth</ChapterLink>).</p>
      </Faq>
      <Faq q="L'app è lenta">
        <p>Dispositivo poco potente o troppi grafici. Attiva la <B>modalità LIM</B> (menu Aspetto): disattiva le animazioni e disegna grafici più leggeri. Chiudi le altre schede; nelle misure lunghe mostra meno grafici (menu «Grafici»).</p>
      </Faq>
      <Note>Il problema non è qui? <a className="font-medium text-brand underline underline-offset-2" href={ISSUES_URL} target="_blank" rel="noopener">Segnalalo su GitHub</a>: descrivi dispositivo, browser, componenti e che cosa succede.</Note>
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
  { id: "wiring", title: "Collegare i componenti", icon: Plug, body: Wiring },
  { id: "measure", title: "Misurare", icon: FlaskConical, body: Measure },
  { id: "rigs", title: "Progetti e componenti", icon: SlidersHorizontal, body: Rigs },
  { id: "analysis", title: "Elaborazione", icon: ChartLine, body: Analysis },
  { id: "field", title: "Sul campo e Bluetooth", icon: Bluetooth, body: Field },
  { id: "sd", title: "Scheda SD e pulsante", icon: MemoryStick, body: SdChapter },
  { id: "outputs", title: "Display, LED e cicalino", icon: Siren, body: Outputs },
  { id: "data", title: "Dati e account", icon: Cloud, body: Data },
  { id: "problems", title: "Problemi comuni", icon: LifeBuoy, body: Problems },
];

function ChapterLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => openGuide(id)}>{children}</button>;
}

export function GuideButton({ className }: { className?: string }) {
  return <Button variant="outline" size="sm" className={className} aria-label="Guida" onClick={() => openGuide("start")}><BookOpen /> <span className="hidden sm:inline">Guida</span></Button>;
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
          <DialogDescription className="sr-only">Manuale: firmware, collegamenti, misure, elaborazione, Bluetooth.</DialogDescription>
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
              <a className="underline" href={REPO_URL} target="_blank" rel="noopener">codice sorgente su GitHub</a> ·{" "}
              <a className="underline" href={ISSUES_URL} target="_blank" rel="noopener">segnala un problema</a> ·{" "}
              <button type="button" className="underline" onClick={openPrivacy}>informativa sulla privacy</button>
            </p>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
