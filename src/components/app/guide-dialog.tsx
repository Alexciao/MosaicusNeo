"use client";
// La guida di MosaicusNeo: un manuale a capitoli, passo passo, per chi non ha mai usato Arduino.
// Il capitolo «Collegare i componenti» genera lo schema e le istruzioni per i componenti scelti
// (o per il progetto aperto). Gli altri punti dell'app possono aprirla a un capitolo preciso.

import { useEffect, useState } from "react";
import { create } from "zustand";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  Bluetooth, ChartLine, Check, ChevronLeft, ChevronRight, CircleHelp, Cloud, Copy, Cpu, Download, FlaskConical, LifeBuoy, MemoryStick, Minus, Monitor, Plug, Presentation, Rocket, Share2,
  Siren, SlidersHorizontal, Smartphone, TriangleAlert, Unplug, X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SENSORS } from "@/lib/sensors/catalog";
import { useLab, openGuide, closeGuide, showWiring, setLim } from "@/lib/lab-store";
import { detectDevice, bluetoothAvailable, DEVICE_LABEL, OS_LABEL, BROWSER_LABEL, type GuideDevice, type DeviceInfo } from "@/lib/device";
import { APP_VERSION, FIRMWARE_URL, FIRMWARE_VERSION } from "@/lib/version";
import { locale } from "@/i18n";
import { cn } from "@/lib/utils";
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
            <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium text-muted-foreground tabular ring-1 ring-border">{i + 1}</span>
            <div className="pt-0.5"><p className="text-sm font-medium">{t}</p>{d && <div className="mt-0.5 text-sm text-muted-foreground">{d}</div>}</div>
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
  return <div className={cn("rounded-md px-3 py-2.5 text-sm", kind === "warn" ? "bg-destructive/[0.06] text-destructive ring-1 ring-destructive/20 ring-inset" : "bg-muted/60")}>{children}</div>;
}
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b py-2.5 last:border-b-0">
      <summary className="cursor-pointer text-sm font-medium marker:text-muted-foreground">{q}</summary>
      <div className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}

/** Tag comuni dei messaggi della guida (t.rich): grassetto, codice, rimandi ai capitoli. */
const tags = {
  b: (c: React.ReactNode) => <B>{c}</B>,
  code: (c: React.ReactNode) => <code className="rounded bg-muted px-1">{c}</code>,
  firmware: (c: React.ReactNode) => <ChapterLink id="firmware">{c}</ChapterLink>,
  wiring: (c: React.ReactNode) => <ChapterLink id="wiring">{c}</ChapterLink>,
  field: (c: React.ReactNode) => <ChapterLink id="wireless">{c}</ChapterLink>,
  measure: (c: React.ReactNode) => <ChapterLink id="measure">{c}</ChapterLink>,
};
/** Link esterni nei testi (pagina di download dell'IDE, Cloud Editor). */
function ext(href: string) {
  return function ExtLink(c: React.ReactNode) {
    return <a className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground" href={href} target="_blank" rel="noopener">{c}</a>;
  };
}
const IDE_URL = "https://www.arduino.cc/en/software";
const CLOUD_URL = "https://app.arduino.cc";
const fw = { ...tags, v: FIRMWARE_VERSION };

/** Il nome del dispositivo dentro una frase: in italiano in minuscolo, in inglese com'è (nomi propri). */
const inSentence = (s: string) => (locale === "it" ? s.toLowerCase() : s);

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
  const t = useTranslations("guide.picker");
  const dev = useDev();
  const items = Object.fromEntries(DEVICES.map((d) => [d, d === DETECTED?.device ? t("itemThis", { label: DEVICE_LABEL[d] }) : DEVICE_LABEL[d]]));
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground sm:inline">{t("label")}</span>
      <Select value={dev} onValueChange={(v) => v && setGuideDevice(v as GuideDevice)} items={items}>
        <SelectTrigger size="sm" aria-label={t("aria")} className="w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DEVICES.map((d) => {
            const Icon = DEVICE_ICON[d];
            return <SelectItem key={d} value={d}><Icon /> {DEVICE_LABEL[d]}{d === DETECTED?.device && <span className="text-xs text-muted-foreground">{t("badgeThis")}</span>}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Avviso quando si leggono le istruzioni di un dispositivo diverso da questo. */
function OtherDeviceNote() {
  const t = useTranslations("guide.otherDevice");
  const dev = useDev();
  if (!DETECTED || dev === DETECTED.device) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{t.rich("text", { ...tags, reading: inSentence(DEVICE_LABEL[dev]), here: inSentence(DEVICE_LABEL[DETECTED.device]) })}</span>
      <Button size="xs" variant="ghost" onClick={() => setGuideDevice(DETECTED.device)}>{t("back")}</Button>
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
  const t = useTranslations("guide.checks");
  const [btOn, setBtOn] = useState<boolean | null>(null);
  useEffect(() => { let live = true; void bluetoothAvailable().then((v) => { if (live) setBtOn(v); }); return () => { live = false; }; }, []);
  const chromium = d.browser === "chrome" || d.browser === "edge" || d.browser === "opera";
  const mobile = d.os === "android" || d.os === "ios";
  const browser = BROWSER_LABEL[d.browser];

  const usb: [CheckState, string] = mobile
    ? ["na", d.os === "android" ? t("usb.android") : t("usb.ios")]
    : d.serial ? ["ok", t("usb.ok")]
    : ["no", chromium ? t("usb.chromiumOff") : t("usb.otherBrowser", { browser })];

  const ble: [CheckState, string] = d.bluetooth
    ? btOn === false ? ["warn", t("ble.off")] : ["ok", t("ble.ok")]
    : d.os === "ios" ? ["no", t("ble.ios")]
    : ["no", chromium ? t("ble.chromiumOff") : t("ble.otherBrowser", { browser })];

  const hc06: [CheckState, string] = d.os === "ios" ? ["no", t("hc06.ios")]
    : d.os === "android" ? (d.serial ? ["ok", t("hc06.androidOk")] : ["no", d.browser === "chrome" ? t("hc06.androidChrome", { version: d.version ?? "?" }) : t("hc06.androidOther")])
    : d.serial ? ["warn", t("hc06.pcWarn")] : ["no", t("hc06.pcNo")];

  return (
    <ul className="divide-y">
      <CheckRow state={usb[0]} title={t("usbTitle")}>{usb[1]}</CheckRow>
      <CheckRow state={ble[0]} title={t("bleTitle")}>{ble[1]}</CheckRow>
      <CheckRow state={hc06[0]} title={t("hc06Title")}>{hc06[1]}</CheckRow>
      <CheckRow state={d.secure ? "ok" : "no"} title={t("secureTitle")}>{d.secure ? t("secure.ok") : t("secure.no")}</CheckRow>
      <CheckRow state={d.standalone ? "ok" : "na"} title={t("installedTitle")}>
        {d.standalone ? t("installed.ok") : d.os === "ios" ? t("installed.ios") : t("installed.other")}
      </CheckRow>
    </ul>
  );
}

/** I sistemi da cui si carica il firmware (su Chromebook con l'Arduino Cloud Editor, altrove con Arduino IDE). */
type FwOs = "windows" | "mac" | "linux" | "chromeos";
const FW_OSES: FwOs[] = ["windows", "mac", "linux", "chromeos"];

function PortHint({ os }: { os: Exclude<FwOs, "chromeos"> }) {
  const t = useTranslations("guide.port");
  return <>{t.rich(os, tags)}</>;
}

function ConnectHow() {
  const t = useTranslations("guide.connectHow");
  const dev = useDev();
  return (
    <>
      {dev === "pc" && t("pc")}
      {(dev === "android" || dev === "board") && t("android")}
      {dev === "ios" && t("ios")}
      {" "}{t.rich("wait", tags)}
    </>
  );
}

/** Il percorso consigliato per il dispositivo scelto. */
function DevicePath() {
  const t = useTranslations("guide.path");
  const dev = useDev();
  const os = DETECTED?.device === "pc" ? DETECTED.os : null;
  if (dev === "pc") return (
    <Steps items={[
      [t("pc.s1.t"), t("pc.s1.d")],
      [t("pc.s2.t"), t.rich("pc.s2.d", tags)],
      [t("pc.s3.t"), t.rich("pc.s3.d", tags)],
      [t("pc.s4.t"), t("pc.s4.d", { port: os === "windows" ? " (COM3, COM4…)" : os === "mac" ? " (/dev/cu.usbmodem…)" : os === "linux" ? " (/dev/ttyACM0)" : "" })],
      [t("pc.s5.t"), t.rich("pc.s5.d", tags)],
    ]} />
  );
  if (dev === "android") return (
    <Steps items={[
      [t("android.s1.t"), t.rich("android.s1.d", tags)],
      [t("android.s2.t"), t.rich("android.s2.d", tags)],
      [t("android.s3.t"), t.rich("android.s3.d", tags)],
      [t("android.s4.t"), t("android.s4.d")],
      [t("android.s5.t"), t("android.s5.d")],
    ]} />
  );
  if (dev === "ios") return (
    <>
      <Note kind="warn">{t.rich("ios.note", tags)}</Note>
      <Steps items={[
        [t("ios.s1.t"), t.rich("ios.s1.d", tags)],
        [t("ios.s2.t"), t.rich("ios.s2.d", tags)],
        [t("ios.s3.t"), t.rich("ios.s3.d", tags)],
        [t("ios.s4.t"), t("ios.s4.d")],
        [t("ios.s5.t"), t("ios.s5.d")],
      ]} />
    </>
  );
  return (
    <Steps items={[
      [t("board.s1.t"), t.rich("board.s1.d", { ...tags, lim: (c) => <button type="button" className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground" onClick={() => setLim(true)}>{c}</button> })],
      [t("board.s2.t"), t("board.s2.d")],
      [t("board.s3.t"), t.rich("board.s3.d", tags)],
      [t("board.s4.t"), t("board.s4.d")],
    ]} />
  );
}

function ShareLink() {
  const t = useTranslations("guide.share");
  const url = typeof location !== "undefined" ? location.origin : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const share = async () => {
    if (canShare) { try { await navigator.share({ title: "MosaicusNeo", url }); return; } catch { /* annullato */ } }
    try { await navigator.clipboard.writeText(url); toast.success(t("copied")); } catch { toast(url); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-3 text-sm">
      <span className="min-w-0 flex-1">{t.rich("open", { ...tags, url: url.replace(/^https?:\/\//, "") })}</span>
      <Button size="sm" variant="outline" onClick={() => void share()}>{canShare ? <Share2 /> : <Copy />} {canShare ? t("share") : t("copy")}</Button>
    </div>
  );
}

/** Il percorso per il dispositivo scelto in alto («Istruzioni per»), con i controlli di questo dispositivo
 *  in sordina: una riga richiudibile, aperta solo se serve. */
function StartDevice() {
  const t = useTranslations("guide.startDevice");
  const dev = useDev();
  const d = DETECTED;
  const okHere = !d || dev !== d.device || (d.device === "pc" ? d.serial : d.bluetooth);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <H>{t("path")}</H>
        <span className="text-xs text-muted-foreground">{DEVICE_LABEL[dev]}</span>
      </div>
      <OtherDeviceNote />
      {!okHere && <Note kind="warn">{t("cannot")}</Note>}
      {!d && <P>{t("unknown")}</P>}
      <DevicePath />
      {d && dev !== d.device && <ShareLink />}
      {d && (
        <details className="group rounded-md border px-3 py-2" open={!okHere || undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
            <span className="min-w-0 flex-1">{t("details")}</span>
            <span className="hidden sm:inline">{t("detected", { device: DEVICE_LABEL[d.device], os: OS_LABEL[d.os], browser: `${BROWSER_LABEL[d.browser]}${d.version ? ` ${d.version}` : ""}` })}</span>
          </summary>
          <div className="mt-2"><DeviceChecks d={d} /></div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">{t("otherHint")}</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Capitoli
// ---------------------------------------------------------------------------
function Start() {
  const t = useTranslations("guide.start");
  return (
    <>
      <P>{t("intro")}</P>
      <H>{t("needTitle")}</H>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/50">
        <li>{t.rich("need.arduino", tags)}</li>
        <li>{t.rich("need.parts", tags)}</li>
        <li>{t.rich("need.computer", tags)}</li>
        <li>{t.rich("need.optional", tags)}</li>
      </ul>
      <StartDevice />
      <Note>{t.rich("simulator", tags)}</Note>
    </>
  );
}

/** Il sistema del computer che carica il firmware: quello rilevato, se è un computer; altrimenti Windows. */
const DETECTED_FW_OS: FwOs = DETECTED && (FW_OSES as string[]).includes(DETECTED.os) ? (DETECTED.os as FwOs) : "windows";

function Firmware() {
  const t = useTranslations("guide.firmware");
  const dev = useDev();
  const [os, setOs] = useState<FwOs>(DETECTED_FW_OS);
  const links = { ...tags, ide: ext(IDE_URL), cloud: ext(CLOUD_URL) };
  const steps: (string | [string, React.ReactNode])[] = os === "chromeos"
    ? [
      [t("cloud.s1.t"), t.rich("cloud.s1.d", links)],
      [t("cloud.s2.t"), t.rich("cloud.s2.d", links)],
      [t("s3.t"), t("s3.d")],
      [t("cloud.s4.t"), t.rich("cloud.s4.d", links)],
      [t("cloud.s5.t"), t("cloud.s5.d")],
      [t("s6.t"), t.rich("s6.d", fw)],
    ]
    : [
      [t("ide.t"), t.rich(`ide.${os}`, links)],
      [t("s2.t"), t.rich("s2.d", tags)],
      [t("s3.t"), t("s3.d")],
      [t("s4.t"), <PortHint key="port" os={os} />],
      [t("s5.t"), t.rich("s5.d", tags)],
      [t("s6.t"), t.rich("s6.d", fw)],
    ];
  return (
    <>
      <P>{t("intro")}</P>
      {dev !== "pc" && <Note kind="warn">{t.rich("pcOnly", { ...tags, device: inSentence(DEVICE_LABEL[dev]), target: dev === "board" ? "board" : "phone" })}</Note>}
      {DETECTED && DETECTED.device !== "pc" && <ShareLink />}
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/60 p-3">
        <Button render={<a href={FIRMWARE_URL} download="mosaicusneo_firmware.ino" />}><Download /> {t("download", { v: FIRMWARE_VERSION })}</Button>
        <Button variant="outline" render={<a href={FIRMWARE_SOURCE_URL} target="_blank" rel="noopener" />}><GithubMark className="size-4" /> {t("source")}</Button>
        <span className="text-xs text-muted-foreground">{t("fileNote")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span id="fw-os" className="text-muted-foreground">{t("osLabel")}</span>
        <div role="radiogroup" aria-labelledby="fw-os" className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
          {FW_OSES.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={os === o} onClick={() => setOs(o)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                os === o ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {t(`os.${o}`)}
            </button>
          ))}
        </div>
      </div>
      <Steps items={steps} />
      {(os === "windows" || os === "mac") && <Note>{t(`ch340.${os}`)}</Note>}
      {os !== "chromeos" && <Note>{t.rich("noAdmin", links)}</Note>}
      <Note kind="warn">{t("serialBusy")}</Note>
    </>
  );
}

function Wiring() {
  const t = useTranslations("guide.wiring");
  const hasRig = useLab((s) => s.rig.sensors.some((x) => !SENSORS[x.type].phone));
  return (
    <>
      <P>{t("intro")}</P>
      <P>{t("where")}</P>
      <Button variant="outline" className="self-start" disabled={!hasRig} onClick={() => { closeGuide(); showWiring(); }}>
        <Plug /> {t("open")}
      </Button>
      {!hasRig && <Note>{t("empty")}</Note>}
      <H>{t("breadboard")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("bb1")}</li>
        <li>{t("bb2")}</li>
        <li>{t("bb3")}</li>
      </ul>
    </>
  );
}

function Measure() {
  const t = useTranslations("guide.measure");
  return (
    <>
      <Steps items={[
        [t("s1.t"), t("s1.d")],
        [t("s2.t"), t("s2.d")],
        [t("s3.t"), <ConnectHow key="connect" />],
        [t("s4.t"), t("s4.d")],
        [t("s5.t"), t("s5.d")],
        [t("s6.t"), t("s6.d")],
        [t("s7.t"), t("s7.d")],
      ]} />
      <H>{t("more")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t.rich("m1", tags)}</li>
        <li>{t.rich("m2", tags)}</li>
        <li>{t.rich("m3", tags)}</li>
        <li>{t.rich("m4", tags)}</li>
        <li>{t.rich("m5", tags)}</li>
      </ul>
    </>
  );
}

function Rigs() {
  const t = useTranslations("guide.rigs");
  return (
    <>
      <P>{t.rich("intro", tags)}</P>
      <H>{t("projects")}</H>
      <P>{t.rich("projectsIntro", tags)}</P>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t.rich("p1", tags)}</li>
        <li>{t.rich("p2", tags)}</li>
        <li>{t("p3")}</li>
      </ul>
      <P>{t.rich("personal", tags)}</P>
      <H>{t("edit")}</H>
      <Steps items={[
        [t("s1.t"), t("s1.d")],
        [t("s2.t"), t("s2.d")],
        [t("s3.t"), t("s3.d")],
        [t("s4.t"), t("s4.d")],
        [t("s5.t"), t("s5.d")],
      ]} />
      <H>{t("phone")}</H>
      <P>{t.rich("phoneText", tags)}</P>
      <Note>{t("errorNote")}</Note>
    </>
  );
}

function Analysis() {
  const t = useTranslations("guide.analysis");
  return (
    <>
      <P>{t.rich("intro", tags)}</P>
      <H>{t("tools")}</H>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["range", "eyeLine", "tangent", "fit", "ruler", "sheet"] as const).map((k) => (
          <div key={k} className="rounded-md border p-3"><p className="text-sm font-medium">{t(`tool.${k}.t`)}</p><p className="text-sm text-muted-foreground">{t(`tool.${k}.d`)}</p></div>
        ))}
      </div>
      <H>{t("results")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t.rich("r1", tags)}</li>
        <li>{t.rich("r2", tags)}</li>
        <li>{t.rich("r3", tags)}</li>
      </ul>
    </>
  );
}

/** Senza fili: Bluetooth (dal vivo sul telefono), scheda SD (Arduino da solo) e il pulsante che serve a entrambi. */
function Wireless() {
  const t = useTranslations("guide.wireless");
  const ways = [
    { k: "bt", icon: Bluetooth, href: "#guide-bt" },
    { k: "sd", icon: MemoryStick, href: "#guide-sd" },
  ] as const;
  return (
    <>
      <P>{t("intro")}</P>
      <div className="grid gap-2 sm:grid-cols-2">
        {ways.map(({ k, icon: Icon, href }) => (
          <a key={k} href={href} onClick={(e) => { e.preventDefault(); document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            className="flex gap-3 rounded-md border p-3 transition-colors hover:bg-muted/60">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0"><span className="block text-sm font-medium">{t(`${k}.t`)}</span><span className="block text-sm text-muted-foreground">{t(`${k}.d`)}</span></span>
          </a>
        ))}
      </div>
      <h3 id="guide-bt" className="mt-4 scroll-mt-4 text-lg font-semibold">{t("btTitle")}</h3>
      <Field />
      <h3 id="guide-sd" className="mt-4 scroll-mt-4 text-lg font-semibold">{t("sdTitle")}</h3>
      <SdCard />
    </>
  );
}

function SdCard() {
  const t = useTranslations("guide.sd");
  const tw = useTranslations("guide.wireless");
  return (
    <>
      <P>{t.rich("intro", tags)}</P>
      <H>{t("need")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("n1")}</li>
        <li>{t.rich("n2", tags)}</li>
        <li>{t("n3")}</li>
        <li>{t("n4", { v: FIRMWARE_VERSION })}</li>
      </ul>
      <H>{t("record")}</H>
      <Steps items={[
        [t("s1.t"), t.rich("s1.d", tags)],
        [t("s2.t"), t("s2.d")],
        [t("s3.t"), t("s3.d")],
        [t("s4.t"), t.rich("s4.d", tags)],
      ]} />
      <Note>{t("statusNote")}</Note>
      <H>{t("buttonTitle")}</H>
      <P>{tw("buttonText")}</P>
    </>
  );
}

function Field() {
  const t = useTranslations("guide.field");
  const dev = useDev();
  return (
    <>
      <OtherDeviceNote />
      {dev === "ios" && <Note kind="warn">{t.rich("iosNote", tags)}</Note>}
      <P>{t.rich("intro", tags)}</P>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2" /><th className="p-2">{t("table.classic")}</th><th className="p-2 font-medium">{t("table.ble")}</th></tr></thead>
          <tbody className="text-muted-foreground">
            <tr className={cn("border-t", (dev === "android" || dev === "board") && "bg-foreground/[0.03]")}><td className="p-2 text-foreground">{dev === "board" ? t("table.androidBoard") : t("table.android")}</td><td className="p-2">{t("table.yesChrome")}</td><td className="p-2">{t("table.yesChrome")}</td></tr>
            <tr className={cn("border-t", dev === "ios" && "bg-foreground/[0.03]")}><td className="p-2 text-foreground">{t("table.iphone")}</td><td className="p-2">{t("table.no")}</td><td className="p-2">{t("table.yesBluefy")}</td></tr>
            <tr className={cn("border-t", dev === "pc" && "bg-foreground/[0.03]")}><td className="p-2 text-foreground">{t("table.computer")}</td><td className="p-2">{t("table.ifPaired")}</td><td className="p-2">{t("table.yesChromeEdge")}</td></tr>
            <tr className="border-t"><td className="p-2 text-foreground">{t("table.before")}</td><td className="p-2">{t("table.pairIt")}</td><td className="p-2">{t("table.nothing")}</td></tr>
          </tbody>
        </table>
      </div>
      <H>{t("config")}</H>
      <Steps items={[
        [t("c1.t"), t("c1.d")],
        [t("c2.t"), t("c2.d")],
        [t("c3.t"), t("c3.d")],
        [t("c4.t"), t("c4.d")],
        [t("c5.t"), t("c5.d")],
      ]} />
      <H>{t("phone")}</H>
      <Steps items={[
        [t("p1.t"), t("p1.d")],
        [t("p2.t"), t.rich("p2.d", tags)],
        [t("p3.t"), t.rich("p3.d", tags)],
        [t("p4.t"), t("p4.d")],
      ]} />
      <H>{t("gps")}</H>
      <P>{t("gpsText")}</P>
    </>
  );
}

/** Righe della tabella degli indicatori: chiave dei testi e colore del LED. */
const OUTPUT_ROWS = [
  ["waiting", "#3b82f6"],
  ["connected", "#3b82f6"],
  ["rejected", "#ef4444"],
  ["gpsSearch", "#eab308"],
  ["noResponse", "#ef4444"],
  ["several", "#ef4444"],
  ["measuring", "#22c55e"],
] as const;

function Outputs() {
  const t = useTranslations("guide.outputs");
  return (
    <>
      <P>{t.rich("intro", fw)}</P>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground"><tr><th className="p-2 font-medium">{t("colSituation")}</th><th className="p-2 font-medium">{t("colDisplay")}</th><th className="p-2 font-medium">{t("colLed")}</th><th className="p-2 font-medium">{t("colBuzzer")}</th></tr></thead>
          <tbody className="text-muted-foreground">
            {OUTPUT_ROWS.map(([k, c]) => (
              <tr key={k} className="border-t">
                <td className="p-2 text-foreground">{t(`rows.${k}.situation`)}</td>
                <td className="p-2 font-mono text-xs">{t(`rows.${k}.display`)}</td>
                <td className="p-2"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c }} />{t(`rows.${k}.led`)}</span></td>
                <td className="p-2">{t(`rows.${k}.beep`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{t.rich("buzzerNote", tags)}</Note>
      <H>{t("gpsTitle")}</H>
      <P>{t("gpsText")}</P>
      <H>{t("multiTitle")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("mu1")}</li>
        <li>{t("mu2")}</li>
        <li>{t("mu3")}</li>
        <li>{t("mu4")}</li>
      </ul>
      <Note>{t("firmwareNote", { v: FIRMWARE_VERSION })}</Note>
      <H>{t("details")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("d1")}</li>
        <li>{t("d2")}</li>
        <li>{t("d3")}</li>
        <li>{t("d4")}</li>
        <li>{t("d5")}</li>
        <li>{t("d6")}</li>
      </ul>
    </>
  );
}

function Data() {
  const t = useTranslations("guide.data");
  return (
    <>
      <H>{t("whereTitle")}</H>
      <P>{t.rich("where", tags)}</P>
      <H>{t("accountTitle")}</H>
      <P>{t("account")}</P>
      <P>{t.rich("delete", tags)}</P>
      <H>{t("formatsTitle")}</H>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t.rich("f1", tags)}</li>
        <li>{t.rich("f2", tags)}</li>
        <li>{t.rich("f3", tags)}</li>
        <li>{t.rich("f4", tags)}</li>
      </ul>
    </>
  );
}

function Problems() {
  const t = useTranslations("guide.problems");
  return (
    <div className="flex flex-col gap-2">
      <Faq q={t("noPort.q")}>
        <p>{t("noPort.a")}</p>
      </Faq>
      <Faq q={t("noFirmware.q")}>
        <p>{t.rich("noFirmware.a", tags)}</p>
      </Faq>
      <Faq q={t("oldFirmware.q")}>
        <p>{t("oldFirmware.a", { v: FIRMWARE_VERSION })}</p>
      </Faq>
      <Faq q={t("dht.q")}>
        <p>{t("dht.a")}</p>
      </Faq>
      <Faq q={t("sonar.q")}>
        <p>{t("sonar.a")}</p>
      </Faq>
      <Faq q={t("thermistor.q")}>
        <p>{t("thermistor.a")}</p>
      </Faq>
      <Faq q={t("gps.q")}>
        <p>{t("gps.a")}</p>
      </Faq>
      <Faq q={t("bluetooth.q")}>
        <p>{t("bluetooth.a1")}</p>
        <p>{t("bluetooth.a2")}</p>
        <p>{t.rich("bluetooth.a3", tags)}</p>
      </Faq>
      <Faq q={t("slow.q")}>
        <p>{t.rich("slow.a", tags)}</p>
      </Faq>
      <Note>{t.rich("report", { ...tags, issues: (c) => <a className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground" href={ISSUES_URL} target="_blank" rel="noopener">{c}</a> })}</Note>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Struttura
// ---------------------------------------------------------------------------
const CHAPTERS = [
  { id: "start", icon: Rocket, body: Start },
  { id: "firmware", icon: Cpu, body: Firmware },
  { id: "wiring", icon: Plug, body: Wiring },
  { id: "measure", icon: FlaskConical, body: Measure },
  { id: "rigs", icon: SlidersHorizontal, body: Rigs },
  { id: "analysis", icon: ChartLine, body: Analysis },
  { id: "wireless", icon: Unplug, body: Wireless },
  { id: "outputs", icon: Siren, body: Outputs },
  { id: "data", icon: Cloud, body: Data },
  { id: "problems", icon: LifeBuoy, body: Problems },
] as const satisfies readonly { id: string; icon: LucideIcon; body: () => React.ReactElement }[];

const LEGACY_CHAPTERS: Record<string, string> = { device: "start", field: "wireless", sd: "wireless" };

function ChapterLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <button type="button" className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground" onClick={() => openGuide(id)}>{children}</button>;
}

export function GuideButton({ className }: { className?: string }) {
  const t = useTranslations("guide");
  return <Button variant="ghost" size="sm" className={cn("max-sm:w-8 max-sm:px-0", className)} aria-label={t("button")} onClick={() => openGuide("start")}><CircleHelp /> <span className="hidden sm:inline">{t("button")}</span></Button>;
}

/** La finestra della guida (una sola per l'app; si apre con openGuide). */
export function GuideDialog() {
  const t = useTranslations("guide");
  const chapter = useLab((s) => s.guide);
  // capitoli di prima, uniti ad altri: un vecchio rimando apre quello che li contiene
  const id = chapter && (LEGACY_CHAPTERS[chapter] ?? chapter);
  const current = CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0];
  const i = CHAPTERS.indexOf(current);
  const Body = current.body;
  const title = (c: (typeof CHAPTERS)[number]) => t(`chapters.${c.id}`);
  return (
    <Dialog open={chapter != null} onOpenChange={(o) => { if (!o) closeGuide(); }}>
      <DialogContent className="flex h-[min(92svh,860px)] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3 pr-12">
          <DialogTitle className="mr-auto">{t("dialog.title")}</DialogTitle>
          <DevicePicker />
          <DialogDescription className="sr-only">{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav aria-label={t("dialog.nav")} className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
            {CHAPTERS.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" onClick={() => openGuide(c.id)} aria-current={c === current ? "page" : undefined}
                  className={cn("flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors",
                    c === current ? "bg-foreground/[0.06] font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
                  <Icon className="size-4 shrink-0" /> {title(c)}
                </button>
              );
            })}
          </nav>
          <article key={current.id} className="mz-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <h2 className="text-xl font-semibold tracking-[-0.015em]">{title(current)}</h2>
            <Body />
            <div className="mt-auto flex justify-between gap-2 border-t pt-4">
              {i > 0 ? <Button variant="ghost" size="sm" onClick={() => openGuide(CHAPTERS[i - 1].id)}><ChevronLeft /> {title(CHAPTERS[i - 1])}</Button> : <span />}
              {i < CHAPTERS.length - 1 && <Button variant="outline" size="sm" onClick={() => openGuide(CHAPTERS[i + 1].id)}>{title(CHAPTERS[i + 1])} <ChevronRight /></Button>}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.rich("dialog.footer", {
                app: APP_VERSION,
                fw: FIRMWARE_VERSION,
                repo: (c) => <a className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" href={REPO_URL} target="_blank" rel="noopener">{c}</a>,
                issues: (c) => <a className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" href={ISSUES_URL} target="_blank" rel="noopener">{c}</a>,
                privacy: (c) => <button type="button" className="underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground" onClick={openPrivacy}>{c}</button>,
              })}
            </p>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
