// Il marchio di MosaicusNeo: una tessera esagonale (il mosaico) con la traccia di una misura che sale.
// Un solo colore (currentColor), su una griglia di 24: si colora e si dimensiona come un'icona.
// Lo stesso disegno sta in public/icons/mark.svg (file da riusare) e nella favicon (src/app/icon.svg).

export const LOGO_PATH =
  "M12 1.6a1.6 1.6 0 0 1 .8.21l8.2 4.74a1.6 1.6 0 0 1 .8 1.39v9.12a1.6 1.6 0 0 1-.8 1.39l-8.2 4.74a1.6 1.6 0 0 1-1.6 0L3 18.45a1.6 1.6 0 0 1-.8-1.39V7.94a1.6 1.6 0 0 1 .8-1.39l8.2-4.74A1.6 1.6 0 0 1 12 1.6Zm4.95 6.7a1 1 0 0 0-1.4.25l-2.4 3.5-2.4-1.6a1 1 0 0 0-1.3.17l-3 3.5a1 1 0 1 0 1.5 1.3l2.42-2.82 2.53 1.69a1 1 0 0 0 1.38-.27l3-4.33a1 1 0 0 0-.33-1.39Z";

/** title: nome accessibile; senza, il marchio è decorativo (accanto c'è già la scritta). */
export function LogoMark({ className, title, size }: { className?: string; title?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path fillRule="evenodd" d={LOGO_PATH} />
    </svg>
  );
}
