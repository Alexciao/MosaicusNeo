"use client";
// Schede «a pillola» con l'indicatore che scivola sotto la scheda attiva.
// L'indicatore è un solo elemento assoluto: si sposta con transform e cambia larghezza,
// senza ridisegnare React (la posizione si scrive direttamente nello stile).

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface GlideItem { id: string; content: React.ReactNode; onSelect: () => void; label?: string }

export function GlideNav({ label, value, items, className, size = "md" }: {
  label: string; value: string; items: GlideItem[]; className?: string; size?: "sm" | "md";
}) {
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const btns = useRef(new Map<string, HTMLButtonElement>());
  const ids = items.map((i) => i.id).join("|");

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    const place = () => {
      const el = btns.current.get(value);
      if (!el) { pill.style.opacity = "0"; return; }
      pill.style.opacity = "1";
      pill.style.width = `${el.offsetWidth}px`;
      pill.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    place();
    // dal secondo posizionamento in poi, scivola
    const raf = requestAnimationFrame(() => pill.dataset.ready = "");
    // la larghezza delle schede cambia (numeri, carattere caricato, modalità LIM): si riallinea
    const ro = new ResizeObserver(place);
    btns.current.forEach((b) => ro.observe(b));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [value, ids]);

  return (
    <nav ref={navRef} aria-label={label} className={cn("relative isolate flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}>
      <span ref={pillRef} aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0 -z-10 rounded-md bg-background shadow-sm ring-1 ring-border will-change-transform data-ready:transition-[transform,width] data-ready:duration-300 data-ready:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:bg-secondary" />
      {items.map((it) => (
        <button key={it.id} type="button" aria-label={it.label}
          ref={(el) => { if (el) btns.current.set(it.id, el); else btns.current.delete(it.id); }}
          onClick={it.onSelect}
          aria-current={value === it.id ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm",
            value === it.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}>
          {it.content}
        </button>
      ))}
    </nav>
  );
}
