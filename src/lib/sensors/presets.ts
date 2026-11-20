// MosaicusNeo — esperimenti pronti (preset) e strumenti.
//
// Un esperimento è un montaggio di sensori già pensato per un'attività: sensori e pin
// predefiniti, grafici e letture da mostrare, idee per la lezione, scenario del simulatore.
// Si può aprire e modificare (pin, opzioni, sensori in più); le modifiche restano sue.
// Gli strumenti (oscilloscopi, synth) hanno un pannello proprio: non sono serie di sensori.

import type { LucideIcon } from "lucide-react";
import { AudioLines, AudioWaveform, Droplets, Rotate3d, Smartphone, MapPinned, MoveRight, Piano, Thermometer, WavesHorizontal, Zap } from "lucide-react";
import type { SensorType } from "./catalog";
import { makeSensor, type SensorInstance } from "./rig";
import { t } from "@/i18n";
import type { Options, Tone, WiringBlock } from "./types";

const TOPIC = {
  kinematics: t("sensors.topics.kinematics"), thermo: t("sensors.topics.thermo"), field: t("sensors.topics.field"), tools: t("lab.info.toolsTopic"),
};
const IDEA = t("sensors.presets.idea");

export interface PresetSensor { type: SensorType; pins?: Record<string, number>; options?: Options; interval?: number; label?: string }
export interface Preset {
  id: string;
  topic: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  sensors: PresetSensor[];
  /** grafici mostrati all'inizio e letture in evidenza (chiavi delle grandezze) */
  visible: string[];
  readouts: string[];
  /** scenario del simulatore e nota (tempo accelerato) */
  sim: string;
  simNote?: string;
  tips?: WiringBlock[];
}

export const PRESETS: Preset[] = [
  {
    id: "motion", topic: TOPIC.kinematics, title: t("sensors.presets.motion.title"), subtitle: t("sensors.presets.motion.subtitle"),
    icon: MoveRight, tone: "sky", sim: "incline",
    sensors: [{ type: "sonar", interval: 50 }],
    visible: ["x", "v", "a"], readouts: ["x", "v"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.motion.tip") }],
  },
  {
    id: "harmonic", topic: TOPIC.kinematics, title: t("sensors.presets.harmonic.title"), subtitle: t("sensors.presets.harmonic.subtitle"),
    icon: WavesHorizontal, tone: "rose", sim: "spring",
    sensors: [{ type: "sonar", interval: 50, options: { window: 2 } }],
    visible: ["x", "v", "a"], readouts: ["x", "v"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.harmonic.tip") }],
  },
  {
    id: "cooling", topic: TOPIC.thermo, title: t("sensors.presets.cooling.title"), subtitle: t("sensors.presets.cooling.subtitle"),
    icon: Thermometer, tone: "rose", sim: "cooling", simNote: t("sensors.presets.cooling.simNote"),
    sensors: [{ type: "ntc", interval: 1000 }],
    visible: ["T"], readouts: ["T", "R"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.cooling.tip") }],
  },
  {
    id: "humidity", topic: TOPIC.thermo, title: t("sensors.presets.humidity.title"), subtitle: t("sensors.presets.humidity.subtitle"),
    icon: Droplets, tone: "sky", sim: "breath", simNote: t("sensors.presets.humidity.simNote"),
    sensors: [{ type: "dht", interval: 2000 }],
    visible: ["RH", "T"], readouts: ["RH", "T", "Td"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.humidity.tip") }],
  },
  {
    id: "gpsmap", topic: TOPIC.field, title: t("sensors.presets.gpsmap.title"), subtitle: t("sensors.presets.gpsmap.subtitle"),
    icon: MapPinned, tone: "lime", sim: "walk", simNote: t("sensors.presets.gpsmap.simNote"),
    sensors: [{ type: "gps", interval: 2000 }, { type: "dht", interval: 2000 }],
    visible: ["T", "alt"], readouts: ["T", "RH", "sats", "s"],
    tips: [
      { title: t("sensors.presets.gpsmap.wirelessTitle"), tip: true, text: t("sensors.presets.gpsmap.wireless") },
      { title: t("sensors.presets.gpsmap.fixTitle"), tip: true, text: t("sensors.presets.gpsmap.fix") },
    ],
  },
  // --- sensori del telefono, senza Arduino
  {
    id: "phoneAcc", topic: TOPIC.tools, title: t("sensors.presets.phoneAcc.title"), subtitle: t("sensors.presets.phoneAcc.subtitle"),
    icon: Smartphone, tone: "lime", sim: "phone-pendulum",
    sensors: [{ type: "pmotion", interval: 20 }],
    visible: ["ax", "ay", "az"], readouts: ["am", "ay"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.phoneAcc.tip") }],
  },
  {
    id: "phoneGyro", topic: TOPIC.tools, title: t("sensors.presets.phoneGyro.title"), subtitle: t("sensors.presets.phoneGyro.subtitle"),
    icon: Rotate3d, tone: "sky", sim: "phone-turn",
    sensors: [{ type: "pmotion", interval: 20 }],
    visible: ["gz"], readouts: ["gz", "ax"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.phoneGyro.tip") }],
  },
  {
    id: "phoneSound", topic: TOPIC.tools, title: t("sensors.presets.phoneSound.title"), subtitle: t("sensors.presets.phoneSound.subtitle"),
    icon: AudioLines, tone: "rose", sim: "phone-sound",
    sensors: [{ type: "psound", interval: 50 }],
    visible: ["freq", "level"], readouts: ["freq", "level"],
    tips: [{ title: IDEA, tip: true, text: t("sensors.presets.phoneSound.tip") }],
  },
];
export const PRESET_TOPICS = [TOPIC.kinematics, TOPIC.thermo, TOPIC.field];
/** Esperimenti con i soli sensori del telefono: nella barra stanno tra gli strumenti. */
export const PHONE_PRESETS = PRESETS.filter((p) => p.topic === TOPIC.tools);
/** Argomenti chiusi all'inizio nella barra: il centro dell'app resta Arduino. */
export const COLLAPSED_TOPICS: string[] = [];
export const presetById = (id: string | null | undefined) => PRESETS.find((p) => p.id === id);

/** I sensori di un preset come istanze (pin e opzioni di partenza). */
export function presetSensors(p: Preset): SensorInstance[] {
  const taken = new Set<number>();
  return p.sensors.map((s) => {
    const inst = makeSensor(s.type, taken, { ...(s.interval ? { interval: s.interval } : {}), ...(s.options ? { options: s.options } : {}), ...(s.label ? { label: s.label } : {}) });
    if (s.pins) Object.assign(inst.pins, s.pins);
    inst.id = `${p.id}-${s.type}`;
    return inst;
  });
}

// ---------------------------------------------------------------------------
// Strumenti
// ---------------------------------------------------------------------------
export interface Instrument {
  id: string;
  kind: "scope" | "synth";
  source: "audio" | "arduino";
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  optionalLink?: boolean;
  sim?: string;
  wiring: WiringBlock[];
}

export const INSTRUMENTS: Instrument[] = [
  {
    id: "scope", kind: "scope", source: "audio", title: t("sensors.instruments.scope.title"), subtitle: t("sensors.instruments.scope.subtitle"), icon: AudioWaveform, tone: "lime",
    wiring: [{ title: t("sensors.instruments.scope.wiringTitle"), text: t("sensors.instruments.scope.wiring") }],
  },
  {
    id: "synth", kind: "synth", source: "arduino", optionalLink: true, title: "Synth", subtitle: t("sensors.instruments.synth.subtitle"),
    icon: Piano, tone: "saffron", sim: "hand",
    wiring: [{ title: t("sensors.instruments.synth.wiringTitle"), schematic: "hcsr04", pins: { trig: "D12", echo: "D11" }, text: t("sensors.instruments.synth.wiring") }],
  },
  {
    id: "escope", kind: "scope", source: "arduino", title: t("sensors.instruments.escope.title"), subtitle: t("sensors.instruments.escope.subtitle"), icon: Zap, tone: "sky", sim: "scope",
    wiring: [
      { title: t("sensors.instruments.escope.safeTitle"), warn: true, text: t("sensors.instruments.escope.safe") },
      { title: t("sensors.instruments.escope.micTitle"), schematic: "mic" },
      { title: t("sensors.instruments.escope.coilTitle"), schematic: "coil", text: t("sensors.instruments.escope.coil") },
    ],
  },
];
export const instrumentById = (id: string | null | undefined) => INSTRUMENTS.find((i) => i.id === id);
