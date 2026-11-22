"use client";
// Condividere e creare i miei lab.
//  - ShareDialog: link (con il suo codice QR), codice da copiare e file .neoproj.
//  - NewLabDialog: «Nuovo lab», da zero (nome, colore, icona, componenti) o da un codice, un link o
//    un file. Si apre anche dal link (#lab=…): vedi openNewLab.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { encode as encodeQr } from "uqr";
import { Check, ClipboardPaste, Copy, Download, FileUp, Plus, Search, Share2, Sparkles, TriangleExclamationPoint, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SENSORS, type SensorType } from "@/lib/sensors/catalog";
import { sensorLabel, type Rig, type SensorInstance } from "@/lib/sensors/rig";
import { DEFAULT_PROJECT_ICON, DEFAULT_PROJECT_TONE, PROJECT_ICONS, isProjectIcon, projectTone, type ProjectIconKey } from "@/lib/sensors/project-look";
import { SHARE_EXT, ShareError, decodeLab, encodeLab, hasCode, shareFileName, shareLink, type LabDraft } from "@/lib/sensors/share";
import type { Tone } from "@/lib/sensors/types";
import { useLab, checkAdd, createRig, rigVisible, showWiring } from "@/lib/lab-store";
import { download } from "@/lib/mosaicus/export.js";
import { toast } from "@/lib/toast";
import { isPhoneWidth } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { ComponentThumb } from "./board-diagram";
import { ComponentPicker } from "./rig-editor";
import { IconField, ToneField } from "./lab-look";
import { toneBg, toneFg } from "./tone";

/** I componenti più usati: proposti nel lab vuoto e nella finestra «Nuovo lab». */
export const QUICK_COMPONENTS: SensorType[] = ["sonar", "ntc", "dht", "ldr", "button", "imu"];

/** Suggeriti della finestra «Nuovo lab»: sette più «Sfoglia tutti» fanno due righe piene da quattro. */
const NEW_LAB_SUGGESTIONS: SensorType[] = [...QUICK_COMPONENTS, "ds18b20"];

/** Le caselle da mostrare: i suggeriti, poi ciò che è arrivato dal catalogo (spuntato); «Sfoglia tutti»
 *  segue sempre per ultima. */
const suggestionTiles = (chosen: SensorType[]): SensorType[] =>
  [...NEW_LAB_SUGGESTIONS, ...chosen.filter((type) => !NEW_LAB_SUGGESTIONS.includes(type))];

// ---------------------------------------------------------------------------
// Condividi

/** Codice QR del link, disegnato in SVG: moduli scuri su fondo chiaro anche nel tema scuro (le
 *  fotocamere leggono meglio così). */
function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const qr = encodeQr(value, { ecc: "M", border: 0 });
    let d = "";
    qr.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
    return { path: d, size: qr.size };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={label} className={className}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/** Il codice a gruppi di quattro, solo a vista: copiato resta un pezzo unico. */
function GroupedCode({ code }: { code: string }) {
  const groups = code.match(/.{1,4}/g) ?? [];
  return <>{groups.map((g, i) => <span key={i} className="mr-[0.45ch] inline-block last:mr-0">{g}</span>)}</>;
}

export function ShareDialog({ rig, open, onOpenChange }: { rig: Rig; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("rig.share");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  // all'apertura il fuoco va su «Copia» del link (il campo, a fuoco, mostrerebbe solo la fine del codice)
  const copyLinkRef = useRef<HTMLButtonElement>(null);
  const Icon = PROJECT_ICONS[isProjectIcon(rig.icon) ? rig.icon : DEFAULT_PROJECT_ICON], tone = projectTone(rig);
  // il codice si ricalcola a ogni apertura (grafici e componenti possono essere cambiati)
  const code = useMemo(() => (open ? encodeLab(rig, rigVisible(rig.id)) : ""), [open, rig]);
  const link = code ? shareLink(code) : "";
  const charts = code ? rigVisible(rig.id).length : 0;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(null), 1800); return () => clearTimeout(id); }, [copied]);
  const copy = async (what: "link" | "code") => {
    try { await navigator.clipboard.writeText(what === "link" ? link : code); setCopied(what); }
    catch { toast.error(t("copyFailed")); }
  };
  const save = () => { download(`${code}\n`, shareFileName(rig.name), "text/plain;charset=utf-8"); toast.success(t("saved", { file: shareFileName(rig.name) })); };
  const native = async () => { try { await navigator.share({ title: rig.name, text: t("shareText", { name: rig.name }), url: link }); } catch { /* annullato */ } };
  const copyButton = (what: "link" | "code", label: string) => (
    <Button ref={what === "link" ? copyLinkRef : undefined} type="button" variant="outline" size="sm" onClick={() => void copy(what)} className="w-28 shrink-0" aria-label={label}>
      {copied === what ? <><Check /> {t("copied")}</> : <><Copy /> {t("copy")}</>}
    </Button>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setCopied(null); }}>
      <DialogContent initialFocus={copyLinkRef} className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-3 px-5 pt-5 pr-12 pb-4">
          <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5", toneBg[tone], toneFg[tone])}><Icon /></span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle className="truncate">{t("title", { name: rig.name })}</DialogTitle>
            <DialogDescription>{t("summary", { n: rig.sensors.length, charts })}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="grid gap-5 border-t px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)]">
          {/* il QR: per aprire il lab subito su un telefono (dalla lavagna, dal compagno di banco) */}
          <figure className="flex flex-col items-center gap-2 justify-self-center sm:justify-self-start">
            <div className="rounded-xl bg-white p-3 text-zinc-950 shadow-xs ring-1 ring-black/10">
              {link && <QrCode value={link} label={t("qrLabel", { name: rig.name })} className="size-40 sm:size-36" />}
            </div>
            <figcaption className="max-w-40 text-center text-xs leading-snug text-muted-foreground">{t("qrHint")}</figcaption>
          </figure>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t("linkLabel")}</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={link} aria-label={t("linkLabel")} onFocus={(e) => e.currentTarget.select()} className="h-8 truncate text-[13px] md:text-[13px]" />
                {copyButton("link", t("copyLink"))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t("codeLabel")}</p>
              <div className="flex items-start gap-2">
                <p aria-label={t("codeLabel")} className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-2.5 py-1 font-mono text-[13px] leading-relaxed tracking-wide break-all select-all dark:bg-input/30">
                  <GroupedCode code={code} />
                </p>
                {copyButton("code", t("copyCode"))}
              </div>
              <p className="text-xs text-muted-foreground">{t("codeHint")}</p>
            </div>
          </div>
        </div>
        <DialogFooter className="m-0 items-center border-t px-5 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground max-sm:text-center">{t("note")}</p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" onClick={save} disabled={!code}><Download /> {t("download", { ext: SHARE_EXT })}</Button>
            {canShare && <Button onClick={() => void native()} disabled={!link}><Share2 /> {t("nativeShare")}</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Nuovo lab

/** Una casella dei componenti suggeriti nella finestra «Nuovo lab». */
function Tile({ on, label, title, icon, onClick, haspopup }: { on: boolean; label: string; title?: string; icon: React.ReactNode; onClick: () => void; haspopup?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={haspopup ? undefined : on} aria-haspopup={haspopup ? "dialog" : undefined}
      className={cn("group/tile relative flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 text-left transition-[background-color,border-color,scale] duration-150 ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]",
        on ? "border-foreground/30 bg-foreground/[0.04]" : "hover:bg-foreground/[0.03]")}>
      <span className="grid size-6 shrink-0 place-items-center" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
      {/* spunta in un angolo: non toglie spazio al nome */}
      {on && (
        <span aria-hidden className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background shadow-sm ring-2 ring-popover">
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      )}
    </button>
  );
}

/** Anteprima del lab che si sta importando: come apparirà e che cosa contiene. */
function LabPreview({ name, tone, icon, sensors, charts, placeholder }: { name: string; tone: Tone; icon: ProjectIconKey; sensors: SensorInstance[]; charts: number; placeholder: string }) {
  const t = useTranslations("rig.newLab");
  const Icon = PROJECT_ICONS[icon];
  return (
    <section aria-label={t("previewLabel")} className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 dark:bg-input/20">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5", toneBg[tone], toneFg[tone])}><Icon /></span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{name.trim() || placeholder}</p>
          <p className="text-xs text-muted-foreground">{t("previewSummary", { n: sensors.length, charts })}</p>
        </div>
      </div>
      {sensors.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {sensors.map((s) => (
            <li key={s.id} className="flex h-9 min-w-0 items-center gap-2 rounded-lg bg-muted/50 px-2 dark:bg-input/40">
              <span className="grid size-5 shrink-0 place-items-center" aria-hidden><ComponentThumb type={s.type} className="size-full" /></span>
              <span className="min-w-0 truncate text-[13px] font-medium" title={sensorLabel(s)}>{sensorLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Decoded = { state: "idle" } | { state: "ok"; draft: LabDraft } | { state: "error"; message: string };

/** Aperta o chiusa fuori dalla barra dei lab: sul telefono la barra è un cassetto che si chiude (e si
 *  smonta) proprio mentre la finestra si apre. */
const useNewLab = create<{ open: boolean; code: string | null; request: number }>(() => ({ open: false, code: null, request: 0 }));
/** Apre «Nuovo lab»; con un codice (dal link #lab=…) direttamente sulla scheda Importa, già compilata. */
export const openNewLab = (code?: string) => useNewLab.setState((s) => ({ open: true, code: code ?? null, request: s.request + 1 }));

/** «Nuovo lab»: una sola, montata dalla pagina Misura; si apre con openNewLab(). */
export function NewLabDialog() {
  const t = useTranslations("rig.newLab");
  const open = useNewLab((s) => s.open);
  const onOpenChange = (o: boolean) => useNewLab.setState({ open: o });
  const running = useLab((s) => s.running);
  const uid = useId();
  const [tab, setTab] = useState<"create" | "import">("create");
  // da zero
  const [name, setName] = useState("");
  const [tone, setTone] = useState<Tone>(DEFAULT_PROJECT_TONE);
  const [icon, setIcon] = useState<ProjectIconKey>(DEFAULT_PROJECT_ICON);
  const [sensors, setSensors] = useState<SensorInstance[]>([]);
  const [browse, setBrowse] = useState(false);
  // da un codice o un file
  const [text, setText] = useState("");
  // il risultato vale per il testo da cui è stato letto
  const [result, setResult] = useState<{ text: string; value: Decoded }>({ text: "", value: { state: "idle" } });
  const [fileError, setFileError] = useState(false);
  const decoded: Decoded = fileError ? { state: "error", message: t("errors.format") } : text.trim() && result.text === text ? result.value : { state: "idle" };
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canPaste = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
  // aperta con un codice (dal link): si va all'import con il codice già dentro
  const request = useNewLab((s) => s.request), requestCode = useNewLab((s) => s.code);
  const [handled, setHandled] = useState(request);
  if (request !== handled) {
    setHandled(request);
    if (requestCode) { setTab("import"); setText(requestCode); setFileError(false); }
  }

  const reset = () => {
    setTab("create"); setName(""); setTone(DEFAULT_PROJECT_TONE); setIcon(DEFAULT_PROJECT_ICON); setSensors([]);
    setText(""); setResult({ text: "", value: { state: "idle" } }); setFileError(false); setDragging(false);
  };
  const change = (o: boolean) => { onOpenChange(o); if (!o) setTimeout(reset, 200); };

  // il codice si legge mentre lo si incolla: l'anteprima compare subito
  useEffect(() => {
    if (!text.trim()) return;
    let live = true;
    decodeLab(text).then(
      (draft) => { if (live) setResult({ text, value: { state: "ok", draft } }); },
      (e: unknown) => { if (live) setResult({ text, value: { state: "error", message: t(`errors.${e instanceof ShareError ? e.code : "format"}`) } }); },
    );
    return () => { live = false; };
  }, [text, t]);

  const addTypes = (types: SensorType[]) => {
    let cur = sensors;
    for (const type of types) {
      const plan = checkAdd(cur, type);
      if (!plan.ok) { toast.error(t("cantAdd", { name: SENSORS[type].title }), { description: plan.error, duration: 8000 }); continue; }
      cur = plan.sensors;
    }
    setSensors(cur);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 256 * 1024) { setFileError(true); return; }
    const content = await file.text();
    setFileError(false);
    setText(content.trim());
  };

  const finish = (draft: LabDraft, imported: boolean) => {
    const rig = createRig(draft);
    if (!rig) return;
    change(false);
    toast.success(t(imported ? "imported" : "created", { name: rig.name }), rig.sensors.length ? { action: { label: t("wiring"), onClick: () => showWiring() } } : undefined);
  };
  const create = () => finish({ name, tone, icon, sensors }, false);
  const importLab = () => { if (decoded.state === "ok") finish(decoded.draft, true); };
  const paste = async () => { try { const c = await navigator.clipboard.readText(); if (c.trim()) { setText(c.trim()); setFileError(false); } } catch { toast.error(t("pasteFailed")); } };

  const draft = decoded.state === "ok" ? decoded.draft : null;
  const tiles = suggestionTiles([...new Set(sensors.map((s) => s.type))]);
  return (
    <>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent className="flex max-h-[min(48rem,92dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="gap-1 px-5 pt-5 pb-3">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "create" | "import")} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="px-5 pb-3">
              <TabsList className="w-full">
                <TabsTrigger value="create"><Sparkles /> {t("tabCreate")}</TabsTrigger>
                <TabsTrigger value="import"><FileUp /> {t("tabImport")}</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="create" className="flex min-h-0 flex-1 flex-col">
              <form id={`${uid}-create`} onSubmit={(e) => { e.preventDefault(); create(); }}
                className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain border-t px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-colors [&_svg]:size-4", toneBg[tone], toneFg[tone])}>
                    {(() => { const I = PROJECT_ICONS[icon]; return <I />; })()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`${uid}-name`} className="sr-only">{t("name")}</label>
                    <Input id={`${uid}-name`} autoFocus={!isPhoneWidth()} value={name} maxLength={80} placeholder={t("namePlaceholder")}
                      onChange={(e) => setName(e.target.value)}
                      // un codice incollato nel nome: si passa da soli all'import
                      onPaste={(e) => { const c = e.clipboardData.getData("text"); if (hasCode(c)) { e.preventDefault(); setText(c.trim()); setTab("import"); } }}
                      className="h-9 text-[15px] font-medium md:text-[15px]" />
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <ToneField id={`${uid}-new`} tone={tone} onChange={setTone} />
                  <IconField id={`${uid}-new`} icon={icon} tone={tone} onChange={setIcon} />
                </div>
                <section className="flex flex-col gap-2.5" aria-labelledby={`${uid}-components`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p id={`${uid}-components`} className="text-xs font-medium text-muted-foreground">{t("components")}</p>
                    <p className="text-xs text-muted-foreground tabular">{sensors.length ? t("componentCount", { n: sensors.length }) : t("optional")}</p>
                  </div>
                  {/* un clic aggiunge, un altro toglie; ciò che arriva dal catalogo diventa una casella spuntata
                      (e sparisce se la si toglie); «Sfoglia tutti» resta l'ultima */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {tiles.map((type) => {
                      const on = sensors.some((s) => s.type === type);
                      return (
                        <Tile key={type} on={on} title={SENSORS[type].measures} label={SENSORS[type].short}
                          icon={<ComponentThumb type={type} className="size-full" />}
                          onClick={() => { if (on) setSensors(sensors.filter((s) => s.type !== type)); else addTypes([type]); }} />
                      );
                    })}
                    <Tile on={false} label={t("browseAll")} icon={<Search className="size-4 text-muted-foreground" />} onClick={() => setBrowse(true)} haspopup />
                  </div>
                </section>
              </form>
              <DialogFooter className="m-0 border-t px-5 py-3">
                <Button type="button" variant="outline" onClick={() => change(false)}>{t("cancel")}</Button>
                <Button type="submit" form={`${uid}-create`} disabled={running}><Plus /> {t("create")}</Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="import" className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain border-t px-5 py-4"
                onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }}>
                {/* un'unica casella: si incolla un codice o un link, si sceglie o si trascina un file */}
                <div className={cn("relative flex flex-col rounded-xl border bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
                  decoded.state === "error" && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
                  dragging && "border-dashed border-foreground/50")}>
                  <label htmlFor={`${uid}-code`} className="sr-only">{t("codeLabel")}</label>
                  <textarea id={`${uid}-code`} autoFocus={!isPhoneWidth()} rows={3} value={text} spellCheck={false} autoComplete="off" autoCapitalize="off"
                    onChange={(e) => { setText(e.target.value); setFileError(false); }} placeholder={t("codePlaceholder")}
                    aria-invalid={decoded.state === "error" || undefined} aria-describedby={`${uid}-code-status`}
                    className="min-h-20 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 font-mono text-[13px] leading-relaxed break-all outline-none placeholder:font-sans placeholder:text-muted-foreground" />
                  <div className="flex items-center gap-1 px-1.5 pb-1.5">
                    {canPaste && <Button type="button" variant="ghost" size="sm" onClick={() => void paste()}><ClipboardPaste /> {t("paste")}</Button>}
                    <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}><FileUp /> {t("chooseFile")}</Button>
                    <span className="ml-auto hidden px-1.5 text-xs text-muted-foreground sm:inline">{t("dropHint", { ext: SHARE_EXT })}</span>
                    {text && (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setText(""); setFileError(false); }} aria-label={t("clear")} title={t("clear")}
                        className="text-muted-foreground max-sm:ml-auto"><X /></Button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept={`${SHARE_EXT},text/plain`} className="hidden"
                    onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
                  {dragging && (
                    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-card/90 text-[13px] font-medium">
                      <span className="flex items-center gap-2"><FileUp className="size-4" /> {t("dropNow")}</span>
                    </div>
                  )}
                </div>
                <div id={`${uid}-code-status`} aria-live="polite" className="flex flex-col gap-3">
                  {draft && (
                    <LabPreview name={draft.name} tone={projectTone(draft)} icon={isProjectIcon(draft.icon) ? draft.icon : DEFAULT_PROJECT_ICON}
                      sensors={draft.sensors} charts={draft.visible?.length ?? 0} placeholder={t("namePlaceholder")} />
                  )}
                  {decoded.state === "error" && (
                    <p className="flex items-start gap-2 text-[13px] text-destructive">
                      <TriangleExclamationPoint aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {decoded.message}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="m-0 border-t px-5 py-3">
                <Button type="button" variant="outline" onClick={() => change(false)}>{t("cancel")}</Button>
                <Button type="button" disabled={!draft || running} onClick={importLab}><FileUp /> {t("import")}</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <ComponentPicker open={browse} onOpenChange={setBrowse} base={sensors} onAdd={addTypes} />
    </>
  );
}
