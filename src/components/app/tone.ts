import type { Tone } from "@/lib/sensors/types";

/** Sfondo delle piastrelle colorate (icone dei lab). */
export const toneBg: Record<Tone, string> = {
  lime: "bg-tone-lime",
  sky: "bg-tone-sky",
  rose: "bg-tone-rose",
  saffron: "bg-tone-saffron",
  violet: "bg-tone-violet",
};

/** Colore dell'icona sulla piastrella: la stessa tinta, più intensa. */
export const toneFg: Record<Tone, string> = {
  lime: "text-tone-lime-fg",
  sky: "text-tone-sky-fg",
  rose: "text-tone-rose-fg",
  saffron: "text-tone-saffron-fg",
  violet: "text-tone-violet-fg",
};

/** Pallino pieno del colore (selettore dei colori dei progetti). */
export const toneDot: Record<Tone, string> = {
  lime: "bg-tone-lime-fg",
  sky: "bg-tone-sky-fg",
  rose: "bg-tone-rose-fg",
  saffron: "bg-tone-saffron-fg",
  violet: "bg-tone-violet-fg",
};
