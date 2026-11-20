// MosaicusNeo — tipi condivisi del sistema a sensori.

export type Row = Record<string, number | boolean | string> & { t: number };
export type Options = Record<string, number | string>;
export type Tone = "lime" | "sky" | "rose" | "saffron" | "violet";

export interface Param {
  key: string;
  label: string;
  unit?: string;
  value: number | string;
  min?: number;
  step?: number;
  advanced?: boolean;
  type?: "number" | "select" | "text";
  options?: [string, string][];
}

export type Schematic = "hcsr04" | "ntc" | "mic" | "coil" | "dht" | "gps" | "analog" | "ldr" | "hc06";
export interface WiringBlock { title: string; text?: string; schematic?: Schematic; pins?: Record<string, string>; warn?: boolean; tip?: boolean }
