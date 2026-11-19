/*
  MosaicusNeo — firmware unico per Arduino Uno R3 (e compatibili, es. Elegoo UNO R3)
  ---------------------------------------------------------------------------------
  Copyright (c) 2026 Ermes Ferdinando Rosi — licenza MIT (testo nel file LICENSE del progetto)

  Si carica UNA volta sola. Da quel momento è l'app a dire quali sensori sono collegati,
  su quali pin e ogni quanto leggerli: un "montaggio" fino a 6 sensori, anche dello stesso
  tipo (es. due termistori), ognuno con il suo ritmo.

  Filosofia: Arduino invia solo grandezze GREZZE (conteggi ADC, tempi di volo in µs, i byte
  del DHT, i campi delle frasi NMEA del GPS). Le conversioni in grandezze fisiche avvengono
  nell'app, dove i parametri si cambiano senza ricaricare il firmware e la catena di misura
  resta visibile.

  Pin: D0 e D1 sono della porta seriale (cavo USB e, in parallelo, Bluetooth HC-06): non
  vanno usati per i sensori. I sensori analogici vanno su A0…A5 (numeri 14…19); quelli
  digitali su D2…D13 o anche su A0…A5. Il LED su D13 si accende durante la misura, a meno
  che D13 non sia usato da un sensore.

  Protocollo (115200 baud, righe terminate da '\n'):
    App -> Arduino                              Arduino -> App
    ID?                                         #MOSAICUS,<versione>,READY
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
        motivi  SLOT, TIPO, PIN, ANALOGICO, DOPPIO (pin già usato), GPS (ce n'è già uno)
    START                                       #ACK,START
                                                D,<slot>,<t_ms>,<valori…>   una riga per lettura
        t_ms con tre decimali (µs), dall'istante di START. Per il sonar è l'istante a metà del
        volo dell'ultrasuono. L'orologio non si azzera dopo 71 minuti (contatore a 64 bit).
    STOP                                        #ACK,STOP
    START,SCOPE,<dt_us>,<n>,<livello>,<fronte>,<auto>
                                                #ACK,START,SCOPE,<dt_us>
                                                W,<trig>,<dt_us>,<a0>,…,<a(n-1)>   (oscilloscopio su A0)
    BT,SETUP                                    #BT,SETUP … #ACK,BT,SETUP
        configura l'HC-06 (collegati via USB, HC-06 non associato): nome «MosaicusNeo», 115200 baud
    (comando sconosciuto)                       #ERR,<testo>

  Collegamenti tipici (l'app mostra lo schema con i pin scelti):
    termistore NTC: partitore con 10 kΩ, uscita su A0 · DHT11: DATA su D2 · HC-SR04: TRIG D12,
    ECHO D11 · GPS: TX del GPS su D4 · HC-06: TXD → D0, RXD ← D1 con partitore 1 kΩ / 2 kΩ.
    Mentre carichi lo sketch dall'IDE, stacca il filo TXD dell'HC-06 da D0.
*/

#include <SoftwareSerial.h>

const char *FW_VERSION = "1.0";

const uint8_t MAX_SLOTS = 6;
const uint8_t ADC_SAMPLES = 16;                 // sovracampionamento per ridurre il rumore
const unsigned long ECHO_TIMEOUT_US = 30000UL;  // ~5 m andata e ritorno

enum SensorType : uint8_t { S_NONE, S_NTC, S_ANA, S_DHT, S_SONAR, S_GPS };

struct Slot {
  uint8_t type;
  uint8_t pinA, pinB, opt;
  unsigned long intervalMs;
  unsigned long nextMs;
};
Slot slots[MAX_SLOTS];

enum Mode : uint8_t { IDLE, RUN, SCOPE };
Mode mode = IDLE;
bool ledFree = true;            // D13 non usato da un sensore: il LED può segnalare la misura

// ---------- orologio a 64 bit in µs (micros() torna a zero ogni 71,6 minuti) ----------
uint32_t lastMicros = 0, microsWraps = 0;
uint64_t nowUs() {
  uint32_t u = micros();
  if (u < lastMicros) microsWraps++;
  lastMicros = u;
  return ((uint64_t)microsWraps << 32) | u;
}
uint64_t t0Us = 0;

void printTime(uint64_t us) {
  uint64_t rel = us - t0Us;
  uint32_t ms = (uint32_t)(rel / 1000);
  uint16_t frac = (uint16_t)(rel % 1000);
  Serial.print(ms);
  Serial.print('.');
  if (frac < 100) Serial.print('0');
  if (frac < 10) Serial.print('0');
  Serial.print(frac);
}

// ---------- oscilloscopio ----------
const int SCOPE_MAX = 400;
const int SCOPE_HYST = 3;          // isteresi del trigger (conteggi ADC): ignora il rumore
uint16_t scopeBuf[SCOPE_MAX];
unsigned int scopeDt = 100;        // µs tra due campioni
int scopeN = SCOPE_MAX;
int scopeLevel = 512;
int scopeEdge = 1;
bool scopeAuto = true;

// ---------- DHT ----------
uint8_t dhtData[5];

// ---------- GPS ----------
SoftwareSerial *gpsSerial = nullptr;
int8_t gpsSlot = -1;
char nmea[84];
uint8_t nmeaLen = 0;
unsigned long nmeaLastByte = 0;
char gLat[13] = "", gLon[14] = "", gAlt[9] = "", gSats[4] = "", gHdop[6] = "";
char gSpd[9] = "", gUtc[11] = "", gDate[7] = "";
char gFix = '0';

char cmdBuf[48];
uint8_t cmdLen = 0;

void sendHello() {
  Serial.print(F("#MOSAICUS,"));
  Serial.print(FW_VERSION);
  Serial.println(F(",READY"));
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  for (uint8_t i = 0; i < MAX_SLOTS; i++) slots[i].type = S_NONE;
  delay(50);
  sendHello();
}

void led(bool on) { if (ledFree) digitalWrite(LED_BUILTIN, on ? HIGH : LOW); }

// ADC più veloce per l'oscilloscopio: prescaler 16 → una conversione in ~16 µs (invece di ~112).
void adcFast(bool on) { ADCSRA = (ADCSRA & ~0x07) | (on ? 0x04 : 0x07); }

float readAdc(uint8_t pin) {
  unsigned long sum = 0;
  for (uint8_t i = 0; i < ADC_SAMPLES; i++) sum += analogRead(pin);
  return sum / (float)ADC_SAMPLES;
}

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
  if (strcmp(type, "RMC") == 0 && n >= 10) {
    copyField(gUtc, sizeof(gUtc), f[1]);
    copyField(gDate, sizeof(gDate), f[9]);
    if (f[2][0] == 'A') {
      copyCoord(gLat, sizeof(gLat), f[3], f[4]);
      copyCoord(gLon, sizeof(gLon), f[5], f[6]);
      copyField(gSpd, sizeof(gSpd), f[7]);
    } else {
      gFix = '0';
    }
  } else if (strcmp(type, "GGA") == 0 && n >= 10) {
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
  Serial.print(',');
  if (*s) Serial.print(s); else Serial.print(F("nan"));
}
void gpsStop() {
  if (gpsSerial) { gpsSerial->end(); delete gpsSerial; gpsSerial = nullptr; }
  gpsSlot = -1;
}

// ---------- configurazione del montaggio ----------
bool isAnalog(uint8_t p) { return p >= 14 && p <= 19; }
bool pinOk(uint8_t p) { return p >= 2 && p <= 19; }

// pin già usato da un altro slot?
bool pinTaken(uint8_t pin, uint8_t except) {
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    if (i == except || slots[i].type == S_NONE) continue;
    const Slot &s = slots[i];
    if (s.pinA == pin) return true;
    if ((s.type == S_SONAR || s.type == S_GPS) && s.pinB == pin) return true;
  }
  return false;
}

void cfgError(int slot, const __FlashStringHelper *why) {
  Serial.print(F("#ERR,CFG,"));
  Serial.print(slot);
  Serial.print(',');
  Serial.println(why);
}

void cfgClear() {
  mode = IDLE;
  gpsStop();
  for (uint8_t i = 0; i < MAX_SLOTS; i++) slots[i].type = S_NONE;
  ledFree = true;
  led(false);
  Serial.println(F("#ACK,CFG,CLEAR"));
}

void cfgAdd(char *args) {
  // args: "<slot>,<tipo>,<ms>,<pinA>,<pinB>,<opz>"
  char *f[6];
  uint8_t n = 0;
  f[n++] = args;
  for (char *p = args; *p && n < 6; p++) if (*p == ',') { *p = '\0'; f[n++] = p + 1; }
  if (n < 6) { cfgError(-1, F("ARGOMENTI")); return; }
  int slot = atoi(f[0]);
  if (slot < 0 || slot >= MAX_SLOTS) { cfgError(slot, F("SLOT")); return; }
  uint8_t type = S_NONE;
  if (strcmp(f[1], "NTC") == 0) type = S_NTC;
  else if (strcmp(f[1], "ANA") == 0) type = S_ANA;
  else if (strcmp(f[1], "DHT") == 0) type = S_DHT;
  else if (strcmp(f[1], "SONAR") == 0) type = S_SONAR;
  else if (strcmp(f[1], "GPS") == 0) type = S_GPS;
  if (type == S_NONE) { cfgError(slot, F("TIPO")); return; }
  long ms = atol(f[2]);
  uint8_t a = (uint8_t)atoi(f[3]), b = (uint8_t)atoi(f[4]), opt = (uint8_t)atoi(f[5]);
  bool twoPins = type == S_SONAR || type == S_GPS;
  if (!pinOk(a) || (twoPins && (!pinOk(b) || a == b))) { cfgError(slot, F("PIN")); return; }
  if ((type == S_NTC || type == S_ANA) && !isAnalog(a)) { cfgError(slot, F("ANALOGICO")); return; }
  if (pinTaken(a, slot) || (twoPins && pinTaken(b, slot))) { cfgError(slot, F("DOPPIO")); return; }
  if (type == S_GPS && gpsSlot >= 0 && gpsSlot != slot) { cfgError(slot, F("GPS")); return; }
  // intervalli minimi: oltre, il sensore non ce la fa
  long minMs = type == S_DHT ? (opt == 22 ? 2000 : 1000) : type == S_GPS ? 1000 : type == S_SONAR ? 30 : 5;
  if (ms < minMs) ms = minMs;
  if (ms > 600000L) ms = 600000L;
  Slot &s = slots[slot];
  if (s.type == S_GPS) gpsStop();
  s.type = type; s.pinA = a; s.pinB = b; s.opt = opt; s.intervalMs = (unsigned long)ms;
  if (type == S_SONAR) { pinMode(a, OUTPUT); digitalWrite(a, LOW); pinMode(b, INPUT); }
  if (type == S_DHT) pinMode(a, INPUT_PULLUP);
  if (type == S_GPS) { gpsSlot = slot; gpsSerial = new SoftwareSerial(a, b); }
  ledFree = !pinTaken(13, 255);
  Serial.print(F("#ACK,CFG,ADD,"));
  Serial.println(slot);
}

void startRun() {
  bool any = false;
  for (uint8_t i = 0; i < MAX_SLOTS; i++) if (slots[i].type != S_NONE) any = true;
  if (!any) { Serial.println(F("#ERR,START,VUOTO")); return; }
  adcFast(false);
  t0Us = nowUs();
  unsigned long now = millis();
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    // DHT e GPS vogliono un attimo prima della prima lettura
    slots[i].nextMs = now + ((slots[i].type == S_DHT || slots[i].type == S_GPS) ? 1000 : 0);
  }
  if (gpsSerial) { gpsSerial->begin(9600); nmeaLen = 0; }
  mode = RUN;
  led(true);
  Serial.println(F("#ACK,START"));
}

void stopAll() {
  if (gpsSerial) gpsSerial->end();
  if (mode == SCOPE) adcFast(false);
  mode = IDLE;
  led(false);
  Serial.println(F("#ACK,STOP"));
}

// ---------- lettura di uno slot ----------
// Restituisce false se la lettura va rimandata (DHT mentre il GPS sta trasmettendo).
bool readSlot(uint8_t i) {
  Slot &s = slots[i];
  uint64_t stamp = nowUs();
  switch (s.type) {
    case S_NTC:
    case S_ANA: {
      float adc = readAdc(s.pinA);
      Serial.print(F("D,")); Serial.print(i); Serial.print(','); printTime(stamp);
      Serial.print(','); Serial.println(adc, 2);
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
      Serial.print(F("D,")); Serial.print(i); Serial.print(','); printTime(stamp);
      for (uint8_t k = 0; k < 4; k++) { Serial.print(','); Serial.print(dhtData[k]); }
      Serial.print(','); Serial.println(err);
      return true;
    }
    case S_SONAR: {
      unsigned long echo = sonarRead(s.pinA, s.pinB, stamp);
      Serial.print(F("D,")); Serial.print(i); Serial.print(','); printTime(stamp);
      Serial.print(','); Serial.println(echo);
      return true;
    }
    case S_GPS: {
      Serial.print(F("D,")); Serial.print(i); Serial.print(','); printTime(stamp);
      Serial.print(','); Serial.print(gFix);
      printField(gLat); printField(gLon); printField(gAlt); printField(gSats);
      printField(gHdop); printField(gSpd); printField(gUtc); printField(gDate);
      Serial.println();
      return true;
    }
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
  for (int i = 0; i < scopeN; i++) { Serial.print(','); Serial.print(scopeBuf[i]); }
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
void btSetup() {
  Serial.println(F("#BT,SETUP"));
  Serial.flush();
  Serial.end();
  Serial.begin(9600);
  delay(300);
  Serial.print(F("AT+NAMEMosaicus"));
  delay(1200);
  Serial.print(F("AT+BAUD8"));          // 8 = 115200 baud
  delay(1200);
  Serial.print(F("AT+NAME=MosaicusNeo\r\n"));
  delay(800);
  Serial.print(F("AT+BAUD8\r\n"));
  delay(800);
  Serial.flush();
  Serial.end();
  Serial.begin(115200);
  delay(100);
  Serial.println(F("#ACK,BT,SETUP"));
}

// ---------- comandi ----------
void handleCommand(char *cmd) {
  if (strcmp(cmd, "ID?") == 0) sendHello();
  else if (strcmp(cmd, "STOP") == 0) stopAll();
  else if (strcmp(cmd, "START") == 0) startRun();
  else if (strcmp(cmd, "CFG,CLEAR") == 0) cfgClear();
  else if (strncmp(cmd, "CFG,ADD,", 8) == 0) { if (mode == RUN) stopAll(); cfgAdd(cmd + 8); }
  else if (strncmp(cmd, "START,SCOPE,", 12) == 0) startScope(cmd + 12);
  else if (strcmp(cmd, "BT,SETUP") == 0) { if (mode != IDLE) stopAll(); btSetup(); }
  else if (cmdLen > 0) { Serial.print(F("#ERR,")); Serial.println(cmd); }
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

// ---------- ciclo principale ----------
void loop() {
  nowUs();                       // tiene aggiornato il contatore dei giri di micros()
  pollSerial();
  if (mode == SCOPE) {
    bool fired;
    if (scopeCapture(fired)) scopeSend(fired);
    return;
  }
  if (mode != RUN) return;
  pollGps();
  unsigned long now = millis();
  for (uint8_t i = 0; i < MAX_SLOTS; i++) {
    Slot &s = slots[i];
    if (s.type == S_NONE || (long)(now - s.nextMs) < 0) continue;
    if (!readSlot(i)) continue;              // rimandata: riprovo al prossimo giro
    s.nextMs += s.intervalMs;                // scansione regolare, senza deriva
    // se siamo rimasti molto indietro (intervallo troppo breve per tanti sensori), riallinea
    if ((long)(millis() - s.nextMs) > (long)(5 * s.intervalMs)) s.nextMs = millis() + s.intervalMs;
    pollGps();
    pollSerial();
  }
}
