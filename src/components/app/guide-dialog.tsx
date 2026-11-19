"use client";

import { useState } from "react";
import { Cpu, Download, Laptop, MonitorSmartphone, Presentation, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_VERSION, FIRMWARE_URL, FIRMWARE_VERSION } from "@/lib/version";

const MEASURE = [
  ["Scegli il lab", "Un esperimento pronto o un tuo montaggio, nell'elenco a sinistra (sul telefono: «Lab», nella barra in basso). Nella scheda «Sensori» scegli sensori e pin, in «Collegamenti» vedi come collegarli."],
  ["Collega", "Arduino con il cavo → «Collega Arduino». Il telefono → «Attiva sensori». Senza niente → «Simulatore»."],
  ["Avvia e ferma", "«Avvia», guarda i punti arrivare, poi «Ferma». La misura si salva da sola nel Quaderno."],
  ["Scegli un tratto", "Trascina sul grafico: il tratto si colora. Pizzico o Ctrl + rotella per lo zoom, doppio clic per annullare."],
  ["Invialo", "«Invia a Elaborazione», poi passa alla pagina Elaborazione."],
];
const ANALYSE = [
  ["Il riquadro", "Ogni tratto diventa un riquadro. Sopra scegli cosa mettere sugli assi x e y."],
  ["Retta a occhio", "Muovi le due maniglie finché la retta passa in mezzo ai punti, poi leggi la pendenza Δy/Δx. Alla fine il confronto con il computer."],
  ["Fit", "Scegli un modello (retta, parabola, esponenziale, sinusoide…): il computer trova la curva migliore e ti dà la grandezza fisica con la sua incertezza."],
  ["Righello", "Sulle onde: metti le due linee su due creste e conta i periodi N tra le due. T = Δt / N, f = 1 / T."],
  ["Salva ed esporta", "«Salva» il risultato, spunta i riquadri, «Esporta in Excel»."],
];

const FIELD = [
  ["Collega i moduli", "GPS VMA430: TX → D4. HC-06: TXD → D0, RXD ← D1 con il partitore 1 kΩ / 2 kΩ. DHT11: DATA → D2. Tutti a 5 V e GND (i pin si possono cambiare nella scheda «Sensori»; schema in «Collegamenti»)."],
  ["Configura l'HC-06 (una volta)", "Arduino al computer con il cavo, «Collega Arduino», poi nella scheda «Collegamenti» → «Configura HC-06». Mentre carichi il firmware dall'IDE stacca il filo TXD dell'HC-06."],
  ["Associa il telefono", "Android, impostazioni Bluetooth: associa «MosaicusNeo» (PIN 1234). Alimenta Arduino con un power bank."],
  ["Misura camminando", "Chrome su Android → lab «Mappa della temperatura» → «Collega via Bluetooth» → scegli MosaicusNeo → «Avvia». Lo schermo resta acceso; il Quaderno si salva ogni 30 s."],
  ["Analizza o esporta", "Mappa colorata e grafici subito. Poi Excel, CSV, GPX (Strava, Google Earth) o GeoJSON (QGIS), oppure «Invia a Elaborazione» per i fit, per esempio T in funzione dell'altitudine."],
];

function Steps({ items }: { items: string[][] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map(([t, d], i) => (
        <li key={t} className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span>
          <div><p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p></div>
        </li>
      ))}
    </ol>
  );
}

export function GuideDialog({ trigger }: { trigger: React.ReactElement }) {
  const [tab, setTab] = useState("misura");
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Come si usa MosaicusNeo</DialogTitle>
          <DialogDescription>Micro-laboratorio di fisica: Arduino, sensori del telefono, suono. Funziona anche senza rete.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList className="w-full">
            <TabsTrigger value="misura">Misura</TabsTrigger>
            <TabsTrigger value="elab">Elabora</TabsTrigger>
            <TabsTrigger value="field">Sul campo</TabsTrigger>
            <TabsTrigger value="setup">Che cosa serve</TabsTrigger>
          </TabsList>
          <TabsContent value="misura" className="pt-3"><Steps items={MEASURE} /></TabsContent>
          <TabsContent value="elab" className="pt-3"><Steps items={ANALYSE} /></TabsContent>
          <TabsContent value="field" className="flex flex-col gap-3 pt-3">
            <Steps items={FIELD} />
            <p className="text-xs text-muted-foreground">Serve Chrome 138 o successivo su Android: iPhone non può usare il Bluetooth seriale dell&apos;HC-06.</p>
          </TabsContent>
          <TabsContent value="setup" className="flex flex-col gap-4 pt-3">
            <ul className="flex flex-col gap-2.5 text-sm">
              <li className="flex gap-2.5"><Laptop className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><b>Computer</b> · Chrome o Edge: servono per parlare con Arduino (Web Serial).</span></li>
              <li className="flex gap-2.5"><Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><b>Telefono</b> · Chrome o Safari: usa i sensori del telefono, senza Arduino. Si può installare come app.</span></li>
              <li className="flex gap-2.5"><Cpu className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><b>Arduino Uno</b> · con il firmware MosaicusNeo, da caricare una volta con l&apos;IDE di Arduino.</span></li>
              <li className="flex gap-2.5"><Presentation className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><b>LIM</b> · il pulsante con la lavagna ingrandisce testi e grafici.</span></li>
            </ul>
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="mb-2 text-sm font-semibold">Firmware Arduino v{FIRMWARE_VERSION}</p>
              <p className="mb-3 text-sm text-muted-foreground">
                Uno solo per tutti i lab: termistore (A0), HC-SR04 (pin 12 e 11), DHT11/DHT22 (pin 2), GPS (pin 4), Bluetooth HC-06 (pin 0 e 1), oscilloscopio (A0).
                Aprilo con l&apos;IDE di Arduino, scegli la scheda «Arduino Uno» e premi «Carica».
              </p>
              <Button render={<a href={FIRMWARE_URL} download="mosaicusneo_firmware.ino" />} size="sm">
                <Download /> Scarica mosaicusneo_firmware.ino
              </Button>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-semibold"><MonitorSmartphone className="size-4" />Installala come app</p>
              <p className="text-muted-foreground">Dal menu ⋮ del browser (Android, computer) o da «Condividi» su iPhone: «Installa app» o «Aggiungi alla schermata Home». Da quel momento funziona anche senza rete.</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Il microfono serve solo a misurare il suono: l&apos;audio non viene registrato né inviato. Le misure restano in questo browser.
              MosaicusNeo v{APP_VERSION} · basato su Mosaicus (© 2026 Ermes Ferdinando Rosi) · software libero con licenza MIT ·{" "}
              <a className="underline" href="https://github.com/Alexciao/MosaicusNeo" target="_blank" rel="noopener">codice sorgente</a>
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
