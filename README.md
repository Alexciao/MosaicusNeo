# Mosaicus

Micro-laboratorio di fisica nel browser: esperimenti con **Arduino**, con i **sensori del telefono** e con il **suono**. Grafici in tempo reale, oscilloscopio, synth, analisi dei dati (retta a occhio, tangente, fit con incertezze, righello) ed esportazione in Excel. Funziona anche senza rete e si installa come app (PWA).

Questa è la versione "Neo": l'app Mosaicus di [ermesfrosi.it](https://ermesfrosi.it) migrata a **Next.js + React + shadcn/ui**, ridisegnata, con il nuovo lab **Umidità e temperatura** (sensore DHT11 / DHT22).

## Lab

| Argomento | Lab | Sensore |
|---|---|---|
| Cinematica | Moto rettilineo, Moto armonico | HC-SR04 (pin 12, 11) |
| Termologia | Raffreddamento | Termistore NTC su A0 |
| Termologia | **Umidità e temperatura** (punto di rugiada, umidità assoluta) | **DHT11 / DHT22 su D2** |
| Onde e suono | Oscilloscopio, Synth, Frequenza nel tempo | Microfono del dispositivo, HC-SR04 facoltativo |
| Elettromagnetismo | Oscilloscopio elettrico | Tensione 0–5 V su A0 |

Ogni lab funziona anche con il **simulatore**, senza hardware.

## Firmware

Un solo sketch per tutti i lab: [`firmware/mosaicus_firmware/mosaicus_firmware.ino`](firmware/mosaicus_firmware/mosaicus_firmware.ino) (v0.3). Si carica una volta con l'IDE di Arduino su un Arduino Uno; poi è l'app a scegliere l'esperimento con comandi seriali (115200 baud). Il firmware invia solo dati grezzi (conteggi ADC, tempi di volo, i byte del DHT): le conversioni avvengono nell'app, dove si vedono e si tarano.

DHT11/DHT22: `START,DHT,<intervallo_ms>,<11|22>` → `H,<t_ms>,<b0>,<b1>,<b2>,<b3>,<err>`. La lettura è a bit-bang, senza librerie esterne. Il modulo a 3 pin ha già il pull-up; il sensore a 4 pin vuole 10 kΩ tra DATA e 5 V.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build di produzione
npm run lint
npm run typecheck
```

Il collegamento con Arduino usa la Web Serial API (Chrome o Edge su computer); i sensori del telefono e il microfono richiedono HTTPS (o `localhost`).

## Struttura

```
firmware/                       sketch Arduino (copiato in public/ a ogni build)
src/app/                        layout, manifest, icone
src/components/app/             pagina Misura: intestazione, lab, grafici, parametri, quaderno
src/components/workbench/       pagina Elaborazione: riquadri, strumenti, foglio dei dati
src/components/instruments/     oscilloscopio e synth
src/components/ui/              componenti shadcn/ui
src/lib/lab-store.ts            stato e logica della misura (collegamento, protocollo, sessioni)
src/lib/workbench-store.ts      riquadri di Elaborazione ed export Excel
src/lib/mosaicus/               motori senza interfaccia: esperimenti, fit, DSP, grafici su canvas,
                                formule, XLSX, seriale, telefono, simulatore, audio
public/sw.js                    service worker per l'uso offline
```

## Deploy

Il progetto è collegato a Vercel: ogni push su `main` viene pubblicato in produzione, ogni altro branch ha un'anteprima.

## Licenza

MIT — © 2026 Ermes Ferdinando Rosi. Vedi [LICENSE](LICENSE) e [NOTICE.txt](NOTICE.txt).
