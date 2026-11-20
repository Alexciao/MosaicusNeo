"use client";
// Il marchio di MosaicusNeo: una tessera esagonale (il mosaico) con la traccia di una misura che sale
// disegnata in lime dentro il ritaglio. Su una griglia di 24, come un'icona: la tessera prende
// currentColor, la traccia --logo-accent (con accent={false} resta solo il ritaglio: marchio a un colore).
// Gli stessi disegni stanno in public/icons/mark.svg e mark-mono.svg
// (file da riusare) e nella favicon (src/app/icon.svg).

import { useId } from "react";

export const LOGO_HEX =
  "M12 1.6a1.6 1.6 0 0 1 .8.21l8.2 4.74a1.6 1.6 0 0 1 .8 1.39v9.12a1.6 1.6 0 0 1-.8 1.39l-8.2 4.74a1.6 1.6 0 0 1-1.6 0L3 18.45a1.6 1.6 0 0 1-.8-1.39V7.94a1.6 1.6 0 0 1 .8-1.39l8.2-4.74A1.6 1.6 0 0 1 12 1.6Z";
/** la traccia: ritagliata dalla tessera e, dentro il ritaglio, ridisegnata in lime */
export const LOGO_TRACE = "m6.9 15.3 3-3.5 3 2 3.1-4.4";

/** title: nome accessibile; senza, il marchio è decorativo (accanto c'è già la scritta).
 *  accent={false}: solo il ritaglio, marchio a un colore. */
export function LogoMark({ className, title, size, accent = true }: { className?: string; title?: string; size?: number; accent?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <mask id={`m${id}`} maskUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="#fff" />
        <path d={LOGO_TRACE} fill="none" stroke="#000" strokeWidth={accent ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <path d={LOGO_HEX} fill="currentColor" mask={`url(#m${id})`} />
      {accent && <path d={LOGO_TRACE} fill="none" stroke="var(--logo-accent, #65a30d)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
