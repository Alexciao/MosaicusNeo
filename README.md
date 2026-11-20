# MosaicusNeo

**App:** [mosaicusneo.alexcorazza.com](https://mosaicusneo.alexcorazza.com)

Micro-laboratorio di fisica nel browser con **Arduino**: scegli i sensori che hai collegato, l'app ti mostra come collegarli, li legge tutti insieme con un unico firmware e li mette sugli stessi grafici. Poi analisi dei dati (retta a occhio, tangente, fit con incertezze e verifica dei residui, righello), mappa per le misure all'aperto, esportazione in Excel, CSV, GPX e GeoJSON. Funziona anche senza rete e si installa come app (PWA).

MosaicusNeo nasce da [Mosaicus](https://ermesfrosi.it) di Ermes Ferdinando Rosi (licenza MIT): migrato a **Next.js + React + shadcn/ui**, ridisegnato, con un sistema a sensori modulare, il Bluetooth per lavorare sul campo e gli account facoltativi per ritrovare i dati su tutti i dispositivi.

## Sensori ed esperimenti

Il cuore dell'app è il **progetto**: fino a 6 sensori su un Arduino Uno, anche dello stesso tipo, ognuno sui pin che preferisci e con il suo ritmo di lettura. L'app controlla i pin (doppi, analogici, D0/D1 riservati alla seriale), e genera la guida ai collegamenti. Tutto è un componente, e il catalogo li divide per che cosa fanno: **sensori** (gli ingressi), **comandi** (pulsante), **display, LED e suoni** (le uscite), **memoria** (scheda SD), **Bluetooth** e **telefono**, con ricerca, argomenti e disegni dei moduli. Ogni componente entra nello schema, nell'occorrente e nei passi.

| Sensore | Pin | Grandezze |
|---|---|---|
| Termistore NTC (partitore) | A0…A5 | T, ln(T − Tₐ), R |
| DHT11 / DHT22 | digitale | T, umidità relativa, punto di rugiada, umidità assoluta |
| Ultrasuoni HC-SR04 | TRIG + ECHO | posizione, velocità, accelerazione |
| GPS NEO-6M/7M (VMA430 / WPI430) | RX (+ TX) | posizione, altitudine, velocità, distanza percorsa |
| Fotoresistenza (partitore) | A0…A5 | luminosità relativa |
| Tensione analogica 0–5 V | A0…A5 | V, o una grandezza tarata y = k·V + q |
| Sonda DS18B20 (anche impermeabile) | digitale + 4,7 kΩ | T (±0,5 °C, −55…125 °C) |
| Fotocellula / ingresso digitale | digitale (D2/D3: istanti al µs) | stato, passaggi, periodo, tempo di oscuramento, velocità |
| Cella di carico + HX711 | DT + SCK | massa, forza |
| Accelerometro MPU-6050 (GY-521) | SDA + SCL (I2C) | aₓ, aᵧ, a_z, \|a\|, velocità angolari |
| Termometro a infrarossi MLX90614 (GY-906) | SDA + SCL (I2C) | T della superficie senza contatto (corretta per l'emissività), T del sensore |

**Display, LED e cicalino** (facoltativi, fuori dai 6 posti dei sensori): display OLED 64×32 da 0,49" (I2C), LED RGB, cicalino attivo o passivo. Li comanda Arduino da solo: blu = in attesa dell'app o pronto, giallo = GPS o sensore in ricerca, rosso = problema, verde = sta misurando; il cicalino suona finché qualcosa non è pronto (1, 2 o 3 bip ogni 3 s) e tace quando la misura procede bene. Il display mostra lo stato e, durante la misura, il valore principale. Arduino li ricorda (EEPROM): appena acceso segnala subito «in attesa dell'app». Il GPS senza fix viene mostrato come «in ricerca», non come errore. Con più sensori in difficoltà il display li mostra a turno («PROBL 1/2»), con «#2» per distinguere due sensori dello stesso tipo; un componente rifiutato dalla configurazione resta segnalato («CONFIG», con il motivo). In attesa dell'app il display mostra la versione del firmware e come collegarsi: «USB v1.5», oppure «USB/BT 1.5» se un modulo Bluetooth (facoltativo) ha risposto a «Configura».

**Comandi, memoria e Bluetooth** (anche questi fuori dai 6 posti):

| Componente | Pin | A che cosa serve |
|---|---|---|
| Pulsante Avvia/Ferma | digitale + GND | con l'app collegata (cavo, HC-06, BLE) fa come «Avvia»/«Ferma»; con la scheda SD avvia e ferma la registrazione |
| Scheda microSD | D10 (CS), D11, D12, D13 (SPI) | Arduino registra da solo, a batteria: si prepara una volta via USB («Prepara Arduino»), poi registra col pulsante o da quando si accende; i file LOGnnnnn.CSV si importano nel Quaderno |
| Bluetooth HC-06 / Bluetooth LE (HM-10, AT-09, HC-08) | D0, D1 (con partitore) | misurare senza cavo; sceglierlo dal menu di «Collega» lo aggiunge da solo al progetto |

La guida ai collegamenti si genera dai componenti e dai pin scelti: schema **realistico** (Arduino Uno e moduli infilati in una breadboard con colonne e righe numerate, con le resistenze che servono) o **schema** compatto, occorrente e passi foro per foro.

Gli **esperimenti pronti** sono progetti già pensati per una lezione (Moto rettilineo, Moto armonico, Raffreddamento, Umidità e temperatura, Mappa della temperatura): si aprono e funzionano subito, e si possono modificare (le modifiche diventano una versione personale, ripristinabile). In **I miei progetti**, in cima alla barra, si compongono progetti propri. Gli **strumenti** (oscilloscopio audio, oscilloscopio elettrico su A0, synth) hanno un pannello proprio.

Con più sensori a ritmi diversi ogni lettura conserva il suo istante; quando servono insieme (mappa, invio a Elaborazione) le grandezze degli altri sensori vengono interpolate sui tempi del sensore scelto. Ogni progetto funziona anche con il **simulatore**, senza hardware.

## Firmware

Un solo sketch: [`firmware/mosaicusneo_firmware/mosaicusneo_firmware.ino`](firmware/mosaicusneo_firmware/mosaicusneo_firmware.ino) (v1.5, nessuna libreria esterna: I2C, 1-Wire e un FAT32 minimo per la scheda SD scritti apposta, 95 % della flash, 76 % della RAM), da caricare una volta con l'IDE di Arduino. L'app configura i sensori con comandi seriali (115200 baud) e il firmware invia solo dati grezzi (conteggi ADC, tempi di volo, i byte del DHT, i campi NMEA del GPS): le conversioni avvengono nell'app, dove si vedono e si tarano.

```
CFG,CLEAR                                          → #ACK,CFG,CLEAR
CFG,ADD,<slot>,<NTC|ANA|DHT|SONAR|GPS|DS18|GATE|HX711|IMU|MLX>,<ms>,<pinA>,<pinB>,<opz>
                                                   → #ACK,CFG,ADD,<slot> | #ERR,CFG,<slot>,<motivo>
START                                              → #ACK,START, poi D,<slot>,<t_ms>,<valori…>
STOP · START,SCOPE,… (oscilloscopio) · BT,SETUP (HC-06) · BT,SETUP,BLE (HM-10, AT-09, HC-08) · ID?
OUT,CLEAR · OUT,ADD,<OLED|RGB|BUZ|BTN|SD>,<p1>,<p2>,<p3>,<opz> · OUT,SAVE · OUT,TEST · OUT,L,<1|2>,<testo>
CFG,SAVE,<id>                                      → #ACK,CFG,SAVE   (configurazione salvata per la scheda SD)
SD,TEST                                            → #SD,OK,<MB> | #SD,ERR,<NOOUT|CARD|FAT32|FILE>
PING (ogni 2 s dall'app) · LINK,<U|B>              ← #ST,<W|I|S|E|T|O|C|R|L>,<slot>,<problema>,<k>,<n>,<bt>,<link> a ogni cambio
                                                   ← #KEY quando si preme il pulsante con l'app collegata
```

Sulla scheda SD il firmware scrive le stesse righe `D,…` della seriale, in `LOG00001.CSV`, `LOG00002.CSV`… (FAT32), dopo un'intestazione con la configurazione (`#MOSAICUS,<fw>,SD`, `#PROJ,<id>`, `#CFG,…`, `#START`; `#STOP,<t_ms>` se fermata col pulsante). L'app li importa nel Quaderno con le opzioni del progetto preparato.

Pin come numeri (A0 = 14 … A5 = 19); tempi con risoluzione di 1 µs e orologio a 64 bit (nessun azzeramento dopo 71 minuti).

## Sul campo: Arduino + Bluetooth + telefono

Due tipi di modulo, collegati allo stesso modo (TXD → D0, RXD ← D1 tramite partitore 1 kΩ/2 kΩ, in parallelo al cavo USB) e con lo stesso protocollo del cavo:

| | HC-06 (Bluetooth classico) | BLE: HM-10, AT-09 / BT05, HC-08 |
|---|---|---|
| Android | Chrome 138+ (Web Serial su RFCOMM) | Chrome (Web Bluetooth) |
| iPhone / iPad | no (iOS non espone il Bluetooth seriale classico) | sì, nel browser Bluefy (Web Bluetooth) |
| Computer | se associato prima | Chrome, Edge |
| Configurazione | «Configura HC-06» (`BT,SETUP`), poi associa (PIN 1234) | «Configura modulo BLE» (`BT,SETUP,BLE`), nessuna associazione |

La configurazione (nome «MosaicusNeo», 115200 baud) si fa una volta, con Arduino collegato via USB: scheda «Collegamenti» → interruttore «Bluetooth» → «Configura». Mentre carichi lo sketch stacca il filo TXD da D0. Sul campo: power bank su Arduino, «Collega» (menu ▾ per scegliere il Bluetooth LE), «Avvia»; lo schermo resta acceso e il Quaderno si salva ogni 30 s.

Safari non ha né Web Serial né Web Bluetooth: su iPhone e iPad serve un modulo BLE e il browser Bluefy.

## Quaderno ed export

Ogni misura finisce da sola nel **Quaderno** (pagina dedicata): ricerca, filtri per lab e sorgente, ordinamento, gruppi per giorno; da lì si riapre in Misura, si manda intera a Elaborazione («Analizza»), si esporta o si rinomina. In Misura, «Analizza il tratto» apre Elaborazione sul nuovo riquadro (il «+» lo aggiunge senza cambiare pagina). Oltre a Excel, CSV, PNG, GPX e GeoJSON c'è l'export dei **dati grezzi** di Arduino (CSV o Excel, una riga per lettura, colonne `t_s, t_ms, sensor, type, slot, …`), per script in Python, R o MATLAB.

## Account e cloud (facoltativi)

Senza account tutto resta nel browser (IndexedDB) e l'app funziona offline. Con un account (email e password, via Supabase) misure, riquadri, progetti e preferenze dei lab si sincronizzano tra i dispositivi: archivio *local-first*, vince la modifica più recente, le cancellazioni arrivano agli altri dispositivi, Row Level Security. Lo schema è in [`supabase/migrations`](supabase/migrations); per attivare il cloud servono le variabili di [`.env.example`](.env.example). Dal menu dell'account, «Elimina account» cancella subito account e dati sincronizzati (funzione `delete_account`, migrazione `20261119130000_delete_account.sql`).

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
src/lib/sensors/                catalogo dei componenti, progetto, preset, grandezze, simulatore
src/lib/lab-store.ts            pagina Misura: collegamento, protocollo, dati, sessioni, export
src/lib/workbench-store.ts      riquadri di Elaborazione ed export Excel
src/lib/cloud/                  account Supabase, archivio local-first, sincronizzazione
src/lib/mosaicus/               motori: fit, DSP, grafici su canvas, formule, XLSX, seriale, audio
src/components/app/             pagina Misura, editor dei componenti, guida ai collegamenti, guida, mappa
src/components/workbench/       pagina Elaborazione
src/components/instruments/     oscilloscopio e synth
supabase/migrations/            schema del database
```

## Licenza

MIT — © 2026 Ermes Ferdinando Rosi (Mosaicus). Vedi [LICENSE](LICENSE) e [NOTICE.txt](NOTICE.txt).
