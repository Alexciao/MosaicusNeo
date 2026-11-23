import * as React from "react"

import { PANEL_DOCK_QUERY, panelDocked } from "@/lib/lab-panel"

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(PANEL_DOCK_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/** Il pannello della pagina Lab è agganciato a destra (schermi larghi)? */
export function usePanelDocked() {
  return React.useSyncExternalStore(subscribe, panelDocked, () => false)
}
