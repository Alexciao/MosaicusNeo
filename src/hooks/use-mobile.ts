import * as React from "react"

/** Telefono: sotto i 768 px. La barra laterale dei lab usa invece 1024 (lg). */
const MOBILE_BREAKPOINT = 768

/** La larghezza della finestra è sotto il punto di rottura? (false durante il rendering sul server) */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const query = `(max-width: ${breakpoint - 1}px)`
  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
