"use client";
// Condividere e creare i miei lab.
//  - ShareDialog: il codice del lab (da copiare) e il file .neoproj che lo contiene.
//  - NewLabDialog: «Nuovo lab», da zero (nome, colore, icona, componenti) o da un codice/file.

import { useEffect, useId, useRef, useState } from "react";
import { create } from "zustand";
import { Check, Copy, Download, FileUp, Plus, Search, Sparkles, TriangleExclamationPoint } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SENSORS, type SensorType } from "@/lib/sensors/catalog";
import { sensorLabel, type Rig, type SensorInstance } from "@/lib/sensors/rig";
import { DEFAULT_PROJECT_ICON, DEFAULT_PROJECT_TONE, PROJECT_ICONS, isProjectIcon, projectTone, type ProjectIconKey } from "@/lib/sensors/project-look";
import { SHARE_EXT, ShareError, decodeLab, encodeLab, findCode, shareFileName, type LabDraft } from "@/lib/sensors/share";
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

const codeClass = "w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs leading-relaxed break-all outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30";

// ---------------------------------------------------------------------------
// Condividi

export function ShareDialog({ rig, open, onOpenChange }: { rig: Rig; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("rig.share");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const Icon = PROJECT_ICONS[isProjectIcon(rig.icon) ? rig.icon : DEFAULT_PROJECT_ICON], tone = projectTone(rig);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void encodeLab(rig, rigVisible(rig.id)).then((c) => { if (live) setCode(c); });
    return () => { live = false; };
  }, [open, rig]);
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(id); }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch { toast.error(t("copyFailed")); }
  };
  const save = () => { download(`${code}\n`, shareFileName(rig.name), "text/plain;charset=utf-8"); toast.success(t("saved", { file: shareFileName(rig.name) })); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setCopied(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Icon className={cn("size-4 shrink-0", toneFg[tone])} aria-hidden />
            <span className="truncate">{t("title", { name: rig.name })}</span>
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <textarea readOnly value={code} rows={4} aria-label={t("codeLabel")} onFocus={(e) => e.currentTarget.select()} className={cn(codeClass, "bg-muted/40 select-all")} />
          <p className="text-xs text-muted-foreground">{t("contents", { n: rig.sensors.length })}</p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={save} disabled={!code}><Download /> {t("download", { ext: SHARE_EXT })}</Button>
          <Button onClick={() => void copy()} disabled={!code} className="min-w-32">
            {copied ? <><Check /> {t("copied")}</> : <><Copy /> {t("copy")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Nuovo lab

/** Un componente nell'anteprima di un lab importato. */
function DraftChip({ s }: { s: SensorInstance }) {
  return (
    <li className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-card pr-2 pl-1 text-xs whitespace-nowrap">
      <span className="grid size-5 place-items-center" aria-hidden><ComponentThumb type={s.type} className="size-full" /></span>
      <span className="max-w-40 truncate font-medium" title={sensorLabel(s)}>{sensorLabel(s)}</span>
    </li>
  );
}

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

/** Anteprima di un lab (nome, icona, componenti): in cima alla scheda Crea e dopo l'import. */
function LabPreview({ name, tone, icon, sensors, placeholder }: { name: string; tone: Tone; icon: ProjectIconKey; sensors: SensorInstance[]; placeholder: string }) {
  const t = useTranslations("rig.newLab");
  const Icon = PROJECT_ICONS[icon];
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4", toneBg[tone], toneFg[tone])}><Icon /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name.trim() || placeholder}</p>
          <p className="text-xs text-muted-foreground">{t("componentCount", { n: sensors.length })}</p>
        </div>
      </div>
      {sensors.length > 0 && <ul className="flex flex-wrap gap-1.5">{sensors.map((s) => <DraftChip key={s.id} s={s} />)}</ul>}
    </div>
  );
}

type Decoded = { state: "idle" } | { state: "ok"; draft: LabDraft } | { state: "error"; message: string };

/** Aperta o chiusa fuori dalla barra dei lab: sul telefono la barra è un cassetto che si chiude (e si
 *  smonta) proprio mentre la finestra si apre. */
const useNewLab = create<{ open: boolean }>(() => ({ open: false }));
export const openNewLab = () => useNewLab.setState({ open: true });

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
    setText(findCode(content) ?? content);
  };

  const finish = (draft: LabDraft, imported: boolean) => {
    const rig = createRig(draft);
    if (!rig) return;
    change(false);
    toast.success(t(imported ? "imported" : "created", { name: rig.name }), rig.sensors.length ? { action: { label: t("wiring"), onClick: () => showWiring() } } : undefined);
  };
  const create = () => finish({ name, tone, icon, sensors }, false);
  const importLab = () => { if (decoded.state === "ok") finish(decoded.draft, true); };

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
                      onPaste={(e) => { const c = findCode(e.clipboardData.getData("text")); if (c) { e.preventDefault(); setText(c); setTab("import"); } }}
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
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${uid}-code`} className="text-xs font-medium text-muted-foreground">{t("codeLabel")}</label>
                  <textarea id={`${uid}-code`} autoFocus={!isPhoneWidth()} rows={4} value={text} spellCheck={false} autoComplete="off" autoCapitalize="off"
                    onChange={(e) => { setText(e.target.value); setFileError(false); }} placeholder={t("codePlaceholder")}
                    aria-invalid={decoded.state === "error" || undefined} aria-describedby={`${uid}-code-status`}
                    className={codeClass} />
                </div>
                <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
                  dragging ? "border-foreground/40 bg-foreground/[0.04]" : "border-border")}>
                  <FileUp aria-hidden className="size-5 text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">{t("dropHint", { ext: SHARE_EXT })}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{t("chooseFile")}</Button>
                  <input ref={fileRef} type="file" accept={`${SHARE_EXT},text/plain`} className="hidden"
                    onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
                </div>
                <div id={`${uid}-code-status`} aria-live="polite">
                  {draft && (
                    <LabPreview name={draft.name} tone={projectTone(draft)} icon={isProjectIcon(draft.icon) ? draft.icon : DEFAULT_PROJECT_ICON}
                      sensors={draft.sensors} placeholder={t("namePlaceholder")} />
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
