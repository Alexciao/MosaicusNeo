import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MosaicusNeo · micro-laboratorio di fisica",
    short_name: "MosaicusNeo",
    description:
      "Esperimenti di fisica con Arduino e i sensori del telefono: grafici in tempo reale, analisi dei dati, esportazione in Excel. Funziona anche offline.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
