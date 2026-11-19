// MosaicusNeo — esperimenti pronti (preset) e strumenti.
//
// Un esperimento è un montaggio di sensori già pensato per un'attività: sensori e pin
// predefiniti, grafici e letture da mostrare, idee per la lezione, scenario del simulatore.
// Si può aprire e modificare (pin, opzioni, sensori in più); le modifiche restano sue.
// Gli strumenti (oscilloscopi, synth) hanno un pannello proprio: non sono serie di sensori.

import type { LucideIcon } from "lucide-react";
import { AudioWaveform, Droplets, MapPinned, MoveRight, Piano, Thermometer, WavesHorizontal, Zap } from "lucide-react";
import type { SensorType } from "./catalog";
import { makeSensor, type SensorInstance } from "./rig";
import type { Options, Tone, WiringBlock } from "./types";

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
    id: "motion", topic: "Cinematica", title: "Moto rettilineo", subtitle: "Uniforme e accelerato · HC-SR04",
    icon: MoveRight, tone: "sky", sim: "incline",
    sensors: [{ type: "sonar", interval: 50 }],
    visible: ["x", "v", "a"], readouts: ["x", "v"],
    tips: [{ title: "Idea", tip: true, text: "Carrello su un piano inclinato, bersaglio piatto tra 5 cm e 1 m dal sensore. Con il fit della parabola su x(t) trovi l'accelerazione." }],
  },
  {
    id: "harmonic", topic: "Cinematica", title: "Moto armonico", subtitle: "Oscillazioni · HC-SR04",
    icon: WavesHorizontal, tone: "rose", sim: "spring",
    sensors: [{ type: "sonar", interval: 50, options: { window: 2 } }],
    visible: ["x", "v", "a"], readouts: ["x", "v"],
    tips: [{ title: "Idea", tip: true, text: "Massa appesa a una molla, sensore a terra, cartoncino sotto la massa. Fit con la sinusoide smorzata: periodo e smorzamento." }],
  },
  {
    id: "cooling", topic: "Termologia", title: "Raffreddamento", subtitle: "Legge di Newton · termistore NTC",
    icon: Thermometer, tone: "rose", sim: "cooling", simNote: "tempo ×30",
    sensors: [{ type: "ntc", interval: 1000 }],
    visible: ["T"], readouts: ["T", "R"],
    tips: [{ title: "Idea", tip: true, text: "Termistore in una patata calda (o in acqua calda), poi lascialo raffreddare. Fit esponenziale con asintoto, oppure retta su ln(T − Tₐ)." }],
  },
  {
    id: "humidity", topic: "Termologia", title: "Umidità e temperatura", subtitle: "Punto di rugiada · DHT11",
    icon: Droplets, tone: "sky", sim: "breath", simNote: "tempo ×5",
    sensors: [{ type: "dht", interval: 2000 }],
    visible: ["RH", "T"], readouts: ["RH", "T", "Td"],
    tips: [{ title: "Idea", tip: true, text: "Soffia sul sensore: l'umidità sale di colpo e torna giù lentamente. Con un fit esponenziale misuri il tempo caratteristico." }],
  },
  {
    id: "gpsmap", topic: "Sul campo", title: "Mappa della temperatura", subtitle: "GPS + DHT11 · telefono via Bluetooth",
    icon: MapPinned, tone: "lime", sim: "walk", simNote: "passeggiata, tempo ×5",
    sensors: [{ type: "gps", interval: 2000 }, { type: "dht", interval: 2000 }],
    visible: ["T", "alt"], readouts: ["T", "RH", "sats", "s"],
    tips: [
      { title: "Senza cavo: Bluetooth", tip: true, text: "Con l'HC-06 (vedi «Bluetooth» qui sotto) e un power bank, Arduino si collega al telefono Android: Chrome → «Collega via Bluetooth». Lo schermo resta acceso durante la misura e il Quaderno si salva ogni 30 s." },
      { title: "Il primo fix", tip: true, text: "All'aperto il GPS trova i satelliti in 30 s – qualche minuto. I punti senza posizione restano nella tabella ma non vanno sulla mappa." },
    ],
  },
];
export const PRESET_TOPICS = ["Cinematica", "Termologia", "Sul campo"];
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
    id: "scope", kind: "scope", source: "audio", title: "Oscilloscopio", subtitle: "Guarda la forma di un suono", icon: AudioWaveform, tone: "lime",
    wiring: [{ title: "Microfono del dispositivo", text: "Telefono o computer: non serve altro. L'audio non viene registrato né inviato." }],
  },
  {
    id: "synth", kind: "synth", source: "arduino", optionalLink: true, title: "Synth", subtitle: "Crea un suono e suonalo: tastiera, dito, telefono, HC-SR04",
    icon: Piano, tone: "saffron", sim: "hand",
    wiring: [{ title: "Con Arduino (facoltativo)", schematic: "hcsr04", pins: { trig: "D12", echo: "D11" }, text: "HC-SR04 con TRIG su D12 ed ECHO su D11, rivolto verso l'alto: la mano sopra tra 5 e 50 cm." }],
  },
  {
    id: "escope", kind: "scope", source: "arduino", title: "Oscilloscopio elettrico", subtitle: "Guarda una tensione su A0: microfono, bobina", icon: Zap, tone: "sky", sim: "scope",
    wiring: [
      { title: "Solo 0–5 V", warn: true, text: "Mai la rete elettrica. Il segnale va su A0." },
      { title: "Microfono del kit", schematic: "mic" },
      { title: "Bobina e magnete", schematic: "coil", text: "Fai cadere il magnete nella bobina, trigger singolo." },
    ],
  },
];
export const instrumentById = (id: string | null | undefined) => INSTRUMENTS.find((i) => i.id === id);
