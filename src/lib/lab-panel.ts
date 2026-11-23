// Il pannello di destra della pagina Lab (componenti, collegamenti, seriale).
// Da xl in su è una barra laterale: la pagina occupa la finestra e ogni colonna scorre per conto suo.
// Sotto xl il pannello sta in coda alla misura e scorre la finestra.

/** Da qui in su il pannello è agganciato a destra (il punto di rottura xl di Tailwind: classi «xl:»). */
export const PANEL_DOCK_QUERY = "(min-width: 80rem)";
export const PANEL_ID = "side-panel";
/** La colonna centrale, che da xl in su scorre da sola. */
export const LAB_SCROLL_ID = "lab-scroll";

export const panelDocked = () => typeof window !== "undefined" && window.matchMedia(PANEL_DOCK_QUERY).matches;
