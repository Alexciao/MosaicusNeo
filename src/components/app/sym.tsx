// Simboli delle grandezze con i pedici: «_» seguito da un solo carattere è un pedice (a_z, ω_x),
// la stessa convenzione che sul canvas segue fillRich (src/lib/mosaicus/chart.js).

const SPLIT_RE = /_([A-Za-z0-9])(?![A-Za-z0-9])/;

/** Testo con i pedici resi come <sub> (es. "a_z (m/s²)"). */
export function Sym({ children, className }: { children: React.ReactNode; className?: string }) {
  if (typeof children !== "string") return className ? <span className={className}>{children}</span> : <>{children}</>;
  // split con un gruppo: [testo, pedice, testo, pedice, …, testo]
  const parts = children.split(new RegExp(SPLIT_RE.source, "g"));
  return <span className={className}>{parts.map((p, i) => (i % 2 ? <sub key={i}>{p}</sub> : p))}</span>;
}

/** Lo stesso testo in forma piana, per attributi (aria-label, title) e file esportati: a_z → az. */
export const plainSym = (s: string) => s.replace(new RegExp(SPLIT_RE.source, "g"), "$1");
