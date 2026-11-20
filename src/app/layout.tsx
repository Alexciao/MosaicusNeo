import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mosaicusneo.alexcorazza.com"),
  title: "MosaicusNeo · physics micro-lab",
  description:
    "Physics experiments with Arduino and your phone's sensors: real-time charts, oscilloscope, synth, data analysis, Excel export. Works offline too.",
  applicationName: "MosaicusNeo",
  appleWebApp: { capable: true, title: "MosaicusNeo", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // con la barra di stato traslucida (iPhone, app installata) la pagina passa sotto la tacca:
  // le barre in alto e in basso aggiungono i margini di sicurezza (env(safe-area-inset-*))
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
