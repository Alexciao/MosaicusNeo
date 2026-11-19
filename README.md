# Mosaicus

Micro-laboratorio di fisica nel browser: esperimenti con **Arduino**, con i **sensori del telefono** e con il **suono**. Grafici in tempo reale, oscilloscopio, synth, analisi dei dati (retta a occhio, tangente, fit con incertezze, righello) ed esportazione in Excel. Funziona anche senza rete e si installa come app (PWA).

Questa è la versione "Neo": l'app Mosaicus di [ermesfrosi.it](https://ermesfrosi.it) migrata a **Next.js + React + shadcn/ui**, ridisegnata, con i nuovi lab **Umidità e temperatura** (DHT11 / DHT22) e **Mappa della temperatura** (GPS + Bluetooth, sul campo con il telefono), e con **account facoltativi** per ritrovare i dati su tutti i dispositivi.

## Lab

| Argomento | Lab | Sensore |
|---|---|---|
| Cinematica | Moto rettilineo, Moto armonico | HC-SR04 (pin 12, 11) |
| Termologia | Raffreddamento | Termistore NTC su A0 |
| Termologia | **Umidità e temperatura** (punto di rugiada, umidità assoluta) | **DHT11 / DHT22 su D2** |
| Sul campo | **Mappa della temperatura** (traccia GPS, mappa interattiva, GPX/GeoJSON) | **GPS VMA430/WPI430 su D4, HC-06 su D0/D1**, DHT11 o NTC |
| Onde e suono | Oscilloscopio, Synth, Frequenza nel tempo | Microfono del dispositivo, HC-SR04 facoltativo |
| Elettromagnetismo | Oscilloscopio elettrico | Tensione 0–5 V su A0 |

Ogni lab funziona anche con il **simulatore**, senza hardware.

## Firmware

Un solo sketch per tutti i lab: [`firmware/mosaicus_firmware/mosaicus_firmware.ino`](firmware/mosaicus_firmware/mosaicus_firmware.ino) (v0.4). Si carica una volta con l'IDE di Arduino su un Arduino Uno; poi è l'app a scegliere l'esperimento con comandi seriali (115200 baud). Il firmware invia solo dati grezzi (conteggi ADC, tempi di volo, i byte del DHT): le conversioni avvengono nell'app, dove si vedono e si tarano.

DHT11/DHT22: `START,DHT,<intervallo_ms>,<11|22>` → `H,<t_ms>,<b0>,<b1>,<b2>,<b3>,<err>`. La lettura è a bit-bang, senza librerie esterne. Il modulo a 3 pin ha già il pull-up; il sensore a 4 pin vuole 10 kΩ tra DATA e 5 V.

GPS: `START,GPS,<intervallo_ms>,<0|1|11|22>` → `G,<t_ms>,<fix>,<lat>,<lon>,<alt>,<sat>,<hdop>,<vel_nodi>,<utc>,<data>,<sensore>,<a>,<b>,<c>,<d>,<err>`, con le coordinate NMEA così come arrivano dal modulo (la conversione in gradi la fa l'app). Bluetooth: `BT,SETUP` configura l'HC-06.

## Sul campo: Arduino + GPS + Bluetooth + telefono

1. **Collegamenti**: GPS VMA430/WPI430 (u-blox NEO-7M) TX → D4; HC-06 TXD → D0, RXD ← D1 tramite partitore 1 kΩ/2 kΩ (3,3 V); DHT11 DATA → D2; tutto a 5 V e GND. Arduino alimentato da un power bank.
2. **Una volta sola**: con Arduino al computer via USB, lab «Mappa della temperatura» → «Configura HC-06» (comando `BT,SETUP`: nome «Mosaicus», 115200 baud). Mentre carichi lo sketch stacca il filo TXD dell'HC-06 da D0.
3. **Associa** «Mosaicus» nelle impostazioni Bluetooth di Android (PIN 1234).
4. **Misura**: Chrome per Android (138 o successivo: Web Serial via Bluetooth RFCOMM) → «Collega via Bluetooth» → «Avvia». Lo schermo resta acceso e il Quaderno si salva ogni 30 s.
5. **Analizza**: mappa colorata (temperatura, umidità, punto di rugiada, altitudine, velocità) legata ai grafici; esporta Excel/CSV/GPX/GeoJSON o invia a Elaborazione (es. fit di T in funzione dell'altitudine).

iPhone e iPad non possono collegarsi all'HC-06 (Safari non ha Web Serial e iOS non espone il Bluetooth seriale classico).

## Account e cloud (facoltativi)

Senza account tutto resta nel browser (IndexedDB) e l'app funziona offline. Con un account (email e password, via Supabase) misure, riquadri e preferenze dei lab si sincronizzano tra i dispositivi:

- archivio *local-first*: ogni modifica si salva subito in locale e poi nel cloud; in caso di conflitto vince la più recente; le cancellazioni arrivano agli altri dispositivi;
- le misure create prima di accedere entrano nell'account; uscendo, i dati dell'account vengono tolti dal dispositivo (restano nel cloud);
- Row Level Security: ogni utente vede solo le proprie righe.

Lo schema del database è in [`supabase/migrations`](supabase/migrations). Per attivare il cloud servono le variabili di [`.env.example`](.env.example) (URL del progetto e chiave *publishable*); senza, il pulsante «Accedi» non compare.

```bash
npx supabase link --project-ref <ref>
npx supabase db push --remote
```

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
src/lib/cloud/                  account Supabase, archivio local-first, sincronizzazione
supabase/migrations/            schema del database (tabelle, RLS)
src/lib/mosaicus/               motori senza interfaccia: esperimenti, fit, DSP, grafici su canvas,
                                formule, XLSX, seriale, telefono, simulatore, audio
public/sw.js                    service worker per l'uso offline
```

## Deploy

Il progetto è collegato a Vercel: ogni push su `main` viene pubblicato in produzione, ogni altro branch ha un'anteprima.

## Licenza

MIT — © 2026 Ermes Ferdinando Rosi. Vedi [LICENSE](LICENSE) e [NOTICE.txt](NOTICE.txt).
