import type { Tone } from "@/lib/sensors/types";

/** Sfondo delle piastrelle colorate (icone dei lab). */
export const toneBg: Record<Tone, string> = {
  lime: "bg-tone-lime",
  sky: "bg-tone-sky",
  rose: "bg-tone-rose",
  saffron: "bg-tone-saffron",
  violet: "bg-tone-violet",
  indigo: "bg-tone-indigo",
  teal: "bg-tone-teal",
  emerald: "bg-tone-emerald",
  orange: "bg-tone-orange",
  red: "bg-tone-red",
  fuchsia: "bg-tone-fuchsia",
  slate: "bg-tone-slate",
};

/** Colore dell'icona sulla piastrella: la stessa tinta, più intensa. */
export const toneFg: Record<Tone, string> = {
  lime: "text-tone-lime-fg",
  sky: "text-tone-sky-fg",
  rose: "text-tone-rose-fg",
  saffron: "text-tone-saffron-fg",
  violet: "text-tone-violet-fg",
  indigo: "text-tone-indigo-fg",
  teal: "text-tone-teal-fg",
  emerald: "text-tone-emerald-fg",
  orange: "text-tone-orange-fg",
  red: "text-tone-red-fg",
  fuchsia: "text-tone-fuchsia-fg",
  slate: "text-tone-slate-fg",
};

/** Pallino pieno del colore (selettore dei colori dei progetti). */
export const toneDot: Record<Tone, string> = {
  lime: "bg-tone-lime-fg",
  sky: "bg-tone-sky-fg",
  rose: "bg-tone-rose-fg",
  saffron: "bg-tone-saffron-fg",
  violet: "bg-tone-violet-fg",
  indigo: "bg-tone-indigo-fg",
  teal: "bg-tone-teal-fg",
  emerald: "bg-tone-emerald-fg",
  orange: "bg-tone-orange-fg",
  red: "bg-tone-red-fg",
  fuchsia: "bg-tone-fuchsia-fg",
  slate: "bg-tone-slate-fg",
};
