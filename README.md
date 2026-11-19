# MosaicusNeo

Micro-laboratorio di fisica nel browser con **Arduino**: scegli i sensori che hai collegato, l'app ti mostra come collegarli, li legge tutti insieme con un unico firmware e li mette sugli stessi grafici. Poi analisi dei dati (retta a occhio, tangente, fit con incertezze e verifica dei residui, righello), mappa per le misure all'aperto, esportazione in Excel, CSV, GPX e GeoJSON. Funziona anche senza rete e si installa come app (PWA).

MosaicusNeo nasce da [Mosaicus](https://ermesfrosi.it) di Ermes Ferdinando Rosi (licenza MIT): migrato a **Next.js + React + shadcn/ui**, ridisegnato, con un sistema a sensori modulare, il Bluetooth per lavorare sul campo e gli account facoltativi per ritrovare i dati su tutti i dispositivi.

## Sensori ed esperimenti

Il cuore dell'app è il **montaggio**: fino a 6 sensori su un Arduino Uno, anche dello stesso tipo, ognuno sui pin che preferisci e con il suo ritmo di lettura. L'app controlla i pin (doppi, analogici, D0/D1 riservati alla seriale), mostra la mappa dei pin e uno schema per ogni sensore.

| Sensore | Pin | Grandezze |
|---|---|---|
| Termistore NTC (partitore) | A0…A5 | T, ln(T − Tₐ), R |
| DHT11 / DHT22 | digitale | T, umidità relativa, punto di rugiada, umidità assoluta |
| Ultrasuoni HC-SR04 | TRIG + ECHO | posizione, velocità, accelerazione |
| GPS NEO-6M/7M (VMA430 / WPI430) | RX (+ TX) | posizione, altitudine, velocità, distanza percorsa |
| Fotoresistenza (partitore) | A0…A5 | luminosità relativa |
| Tensione analogica 0–5 V | A0…A5 | V, o una grandezza tarata y = k·V + q |

Gli **esperimenti pronti** sono montaggi già pensati per una lezione (Moto rettilineo, Moto armonico, Raffreddamento, Umidità e temperatura, Mappa della temperatura): si aprono e funzionano subito, e si possono modificare (le modifiche diventano una versione personale, ripristinabile). In **I miei montaggi** si compongono montaggi liberi. Gli **strumenti** (oscilloscopio audio, oscilloscopio elettrico su A0, synth) hanno un pannello proprio.

Con più sensori a ritmi diversi ogni lettura conserva il suo istante; quando servono insieme (mappa, invio a Elaborazione) le grandezze degli altri sensori vengono interpolate sui tempi del sensore scelto. Ogni montaggio funziona anche con il **simulatore**, senza hardware.

## Firmware

Un solo sketch: [`firmware/mosaicusneo_firmware/mosaicusneo_firmware.ino`](firmware/mosaicusneo_firmware/mosaicusneo_firmware.ino) (v1.1), da caricare una volta con l'IDE di Arduino. L'app configura il montaggio con comandi seriali (115200 baud) e il firmware invia solo dati grezzi (conteggi ADC, tempi di volo, i byte del DHT, i campi NMEA del GPS): le conversioni avvengono nell'app, dove si vedono e si tarano.

```
CFG,CLEAR                                          → #ACK,CFG,CLEAR
CFG,ADD,<slot>,<NTC|ANA|DHT|SONAR|GPS>,<ms>,<pinA>,<pinB>,<opz>
                                                   → #ACK,CFG,ADD,<slot> | #ERR,CFG,<slot>,<motivo>
START                                              → #ACK,START, poi D,<slot>,<t_ms>,<valori…>
STOP · START,SCOPE,… (oscilloscopio) · BT,SETUP (HC-06) · BT,SETUP,BLE (HM-10, AT-09, HC-08) · ID?
```

Pin come numeri (A0 = 14 … A5 = 19); tempi con risoluzione di 1 µs e orologio a 64 bit (nessun azzeramento dopo 71 minuti).

## Sul campo: Arduino + Bluetooth + telefono

Due tipi di modulo, collegati allo stesso modo (TXD → D0, RXD ← D1 tramite partitore 1 kΩ/2 kΩ, in parallelo al cavo USB) e con lo stesso protocollo del cavo:

| | HC-06 (Bluetooth classico) | BLE: HM-10, AT-09 / BT05, HC-08 |
|---|---|---|
| Android | Chrome 138+ (Web Serial su RFCOMM) | Chrome (Web Bluetooth) |
| iPhone / iPad | no (iOS non espone il Bluetooth seriale classico) | sì, nel browser Bluefy (Web Bluetooth) |
| Computer | se associato prima | Chrome, Edge |
| Configurazione | «Configura HC-06» (`BT,SETUP`), poi associa (PIN 1234) | «Configura modulo BLE» (`BT,SETUP,BLE`), nessuna associazione |

La configurazione (nome «MosaicusNeo», 115200 baud) si fa una volta, con Arduino collegato via USB: scheda «Collegamenti» → «Senza cavo: Bluetooth». Mentre carichi lo sketch stacca il filo TXD da D0. Sul campo: power bank su Arduino, «Collega» (menu ▾ per scegliere il Bluetooth LE), «Avvia»; lo schermo resta acceso e il Quaderno si salva ogni 30 s.

Safari non ha né Web Serial né Web Bluetooth: su iPhone e iPad serve un modulo BLE e il browser Bluefy.

## Account e cloud (facoltativi)

Senza account tutto resta nel browser (IndexedDB) e l'app funziona offline. Con un account (email e password, via Supabase) misure, riquadri, montaggi e preferenze dei lab si sincronizzano tra i dispositivi: archivio *local-first*, vince la modifica più recente, le cancellazioni arrivano agli altri dispositivi, Row Level Security. Lo schema è in [`supabase/migrations`](supabase/migrations); per attivare il cloud servono le variabili di [`.env.example`](.env.example).

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run typecheck
```

```
firmware/                       sketch Arduino (copiato in public/ a ogni build)
src/lib/sensors/                catalogo dei sensori, montaggio, preset, grandezze, simulatore
src/lib/lab-store.ts            pagina Misura: collegamento, protocollo, dati, sessioni, export
src/lib/workbench-store.ts      riquadri di Elaborazione ed export Excel
src/lib/cloud/                  account Supabase, archivio local-first, sincronizzazione
src/lib/mosaicus/               motori: fit, DSP, grafici su canvas, formule, XLSX, seriale, audio
src/components/app/             pagina Misura, editor del montaggio, schemi generati, guida, mappa
src/components/workbench/       pagina Elaborazione
src/components/instruments/     oscilloscopio e synth
supabase/migrations/            schema del database
```

## Licenza

MIT — © 2026 Ermes Ferdinando Rosi (Mosaicus). Vedi [LICENSE](LICENSE) e [NOTICE.txt](NOTICE.txt).
