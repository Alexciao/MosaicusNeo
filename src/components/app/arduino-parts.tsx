"use client";
// Il LED RGB e il cicalino di Arduino disegnati come i componenti veri, nello specchio «Su Arduino»
// della scheda della misura. Il cicalino suona anche qui, con gli stessi tempi del firmware.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import { prefs, fmtVal } from "@/lib/prefs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// LED RGB da 5 mm: cupola trasparente, colletto e quattro piedini (il comune è il più lungo)
// ---------------------------------------------------------------------------
export function LedPart({ color, on, label }: { color: string; on: boolean; label: string }) {
  return (
    <svg viewBox="0 0 24 46" className="h-[52px] w-auto shrink-0 overflow-visible" role="img" aria-label={label}>
      <title>{label}</title>
      {/* piedini */}
      {[[6.5, 41], [10, 46], [14, 43], [17.5, 41]].map(([x, y2]) => (
        <line key={x} x1={x} y1={26} x2={x} y2={y2} stroke="#a1a1aa" strokeWidth={1.2} strokeLinecap="round" />
      ))}
      {/* alone quando è acceso */}
      <circle cx={12} cy={14} r={11} fill={color} opacity={on ? 0.28 : 0} style={{ filter: "blur(4px)", transition: "opacity 60ms" }} />
      {/* cupola: colorata se accesa, lattiginosa se spenta */}
      <path d="M5 26V12.5a7 7 0 0 1 14 0V26Z" fill={on ? color : "var(--led-off, #d4d4d8)"} fillOpacity={on ? 0.95 : 0.55}
        stroke={on ? color : "#a1a1aa"} strokeOpacity={0.6} strokeWidth={0.6} style={{ transition: "fill 60ms" }} />
      <rect x={3.8} y={24.2} width={16.4} height={2.6} rx={0.8} fill={on ? color : "var(--led-off, #d4d4d8)"} fillOpacity={on ? 0.85 : 0.5} stroke="#a1a1aa" strokeOpacity={0.5} strokeWidth={0.5} />
      {/* riflesso */}
      <ellipse cx={9.2} cy={10.5} rx={1.6} ry={3.2} fill="#fff" opacity={on ? 0.55 : 0.4} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Il ritmo del cicalino, come nel firmware (statusTick): gruppi di 1–3 bip da 90 ms ogni 3 s (passo
// 200 ms) contati dal cambio di stato; oppure, con il pulsante e mentre registra, un «tic» grave da
// 100 ms ogni 5 s, sfasato di 2,5 s. In più i bip di conferma (chirp): due da 60 ms all'avvio, uno da
// 350 ms all'arresto. Con un cicalino passivo ognuno ha la sua nota.
// ---------------------------------------------------------------------------
export interface BeepPlan { beeps: number; tic: boolean }
type BeepKind = "status" | "confirm" | "tic";
interface Beep { start: number; dur: number; kind: BeepKind }
/** Le note del firmware per un cicalino passivo (OCR2A 91, 138, 249); quello attivo ha una nota sola. */
const NOTE: Record<BeepKind, number> = { status: 2700, confirm: 1800, tic: 1000 };
const ACTIVE_NOTE = 2300;

function beepsBetween(plan: BeepPlan, anchor: number, from: number, to: number, chirps: Beep[] = []): Beep[] {
  const out: Beep[] = chirps.filter((b) => b.start + b.dur >= from && b.start <= to);
  if (plan.tic) {
    for (let c = Math.max(0, Math.floor((from - anchor - 2500) / 5000)); ; c++) {
      const s = anchor + 2500 + c * 5000;
      if (s > to) break;
      if (s + 100 >= from) out.push({ start: s, dur: 100, kind: "tic" });
    }
  } else if (plan.beeps > 0) {
    for (let c = Math.max(0, Math.floor((from - anchor) / 3000)); ; c++) {
      const base = anchor + c * 3000;
      if (base > to) break;
      for (let i = 0; i < plan.beeps; i++) {
        const s = base + i * 200;
        if (s + 90 >= from && s <= to) out.push({ start: s, dur: 90, kind: "status" });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// suono: un'onda quadra breve, come un cicalino (passivo: una nota per segnale; attivo: sempre la stessa)
let audioCtx: AudioContext | null = null;
function audio() {
  if (!audioCtx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}
function play(b: Beep, passive: boolean) {
  const a = audio();
  if (!a) return;
  const at = a.currentTime + Math.max(0, (b.start - performance.now()) / 1000), len = b.dur / 1000;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "square";
  o.frequency.value = passive ? NOTE[b.kind] : ACTIVE_NOTE;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.03, at + 0.004);
  g.gain.setValueAtTime(0.03, at + len - 0.006);
  g.gain.linearRampToValueAtTime(0, at + len);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + len + 0.01);
}

const SOUND_KEY = "mirrorSound";

/** Il cicalino: disegnato, con le onde sonore mentre suona, il conto alla rovescia per il prossimo bip e
 *  il suono vero su questo dispositivo (di serie solo con il simulatore: con Arduino suona già il suo). */
export function BuzzerPart({ st, plan, passive, confirm, simulated, label }: { st: string; plan: BeepPlan; passive: boolean; confirm: boolean; simulated: boolean; label: string }) {
  const t = useTranslations("app.device");
  const [sound, setSound] = useState(() => prefs.get<Record<string, boolean>>(SOUND_KEY, {})[simulated ? "sim" : "board"] ?? simulated);
  const [view, setView] = useState<{ on: boolean; low: boolean; next: number | null }>({ on: false, low: false, next: null });
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; }, [sound]);
  // il cambio di stato più recente (da → a): resta uguale se l'effetto riparte senza un cambio vero
  const trans = useRef<{ st: string | null; prev: string | null; at: number }>({ st: null, prev: null, at: 0 });

  // il giro ricomincia a ogni cambio di stato, come nel firmware
  const key = `${st}:${plan.beeps}:${plan.tic}`;
  useEffect(() => {
    const t0 = performance.now(), queued = new Set<number>();
    // bip di conferma al cambio di stato, come chirp() nel firmware: blocca Arduino, poi riparte il giro
    const rec = (x: string | null) => x === "T" || x === "L";
    if (trans.current.st !== st) trans.current = { st, prev: trans.current.st, at: t0 };
    const prev = t0 - trans.current.at < 300 ? trans.current.prev : null;
    const chirps: Beep[] = !confirm || prev == null || rec(prev) === rec(st) ? []
      : rec(st) ? [{ start: t0, dur: 60, kind: "confirm" }, { start: t0 + 130, dur: 60, kind: "confirm" }]
      : [{ start: t0, dur: 350, kind: "confirm" }];
    const anchor = t0 + (chirps.length ? chirps.at(-1)!.start + chirps.at(-1)!.dur - t0 : 0);
    let raf = 0, last = "";
    const frame = () => {
      const now = performance.now();
      // le onde restano visibili almeno 250 ms, così anche un bip da 90 ms si vede
      const cur = beepsBetween(plan, anchor, now - 250, now, chirps).findLast((b) => b.start <= now);
      const next = beepsBetween(plan, anchor, now, now + 6000).find((b) => b.start > now);
      const v = { on: !!cur, low: cur?.kind === "tic", next: next ? Math.ceil((next.start - now) / 100) / 10 : null };
      const sig = `${v.on}${v.low}${v.next}`;
      if (sig !== last) { last = sig; setView(v); }
      if (soundRef.current) {
        for (const b of beepsBetween(plan, anchor, now, now + 200, chirps)) {
          if (b.start >= now && !queued.has(b.start)) { queued.add(b.start); play(b, passive); }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key riassume st e plan
  }, [key, passive, confirm]);

  const toggle = () => {
    const v = !sound;
    setSound(v);
    prefs.set(SOUND_KEY, { ...prefs.get<Record<string, boolean>>(SOUND_KEY, {}), [simulated ? "sim" : "board"]: v });
    if (v) audio();
  };
  const silent = !plan.beeps && !plan.tic;
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <svg viewBox="0 0 54 42" className="h-[44px] w-auto overflow-visible" role="img" aria-label={label}>
        <title>{label}</title>
        {/* piedini */}
        <line x1={13} y1={33} x2={13} y2={42} stroke="#a1a1aa" strokeWidth={1.2} strokeLinecap="round" />
        <line x1={23} y1={33} x2={23} y2={39.5} stroke="#a1a1aa" strokeWidth={1.2} strokeLinecap="round" />
        {/* corpo: cilindro nero */}
        <ellipse cx={18} cy={30} rx={14} ry={4} fill="#18181b" />
        <rect x={4} y={12} width={28} height={18} fill="#18181b" />
        <rect x={4} y={12} width={6} height={18} fill="#fff" opacity={0.06} />
        <ellipse cx={18} cy={12} rx={14} ry={4} fill="#2a2a2e" stroke="#3f3f46" strokeWidth={0.6} />
        <ellipse cx={18} cy={12} rx={2.6} ry={1} fill="#050505" />
        <text x={26.5} y={13.4} fontSize={4.2} fontWeight={700} fill="#a1a1aa" textAnchor="middle">+</text>
        {/* onde sonore mentre suona (il tic, più grave, ne ha due) */}
        <g className="text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"
          opacity={view.on ? 0.75 : 0} style={{ transition: "opacity 80ms" }}>
          {(view.low ? [0, 1] : [0, 1, 2]).map((i) => (
            <path key={i} className={cn(view.on && "mz-wave")} style={{ animationDelay: `${i * 70}ms` }}
              d={`M${37 + i * 5} ${15 - i * 3} q${3 + i} ${6 + i * 3} 0 ${12 + i * 6}`} />
          ))}
        </g>
      </svg>
      <span className="inline-flex items-center gap-1 text-[10px] leading-none text-muted-foreground tabular">
        {silent ? t("silent") : view.next != null ? t("nextBeep", { s: fmtVal(view.next, 1) }) : ""}
        <button type="button" onClick={toggle} aria-pressed={sound} aria-label={sound ? t("soundOff") : t("soundOn")} title={sound ? t("soundOff") : t("soundOn")}
          className="-m-1 rounded p-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          {sound ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
        </button>
      </span>
    </span>
  );
}
