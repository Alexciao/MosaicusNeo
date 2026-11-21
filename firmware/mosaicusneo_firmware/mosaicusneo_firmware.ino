/*
  MosaicusNeo — firmware unico per Arduino Uno R3 (e compatibili, es. Elegoo UNO R3)
  ---------------------------------------------------------------------------------
  Copyright (c) 2026 Ermes Ferdinando Rosi — licenza MIT (testo nel file LICENSE del progetto)

  Si carica UNA volta sola. Da quel momento è l'app a dire quali sensori sono collegati,
  su quali pin e ogni quanto leggerli: un "montaggio" fino a 6 sensori, anche dello stesso
  tipo (es. due termistori), ognuno con il suo ritmo. In più fino a tre indicatori di stato
  (display OLED, LED RGB, cicalino) che mostrano da soli se Arduino è pronto e sta misurando.

  Filosofia: Arduino invia solo grandezze GREZZE (conteggi ADC, tempi di volo in µs, i byte
  del DHT, i campi delle frasi NMEA del GPS…). Le conversioni in grandezze fisiche avvengono
  nell'app, dove i parametri si cambiano senza ricaricare il firmware e la catena di misura
  resta visibile.

  Pin: D0 e D1 sono della porta seriale (cavo USB e, in parallelo, Bluetooth): non vanno
  usati per i sensori. I sensori analogici vanno su A0…A5 (numeri 14…19); quelli digitali su
  D2…D13 o anche su A0…A5. Il LED su D13 si accende durante la misura, a meno che D13 non sia
  usato. I dispositivi I2C (display OLED, MPU-6050, MLX90614, SPS30) possono condividere gli stessi due pin.
  Con il modulo microSD, D10…D13 sono suoi (SPI: D11 MOSI, D12 MISO, D13 SCK; D10 deve restare
  un'uscita perché l'SPI funzioni; CS su D10 o su un altro pin).

  Protocollo (115200 baud, righe terminate da '\n'):
    App -> Arduino                              Arduino -> App
    ID?                                         #MOSAICUS,<versione>,READY
    PING                                        (niente: dice ad Arduino che l'app è collegata)
    LINK,<U|B>                                  (niente: l'app è collegata via USB o via Bluetooth)
    CFG,CLEAR                                   #ACK,CFG,CLEAR
    CFG,ADD,<slot>,<tipo>,<ms>,<pinA>,<pinB>,<opz>
                                                #ACK,CFG,ADD,<slot>   oppure   #ERR,CFG,<slot>,<motivo>
        slot  0…5;  ms = intervallo tra due letture;  pin come numeri (A0 = 14 … A5 = 19)
        tipo  NTC    pinA analogico (termistore o qualunque partitore)          → <adc medio>
              ANA    pinA analogico (tensione 0–5 V)                             → <adc medio>
              DHT    pinA digitale, opz = 11 (DHT11) o 22 (DHT22)                → <b0>,<b1>,<b2>,<b3>,<err>
              SONAR  pinA = TRIG, pinB = ECHO (HC-SR04)                          → <eco_us>   (0 = nessun eco)
              GPS    pinA = RX di Arduino (TX del GPS), pinB = TX di Arduino     → <fix>,<lat>,<lon>,<alt>,<sat>,<hdop>,<vel_nodi>,<utc>,<data>
                     (u-blox NEO-6M/7M come VMA430/WPI430, 9600 baud; uno solo)
              DS18   pinA (sonda DS18B20, pull-up 4,7 kΩ)                        → <grezzo_1/16°C>,<err>
              GATE   pinA (fotocellula / ingresso digitale), opz bit0 = inverti  → <stato>   (solo ai cambi; su D2/D3 con interrupt)
              HX711  pinA = DT, pinB = SCK (cella di carico)                     → <conteggi>,<err>
              IMU    pinA = SDA, pinB = SCL (MPU-6050), opz bit0-1 = fondo scala, bit2 = indirizzo 0x69
                                                                                 → <ax>,<ay>,<az>,<gx>,<gy>,<gz>,<err>
              MLX    pinA = SDA, pinB = SCL (termometro a infrarossi MLX90614 / GY-906, 0x5A)
                                                                                 → <oggetto>,<ambiente>,<err>   (in 0,02 K)
              SPS    pinA = SDA, pinB = SCL (polveri sottili Sensirion SPS30, I2C 0x69, SEL a GND)
                                                                                 → <pm1>,<pm2.5>,<pm4>,<pm10>,<nc0.5>,<nc1>,<nc2.5>,<nc4>,<nc10>,<tps>,<err>
                     (µg/m³, #/cm³, µm; err 2 = nessuna risposta o CRC errato)
        motivi  SLOT, TYPE, PIN, ANALOG, DUPLICATE (pin già usato), GPS (ce n'è già uno), ARGS
    START                                       #ACK,START
                                                D,<slot>,<t_ms>,<valori…>   una riga per lettura
        t_ms con tre decimali (µs), dall'istante di START. Per il sonar è l'istante a metà del
        volo dell'ultrasuono. L'orologio non si azzera dopo 71 minuti (contatore a 64 bit).
    STOP                                        #ACK,STOP
    START,SCOPE,<dt_us>,<n>,<livello>,<fronte>,<auto>
                                                #ACK,START,SCOPE,<dt_us>
                                                W,<trig>,<dt_us>,<a0>,…,<a(n-1)>   (oscilloscopio su A0)
    OUT,CLEAR                                   #ACK,OUT,CLEAR
    OUT,ADD,<OLED|RGB|BUZ>,<p1>,<p2>,<p3>,<opz> #ACK,OUT,ADD,<tipo>   oppure   #ERR,OUT,<motivo>
        OLED  p1 = SDA, p2 = SCL (SSD1306 64×32 0,49", I2C 0x3C)
        RGB   p1 = R, p2 = G, p3 = B; opz bit0 = anodo comune
        BUZ   p1; opz bit0 = cicalino passivo, bit1 = bip finché non è tutto pronto, bit2 = bip di conferma
        BTN   p1 = pulsante tra il pin e GND (pull-up interno, antirimbalzo 30 ms)
        SD    p1 = CS del modulo microSD (MOSI D11, MISO D12, SCK D13 fissi; D10 riservato);
              opz bit0 = registra appena acceso (vale solo senza pulsante)
    OUT,SAVE                                    #ACK,OUT,SAVE   (gli indicatori restano anche dopo lo spegnimento)
    CFG,SAVE,<id>                               #ACK,CFG,SAVE   oppure   #ERR,CFG,-1,EMPTY
        salva in EEPROM i sensori configurati e il codice del progetto (fino a 12 caratteri):
        servono per registrare sulla scheda SD senza l'app
    SD,TEST                                     #SD,OK,<MB della partizione>   oppure   #SD,ERR,<NOOUT|CARD|FAT32|FILE>
        prova la scheda (FAT32, al massimo 32 GB formattati così) senza creare file
                                                #KEY   pulsante premuto con l'app collegata: l'app avvia o ferma la misura
    OUT,L,<1|2>,<testo>                         (righe del display durante la misura: valore grande e riga piccola)
    OUT,TEST                                    #ACK,OUT,TEST   (prova: colori, bip, scritta «HELLO»)
                                                #ST,<stato>,<slot>,<problema>,<k>,<n>,<bt>,<link>   a ogni cambio
        stato  W attesa dell'app · I pronto · S in ricerca (GPS, eco) · E errore di un sensore ·
               T misura in corso e tutto a posto · O oscilloscopio ·
               R scheda SD pronta, si aspetta il pulsante · L registrazione sulla scheda SD ·
               E con slot -2 = problema della scheda SD ·
               C configurazione rifiutata (slot -1 = display, LED o cicalino; problema = motivo:
                 1 pin, 2 non analogico, 3 pin doppio, 4 secondo GPS, 5 tipo, 6 comando)
        problema 0 nessuno · 1 in ricerca · 2 errore
        k/n    con più sensori in difficoltà il display li mostra a turno: k = quello mostrato
               (da 1), n = quanti sono. LED e cicalino seguono sempre il più grave.
        bt     modulo Bluetooth configurato (0 nessuno, 1 HC-06, 2 BLE) · link: U USB, B Bluetooth
    BT,SETUP                                    #BT,SETUP … #ACK,BT,SETUP
        configura l'HC-06 (collegati via USB, HC-06 non associato): nome «MosaicusNeo», 115200 baud.
        Se il modulo risponde, Arduino lo ricorda (EEPROM): in attesa dell'app il display mostra «USB/BT».
        Nessuna risposta: #BT,NOREPLY prima dell'#ACK (fili TXD/RXD, o un telefono collegato).
    BT,SETUP,BLE                                #BT,SETUP … #ACK,BT,SETUP,BLE
        come sopra per i moduli Bluetooth Low Energy (HM-10, AT-09 / BT05, HC-08): nome
        «MosaicusNeo», 115200 baud. Comandi diversi da quelli dell'HC-06: non vanno scambiati.
    (comando sconosciuto)                       #ERR,<testo>

  Collegamenti tipici (l'app mostra lo schema con i pin scelti):
    termistore NTC: partitore con 10 kΩ, uscita su A0 · DHT11: DATA su D2 · HC-SR04: TRIG D12,
    ECHO D11 · GPS: TX del GPS su D4 · HC-06: TXD → D0, RXD ← D1 con partitore 1 kΩ / 2 kΩ ·
    display OLED: SDA A4, SCL A5. Mentre carichi lo sketch, stacca il filo TXD del modulo Bluetooth da D0.
    modulo microSD: GND, VCC a 5V, MISO D12, MOSI D11, SCK D13, CS D10 · pulsante: tra un pin e GND.

  Registrazione sulla scheda SD (senza app): l'app manda la configurazione (CFG…, OUT…, OUT,SAVE,
  CFG,SAVE,<id>). All'accensione, se c'è il modulo SD e una configurazione salvata, Arduino aspetta
  4 s un comando dall'app; se non arriva: senza pulsante registra subito (opz bit0 del modulo SD),
  con il pulsante aspetta (stato R): una pressione avvia, la successiva ferma, poi un file nuovo.
  Un comando dall'app durante la registrazione la chiude. Ogni 2 s il file viene aggiornato sulla
  scheda: togliendo l'alimentazione si perdono al massimo gli ultimi 2 s.
  File LOG00001.NEO, LOG00002.NEO… nella cartella principale (FAT32; testo, righe come sotto):
    #MOSAICUS,<versione>,SD
    #PROJ,<id>
    #CFG,<slot>,<tipo>,<ms>,<pinA>,<pinB>,<opz>   (una riga per sensore, ms = intervallo effettivo)
    #START
    D,<slot>,<t_ms>,<valori…>                      (come sulla seriale)
    #STOP,<t_ms>                                   (solo se fermata con il pulsante)

  EEPROM: 0 'M', 1 versione degli indicatori (2) · 20 'B', 21 modulo Bluetooth · 32…56 indicatori
  (5 × tipo, p1, p2, p3, opz) · 64 'C' (configurazione salvata) · 65…76 codice del progetto ·
  80…127 sensori (6 × tipo, pinA, pinB, opz, intervallo in ms su 4 byte).
*/

#include <SoftwareSerial.h>
#include <SPI.h>
#include <EEPROM.h>
#include <new.h>                  // placement new (SoftwareSerial del GPS)

#define FW_VERSION "1.8"          // stringa in flash, unita ai testi vicini (al massimo 4 caratteri: display)

const uint8_t MAX_SLOTS = 6;
const uint8_t ADC_SAMPLES = 16;                 // sovracampionamento per ridurre il rumore
const unsigned long ECHO_TIMEOUT_US = 30000UL;  // ~5 m andata e ritorno

enum SensorType : uint8_t { S_NONE, S_NTC, S_ANA, S_DHT, S_SONAR, S_GPS, S_DS18, S_GATE, S_HX711, S_IMU, S_MLX, S_SPS };
const uint8_t S_LAST = S_SPS;

// i primi 8 byte vanno così come sono in EEPROM (cfgSave)
struct Slot {
  uint8_t type;
  uint8_t pinA, pinB, opt;
  unsigned long intervalMs;
  unsigned long nextMs;
  uint8_t st;      // stato interno (DS18: conversione avviata; GATE: ultimo livello; IMU: inizializzato; SPS: misura avviata)
  uint8_t bad;     // letture cattive di fila
  uint8_t issue;   // 0 a posto, 1 in ricerca, 2 errore
};
Slot slots[MAX_SLOTS];

// ---------- indicatori di stato ----------
enum OutType : uint8_t { O_NONE, O_OLED, O_RGB, O_BUZ, O_BTN, O_SD };
struct Out { uint8_t type; uint8_t p[3]; uint8_t opt; };   // 5 byte, nello stesso ordine della EEPROM
const uint8_t MAX_OUTS = 5;
Out outs[MAX_OUTS];
static_assert(sizeof(Out) == 5 && offsetof(Slot, intervalMs) == 4, "disposizione in EEPROM");
Out *outFind(uint8_t t) { for (uint8_t i = 0; i < MAX_OUTS; i++) if (outs[i].type == t) return &outs[i]; return nullptr; }
uint8_t outPin(uint8_t t) { Out *o = outFind(t); return o ? o->p[0] : 0; }
// indirizzi in EEPROM (vedi in cima)
const int E_OUTS = 32, E_CFG = 64, E_ID = 65, E_SLOTS = 80;
char appBig[6] = "", appSmall[11] = "";

// Bluetooth: il modulo non si vede da Arduino (sta in parallelo al cavo su D0/D1). Lo si scopre
// quando risponde ai comandi AT di BT,SETUP e lo si ricorda in EEPROM (byte 20-21).
uint8_t btKind = 0;             // 0 nessuno, 1 HC-06, 2 BLE
bool linkBt = false;            // l'app ha detto di essere collegata via Bluetooth (LINK,B)

// configurazione rifiutata: resta segnalata finché l'app non rimanda la configurazione
bool cfgBad = false;
int8_t cfgBadSlot = -1;
uint8_t cfgBadWhy = 0, cfgBadType = 0, cfgPendingType = 0, outBad = 0;

// prototipi espliciti (l'IDE li genererebbe da solo, ma senza i valori di default)
bool pinTaken(uint8_t pin, uint8_t except, bool i2c = false);
bool pinTakenBySlot(uint8_t pin);
bool outPinFree(uint8_t p, bool i2c);

enum Mode : uint8_t { IDLE, RUN, SCOPE };
Mode mode = IDLE;
bool ledFree = true;            // D13 non usato: il LED può segnalare la misura

// ---------- orologio a 64 bit in µs (micros() torna a zero ogni 71,6 minuti) ----------
volatile uint32_t lastMicros = 0, microsWraps = 0;
uint64_t nowUs() {
  uint8_t s = SREG; cli();
  uint32_t u = micros();
  if (u < lastMicros) microsWraps++;
  lastMicros = u;
  uint64_t r = ((uint64_t)microsWraps << 32) | u;
  SREG = s;
  return r;
}
uint64_t t0Us = 0;

// Le righe dei dati (D,…) passano da qui: vanno alla seriale (l'app) e/o alla scheda SD.
bool dSer = true, sdOn = false, sdErr = false, bootWait = false;
void sdPut(uint8_t c);
struct DataOut : public Print {
  size_t write(uint8_t c) { if (dSer) Serial.write(c); if (sdOn) sdPut(c); return 1; }
} dout;

// ',' seguita da un numero: stessi caratteri di print(',') + print(v) per ogni intero che qui
// si stampa (tutti tra -2^31 e 2^31), ma una chiamata sola invece di due
void commaNum(Print &p, long v) { p.print(','); p.print(v); }

void printTime(uint64_t us) {
  uint64_t rel = us - t0Us;
  // rel / 1000 e rel % 1000 senza la divisione a 64 bit (costa ~200 byte): divisione in colonna
  // a pezzi di 16 bit; il resto (< 1000) seguito da 16 bit sta sempre in 32 bit
  const uint16_t *w = (const uint16_t *)&rel;   // AVR: little endian, w[3] è il pezzo più alto
  uint32_t r = 0, ms = 0;
  for (int8_t k = 3; k >= 0; k--) {
    uint32_t x = (r << 16) | w[k];
    ms = (ms << 16) | (uint16_t)(x / 1000);    // contano solo i 32 bit bassi del quoziente
    r = x % 1000;
  }
  uint16_t frac = (uint16_t)r;
  dout.print(ms);
  dout.print('.');
  if (frac < 100) dout.print('0');
  if (frac < 10) dout.print('0');
  dout.print(frac);
}
void dataHead(uint8_t i, uint64_t stamp) { dout.print(F("D,")); dout.print(i); dout.print(','); printTime(stamp); }

// Come Print::printFloat del core (stessi caratteri in uscita, «nan», «inf», «ovf» compresi), ma
// senza divisioni né confronti in virgola mobile: i casi speciali si riconoscono dai bit, e
// l'arrotondamento (0,5 diviso per 10 «digits» volte) è calcolato dal compilatore con gli stessi
// passaggi. Risparmia le routine di divisione e di confronto della libreria float.
void printFloat(float x, uint8_t digits) {
  union { float f; uint32_t u; } v;
  v.f = x;
  uint32_t a = v.u & 0x7FFFFFFFUL;
  if (a > 0x7F800000UL) { dout.print(F("nan")); return; }
  if (a == 0x7F800000UL) { dout.print(F("inf")); return; }
  if (a > 0x4F7FFFFFUL) { dout.print(F("ovf")); return; }   // |x| > 4294967040.0
  if (a != v.u && a) dout.print('-');                       // negativo (ma non -0.0)
  v.u = a;
  float n = v.f + (digits == 3 ? 0.5f / 10 / 10 / 10 : 0.5f / 10 / 10);
  uint32_t ip = (uint32_t)n;
  float r = n - (float)ip;
  dout.print(ip);
  dout.print('.');
  while (digits--) {
    r *= 10;
    uint16_t d = (uint16_t)r;
    dout.print(d);
    r -= d;
  }
}

// ---------- oscilloscopio ----------
const int SCOPE_MAX = 400;
const int SCOPE_HYST = 3;          // isteresi del trigger (conteggi ADC): ignora il rumore
unsigned int scopeDt = 100;        // µs tra due campioni
int scopeN = SCOPE_MAX;
int scopeLevel = 512;
int scopeEdge = 1;
bool scopeAuto = true;

// ---------- DHT ----------
uint8_t dhtData[5];

// ---------- GPS ----------
SoftwareSerial *gpsSerial = nullptr;
// l'oggetto vive qui (placement new): niente malloc/free, che costerebbero ~600 byte di flash
alignas(SoftwareSerial) uint8_t gpsMem[sizeof(SoftwareSerial)];
int8_t gpsSlot = -1;
// I campioni dell'oscilloscopio e i testi del GPS non servono mai insieme: condividono la RAM
// (l'Arduino Uno ne ha solo 2 KB). All'avvio di una misura i campi del GPS si azzerano.
struct GpsText { char nmea[84]; char lat[13], lon[14], alt[9], sats[4], hdop[6], spd[9], utc[11], date[7]; };
// Anche il settore da 512 byte della scheda SD sta qui, accanto ai testi del GPS (che servono
// insieme a lui durante la registrazione): la registrazione e l'oscilloscopio non vanno mai insieme.
union Shared { uint16_t scope[SCOPE_MAX]; struct { GpsText g; uint8_t sd[512]; } r; } shared;
#define scopeBuf shared.scope
#define sdBuf shared.r.sd
#define nmea shared.r.g.nmea
#define gLat shared.r.g.lat
#define gLon shared.r.g.lon
#define gAlt shared.r.g.alt
#define gSats shared.r.g.sats
#define gHdop shared.r.g.hdop
#define gSpd shared.r.g.spd
#define gUtc shared.r.g.utc
#define gDate shared.r.g.date
uint8_t nmeaLen = 0;
unsigned long nmeaLastByte = 0;
char gFix = '0';

char cmdBuf[48];
uint8_t cmdLen = 0;
unsigned long lastCmdMs = 0;       // ultimo comando dall'app (PING compreso)
bool pinged = false;               // l'app manda i PING: si può capire se è ancora collegata
unsigned long runStartMs = 0;


void sendHello() {
  Serial.println(F("#MOSAICUS," FW_VERSION ",READY"));
}

void led(bool on) { if (ledFree) digitalWrite(LED_BUILTIN, on ? HIGH : LOW); }

// ADC più veloce per l'oscilloscopio: prescaler 16 → una conversione in ~16 µs (invece di ~112).
void adcFast(bool on) { ADCSRA = (ADCSRA & ~0x07) | (on ? 0x04 : 0x07); }

// somma di ADC_SAMPLES letture (al massimo 16 × 1023: sta in 16 bit); la media è somma / 16
uint16_t readAdcSum(uint8_t pin) {
  uint16_t sum = 0;
  for (uint8_t i = 0; i < ADC_SAMPLES; i++) sum += analogRead(pin);
  return sum;
}

// =====================================================================================
// Bus a due fili, a software (I2C e 1-Wire): qualunque pin, nessuna libreria, poca RAM.
// Una linea si "lascia" mettendola in ingresso (la tira su la resistenza di pull-up) e si
// porta a 0 mettendola in uscita bassa: così nessuno dei due lati forza mai un 1.
// =====================================================================================
inline void lineLow(uint8_t p) { digitalWrite(p, LOW); pinMode(p, OUTPUT); }
inline void lineRelease(uint8_t p) { pinMode(p, INPUT_PULLUP); }

uint8_t i2cSda = 18, i2cScl = 19;
void i2cBus(uint8_t sda, uint8_t scl) { i2cSda = sda; i2cScl = scl; }
void i2cStart() { lineRelease(i2cSda); lineRelease(i2cScl); delayMicroseconds(3); lineLow(i2cSda); delayMicroseconds(3); lineLow(i2cScl); }
void i2cStop() { lineLow(i2cSda); lineRelease(i2cScl); delayMicroseconds(3); lineRelease(i2cSda); delayMicroseconds(3); }
bool i2cWrite(uint8_t b) {
  for (uint8_t m = 0x80; m; m >>= 1) {
    if (b & m) lineRelease(i2cSda); else lineLow(i2cSda);
    lineRelease(i2cScl); delayMicroseconds(2); lineLow(i2cScl);
  }
  lineRelease(i2cSda); lineRelease(i2cScl); delayMicroseconds(2);
  bool ack = digitalRead(i2cSda) == LOW;
  lineLow(i2cScl);
  return ack;
}
uint8_t i2cRead(bool ack) {
  uint8_t b = 0;
  lineRelease(i2cSda);
  for (uint8_t i = 0; i < 8; i++) {
    lineRelease(i2cScl); delayMicroseconds(2);
    b = (b << 1) | (digitalRead(i2cSda) ? 1 : 0);
    lineLow(i2cScl);
  }
  if (ack) lineLow(i2cSda); else lineRelease(i2cSda);
  lineRelease(i2cScl); delayMicroseconds(2); lineLow(i2cScl);
  lineRelease(i2cSda);
  return b;
}
bool i2cWriteReg(uint8_t addr, uint8_t reg, uint8_t val) {
  i2cStart();
  bool ok = i2cWrite(addr << 1) && i2cWrite(reg) && i2cWrite(val);
  i2cStop();
  return ok;
}

// ---------- 1-Wire (DS18B20) ----------
bool owReset(uint8_t p) {
  lineLow(p); delayMicroseconds(480);
  uint8_t s = SREG; cli();
  lineRelease(p); delayMicroseconds(70);
  bool presence = digitalRead(p) == LOW;
  SREG = s;
  delayMicroseconds(410);
  return presence;
}
void owWriteBit(uint8_t p, uint8_t bit) {
  uint8_t s = SREG; cli();
  lineLow(p); delayMicroseconds(bit ? 6 : 60);
  lineRelease(p);
  SREG = s;
  delayMicroseconds(bit ? 64 : 10);
}
uint8_t owReadBit(uint8_t p) {
  uint8_t s = SREG; cli();
  lineLow(p); delayMicroseconds(3);
  lineRelease(p); delayMicroseconds(10);
  uint8_t r = digitalRead(p);
  SREG = s;
  delayMicroseconds(53);
  return r;
}
void owWrite(uint8_t p, uint8_t b) { for (uint8_t i = 0; i < 8; i++) owWriteBit(p, (b >> i) & 1); }
uint8_t owRead(uint8_t p) { uint8_t b = 0; for (uint8_t i = 0; i < 8; i++) b |= owReadBit(p) << i; return b; }
uint8_t crc8(const uint8_t *d, uint8_t n) {
  uint8_t c = 0;
  while (n--) {
    uint8_t b = *d++;
    for (uint8_t i = 0; i < 8; i++) { uint8_t mix = (c ^ b) & 1; c >>= 1; if (mix) c ^= 0x8C; b >>= 1; }
  }
  return c;
}
bool ds18Convert(uint8_t p) {
  if (!owReset(p)) return false;
  owWrite(p, 0xCC); owWrite(p, 0x44);        // tutti i sensori sul filo: avvia la conversione
  return true;
}
// 0 = ok, 1 = nessun sensore, 2 = dati rovinati
uint8_t ds18Read(uint8_t p, int16_t &raw) {
  if (!owReset(p)) return 1;
  owWrite(p, 0xCC); owWrite(p, 0xBE);
  uint8_t d[9];
  for (uint8_t i = 0; i < 9; i++) d[i] = owRead(p);
  if (crc8(d, 8) != d[8]) return 2;
  raw = (int16_t)((d[1] << 8) | d[0]);
  if (raw == 0x0550) return 2;               // 85 °C: valore di accensione, conversione non fatta
  return 0;
}

// ---------- HX711 (cella di carico) ----------
long hxRead(uint8_t dt, uint8_t sck) {
  long v = 0;
  uint8_t s = SREG; cli();                    // SCK alto per più di 60 µs spegnerebbe l'HX711
  for (uint8_t i = 0; i < 24; i++) {
    digitalWrite(sck, HIGH); delayMicroseconds(1);
    v = (v << 1) | digitalRead(dt);
    digitalWrite(sck, LOW); delayMicroseconds(1);
  }
  digitalWrite(sck, HIGH); delayMicroseconds(1); digitalWrite(sck, LOW);   // canale A, guadagno 128
  SREG = s;
  if (v & 0x800000L) v |= 0xFF000000L;
  return v;
}

// ---------- MLX90614 (termometro a infrarossi, SMBus) ----------
// Lettura di una parola (RAM 0x07 = oggetto, 0x06 = ambiente) in unità di 0,02 K. L'SMBus aggiunge
// un byte di controllo (PEC, CRC-8 con polinomio 0x07) su tutto lo scambio: se non torna, la lettura
// si scarta. Il bit 15 a 1 è il flag di errore del sensore.
const uint8_t MLX_ADDR = 0x5A;
uint8_t crcSmbus(uint8_t c, uint8_t b) {
  c ^= b;
  for (uint8_t k = 0; k < 8; k++) c = (c & 0x80) ? (uint8_t)((c << 1) ^ 0x07) : (uint8_t)(c << 1);
  return c;
}
bool mlxRead(const Slot &s, uint8_t reg, uint16_t &v) {
  i2cBus(s.pinA, s.pinB);
  i2cStart();
  if (!i2cWrite(MLX_ADDR << 1) || !i2cWrite(reg)) { i2cStop(); return false; }
  i2cStart();
  if (!i2cWrite((MLX_ADDR << 1) | 1)) { i2cStop(); return false; }
  uint8_t lo = i2cRead(true), hi = i2cRead(true), pec = i2cRead(false);
  i2cStop();
  uint8_t c = crcSmbus(0, MLX_ADDR << 1);
  c = crcSmbus(c, reg); c = crcSmbus(c, (MLX_ADDR << 1) | 1); c = crcSmbus(c, lo); c = crcSmbus(c, hi);
  if (c != pec || (hi & 0x80)) return false;
  v = ((uint16_t)hi << 8) | lo;
  return true;
}

// ---------- SPS30 (polveri sottili, Sensirion) ----------
// I2C a 0x69, al massimo 100 kHz, niente clock stretching e niente repeated start: ogni lettura è
// «imposta il puntatore» (STOP) e poi una lettura nuova. I dati arrivano a parole di 2 byte, ognuna
// seguita dal suo CRC-8 (polinomio 0x31, partenza 0xFF). Valori in float big-endian (formato 0x03).
const uint8_t SPS_ADDR = 0x69;
uint8_t crcSps(const uint8_t *d) {
  uint8_t c = 0xFF;
  for (uint8_t i = 0; i < 2; i++) {
    c ^= d[i];
    for (uint8_t k = 0; k < 8; k++) c = (c & 0x80) ? (uint8_t)((c << 1) ^ 0x31) : (uint8_t)(c << 1);
  }
  return c;
}
// comando a 16 bit; start: in più l'argomento «uscita in float» (0x03, 0x00) con il suo CRC (0xAC)
bool spsCmd(const Slot &s, uint16_t ptr, bool start) {
  i2cBus(s.pinA, s.pinB);
  i2cStart();
  bool ok = i2cWrite(SPS_ADDR << 1) && i2cWrite(ptr >> 8) && i2cWrite(ptr & 0xFF)
         && (!start || (i2cWrite(0x03) && i2cWrite(0x00) && i2cWrite(0xAC)));
  i2cStop();
  return ok;
}
// i 10 valori (0x0300): 20 parole da 2 byte, ognuna con il suo CRC; false se non risponde o un CRC non torna
bool spsRead(const Slot &s, uint8_t *out) {
  if (!spsCmd(s, 0x0300, false)) return false;
  i2cStart();
  if (!i2cWrite((SPS_ADDR << 1) | 1)) { i2cStop(); return false; }
  bool ok = true;
  for (uint8_t w = 0; w < 20; w++) {
    uint8_t b[3];
    for (uint8_t k = 0; k < 3; k++) b[k] = i2cRead(w < 19 || k < 2);
    if (crcSps(b) != b[2]) ok = false;
    out[2 * w] = b[0]; out[2 * w + 1] = b[1];
  }
  i2cStop();
  return ok;
}

// ---------- MPU-6050 (accelerometro e giroscopio) ----------
uint8_t imuAddr(const Slot &s) { return (s.opt & 4) ? 0x69 : 0x68; }
bool imuInit(const Slot &s) {
  i2cBus(s.pinA, s.pinB);
  uint8_t a = imuAddr(s);
  return i2cWriteReg(a, 0x6B, 0x00)            // sveglia
      && i2cWriteReg(a, 0x1A, 0x03)            // filtro passa basso ~44 Hz
      && i2cWriteReg(a, 0x1B, 0x00)            // giroscopio ±250 °/s
      && i2cWriteReg(a, 0x1C, (s.opt & 3) << 3);   // accelerometro ±2/4/8/16 g
}
bool imuRead(const Slot &s, int16_t v[7]) {
  i2cBus(s.pinA, s.pinB);
  uint8_t a = imuAddr(s);
  i2cStart();
  if (!i2cWrite(a << 1) || !i2cWrite(0x3B)) { i2cStop(); return false; }
  i2cStart();
  if (!i2cWrite((a << 1) | 1)) { i2cStop(); return false; }
  for (uint8_t i = 0; i < 7; i++) {
    uint8_t hi = i2cRead(true), lo = i2cRead(i < 6);
    v[i] = (int16_t)((hi << 8) | lo);
  }
  i2cStop();
  return true;
}

// ---------- fotocellule (GATE): ogni cambio con il suo istante ----------
// Su D2 e D3 un interrupt prende l'istante esatto; sugli altri pin si guarda a ogni giro.
struct GateEv { uint64_t t; uint8_t slot; uint8_t level; };
const uint8_t GATE_Q = 6;
volatile GateEv gateQ[GATE_Q];
volatile uint8_t gateHead = 0, gateTail = 0;
volatile int8_t gateIntSlot[2] = { -1, -1 };
void gatePush(uint8_t slot, uint8_t level, uint64_t t) {
  uint8_t n = (gateHead + 1) % GATE_Q;
  if (n == gateTail) return;                  // coda piena: il cambio si perde
  gateQ[gateHead].t = t; gateQ[gateHead].slot = slot; gateQ[gateHead].level = level;
  gateHead = n;
}
uint64_t isrNowUs() {
  uint32_t u = micros(), w = microsWraps;
  if (u < lastMicros) w++;
  return ((uint64_t)w << 32) | u;
}
void gateIsr(uint8_t k) {
  int8_t i = gateIntSlot[k];
  if (i < 0) return;
  uint8_t lv = digitalRead(slots[i].pinA) ^ (slots[i].opt & 1);
  if (lv == slots[i].st) return;
  slots[i].st = lv;
  gatePush(i, lv, isrNowUs());
}
void gateIsr0() { gateIsr(0); }
void gateIsr1() { gateIsr(1); }
void gatePoll() {
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    Slot &s = slots[i];
    if (s.type != S_GATE || s.pinA == 2 || s.pinA == 3) continue;
    uint8_t lv = digitalRead(s.pinA) ^ (s.opt & 1);
    if (lv != s.st) { s.st = lv; gatePush(i, lv, nowUs()); }
  }
}
void gateFlush() {
  while (gateTail != gateHead) {
    uint8_t s = SREG; cli();
    GateEv e; e.t = gateQ[gateTail].t; e.slot = gateQ[gateTail].slot; e.level = gateQ[gateTail].level;
    gateTail = (gateTail + 1) % GATE_Q;
    SREG = s;
    dataHead(e.slot, e.t); commaNum(dout, e.level); dout.println();
  }
}

// =====================================================================================
// Display OLED SSD1306 64×32 (0,49"): niente buffer in RAM, si scrive pagina per pagina.
// 4 righe da 8 pixel; il carattere 5×7 occupa 6 colonne → 10 caratteri per riga.
// =====================================================================================
const uint8_t FONT[] PROGMEM = {
  0x00,0x00,0x00,0x00,0x00, 0x00,0x00,0x5F,0x00,0x00, 0x00,0x07,0x00,0x07,0x00, 0x14,0x7F,0x14,0x7F,0x14,
  0x24,0x2A,0x7F,0x2A,0x12, 0x23,0x13,0x08,0x64,0x62, 0x36,0x49,0x55,0x22,0x50, 0x00,0x05,0x03,0x00,0x00,
  0x00,0x1C,0x22,0x41,0x00, 0x00,0x41,0x22,0x1C,0x00, 0x08,0x2A,0x1C,0x2A,0x08, 0x08,0x08,0x3E,0x08,0x08,
  0x00,0x50,0x30,0x00,0x00, 0x08,0x08,0x08,0x08,0x08, 0x00,0x60,0x60,0x00,0x00, 0x20,0x10,0x08,0x04,0x02,
  0x3E,0x51,0x49,0x45,0x3E, 0x00,0x42,0x7F,0x40,0x00, 0x42,0x61,0x51,0x49,0x46, 0x21,0x41,0x45,0x4B,0x31,
  0x18,0x14,0x12,0x7F,0x10, 0x27,0x45,0x45,0x45,0x39, 0x3C,0x4A,0x49,0x49,0x30, 0x01,0x71,0x09,0x05,0x03,
  0x36,0x49,0x49,0x49,0x36, 0x06,0x49,0x49,0x29,0x1E, 0x00,0x36,0x36,0x00,0x00, 0x00,0x56,0x36,0x00,0x00,
  0x08,0x14,0x22,0x41,0x00, 0x14,0x14,0x14,0x14,0x14, 0x00,0x41,0x22,0x14,0x08, 0x02,0x01,0x51,0x09,0x06,
  0x32,0x49,0x79,0x41,0x3E, 0x7E,0x11,0x11,0x11,0x7E, 0x7F,0x49,0x49,0x49,0x36, 0x3E,0x41,0x41,0x41,0x22,
  0x7F,0x41,0x41,0x22,0x1C, 0x7F,0x49,0x49,0x49,0x41, 0x7F,0x09,0x09,0x09,0x01, 0x3E,0x41,0x49,0x49,0x7A,
  0x7F,0x08,0x08,0x08,0x7F, 0x00,0x41,0x7F,0x41,0x00, 0x20,0x40,0x41,0x3F,0x01, 0x7F,0x08,0x14,0x22,0x41,
  0x7F,0x40,0x40,0x40,0x40, 0x7F,0x02,0x0C,0x02,0x7F, 0x7F,0x04,0x08,0x10,0x7F, 0x3E,0x41,0x41,0x41,0x3E,
  0x7F,0x09,0x09,0x09,0x06, 0x3E,0x41,0x51,0x21,0x5E, 0x7F,0x09,0x19,0x29,0x46, 0x46,0x49,0x49,0x49,0x31,
  0x01,0x01,0x7F,0x01,0x01, 0x3F,0x40,0x40,0x40,0x3F, 0x1F,0x20,0x40,0x20,0x1F, 0x3F,0x40,0x38,0x40,0x3F,
  0x63,0x14,0x08,0x14,0x63, 0x07,0x08,0x70,0x08,0x07, 0x61,0x51,0x49,0x45,0x43, 0x00,0x7F,0x41,0x41,0x00,
  0x02,0x04,0x08,0x10,0x20, 0x00,0x41,0x41,0x7F,0x00, 0x04,0x02,0x01,0x02,0x04, 0x40,0x40,0x40,0x40,0x40,
  0x00,0x01,0x02,0x04,0x00, 0x20,0x54,0x54,0x54,0x78, 0x7F,0x48,0x44,0x44,0x38, 0x38,0x44,0x44,0x44,0x20,
  0x38,0x44,0x44,0x48,0x7F, 0x38,0x54,0x54,0x54,0x18, 0x08,0x7E,0x09,0x01,0x02, 0x0C,0x52,0x52,0x52,0x3E,
  0x7F,0x08,0x04,0x04,0x78, 0x00,0x44,0x7D,0x40,0x00, 0x20,0x40,0x44,0x3D,0x00, 0x7F,0x10,0x28,0x44,0x00,
  0x00,0x41,0x7F,0x40,0x00, 0x7C,0x04,0x18,0x04,0x78, 0x7C,0x08,0x04,0x04,0x78, 0x38,0x44,0x44,0x44,0x38,
  0x7C,0x14,0x14,0x14,0x08, 0x08,0x14,0x14,0x18,0x7C, 0x7C,0x08,0x04,0x04,0x08, 0x48,0x54,0x54,0x54,0x20,
  0x04,0x3F,0x44,0x40,0x20, 0x3C,0x40,0x40,0x20,0x7C, 0x1C,0x20,0x40,0x20,0x1C, 0x3C,0x40,0x30,0x40,0x3C,
  0x44,0x28,0x10,0x28,0x44, 0x0C,0x50,0x50,0x50,0x3C, 0x44,0x64,0x54,0x4C,0x44, 0x00,0x08,0x36,0x41,0x00,
  0x00,0x00,0x7F,0x00,0x00, 0x00,0x41,0x36,0x08,0x00, 0x1C,0x3E,0x3E,0x3E,0x1C, 0x00,0x06,0x09,0x09,0x06,
};  // ASCII 32…126; il 127 è il simbolo del grado (°), il 126 (~) un pallino pieno ● (registrazione)

const uint8_t OLED_INIT[] PROGMEM = {
  0xAE, 0xD5, 0x80, 0xA8, 0x1F, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x02,
  0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF,
};
const uint8_t OLED_ADDR = 0x3C, OLED_X0 = 32;     // il pannello 64×32 sta al centro della RAM 128×64

int8_t oledIdx = -1;
uint16_t oledHash[4];

bool oledCmd(uint8_t c) {
  i2cStart();
  bool ok = i2cWrite(OLED_ADDR << 1) && i2cWrite(0x00) && i2cWrite(c);
  i2cStop();
  return ok;
}
bool oledBegin(const Out &o) {
  i2cBus(o.p[0], o.p[1]);
  bool ok = true;
  for (uint8_t i = 0; i < sizeof(OLED_INIT) && ok; i++) ok = oledCmd(pgm_read_byte(&OLED_INIT[i]));
  for (uint8_t p = 0; p < 4; p++) oledHash[p] = 0xFFFF;
  return ok;
}
inline uint8_t glyphCol(char c, uint8_t k) {
  uint8_t ch = (uint8_t)c;
  if (ch < 32 || ch > 127) ch = '?';
  return pgm_read_byte(&FONT[(ch - 32) * 5 + k]);
}
void oledPageStart(uint8_t page) {
  oledCmd(0xB0 | page); oledCmd(OLED_X0 & 0x0F); oledCmd(0x10 | (OLED_X0 >> 4));
  i2cStart(); i2cWrite(OLED_ADDR << 1); i2cWrite(0x40);
}
// riga di testo piccolo (10 caratteri), eventualmente in negativo (barra in alto)
void oledText(uint8_t page, const char *s, bool inv) {
  oledPageStart(page);
  uint8_t x = 0, m = inv ? 0xFF : 0x00;
  bool end = false;
  for (uint8_t i = 0; i < 10; i++) {
    char c = end ? ' ' : s[i];
    if (!c) { end = true; c = ' '; }
    for (uint8_t k = 0; k < 5; k++) i2cWrite(glyphCol(c, k) ^ m);
    i2cWrite(m); x += 6;
  }
  while (x++ < 64) i2cWrite(m);
  i2cStop();
}
// due pagine di testo grande (caratteri 10×14, al massimo 5), centrato
uint8_t dbl(uint8_t n) { uint8_t r = 0; for (uint8_t i = 0; i < 4; i++) if (n & (1 << i)) r |= 3 << (2 * i); return r; }
void oledBig(uint8_t page, const char *s) {
  uint8_t len = 0; while (len < 5 && s[len]) len++;
  uint8_t w = len * 12, pad = (64 - w) / 2;
  for (uint8_t half = 0; half < 2; half++) {
    oledPageStart(page + half);
    for (uint8_t x = 0; x < pad; x++) i2cWrite(0);
    for (uint8_t i = 0; i < len; i++) {
      for (uint8_t k = 0; k < 5; k++) {
        uint8_t col = glyphCol(s[i], k);
        uint8_t b = dbl(half ? col >> 4 : col & 0x0F);
        i2cWrite(b); i2cWrite(b);
      }
      i2cWrite(0); i2cWrite(0);
    }
    for (uint8_t x = pad + w; x < 64; x++) i2cWrite(0);
    i2cStop();
  }
}
uint16_t hashStr(const char *s, uint16_t h) { while (*s) h = h * 31 + (uint8_t)*s++; return h; }

// =====================================================================================
// Stato: lo decide Arduino da solo, così gli indicatori funzionano anche lontano dal telefono
// =====================================================================================
enum St : uint8_t { ST_WAIT, ST_IDLE, ST_SEARCH, ST_ERR, ST_TRACK, ST_SCOPE, ST_CFG, ST_READY, ST_LOG };
const char ST_CODE[] PROGMEM = "WISETOCRL";
St state = ST_WAIT, shownState = (St)255;
int8_t stSlot = -1, shownSlot = -2;
uint8_t stIssue = 0, stK = 0, stN = 0, shownK = 255;
unsigned long stTick = 0, stCycle = 0;
uint8_t buzzBeeps = 0;          // bip ancora da fare in questo giro
unsigned long buzzOffAt = 0;
bool buzzOn = false;

bool linkOk() { return pinged ? (millis() - lastCmdMs < 6000) : (lastCmdMs != 0); }
// c'è tutto per registrare sulla scheda SD senza l'app?
bool sdArmed() { return outPin(O_SD) && EEPROM.read(E_CFG) == 'C'; }
uint32_t fNum = 0;              // numero del file LOGnnnnn.NEO aperto (o dell'ultimo)

// Lo stato segue il problema più grave (LED e cicalino); se i sensori in difficoltà sono più
// d'uno, il display li mostra a turno, prima gli errori e poi quelli in ricerca.
void computeState() {
  stSlot = -1; stIssue = 0; stK = 0; stN = 0;
  if (mode == SCOPE) { state = ST_SCOPE; return; }
  if (sdOn) { state = ST_LOG; return; }
  if (!linkOk()) {
    if (sdErr) { state = ST_ERR; stSlot = -2; stIssue = 2; return; }      // problema della scheda SD
    state = sdArmed() && outPin(O_BTN) ? ST_READY : ST_WAIT;
    return;
  }
  if (cfgBad || outBad) { state = ST_CFG; stSlot = cfgBad ? cfgBadSlot : -1; stIssue = cfgBad ? cfgBadWhy : outBad; return; }
  if (mode == IDLE) { state = ST_IDLE; return; }
  uint8_t list[MAX_SLOTS];
  for (uint8_t lvl = 2; lvl >= 1; lvl--)
    for (uint8_t i = 0; i < MAX_SLOTS; i++)
      if (slots[i].type != S_NONE && slots[i].issue == lvl) list[stN++] = i;
  if (!stN) { state = ST_TRACK; return; }
  state = slots[list[0]].issue == 2 ? ST_ERR : ST_SEARCH;
  uint8_t k = (millis() / 2500) % stN;
  stSlot = list[k]; stK = k + 1; stIssue = slots[stSlot].issue;
}

// quanti sensori dello stesso tipo ci sono, e che numero ha questo (da 1): «DHT #2»
uint8_t sameType(uint8_t slot, uint8_t &ord) {
  uint8_t n = 0; ord = 0;
  for (uint8_t i = 0; i < MAX_SLOTS; i++) if (slots[i].type == slots[slot].type) { n++; if (i <= slot) ord = n; }
  return n;
}
// "PROBL 1/2": prefisso (PROGMEM) e contatore
void barCount(char *bar, const char *pre) {
  strcpy_P(bar, pre);
  uint8_t n = strlen(bar);
  bar[n++] = ' '; bar[n++] = '0' + stK; bar[n++] = '/'; bar[n++] = '0' + stN; bar[n] = 0;
}

const char TYPE_NAMES[] PROGMEM = "?    NTC  ANA  DHT  SONARGPS  DS18 GATE HX711IMU  MLX  SPS  ";
void typeName(uint8_t t, char *dst) {
  if (t > S_LAST) t = 0;
  for (uint8_t k = 0; k < 5; k++) dst[k] = pgm_read_byte(&TYPE_NAMES[t * 5 + k]);
  dst[5] = 0;
  for (int8_t k = 4; k >= 0 && dst[k] == ' '; k--) dst[k] = 0;
}

// i testi del display (barra, testo grande, riga piccola) per lo stato attuale
void screenTexts(char *bar, char *big, char *small) {
  static const char spin[] PROGMEM = "-\\|/";
  char sp = pgm_read_byte(&spin[(millis() / 300) % 4]);
  big[0] = small[0] = 0;
  switch (state) {
    case ST_WAIT:
      if (mode == RUN) { strcpy_P(bar, PSTR("LINK LOST")); strcpy_P(big, linkBt ? PSTR("BT?") : PSTR("USB?")); strcpy_P(small, PSTR("reconnect")); }
      else {
        // in attesa dell'app: come collegarsi (il cavo sempre, il Bluetooth se il modulo ha risposto
        // a BT,SETUP) e la versione del firmware: «USB v1.3» oppure «USB/BT 1.3»
        strcpy_P(bar, PSTR("NO APP")); strcpy_P(big, PSTR("WAIT"));
        strcpy_P(small, btKind ? PSTR("USB/BT " FW_VERSION) : PSTR("USB v" FW_VERSION));
      }
      break;
    case ST_IDLE: strcpy_P(bar, linkBt ? PSTR("LINK BT") : PSTR("LINK USB")); strcpy_P(big, PSTR("READY")); strcpy_P(small, PSTR("tap Start")); break;
    case ST_CFG: {
      static const char WHY[] PROGMEM = "?         bad pin   pin A0-A5 pin twice 1 GPS onlytype?     command?  ";
      strcpy_P(bar, PSTR("BAD SETUP"));
      if (cfgBad) { if (cfgBadType) typeName(cfgBadType, big); else strcpy_P(big, PSTR("?")); }
      else strcpy_P(big, PSTR("OUT"));
      uint8_t w = stIssue > 6 ? 0 : stIssue;
      for (uint8_t k = 0; k < 10; k++) small[k] = pgm_read_byte(&WHY[w * 10 + k]);
      small[10] = 0;
      for (int8_t k = 9; k >= 0 && small[k] == ' '; k--) small[k] = 0;
      break;
    }
    case ST_SCOPE: strcpy_P(bar, PSTR("LIVE A0")); strcpy_P(big, PSTR("SCOPE")); strcpy_P(small, linkBt ? PSTR("via BT") : PSTR("via USB")); break;
    case ST_READY: strcpy_P(bar, PSTR("SD CARD")); strcpy_P(big, PSTR("PRESS")); strcpy_P(small, PSTR("to record")); break;
    case ST_SEARCH:
    case ST_ERR: {
      if (stSlot < 0) { strcpy_P(bar, PSTR("ERROR")); strcpy_P(big, PSTR("SD")); strcpy_P(small, PSTR("card?")); break; }
      // il testo segue il sensore mostrato in questo turno (lo stato segue il più grave)
      const Slot &s = slots[stSlot];
      uint8_t ord, same = sameType(stSlot, ord);
      char *q = small;
      if (same > 1) { *q++ = '#'; *q++ = '0' + ord; *q++ = ' '; }
      if (stIssue == 1 && s.type == S_GPS) {
        if (stN > 1) barCount(bar, PSTR("SEARCH")); else strcpy_P(bar, PSTR("GPS SEARCH"));
        uint8_t n = 0; while (gSats[n] && n < 2) { big[n] = gSats[n]; n++; }
        if (!n) big[n++] = '0';
        strcpy_P(big + n, PSTR(" sat"));
        strcpy_P(small, PSTR("go outside"));
      } else if (stIssue == 1) {
        if (stN > 1) barCount(bar, PSTR("SEARCH")); else strcpy_P(bar, s.type == S_SONAR ? PSTR("NO ECHO") : PSTR("WAITING"));
        typeName(s.type, big);
        strcpy_P(q, s.type == S_SONAR ? (same > 1 ? PSTR("echo?") : PSTR("target?")) : PSTR("waiting"));
      } else {
        if (stN > 1) barCount(bar, PSTR("ERROR")); else strcpy_P(bar, PSTR("ERROR"));
        typeName(s.type, big);
        // con il numero davanti c'è spazio solo per un suggerimento corto
        switch (s.type) {
          case S_GPS: strcpy_P(q, PSTR("GPS wires?")); break;
          case S_NTC: strcpy_P(q, PSTR("probe?")); break;
          case S_DS18: strcpy_P(q, same > 1 ? PSTR("4.7k?") : PSTR("4.7k wire?")); break;
          case S_IMU: case S_MLX: case S_SPS: strcpy_P(q, same > 1 ? PSTR("SDA?") : PSTR("SDA wires?")); break;
          case S_HX711: strcpy_P(q, same > 1 ? PSTR("DT?") : PSTR("DT wires?")); break;
          default: strcpy_P(q, PSTR("wires?"));
        }
      }
      break;
    }
    case ST_TRACK:
    case ST_LOG: {
      // registrazione: il pallino ● lampeggia all'inizio della barra (inconfondibile);
      // «●REC 12:34» col valore dell'app sotto, altrimenti il tempo grande
      unsigned long s = (millis() - runStartMs) / 1000;
      unsigned int m = s / 60;
      char tm[6], *q = tm;
      if (m > 99) { m /= 60; *q++ = '0' + m / 10 % 10; *q++ = '0' + m % 10; *q++ = 'h'; }
      else {
        if (m >= 10) *q++ = '0' + m / 10;
        *q++ = '0' + m % 10; *q++ = ':';
        *q++ = '0' + (s % 60) / 10; *q++ = '0' + s % 10;
      }
      *q = 0;
      bool sd = state == ST_LOG, val = !sd && appBig[0];
      bar[0] = (millis() / 500) % 2 ? '~' : ' ';
      strcpy_P(bar + 1, sd ? PSTR("SD REC") : val ? PSTR("REC ") : linkBt ? PSTR("REC BT") : PSTR("REC USB"));
      if (val) { strcat(bar, tm); strcpy(big, appBig); strcpy(small, appSmall); }
      else {
        strcpy(big, tm);
        if (sd) {
          // il file in cui sta scrivendo: "LOG00012"
          strcpy_P(small, PSTR("LOG"));
          uint32_t n = fNum;
          for (int8_t k = 7; k >= 3; k--) { small[k] = '0' + n % 10; n /= 10; }
          small[8] = 0;
        } else strcpy_P(small, PSTR("measuring"));
      }
      return;                     // la barra è già completa (niente indicatore nell'angolo)
    }
  }
  // indicatore di vita nell'angolo della barra
  uint8_t n = strlen(bar);
  while (n < 9) bar[n++] = ' ';
  bar[9] = (state == ST_WAIT || state == ST_SEARCH) ? sp : ' ';
  bar[10] = 0;
}

void oledRefresh() {
  if (oledIdx < 0) return;
  char bar[16], big[8], small[16];
  screenTexts(bar, big, small);
  i2cBus(outs[oledIdx].p[0], outs[oledIdx].p[1]);
  uint16_t h0 = hashStr(bar, 7), h1 = hashStr(big, 11), h3 = hashStr(small, 13);
  if (h0 != oledHash[0]) { oledText(0, bar, true); oledHash[0] = h0; }
  if (h1 != oledHash[1]) { oledBig(1, big); oledHash[1] = h1; }
  if (h3 != oledHash[3]) { oledText(3, small, false); oledHash[3] = h3; }
}

void rgbSet(const Out &o, uint8_t rgb) {
  for (uint8_t k = 0; k < 3; k++) {
    bool on = (rgb >> k) & 1;
    digitalWrite(o.p[k], (on ^ (o.opt & 1)) ? HIGH : LOW);
  }
}
// tone(pin, 2700) e noTone(pin) del core, ridotti a quello che fanno sull'Uno (un solo pin alla
// volta, timer 2) con la frequenza fissa: 16 MHz / 2700 / 2 → prescaler 32, OCR2A = 91. Stessi
// registri, nello stesso ordine; il pin si inverte a ogni confronto (durata infinita).
uint8_t tonePin = 255;                  // come tone_pins[0] del core: 255 = libero
volatile uint8_t *tonePort;
uint8_t toneMask;
void toneOn(uint8_t p) {
  if (tonePin != p) {
    if (tonePin != 255) return;         // il timer suona già su un altro pin: il core non fa niente
    tonePin = p;
    TCCR2A = 0; TCCR2B = 0;
    TCCR2A |= _BV(WGM21); TCCR2B |= _BV(CS20);
    tonePort = portOutputRegister(digitalPinToPort(p));
    toneMask = digitalPinToBitMask(p);
  }
  pinMode(p, OUTPUT);
  TCCR2B = (TCCR2B & 0b11111000) | 0b011;
  OCR2A = 91;
  TIMSK2 |= _BV(OCIE2A);
}
void toneOff(uint8_t p) {
  if (tonePin == p) {
    tonePin = 255;
    TIMSK2 &= ~_BV(OCIE2A);
    TCCR2A = _BV(WGM20);
    TCCR2B = (TCCR2B & 0b11111000) | _BV(CS22);
    OCR2A = 0;
  }
  digitalWrite(p, LOW);
}
ISR(TIMER2_COMPA_vect) { *tonePort ^= toneMask; }
void buzz(const Out &o, bool on) {
  if (o.opt & 1) { if (on) toneOn(o.p[0]); else toneOff(o.p[0]); }
  else digitalWrite(o.p[0], on ? HIGH : LOW);
  buzzOn = on;
}
// bip di conferma (bloccante ma breve): n bip da ms millisecondi
void chirp(uint8_t n, unsigned int ms) {
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    if (outs[i].type != O_BUZ || !(outs[i].opt & 4)) continue;
    for (uint8_t k = 0; k < n; k++) { buzz(outs[i], true); delay(ms); buzz(outs[i], false); if (k + 1 < n) delay(70); }
  }
}

// ogni 100 ms: stato, LED, cicalino, display
void statusTick() {
  unsigned long now = millis();
  if (now - stTick < 100) return;
  stTick = now;
  St before = state;
  computeState();
  if (state != shownState || stSlot != shownSlot || stK != shownK) {
    Serial.print(F("#ST,")); Serial.print((char)pgm_read_byte(&ST_CODE[state]));
    commaNum(Serial, stSlot); commaNum(Serial, stIssue); commaNum(Serial, stK); commaNum(Serial, stN);
    commaNum(Serial, btKind); Serial.print(','); Serial.println(linkBt ? 'B' : 'U');
    if (state != shownState) {
      if ((state == ST_TRACK || state == ST_LOG) && before != state && shownState != (St)255) chirp(2, 60);
      stCycle = now;                            // il nuovo stato si sente subito
    }
    shownState = state; shownSlot = stSlot; shownK = stK;
  }
  // giro di 3 s: 1 bip = attesa / pronto ma fermo, 2 = in ricerca, 3 = problema
  uint8_t beeps = state == ST_WAIT || state == ST_IDLE || state == ST_READY ? 1 : state == ST_SEARCH ? 2 : state == ST_ERR || state == ST_CFG ? 3 : 0;
  unsigned long ph = (now - stCycle) % 3000;
  bool beepNow = ph < beeps * 200UL && (ph % 200) < 90;
  bool blink = (now / 500) % 2, fast = (now / 125) % 2;
  uint8_t col = state == ST_WAIT ? (blink ? 4 : 0) : state == ST_IDLE || state == ST_READY ? 4 : state == ST_SEARCH ? (fast ? 3 : 0)
              : state == ST_ERR || state == ST_CFG ? (fast ? 1 : 0) : state == ST_TRACK || state == ST_LOG ? 2 : 6;
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    const Out &o = outs[i];
    if (o.type == O_RGB) rgbSet(o, col);
    else if (o.type == O_BUZ) {
      bool want = (o.opt & 2) && beepNow && mode != SCOPE;
      if (want != buzzOn) buzz(o, want);
    }
  }
  static uint8_t oledDiv = 0;
  if (++oledDiv >= 3) { oledDiv = 0; oledRefresh(); }
}

// ---------- configurazione degli indicatori ----------
void outsOff() {
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    const Out &o = outs[i];
    if (o.type == O_RGB) rgbSet(o, 0);
    if (o.type == O_BUZ) buzz(o, false);
  }
}
void outApply(uint8_t i) {
  Out &o = outs[i];
  if (o.type == O_RGB) { for (uint8_t k = 0; k < 3; k++) pinMode(o.p[k], OUTPUT); rgbSet(o, 0); }
  if (o.type == O_BUZ) { pinMode(o.p[0], OUTPUT); digitalWrite(o.p[0], LOW); }
  if (o.type == O_OLED) { oledIdx = i; oledBegin(o); }
  if (o.type == O_BTN) pinMode(o.p[0], INPUT_PULLUP);
  if (o.type == O_SD) { pinMode(o.p[0], OUTPUT); digitalWrite(o.p[0], HIGH); }
}
void outsClear() {
  outBad = 0;
  outsOff();
  if (oledIdx >= 0) { i2cBus(outs[oledIdx].p[0], outs[oledIdx].p[1]); oledCmd(0xAE); }
  for (uint8_t i = 0; i < MAX_OUTS; i++) outs[i].type = O_NONE;
  oledIdx = -1;
}
// risposta di errore a OUT,ADD: «#ERR,OUT,<motivo>», e il motivo resta segnalato (stato C)
void outErr(uint8_t why, const __FlashStringHelper *msg) { outBad = why; Serial.print(F("#ERR,OUT,")); Serial.println(msg); }
void outAdd(char *args) {
  char *f[5]; uint8_t n = 0;
  f[n++] = args;
  for (char *p = args; *p && n < 5; p++) if (*p == ',') { *p = '\0'; f[n++] = p + 1; }
  if (n < 5) { outErr(6, F("ARGS")); return; }
  static const char ONAMES[] PROGMEM = "OLED\0" "RGB\0" "BUZ\0" "BTN\0" "SD";   // nell'ordine di OutType
  uint8_t t = O_NONE;
  PGM_P nm = ONAMES;
  for (uint8_t k = O_OLED; k <= O_SD; k++) { if (strcmp_P(f[0], nm) == 0) { t = k; break; } nm += strlen_P(nm) + 1; }
  if (t == O_NONE) { outErr(5, F("TYPE")); return; }
  uint8_t np = t == O_RGB ? 3 : t == O_OLED ? 2 : 1;
  uint8_t pins[3];
  for (uint8_t k = 0; k < 3; k++) pins[k] = (uint8_t)atol(f[1 + k]);
  for (uint8_t k = 0; k < np; k++) {
    if (pins[k] < 2 || pins[k] > 19) { outErr(1, F("PIN")); return; }
    if (!outPinFree(pins[k], t == O_OLED)) { outErr(3, F("DUPLICATE")); return; }
  }
  // il modulo SD prende anche D10…D13 (SPI)
  if (t == O_SD) for (uint8_t q = 10; q <= 13; q++) if (q != pins[0] && !outPinFree(q, false)) { outErr(3, F("DUPLICATE")); return; }
  int8_t slot = -1;
  for (uint8_t i = 0; i < MAX_OUTS; i++) if (outs[i].type == t || (slot < 0 && outs[i].type == O_NONE)) slot = i;
  if (slot < 0) { outErr(6, F("FULL")); return; }
  Out &o = outs[slot];
  o.type = t; o.p[0] = pins[0]; o.p[1] = pins[1]; o.p[2] = pins[2]; o.opt = (uint8_t)atol(f[4]);
  outApply(slot);
  ledFree = outPinFree(13, false) && !pinTakenBySlot(13);
  Serial.print(F("#ACK,OUT,ADD,")); Serial.println(f[0]);
}
void outsSave() {
  EEPROM.update(0, 'M'); EEPROM.update(1, 2);
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    // tipo, p1, p2, p3, opz: i 5 byte della struttura, in ordine
    const uint8_t *o = (const uint8_t *)&outs[i];
    for (uint8_t k = 0; k < 5; k++) EEPROM.update(E_OUTS + i * 5 + k, o[k]);
  }
  Serial.println(F("#ACK,OUT,SAVE"));
}
void outsLoad() {
  for (uint8_t i = 0; i < MAX_OUTS; i++) outs[i].type = O_NONE;
  // versione 1 (firmware fino alla 1.4, indicatori ai byte 2…16): si ignora, l'app li rimanda
  if (EEPROM.read(0) != 'M' || EEPROM.read(1) != 2) return;
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    int b = E_OUTS + i * 5;
    Out &o = outs[i];
    o.type = EEPROM.read(b);
    if (o.type > O_SD) { o.type = O_NONE; continue; }
    for (uint8_t k = 1; k < 5; k++) ((uint8_t *)&o)[k] = EEPROM.read(b + k);   // p1, p2, p3, opz
    if (o.type != O_NONE) outApply(i);
  }
}
void outsTest() {
  for (uint8_t c = 1; c <= 7; c++) {
    for (uint8_t i = 0; i < MAX_OUTS; i++) if (outs[i].type == O_RGB) rgbSet(outs[i], c);
    delay(250);
  }
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    if (outs[i].type == O_BUZ) { buzz(outs[i], true); delay(150); buzz(outs[i], false); }
    if (outs[i].type == O_OLED) {
      i2cBus(outs[i].p[0], outs[i].p[1]);
      char a[11], b[6];
      strcpy_P(a, PSTR("TEST")); oledText(0, a, true);
      strcpy_P(b, PSTR("HELLO")); oledBig(1, b);
      strcpy_P(a, PSTR("it works!")); oledText(3, a, false);
      for (uint8_t p = 0; p < 4; p++) oledHash[p] = 0xFFFF;
    }
  }
  delay(1500);
  outsOff();
  Serial.println(F("#ACK,OUT,TEST"));
}

// =====================================================================================
// HC-SR04, DHT, GPS
// =====================================================================================
// ---------- DHT11 / DHT22 (a bit-bang, senza librerie) ----------
// L'Arduino tiene DATA basso per avviare la misura; il sensore risponde con 80 µs basso + 80 µs
// alto, poi 40 bit: ~50 µs basso seguito da ~27 µs alto (bit 0) o ~70 µs alto (bit 1).
unsigned long dhtWhile(uint8_t pin, uint8_t level, unsigned long timeoutUs) {
  unsigned long t0 = micros();
  while (digitalRead(pin) == level) {
    if (micros() - t0 > timeoutUs) return 0;
  }
  unsigned long d = micros() - t0;
  return d ? d : 1;
}

// 0 = ok, 1 = nessuna risposta, 2 = checksum sbagliato
uint8_t dhtRead(uint8_t pin, uint8_t model) {
  for (uint8_t i = 0; i < 5; i++) dhtData[i] = 0;
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  if (model == 22) delayMicroseconds(1100); else delay(20);
  pinMode(pin, INPUT_PULLUP);
  delayMicroseconds(40);
  if (!dhtWhile(pin, LOW, 200)) return 1;
  if (!dhtWhile(pin, HIGH, 200)) return 1;
  for (uint8_t i = 0; i < 40; i++) {
    if (!dhtWhile(pin, LOW, 150)) return 1;
    unsigned long high = dhtWhile(pin, HIGH, 150);
    if (!high) return 1;
    dhtData[i / 8] <<= 1;
    if (high > 48) dhtData[i / 8] |= 1;
  }
  uint8_t sum = dhtData[0] + dhtData[1] + dhtData[2] + dhtData[3];
  return sum == dhtData[4] ? 0 : 2;
}

// ---------- HC-SR04 ----------
// Restituisce l'eco in µs (0 se nessun eco) e, in tStamp, l'istante a metà del volo.
unsigned long sonarRead(uint8_t trig, uint8_t echo, uint64_t &tStamp) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  uint64_t tTrig = nowUs();
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long e = pulseIn(echo, HIGH, ECHO_TIMEOUT_US);
  tStamp = tTrig + e / 2;
  return e;
}

// ---------- GPS (NMEA) ----------
// Servono $GPRMC/$GNRMC (ora, stato, posizione, velocità, data) e $GPGGA/$GNGGA (fix,
// satelliti, HDOP, altitudine). Si controlla il checksum e si conservano i campi come testo.
void copyField(char *dst, uint8_t size, const char *src) {
  uint8_t i = 0;
  while (src[i] && i < size - 1) { dst[i] = src[i]; i++; }
  dst[i] = '\0';
}
// Coordinata con segno: '-' davanti se l'emisfero è S o W.
void copyCoord(char *dst, uint8_t size, const char *val, const char *hemi) {
  if (!*val) { dst[0] = '\0'; return; }
  uint8_t o = 0;
  if (*hemi == 'S' || *hemi == 'W') dst[o++] = '-';
  copyField(dst + o, size - o, val);
}
uint8_t hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return 0;
}
void parseNmea(char *line) {
  if (line[0] != '$') return;
  char *star = strchr(line, '*');
  if (!star || !star[1] || !star[2]) return;
  uint8_t sum = 0;
  for (char *p = line + 1; p < star; p++) sum ^= (uint8_t)*p;
  if (sum != (uint8_t)((hexVal(star[1]) << 4) | hexVal(star[2]))) return;   // frase rovinata
  *star = '\0';
  char *f[16];
  uint8_t n = 0;
  f[n++] = line;
  for (char *p = line; *p && n < 16; p++) if (*p == ',') { *p = '\0'; f[n++] = p + 1; }
  if (strlen(f[0]) < 6) return;
  const char *type = f[0] + 3;
  if (strcmp_P(type, PSTR("RMC")) == 0 && n >= 10) {
    copyField(gUtc, sizeof(gUtc), f[1]);
    copyField(gDate, sizeof(gDate), f[9]);
    if (f[2][0] == 'A') {
      copyCoord(gLat, sizeof(gLat), f[3], f[4]);
      copyCoord(gLon, sizeof(gLon), f[5], f[6]);
      copyField(gSpd, sizeof(gSpd), f[7]);
    } else {
      gFix = '0';
    }
  } else if (strcmp_P(type, PSTR("GGA")) == 0 && n >= 10) {
    copyField(gUtc, sizeof(gUtc), f[1]);
    gFix = f[6][0] ? f[6][0] : '0';
    copyField(gSats, sizeof(gSats), f[7]);
    copyField(gHdop, sizeof(gHdop), f[8]);
    if (gFix != '0') {
      copyCoord(gLat, sizeof(gLat), f[2], f[3]);
      copyCoord(gLon, sizeof(gLon), f[4], f[5]);
      copyField(gAlt, sizeof(gAlt), f[9]);
    }
  }
}
void pollGps() {
  if (!gpsSerial) return;
  while (gpsSerial->available() > 0) {
    char c = (char)gpsSerial->read();
    nmeaLastByte = millis();
    if (c == '$') nmeaLen = 0;
    if (c == '\n' || c == '\r') {
      if (nmeaLen > 6) { nmea[nmeaLen] = '\0'; parseNmea(nmea); }
      nmeaLen = 0;
    } else if (nmeaLen < sizeof(nmea) - 1) {
      nmea[nmeaLen++] = c;
    }
  }
}
void printField(const char *s) {
  dout.print(',');
  if (*s) dout.print(s); else dout.print(F("nan"));
}
void gpsStop() {
  if (gpsSerial) { gpsSerial->~SoftwareSerial(); gpsSerial = nullptr; }   // il distruttore chiama end()
  gpsSlot = -1;
}

// =====================================================================================
// Configurazione del montaggio
// =====================================================================================
bool isAnalog(uint8_t p) { return p >= 14 && p <= 19; }
bool pinOk(uint8_t p) { return p >= 2 && p <= 19; }
bool isI2c(uint8_t t) { return t == S_IMU || t == S_MLX || t == S_SPS; }
bool twoPins(uint8_t t) { return t == S_SONAR || t == S_GPS || t == S_HX711 || isI2c(t); }

// pin già usato da un altro slot? (i2c: i pin I2C si possono condividere con altri I2C)
bool pinTaken(uint8_t pin, uint8_t except, bool i2c) {
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    if (i == except || slots[i].type == S_NONE) continue;
    const Slot &s = slots[i];
    if (i2c && isI2c(s.type)) continue;
    if (s.pinA == pin) return true;
    if (twoPins(s.type) && s.pinB == pin) return true;
  }
  return false;
}
bool pinTakenBySlot(uint8_t pin) { return pinTaken(pin, 255); }
// pin usati da un indicatore o accessorio (il modulo SD prende anche D10…D13)
bool outUses(const Out &o, uint8_t p) {
  if (o.type == O_SD) return p == o.p[0] || (p >= 10 && p <= 13);
  uint8_t np = o.type == O_RGB ? 3 : o.type == O_OLED ? 2 : 1;
  for (uint8_t k = 0; k < np; k++) if (o.p[k] == p) return true;
  return false;
}
bool outClash(uint8_t p, bool i2c) {
  for (uint8_t i = 0; i < MAX_OUTS; i++) {
    const Out &o = outs[i];
    if (o.type == O_NONE || (i2c && o.type == O_OLED)) continue;
    if (outUses(o, p)) return true;
  }
  return false;
}
bool outPinFree(uint8_t p, bool i2c) { return !outClash(p, i2c) && !pinTaken(p, 255, i2c); }

void cfgError(int slot, const __FlashStringHelper *why, uint8_t code) {
  cfgBad = true; cfgBadSlot = slot; cfgBadWhy = code; cfgBadType = cfgPendingType;
  Serial.print(F("#ERR,CFG,"));
  Serial.print(slot);
  Serial.print(',');
  Serial.println(why);
}

void gateDetach() {
  for (uint8_t k = 0; k < 2; k++) if (gateIntSlot[k] >= 0) { detachInterrupt(k); gateIntSlot[k] = -1; }
}

void cfgReset() {
  mode = IDLE;
  gpsStop();
  gateDetach();
  for (uint8_t i = 0; i < MAX_SLOTS; i++) slots[i].type = S_NONE;
  cfgBad = false;
  ledFree = outPinFree(13, false);
  led(false);
}
void cfgClear() { cfgReset(); Serial.println(F("#ACK,CFG,CLEAR")); }

// 0 a posto, altrimenti il motivo: 1 pin, 2 non analogico, 3 pin doppio, 4 secondo GPS
uint8_t cfgApply(uint8_t slot, uint8_t type, long ms, uint8_t a, uint8_t b, uint8_t opt) {
  bool two = twoPins(type), i2c = isI2c(type);
  if (!pinOk(a) || (two && (!pinOk(b) || a == b))) return 1;
  if ((type == S_NTC || type == S_ANA) && !isAnalog(a)) return 2;
  if (pinTaken(a, slot, i2c) || (two && pinTaken(b, slot, i2c))) return 3;
  if (outClash(a, i2c) || (two && outClash(b, i2c))) return 3;     // un indicatore usa già quel pin
  if (type == S_GPS && gpsSlot >= 0 && gpsSlot != slot) return 4;
  // intervalli minimi: oltre, il sensore non ce la fa
  // NONE, NTC, ANA, DHT (DHT22: 2000), SONAR, GPS, DS18, GATE, HX711, IMU, MLX, SPS
  static const uint16_t MIN_MS[] PROGMEM = { 5, 5, 5, 1000, 30, 1000, 1000, 5, 100, 10, 100, 1000 };
  long minMs = type == S_DHT && opt == 22 ? 2000 : pgm_read_word(&MIN_MS[type]);
  if (ms < minMs) ms = minMs;
  if (ms > 600000L) ms = 600000L;
  Slot &s = slots[slot];
  if (s.type == S_GPS) gpsStop();
  s.type = type; s.pinA = a; s.pinB = b; s.opt = opt; s.intervalMs = (unsigned long)ms;
  s.st = 0; s.bad = 0; s.issue = 0;
  if (type == S_SONAR) { pinMode(a, OUTPUT); digitalWrite(a, LOW); pinMode(b, INPUT); }
  if (type == S_DHT) pinMode(a, INPUT_PULLUP);
  if (type == S_GPS) { gpsSlot = slot; gpsSerial = new (gpsMem) SoftwareSerial(a, b); }
  if (type == S_DS18) lineRelease(a);
  if (type == S_HX711) { pinMode(a, INPUT); pinMode(b, OUTPUT); digitalWrite(b, LOW); }
  if (type == S_GATE) pinMode(a, (opt & 2) ? INPUT_PULLUP : INPUT);
  ledFree = outPinFree(13, false);
  return 0;
}

void cfgAdd(char *args) {
  // args: "<slot>,<tipo>,<ms>,<pinA>,<pinB>,<opz>"
  char *f[6];
  uint8_t n = 0;
  cfgPendingType = S_NONE;
  f[n++] = args;
  for (char *p = args; *p && n < 6; p++) if (*p == ',') { *p = '\0'; f[n++] = p + 1; }
  if (n < 6) { cfgError(-1, F("ARGS"), 6); return; }
  int slot = (int)atol(f[0]);
  if (slot < 0 || slot >= MAX_SLOTS) { cfgError(slot, F("SLOT"), 6); return; }
  uint8_t type = S_NONE;
  char nm[6];
  for (uint8_t t = S_NTC; t <= S_LAST; t++) { typeName(t, nm); if (strcmp(nm, f[1]) == 0) type = t; }
  if (type == S_NONE) { cfgError(slot, F("TYPE"), 5); return; }
  cfgPendingType = type;
  uint8_t e = cfgApply(slot, type, atol(f[2]), (uint8_t)atol(f[3]), (uint8_t)atol(f[4]), (uint8_t)atol(f[5]));
  if (e) { cfgError(slot, e == 1 ? F("PIN") : e == 2 ? F("ANALOG") : e == 3 ? F("DUPLICATE") : F("GPS"), e); return; }
  Serial.print(F("#ACK,CFG,ADD,"));
  Serial.println(slot);
}

// ---------- configurazione salvata (per registrare sulla scheda SD senza l'app) ----------
void cfgSave(const char *id) {
  bool any = false;
  for (uint8_t i = 0; i < MAX_SLOTS; i++) if (slots[i].type != S_NONE) any = true;
  if (!any) { Serial.println(F("#ERR,CFG,-1,EMPTY")); return; }
  EEPROM.update(E_CFG, 'C');
  bool end = false;
  for (uint8_t k = 0; k < 12; k++) {
    char c = end ? 0 : id[k];
    if (!(isalnum(c) || c == '_' || c == '-')) { end = true; c = 0; }
    EEPROM.update(E_ID + k, c);
  }
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    const Slot &s = slots[i];
    // tipo, pinA, pinB, opz e l'intervallo (little endian come l'AVR): i primi 8 byte della struttura
    const uint8_t *d = (const uint8_t *)&s;
    for (uint8_t k = 0; k < 8; k++) EEPROM.update(E_SLOTS + i * 8 + k, d[k]);
  }
  Serial.println(F("#ACK,CFG,SAVE"));
}
bool cfgLoad() {
  if (EEPROM.read(E_CFG) != 'C') return false;
  cfgReset();
  bool any = false;
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    int b = E_SLOTS + i * 8;
    uint8_t t = EEPROM.read(b);
    if (t == S_NONE || t > S_LAST) continue;
    uint32_t ms = 0;
    for (int8_t k = 3; k >= 0; k--) ms = (ms << 8) | EEPROM.read(b + 4 + k);
    if (!cfgApply(i, t, ms, EEPROM.read(b + 1), EEPROM.read(b + 2), EEPROM.read(b + 3))) any = true;
  }
  return any;
}

void startRun() {
  bool any = false;
  for (uint8_t i = 0; i < MAX_SLOTS; i++) if (slots[i].type != S_NONE) any = true;
  if (!any) { Serial.println(F("#ERR,START,EMPTY")); return; }
  adcFast(false);
  t0Us = nowUs();
  unsigned long now = millis();
  runStartMs = now;
  appBig[0] = appSmall[0] = 0;
  gateDetach();
  gateHead = gateTail = 0;
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    Slot &s = slots[i];
    s.bad = 0; s.issue = 0;
    // DHT, GPS e DS18B20 vogliono un attimo prima della prima lettura
    s.nextMs = now + ((s.type == S_DHT || s.type == S_GPS) ? 1000 : s.type == S_DS18 ? 800 : 0);
    if (s.type == S_DS18) { s.st = ds18Convert(s.pinA); if (!s.st) s.issue = 2; }
    if (s.type == S_IMU) { s.st = imuInit(s); if (!s.st) s.issue = 2; }
    // SPS30: il ventilatore parte e il primo dato arriva dopo circa un secondo
    if (s.type == S_SPS) { s.st = spsCmd(s, 0x0010, true); s.issue = s.st ? 1 : 2; s.nextMs = now + 1000; }
    if (s.type == S_GATE) {
      s.st = digitalRead(s.pinA) ^ (s.opt & 1);
      gatePush(i, s.st, t0Us);                 // livello di partenza
      if (s.pinA == 2 || s.pinA == 3) {
        uint8_t k = s.pinA - 2;
        gateIntSlot[k] = i;
        attachInterrupt(k, k ? gateIsr1 : gateIsr0, CHANGE);
      }
    }
  }
  memset(&shared.r.g, 0, sizeof(shared.r.g));     // dopo l'oscilloscopio qui c'erano dei campioni
  gFix = '0';
  if (gpsSerial) { gpsSerial->begin(9600); nmeaLen = 0; nmeaLastByte = 0; }
  mode = RUN;
  led(true);
  Serial.println(F("#ACK,START"));
}

void stopAll() {
  bool wasRun = mode == RUN;
  if (gpsSerial) gpsSerial->end();
  gateDetach();
  for (uint8_t i = 0; i < MAX_SLOTS; i++) if (slots[i].type == S_SPS && slots[i].st) { spsCmd(slots[i], 0x0104, false); slots[i].st = 0; }   // ferma il ventilatore
  if (mode == SCOPE) adcFast(false);
  mode = IDLE;
  led(false);
  Serial.println(F("#ACK,STOP"));
  if (wasRun) chirp(1, 350);
}

// ---------- lettura di uno slot ----------
// Restituisce false se la lettura va rimandata (DHT mentre il GPS sta trasmettendo, HX711 non pronto).
void markBad(Slot &s, bool bad, uint8_t after, uint8_t level) {
  if (!bad) { s.bad = 0; s.issue = 0; return; }
  if (s.bad < 255) s.bad++;
  if (s.bad >= after) s.issue = level;
}
bool readSlot(uint8_t i) {
  Slot &s = slots[i];
  uint64_t stamp = nowUs();
  switch (s.type) {
    case S_NTC:
    case S_ANA: {
      uint16_t sum = readAdcSum(s.pinA);
      dataHead(i, stamp); dout.print(','); printFloat(sum * (1.0f / ADC_SAMPLES), 2); dout.println();
      // media < 2 o > 1021 (la media è esatta: somma / 16): sonda staccata o in corto
      if (s.type == S_NTC) markBad(s, sum < 2 * ADC_SAMPLES || sum > 1021 * ADC_SAMPLES, 3, 2);
      return true;
    }
    case S_DHT: {
      // il DHT ha tempi da µs: con il GPS attivo lo si legge in un momento di silenzio e a
      // ricezione spenta, altrimenti le interruzioni della SoftwareSerial rovinano i bit
      if (gpsSerial) {
        if (millis() - nmeaLastByte < 30 && (long)(millis() - s.nextMs) < 600) return false;
        gpsSerial->end();
      }
      uint8_t err = dhtRead(s.pinA, s.opt == 22 ? 22 : 11);
      if (gpsSerial) gpsSerial->begin(9600);
      dataHead(i, stamp);
      for (uint8_t k = 0; k < 4; k++) commaNum(dout, dhtData[k]);
      commaNum(dout, err); dout.println();
      markBad(s, err != 0, 3, 2);
      return true;
    }
    case S_SONAR: {
      unsigned long echo = sonarRead(s.pinA, s.pinB, stamp);
      dataHead(i, stamp); commaNum(dout, echo); dout.println();
      markBad(s, echo == 0, 20, 1);            // nessun eco per un po': bersaglio fuori portata
      return true;
    }
    case S_GPS: {
      dataHead(i, stamp);
      dout.print(','); dout.print(gFix);
      printField(gLat); printField(gLon); printField(gAlt); printField(gSats);
      printField(gHdop); printField(gSpd); printField(gUtc); printField(gDate);
      dout.println();
      // senza fix il GPS sta solo cercando i satelliti; senza nessun byte c'è un problema di fili
      unsigned long silent = millis() - (nmeaLastByte ? nmeaLastByte : runStartMs);
      s.issue = silent > 3000 ? 2 : gFix == '0' ? 1 : 0;
      return true;
    }
    case S_DS18: {
      int16_t raw = 0;
      uint8_t err = s.st ? ds18Read(s.pinA, raw) : 1;
      dataHead(i, stamp); dout.print(',');
      if (err) dout.print(F("nan")); else dout.print(raw);
      commaNum(dout, err); dout.println();
      markBad(s, err != 0, 2, 2);
      s.st = ds18Convert(s.pinA);               // la prossima è pronta tra 750 ms
      return true;
    }
    case S_HX711: {
      if (digitalRead(s.pinA) == HIGH) {        // dato non ancora pronto (l'HX711 va a 10 Hz)
        if ((long)(millis() - s.nextMs) < 400) return false;
        dataHead(i, stamp); dout.println(F(",nan,1"));
        markBad(s, true, 2, 2);
        return true;
      }
      long v = hxRead(s.pinA, s.pinB);
      dataHead(i, stamp); commaNum(dout, v); dout.println(F(",0"));
      markBad(s, false, 1, 2);
      return true;
    }
    case S_IMU: {
      int16_t v[7];
      bool ok = (s.st || (s.st = imuInit(s))) && imuRead(s, v);
      dataHead(i, stamp);
      if (ok) {
        // v: ax, ay, az, temperatura, gx, gy, gz
        for (uint8_t k = 0; k < 7; k++) if (k != 3) commaNum(dout, v[k]);
        dout.println(F(",0"));
      } else { dout.println(F(",nan,nan,nan,nan,nan,nan,1")); s.st = 0; }
      markBad(s, !ok, 2, 2);
      return true;
    }
    case S_MLX: {
      uint16_t obj = 0, amb = 0;
      bool ok = mlxRead(s, 0x07, obj) && mlxRead(s, 0x06, amb);
      dataHead(i, stamp);
      if (ok) { commaNum(dout, obj); commaNum(dout, amb); dout.println(F(",0")); }
      else dout.println(F(",nan,nan,1"));
      markBad(s, !ok, 2, 2);
      return true;
    }
    case S_SPS: {
      // legge gli ultimi valori (il sensore li aggiorna ogni secondo); float big-endian → float dell'AVR
      if (!s.st) s.st = spsCmd(s, 0x0010, true);
      uint8_t b[40];
      bool ok = s.st && spsRead(s, b);
      dataHead(i, stamp);
      for (uint8_t k = 0; k < 10; k++) {
        dout.print(',');
        union { float f; uint8_t c[4]; } v;
        for (uint8_t j = 0; j < 4; j++) v.c[j] = b[4 * k + 3 - j];
        if (ok) printFloat(v.f, k == 9 ? 3 : 2); else dout.print(F("nan"));
      }
      commaNum(dout, ok ? 0 : 2); dout.println();
      markBad(s, !ok, 2, 2);
      return true;
    }
    case S_GATE:
      return true;                              // le fotocellule scrivono solo ai cambi
  }
  return true;
}

// ---------- oscilloscopio (su A0) ----------
bool scopeCapture(bool &fired) {
  fired = false;
  bool armed = false;
  unsigned long w0 = millis();
  if (scopeEdge != 0) {
    while (true) {
      int v = analogRead(A0);
      if (scopeEdge > 0) {
        if (v < scopeLevel - SCOPE_HYST) armed = true;
        else if (armed && v >= scopeLevel) { fired = true; break; }
      } else {
        if (v > scopeLevel + SCOPE_HYST) armed = true;
        else if (armed && v <= scopeLevel) { fired = true; break; }
      }
      if (scopeAuto && millis() - w0 > 120) break;
      if (Serial.available() > 0) return false;   // es. STOP: non resto bloccato
    }
  }
  unsigned long start = micros();
  for (int i = 0; i < scopeN; i++) {
    while ((unsigned long)(micros() - start) < (unsigned long)i * scopeDt) { }
    scopeBuf[i] = analogRead(A0);
  }
  return true;
}
void scopeSend(bool fired) {
  Serial.print(F("W,"));
  Serial.print(fired ? 1 : 0);
  Serial.print(',');
  Serial.print(scopeDt);
  for (int i = 0; i < scopeN; i++) commaNum(Serial, scopeBuf[i]);
  Serial.println();
}
void startScope(char *args) {
  long v[5] = {100, SCOPE_MAX, 512, 1, 1};
  char *p = args;
  for (uint8_t k = 0; k < 5 && p && *p; k++) {
    v[k] = atol(p);
    p = strchr(p, ',');
    if (p) p++;
  }
  scopeDt = (unsigned int)constrain(v[0], 20L, 20000L);
  scopeN = (int)constrain(v[1], 10L, (long)SCOPE_MAX);
  scopeLevel = (int)constrain(v[2], 0L, 1023L);
  scopeEdge = v[3] > 0 ? 1 : (v[3] < 0 ? -1 : 0);
  scopeAuto = v[4] != 0;
  if (gpsSerial) gpsSerial->end();
  gateDetach();
  adcFast(true);
  mode = SCOPE;
  led(true);
  Serial.print(F("#ACK,START,SCOPE,"));
  Serial.println(scopeDt);
}

// ---------- Bluetooth HC-06 ----------
// L'HC-06 esce dalla fabbrica a 9600 baud: lo si porta a 115200 con i comandi AT, che accetta
// solo quando nessun telefono è associato. I moduli con il firmware classico vogliono i comandi
// senza a capo, quelli più recenti con \r\n: si mandano entrambe le forme.
// Moduli BLE (HM-10, AT-09 / BT05, HC-08, JDY): anche loro escono dalla fabbrica a 9600 baud.
//  • HM-10 originale: comandi senza a capo, AT+BAUD4 = 115200, attivo dopo AT+RESET
//  • AT-09 / BT05 / MLT-BT05: gli stessi numeri, ma vogliono \r\n
//  • HC-08: AT+BAUD=115200 (subito attivo: per questo va per ultimo)
// Attenzione: AT+BAUD8 dell'HC-06 su un HM-10 vorrebbe dire 230400 baud. Per questo i due
// gruppi di comandi sono separati.
// Mentre si aspetta, si ascolta: un «OK» (anche «OKsetname», «OK115200»…) vuol dire che il
// modulo c'è e i fili TXD/RXD sono giusti.
bool btSaw = false;
void btListen(unsigned int ms) {
  unsigned long t = millis();
  char prev = 0;
  while (millis() - t < ms) {
    while (Serial.available()) { char c = Serial.read(); if (prev == 'O' && c == 'K') btSaw = true; prev = c; }
  }
}
// già configurato a 115200? (in attesa, non associato, risponde «OK» ad «AT»)
void btProbe() {
  Serial.flush();
  while (Serial.available()) Serial.read();
  Serial.print(F("AT")); btListen(500);
  Serial.print(F("AT\r\n")); btListen(500);
}
// Sull'Uno il TXD del modulo, collegato a D0, copre i comandi che arrivano dal cavo USB. Si manda
// «Configura» con quel filo staccato; Arduino chiede di attaccarlo (#BT,PLUG) e prova finché il
// modulo non risponde (circa 30 s), a 115200 (già configurato) e a 9600 (di fabbrica). Da lì non
// serve più ascoltare il computer: le risposte gli arrivano comunque da D1.
void btWait() {
  Serial.println(F("#BT,PLUG"));
  for (uint8_t i = 0; i < 18 && !btSaw; i++) {
    btProbe();
    if (btSaw) break;
    Serial.end(); Serial.begin(9600); delay(50);
    Serial.print(F("AT")); btListen(300);
    Serial.print(F("AT\r\n")); btListen(300);
    Serial.end(); Serial.begin(115200); delay(50);
  }
}
void btDone(uint8_t kind) {
  Serial.flush();
  Serial.end();
  Serial.begin(115200);
  delay(100);
  if (btSaw) { btKind = kind; EEPROM.update(20, 'B'); EEPROM.update(21, kind); }
  else Serial.println(F("#BT,NOREPLY"));
}

void btSetupBle() {
  Serial.println(F("#BT,SETUP"));
  btSaw = false;
  btWait();
  Serial.end();
  Serial.begin(9600);
  delay(300);
  Serial.print(F("AT+NAMEMosaicusNeo")); btListen(800);      // HM-10 (nome: al massimo 12 caratteri)
  Serial.print(F("AT+BAUD4")); btListen(800);
  Serial.print(F("AT+NAMEMosaicusNeo\r\n")); btListen(800); // AT-09 / BT05
  Serial.print(F("AT+BAUD4\r\n")); btListen(800);
  Serial.print(F("AT+NAME=MosaicusNeo")); btListen(800);     // HC-08
  Serial.print(F("AT+BAUD=115200")); btListen(800);
  Serial.print(F("AT+RESET")); btListen(400);                // HM-10: la nuova velocità vale dopo il riavvio
  Serial.print(F("AT+RESET\r\n")); btListen(1200);
  btDone(2);
  Serial.println(F("#ACK,BT,SETUP,BLE"));
}

void btSetup() {
  Serial.println(F("#BT,SETUP"));
  btSaw = false;
  btWait();
  Serial.end();
  Serial.begin(9600);
  delay(300);
  Serial.print(F("AT+NAMEMosaicus"));
  btListen(1200);
  Serial.print(F("AT+BAUD8"));          // 8 = 115200 baud
  btListen(1200);
  Serial.print(F("AT+NAME=MosaicusNeo\r\n"));
  btListen(800);
  Serial.print(F("AT+BAUD8\r\n"));
  btListen(800);
  btDone(1);
  Serial.println(F("#ACK,BT,SETUP"));
}

// =====================================================================================
// Scheda microSD: SPI hardware e un FAT32 minimo, senza la libreria SD (vorrebbe ~600 byte di
// RAM in più). Un solo settore in RAM (sdBuf): ora contiene i dati in arrivo, ora un settore della
// FAT o della cartella (sdCached dice quale; 0xFFFFFFFF = dati).
// =====================================================================================
uint8_t sdCs = 10, sdSpc = 1, sdNFats = 2;
bool sdHc = false, sdIoErr = false;
uint32_t sdFat, sdData, sdRoot, sdFatSz, sdClusN, sdHint, sdCached = 0xFFFFFFFF;
uint16_t sdMB;
// il file aperto: cluster e settore in scrittura, posizione nel settore, dimensione, voce della cartella
uint32_t fClus, fSize, fDirLba;
uint8_t fSec;
uint16_t fPos, fDirOff;
unsigned long sdSyncMs = 0;

uint16_t rd16(const uint8_t *p) { return p[0] | (p[1] << 8); }
uint32_t rd32(const uint8_t *p) { return rd16(p) | ((uint32_t)rd16(p + 2) << 16); }
void wr32(uint8_t *p, uint32_t v) { for (uint8_t i = 0; i < 4; i++) { p[i] = (uint8_t)v; v >>= 8; } }

uint8_t spiX(uint8_t b) { return SPI.transfer(b); }
bool sdWaitFF(unsigned int ms) {
  unsigned long t = millis();
  while (spiX(0xFF) != 0xFF) if (millis() - t > ms) return false;
  return true;
}
void sdEnd() { digitalWrite(sdCs, HIGH); spiX(0xFF); }
uint8_t sdCmd(uint8_t cmd, uint32_t arg) {
  digitalWrite(sdCs, LOW);
  if (cmd) sdWaitFF(500);
  spiX(0x40 | cmd);
  for (int8_t s = 24; s >= 0; s -= 8) spiX((uint8_t)(arg >> s));
  spiX(cmd == 0 ? 0x95 : cmd == 8 ? 0x87 : 0x01);
  uint8_t r = 0xFF;
  for (uint8_t i = 0; i < 10 && (r & 0x80); i++) r = spiX(0xFF);
  return r;
}
bool sdInit() {
  sdCs = outPin(O_SD);
  pinMode(sdCs, OUTPUT); digitalWrite(sdCs, HIGH);
  SPI.begin();
  SPI.beginTransaction(SPISettings(250000, MSBFIRST, SPI_MODE0));
  for (uint8_t i = 0; i < 10; i++) spiX(0xFF);               // 80 colpi di clock con CS alto
  uint8_t k = 0;
  while (sdCmd(0, 0) != 1) { sdEnd(); if (++k > 20) return false; }
  bool v2 = sdCmd(8, 0x1AA) == 1;
  uint8_t r = 0;
  if (v2) { for (uint8_t i = 0; i < 4; i++) r = spiX(0xFF); if (r != 0xAA) { sdEnd(); return false; } }
  unsigned long t = millis();
  do {
    sdCmd(55, 0);
    if (millis() - t > 2000) { sdEnd(); return false; }
  } while (sdCmd(41, v2 ? 0x40000000UL : 0) != 0);
  sdHc = false;
  if (v2 && sdCmd(58, 0) == 0) { sdHc = spiX(0xFF) & 0x40; for (uint8_t i = 0; i < 3; i++) spiX(0xFF); }
  if (!sdHc) sdCmd(16, 512);
  sdEnd();
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  sdCached = 0xFFFFFFFF;
  return true;
}
uint32_t sdAddr(uint32_t lba) { return sdHc ? lba : lba << 9; }
bool sdRead(uint32_t lba) {
  bool ok = false;
  sdCached = 0xFFFFFFFF;
  if (sdCmd(17, sdAddr(lba)) == 0) {
    unsigned long t = millis();
    uint8_t r;
    while ((r = spiX(0xFF)) == 0xFF && millis() - t < 300) {}
    if (r == 0xFE) { for (uint16_t i = 0; i < 512; i++) sdBuf[i] = spiX(0xFF); spiX(0xFF); spiX(0xFF); ok = true; }
  }
  sdEnd();
  if (!ok) sdIoErr = true;
  return ok;
}
bool sdWrite(uint32_t lba) {
  bool ok = false;
  if (sdCmd(24, sdAddr(lba)) == 0) {
    spiX(0xFF); spiX(0xFE);
    for (uint16_t i = 0; i < 512; i++) spiX(sdBuf[i]);
    spiX(0xFF); spiX(0xFF);
    ok = (spiX(0xFF) & 0x1F) == 0x05 && sdWaitFF(800);
  }
  sdEnd();
  if (!ok) sdIoErr = true;
  return ok;
}
// settore della FAT o della cartella in sdBuf (riletto solo se serve)
bool sdLoad(uint32_t lba) {
  if (sdCached == lba) return true;
  if (!sdRead(lba)) return false;
  sdCached = lba;
  return true;
}

// 0 a posto, 1 scheda assente o che non risponde, 2 non FAT32
uint8_t sdMount() {
  sdIoErr = false;
  if (!sdInit() || !sdLoad(0)) return 1;
  uint32_t part = 0;
  if (memcmp_P(sdBuf + 82, PSTR("FAT32"), 5) != 0) {         // non è un settore di avvio: MBR, prima partizione
    uint8_t t = sdBuf[450];
    if (rd16(sdBuf + 510) != 0xAA55 || (t != 0x0B && t != 0x0C)) return 2;
    part = rd32(sdBuf + 454);
    if (!sdLoad(part)) return 1;
  }
  // FAT32: settori da 512 byte, niente cartella principale fissa né FAT a 16 bit
  if (rd16(sdBuf + 11) != 512 || rd16(sdBuf + 17) != 0 || rd16(sdBuf + 22) != 0) return 2;
  sdSpc = sdBuf[13];
  sdNFats = sdBuf[16];
  sdFatSz = rd32(sdBuf + 36);
  sdFat = part + rd16(sdBuf + 14);
  sdData = sdFat + sdNFats * sdFatSz;
  sdRoot = rd32(sdBuf + 44);
  uint32_t tot = rd32(sdBuf + 32);
  if (!sdSpc || !sdFatSz || !sdNFats || tot <= sdData - part) return 2;
  sdClusN = (tot - (sdData - part)) / sdSpc + 2;
  sdMB = tot >> 11;
  // FSInfo: da dove cercare i cluster liberi; il conteggio dei liberi diventa «da ricalcolare»
  uint32_t fsi = part + rd16(sdBuf + 48);
  sdHint = 2;
  if (sdLoad(fsi) && rd32(sdBuf) == 0x41615252UL) {
    uint32_t h = rd32(sdBuf + 492);
    if (h >= 2 && h < sdClusN) sdHint = h;
    if (rd32(sdBuf + 488) != 0xFFFFFFFFUL) { wr32(sdBuf + 488, 0xFFFFFFFFUL); sdWrite(fsi); }
  }
  return sdIoErr ? 1 : 0;
}
uint32_t clusLba(uint32_t c) { return sdData + (c - 2) * sdSpc; }
uint32_t fatGet(uint32_t c) {
  if (!sdLoad(sdFat + (c >> 7))) return 0x0FFFFFFFUL;
  return rd32(sdBuf + ((c & 127) << 2)) & 0x0FFFFFFFUL;
}
bool fatSet(uint32_t c, uint32_t v) {
  uint32_t lba = sdFat + (c >> 7);
  if (!sdLoad(lba)) return false;
  uint8_t *p = sdBuf + ((c & 127) << 2);
  wr32(p, (rd32(p) & 0xF0000000UL) | v);
  for (uint8_t i = 0; i < sdNFats; i++) if (!sdWrite(lba + i * sdFatSz)) return false;   // tutte le copie
  return true;
}
// nuovo cluster in fondo alla catena (prev = 0: primo cluster del file); 0 = scheda piena o errore
uint32_t fatAlloc(uint32_t prev) {
  uint32_t c = sdHint;
  for (uint32_t n = 2; n < sdClusN; n++, c++) {
    if (c >= sdClusN) c = 2;
    if (fatGet(c) == 0) {
      if (!fatSet(c, 0x0FFFFFFFUL) || (prev && !fatSet(prev, c))) return 0;
      sdHint = c + 1;
      return c;
    }
    if (sdIoErr) return 0;
  }
  return 0;
}
// cartella principale: il LOGnnnnn.NEO più alto (fNum) e il primo posto libero (fDirLba, fDirOff)
bool dirScan() {
  uint32_t c = sdRoot;
  fNum = 0; fDirLba = 0;
  while (c >= 2 && c < 0x0FFFFFF8UL) {
    for (uint8_t s = 0; s < sdSpc; s++) {
      uint32_t lba = clusLba(c) + s;
      if (!sdLoad(lba)) return false;
      for (uint16_t o = 0; o < 512; o += 32) {
        uint8_t *e = sdBuf + o;
        if (e[0] == 0 || e[0] == 0xE5) {
          if (!fDirLba) { fDirLba = lba; fDirOff = o; }
          if (e[0] == 0) return true;                        // fine della cartella
          continue;
        }
        if (e[11] == 0x0F || memcmp_P(e, PSTR("LOG"), 3) || memcmp_P(e + 8, PSTR("NEO"), 3)) continue;
        uint32_t n = 0;
        uint8_t k = 3;
        for (; k < 8 && e[k] >= '0' && e[k] <= '9'; k++) n = n * 10 + e[k] - '0';
        if (k == 8 && n > fNum) fNum = n;
      }
    }
    c = fatGet(c);
  }
  return !sdIoErr;
}
// dimensione del file nella sua voce della cartella
bool dirUpdate() {
  if (!sdLoad(fDirLba)) return false;
  wr32(sdBuf + fDirOff + 28, fSize);
  return sdWrite(fDirLba);
}
// 0 a posto, 1 scheda, 3 niente posto per il file
uint8_t fileCreate() {
  if (!dirScan()) return 1;
  if (!fDirLba || fNum >= 99999) return 3;
  fClus = fatAlloc(0);
  if (!fClus) return sdIoErr ? 1 : 3;
  fNum++;
  if (!sdLoad(fDirLba)) return 1;
  uint8_t *e = sdBuf + fDirOff;
  memset(e, 0, 32);
  memcpy_P(e, PSTR("LOG00000NEO"), 11);
  uint32_t n = fNum;
  for (int8_t k = 7; k >= 3; k--) { e[k] = '0' + n % 10; n /= 10; }
  e[11] = 0x20;                                              // archivio
  e[20] = fClus >> 16; e[21] = fClus >> 24; e[26] = fClus; e[27] = fClus >> 8;   // primo cluster
  // data: 1 gennaio 2026 (Arduino non ha un orologio)
  e[16] = e[18] = e[24] = 0x21; e[17] = e[19] = e[25] = 0x5C;
  fSec = 0; fPos = 0; fSize = 0;
  return dirUpdate() ? 0 : 1;
}
void sdFail() { sdOn = false; sdErr = true; }
bool sdFlushSector() { return sdWrite(clusLba(fClus) + fSec); }
// un byte nel file: a settore pieno lo scrive, a cluster pieno ne prende un altro
void sdPut(uint8_t c) {
  sdCached = 0xFFFFFFFF;                                     // sdBuf ora contiene dati
  sdBuf[fPos++] = c;
  fSize++;
  if (fPos < 512) return;
  fPos = 0;
  if (!sdFlushSector()) { sdFail(); return; }
  if (++fSec >= sdSpc) {
    uint32_t n = fatAlloc(fClus);
    if (!n) { sdFail(); return; }
    fClus = n; fSec = 0;
  }
}
// ogni 2 s e alla fine: il settore a metà e la dimensione del file vanno sulla scheda
void sdSync() {
  sdSyncMs = millis();
  if (!sdOn) return;
  if ((fPos && !sdFlushSector()) || !dirUpdate()) { sdFail(); return; }
  if (fPos && !sdRead(clusLba(fClus) + fSec)) sdFail();     // si riprende a scrivere nello stesso settore
}

void logStart() {
  bootWait = false;
  uint8_t e = cfgLoad() ? sdMount() : 1;
  if (!e) e = fileCreate();
  if (e) { sdErr = true; return; }
  sdErr = false;
  dSer = false; sdOn = true;
  dout.println(F("#MOSAICUS," FW_VERSION ",SD"));
  dout.print(F("#PROJ,"));
  for (uint8_t k = 0; k < 12; k++) { char c = EEPROM.read(E_ID + k); if (!c) break; dout.write(c); }
  dout.println();
  char nm[6];
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    const Slot &s = slots[i];
    if (s.type == S_NONE) continue;
    typeName(s.type, nm);
    dout.print(F("#CFG,")); dout.print(i); dout.print(','); dout.print(nm);
    commaNum(dout, s.intervalMs); commaNum(dout, s.pinA); commaNum(dout, s.pinB); commaNum(dout, s.opt); dout.println();
  }
  dout.println(F("#START"));
  startRun();
  sdSync();
}
void logStop(bool byButton) {
  if (byButton) { dout.print(F("#STOP,")); printTime(nowUs()); dout.println(); }
  stopAll();
  sdSync();
  sdOn = false; dSer = true;
}
void sdTest() {
  if (!outPin(O_SD)) { Serial.println(F("#SD,ERR,NOOUT")); return; }
  if (mode != IDLE) stopAll();
  uint8_t e = sdMount();
  if (!e && !dirScan()) e = 1;
  if (!e && (!fDirLba || fNum >= 99999)) e = 3;
  sdErr = e != 0;
  if (e) { Serial.print(F("#SD,ERR,")); Serial.println(e == 1 ? F("CARD") : e == 2 ? F("FAT32") : F("FILE")); }
  else { Serial.print(F("#SD,OK,")); Serial.println(sdMB); }
}

// ---------- pulsante ----------
// Con l'app collegata manda #KEY (l'app avvia o ferma la misura); senza app avvia e ferma la
// registrazione sulla scheda SD.
uint8_t btnRaw = HIGH, btnState = HIGH;
unsigned long btnT = 0;
void btnPoll() {
  uint8_t p = outPin(O_BTN);
  if (!p) return;
  uint8_t v = digitalRead(p);
  if (v != btnRaw) { btnRaw = v; btnT = millis(); return; }
  if (v == btnState || millis() - btnT < 30) return;
  btnState = v;
  if (v != LOW) return;
  if (sdOn) logStop(true);
  else if (linkOk()) Serial.println(F("#KEY"));
  else if (sdArmed()) logStart();
}

// ---------- comandi ----------
void setAppLine(char *args) {
  // "<1|2>,<testo>": 1 = valore grande (5 caratteri), 2 = riga piccola (10)
  char which = args[0];
  char *txt = strchr(args, ',');
  if (!txt) return;
  txt++;
  if (which == '1') { strncpy(appBig, txt, 5); appBig[5] = 0; }
  else { strncpy(appSmall, txt, 10); appSmall[10] = 0; }
}

void handleCommand(char *cmd) {
  if (!cmd[0]) return;                  // righe vuote (disturbi sulla linea): non sono l'app
  bootWait = false;                     // c'è l'app: niente registrazione automatica
  if (sdOn) logStop(false);             // e quella in corso si chiude
  lastCmdMs = millis();
  if (lastCmdMs == 0) lastCmdMs = 1;
  // i comandi in ordine di prova; quelli che finiscono con ',' sono prefissi (seguono argomenti)
  static const char CMDS[] PROGMEM =
    "PING\0" "LINK,\0" "ID?\0" "STOP\0" "START\0" "CFG,CLEAR\0" "CFG,ADD,\0" "START,SCOPE,\0" "OUT,L,\0"
    "OUT,CLEAR\0" "OUT,ADD,\0" "OUT,SAVE\0" "CFG,SAVE,\0" "SD,TEST\0" "OUT,TEST\0" "BT,SETUP\0" "BT,SETUP,BLE\0";
  uint8_t k = 0;
  char *arg = cmd;
  for (PGM_P p = CMDS; k < 17; k++) {
    uint8_t n = strlen_P(p);
    if (pgm_read_byte(p + n - 1) == ',' ? strncmp_P(cmd, p, n) == 0 : strcmp_P(cmd, p) == 0) { arg = cmd + n; break; }
    p += n + 1;
  }
  switch (k) {
    case 0: pinged = true; break;
    case 1: linkBt = *arg == 'B'; break;
    case 2: sendHello(); break;
    case 3: stopAll(); break;
    case 4: startRun(); break;
    case 5: cfgClear(); break;
    case 6: if (mode == RUN) stopAll(); cfgAdd(arg); break;
    case 7: startScope(arg); break;
    case 8: setAppLine(arg); break;
    case 9: outsClear(); Serial.println(F("#ACK,OUT,CLEAR")); break;
    case 10: outAdd(arg); break;
    case 11: outsSave(); break;
    case 12: cfgSave(arg); break;
    case 13: sdTest(); break;
    case 14: if (mode == RUN) stopAll(); outsTest(); break;
    case 15: if (mode != IDLE) stopAll(); btSetup(); break;
    case 16: if (mode != IDLE) stopAll(); btSetupBle(); break;
    default: if (cmdLen > 0) { Serial.print(F("#ERR,")); Serial.println(cmd); }
  }
}

void pollSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      cmdBuf[cmdLen] = '\0';
      handleCommand(cmdBuf);
      cmdLen = 0;
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = c;
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  for (uint8_t i = 0; i < MAX_SLOTS; i++) slots[i].type = S_NONE;
  outsLoad();                    // gli indicatori salvati segnalano subito «in attesa dell'app»
  if (EEPROM.read(20) == 'B') { btKind = EEPROM.read(21); if (btKind > 2) btKind = 0; }
  ledFree = outPinFree(13, false);
  // modulo SD e configurazione salvata: se l'app non si fa viva entro 4 s, si registra
  if (sdArmed()) { cfgLoad(); bootWait = true; }
  delay(50);
  sendHello();
}

// ---------- ciclo principale ----------
void loop() {
  nowUs();                       // tiene aggiornato il contatore dei giri di micros()
  pollSerial();
  btnPoll();
  if (bootWait && millis() > 4000) {
    bootWait = false;
    Out *o = outFind(O_SD);
    if (o && (o->opt & 1) && !outPin(O_BTN)) logStart();
  }
  if (sdOn && millis() - sdSyncMs > 2000) sdSync();
  if (sdErr && !dSer) { dSer = true; stopAll(); }          // la scheda si è guastata durante la registrazione
  statusTick();
  if (mode == SCOPE) {
    bool fired;
    if (scopeCapture(fired)) scopeSend(fired);
    return;
  }
  if (mode != RUN) return;
  pollGps();
  gatePoll();
  gateFlush();
  unsigned long now = millis();
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    Slot &s = slots[i];
    if (s.type == S_NONE || s.type == S_GATE || (long)(now - s.nextMs) < 0) continue;
    if (!readSlot(i)) continue;              // rimandata: riprovo al prossimo giro
    s.nextMs += s.intervalMs;                // scansione regolare, senza deriva
    // se siamo rimasti molto indietro (intervallo troppo breve per tanti sensori), riallinea
    if ((long)(millis() - s.nextMs) > (long)(5 * s.intervalMs)) s.nextMs = millis() + s.intervalMs;
    pollGps();
    gatePoll();
    gateFlush();
    pollSerial();
  }
}
