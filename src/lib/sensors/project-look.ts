// MosaicusNeo — aspetto dei miei progetti nella barra dei lab: un colore e un'icona a scelta.
// Gli esperimenti pronti hanno il colore del loro argomento (TOPIC_TONE in presets.ts).

import type { LucideIcon } from "lucide-react";
import {
  Activity, Atom, Battery, Bike, Car, Compass, Droplets, Flame, FlaskConical, Gauge, HeartPulse, Hourglass,
  Leaf, Lightbulb, Magnet, Microscope, Music, Orbit, Radio, Rocket, Ruler, Satellite, Scale, Snowflake, Sun,
  Telescope, Thermometer, Timer, Waves, Wind, Wrench, Zap,
} from "lucide-react";
import type { Rig } from "./rig";
import type { Tone } from "./types";

/** Icone tra cui scegliere (la chiave si salva nel progetto). */
export const PROJECT_ICONS = {
  wrench: Wrench, flask: FlaskConical, atom: Atom, microscope: Microscope, magnet: Magnet, zap: Zap,
  battery: Battery, lightbulb: Lightbulb, thermometer: Thermometer, flame: Flame, snowflake: Snowflake, sun: Sun,
  wind: Wind, droplets: Droplets, waves: Waves, activity: Activity, music: Music, radio: Radio,
  gauge: Gauge, ruler: Ruler, scale: Scale, timer: Timer, hourglass: Hourglass, compass: Compass,
  rocket: Rocket, orbit: Orbit, satellite: Satellite, telescope: Telescope, car: Car, bike: Bike,
  heart: HeartPulse, leaf: Leaf,
} satisfies Record<string, LucideIcon>;
export type ProjectIconKey = keyof typeof PROJECT_ICONS;
export const isProjectIcon = (k: unknown): k is ProjectIconKey => typeof k === "string" && k in PROJECT_ICONS;
export const PROJECT_TONES: Tone[] = [
  "violet", "indigo", "sky", "teal", "emerald", "lime",
  "saffron", "orange", "red", "rose", "fuchsia", "slate",
];
export const DEFAULT_PROJECT_TONE: Tone = "violet";
export const DEFAULT_PROJECT_ICON: ProjectIconKey = "wrench";

export const projectTone = (r?: Pick<Rig, "tone"> | null): Tone => (r?.tone && PROJECT_TONES.includes(r.tone) ? r.tone : DEFAULT_PROJECT_TONE);
export const projectIcon = (r?: Pick<Rig, "icon"> | null): LucideIcon => (isProjectIcon(r?.icon) ? PROJECT_ICONS[r.icon] : Wrench);
