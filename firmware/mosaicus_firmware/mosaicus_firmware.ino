/*
  Mosaicus — firmware unico per Arduino Uno R3 (e compatibili, es. Elegoo UNO R3)
  ---------------------------------------------------------------------------------
  Copyright (c) 2026 Ermes Ferdinando Rosi — licenza MIT (testo: https://ermesfrosi.it/mosaicus/app/LICENSE.txt)

  Si carica UNA volta sola. Da quel momento è l'app Mosaicus a decidere quale
  esperimento avviare, inviando comandi testuali sulla porta seriale.

  Filosofia: Arduino invia solo grandezze GREZZE (conteggi ADC, tempi di volo in µs).
  Le conversioni in grandezze fisiche (°C, metri) avvengono nell'app, dove i
  parametri (Beta del termistore, temperatura dell'aria, ...) si cambiano senza
  dover ricaricare il firmware. Così gli studenti vedono anche la catena di misura.

  Collegamenti predefiniti (convenzione dei tutorial Elegoo):
    - Termistore NTC (partitore con resistenza da 10 kΩ) -> A0
    - Sensore a ultrasuoni HC-SR04: TRIG -> D12, ECHO -> D11, VCC -> 5V, GND -> GND
    - Oscilloscopio: segnale su A0, SOLO tra 0 e 5 V (mai la rete elettrica!)
    - Sensore DHT11 (o DHT22): DATA -> D2, VCC -> 5V, GND -> GND
      (il modulo a 3 pin ha già la resistenza di pull-up; il sensore "nudo" a 4 pin
      vuole 10 kΩ tra DATA e 5V)

  Protocollo (115200 baud, righe terminate da '\n'):
    App -> Arduino                Arduino -> App
    ID?                           #MOSAICUS,<versione>,READY
    START,TEMP,<intervallo_ms>    #ACK,START,TEMP,<intervallo_ms>
                                  T,<t_ms>,<adc_medio>        (adc 0..1023, media di 16 letture)
    START,SONAR,<intervallo_ms>   #ACK,START,SONAR,<intervallo_ms>
                                  S,<t_us>,<eco_us>           (eco_us = 0 se nessun eco)
    START,SCOPE,<dt_us>,<n>,<livello>,<fronte>,<auto>
                                  #ACK,START,SCOPE,<dt_us>
                                  W,<trig>,<dt_us>,<a0>,<a1>,...,<a(n-1)>   (una riga per traccia)
        dt_us   tempo tra due campioni (≥ 20 µs); n campioni (≤ 400) letti da A0
        livello soglia del trigger in conteggi ADC (0..1023); fronte 1 = salita, -1 = discesa, 0 = nessuno
        auto    1 = se il trigger non arriva entro 120 ms cattura comunque (trig = 0); 0 = aspetta
    START,DHT,<intervallo_ms>,<tipo>
                                  #ACK,START,DHT,<intervallo_ms>
                                  H,<t_ms>,<b0>,<b1>,<b2>,<b3>,<err>
        tipo    11 = DHT11, 22 = DHT22 (cambia solo la durata dell'impulso di avvio)
        b0..b3  i 4 byte di dati così come arrivano dal sensore (umidità, temperatura):
                la conversione in % e °C la fa l'app, che conosce il tipo di sensore
        err     0 = lettura valida, 1 = il sensore non risponde, 2 = checksum sbagliato
        intervallo ≥ 1000 ms (DHT11) o ≥ 2000 ms (DHT22): il sensore non è più veloce
    STOP                          #ACK,STOP
    (comando sconosciuto)         #ERR,<testo>

  I tempi t sono misurati dall'istante del comando START.
  Licenza: MIT — vedi LICENSE.
*/

const char *FW_VERSION = "0.3";

const uint8_t PIN_THERM = A0;
const uint8_t PIN_TRIG  = 12;
const uint8_t PIN_ECHO  = 11;
const uint8_t PIN_DHT   = 2;

const uint8_t  ADC_SAMPLES    = 16;      // sovracampionamento per ridurre il rumore
const unsigned long ECHO_TIMEOUT_US = 30000UL;  // ~5 m andata e ritorno

enum Mode { IDLE, TEMP, SONAR, SCOPE, DHT };
Mode mode = IDLE;

unsigned long intervalMs = 1000;
unsigned long t0Ms = 0;        // origine dei tempi (millis) per TEMP
unsigned long t0Us = 0;        // origine dei tempi (micros) per SONAR
unsigned long nextMs = 0;      // prossimo campionamento (millis)

// oscilloscopio
const int SCOPE_MAX = 400;
const int SCOPE_HYST = 3;          // isteresi del trigger (conteggi ADC): ignora il rumore
uint16_t scopeBuf[SCOPE_MAX];
unsigned int scopeDt = 100;        // µs tra due campioni
int scopeN = SCOPE_MAX;
int scopeLevel = 512;
int scopeEdge = 1;
bool scopeAuto = true;

// DHT11 / DHT22
uint8_t dhtType = 11;
uint8_t dhtData[5];

char cmdBuf[48];
uint8_t cmdLen = 0;

void sendHello() {
  Serial.print(F("#MOSAICUS,"));
  Serial.print(FW_VERSION);
  Serial.println(F(",READY"));
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  pinMode(PIN_ECHO, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  delay(50);
  sendHello();
}

// ---------- misure ----------

float readThermistorAdc() {
  unsigned long sum = 0;
  for (uint8_t i = 0; i < ADC_SAMPLES; i++) {
    sum += analogRead(PIN_THERM);
  }
  return sum / (float)ADC_SAMPLES;
}

// Restituisce la durata dell'eco in µs (0 se nessun eco) e, in tStampUs,
// l'istante (relativo a t0Us) a cui attribuire la misura: metà del tempo di volo.
unsigned long readSonarUs(unsigned long &tStampUs) {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  unsigned long tTrig = micros();
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long echo = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  tStampUs = (tTrig - t0Us) + echo / 2;
  return echo;
}

// ---------- DHT11 / DHT22 ----------
// Protocollo a un filo: l'Arduino tiene DATA basso per avviare la misura, il sensore
// risponde con 80 µs basso + 80 µs alto, poi 40 bit. Ogni bit è un livello basso di
// ~50 µs seguito da uno alto di ~27 µs (bit 0) oppure ~70 µs (bit 1).
// Si misura la durata dei livelli con micros(): con le interruzioni attive l'errore
// è di pochi µs, molto meno della soglia di 50 µs, e la seriale non perde comandi.

// Attende che DATA lasci il livello `level`; restituisce i µs trascorsi, 0 se scade il tempo.
unsigned long dhtWhile(uint8_t level, unsigned long timeoutUs) {
  unsigned long t0 = micros();
  while (digitalRead(PIN_DHT) == level) {
    if (micros() - t0 > timeoutUs) return 0;
  }
  unsigned long d = micros() - t0;
  return d ? d : 1;
}

// 0 = ok, 1 = nessuna risposta, 2 = checksum sbagliato
uint8_t dhtRead() {
  for (uint8_t i = 0; i < 5; i++) dhtData[i] = 0;
  // impulso di avvio: ≥ 18 ms per il DHT11, ~1 ms per il DHT22
  pinMode(PIN_DHT, OUTPUT);
  digitalWrite(PIN_DHT, LOW);
  if (dhtType == 22) delayMicroseconds(1100); else delay(20);
  pinMode(PIN_DHT, INPUT_PULLUP);
  delayMicroseconds(40);
  // risposta del sensore: basso ~80 µs, alto ~80 µs
  if (!dhtWhile(LOW, 200)) return 1;
  if (!dhtWhile(HIGH, 200)) return 1;
  for (uint8_t i = 0; i < 40; i++) {
    if (!dhtWhile(LOW, 150)) return 1;            // ~50 µs basso prima di ogni bit
    unsigned long high = dhtWhile(HIGH, 150);     // durata del livello alto = valore del bit
    if (!high) return 1;
    dhtData[i / 8] <<= 1;
    if (high > 48) dhtData[i / 8] |= 1;
  }
  uint8_t sum = dhtData[0] + dhtData[1] + dhtData[2] + dhtData[3];
  return sum == dhtData[4] ? 0 : 2;
}

void startDht(char *args) {
  // args: "<intervallo_ms>,<tipo>"
  long interval = atol(args);
  char *p = strchr(args, ',');
  dhtType = (p && atol(p + 1) == 22) ? 22 : 11;
  long minInterval = dhtType == 22 ? 2000 : 1000;
  if (interval < minInterval) interval = minInterval;
  if (interval > 600000L) interval = 600000L;
  intervalMs = (unsigned long)interval;
  pinMode(PIN_DHT, INPUT_PULLUP);
  adcFast(false);
  mode = DHT;
  t0Ms = millis();
  nextMs = t0Ms + 1000;          // il sensore vuole ~1 s dall'accensione prima della prima misura
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.print(F("#ACK,START,DHT,"));
  Serial.println(intervalMs);
}

// ---------- oscilloscopio ----------
// ADC più veloce: prescaler 16 → clock dell'ADC a 1 MHz, una conversione in ~16 µs
// (con il valore predefinito 128 servono ~112 µs). Si perde un po' di precisione, ma per
// una forma d'onda va benissimo. Per il termistore si torna al prescaler 128.
void adcFast(bool on) {
  ADCSRA = (ADCSRA & ~0x07) | (on ? 0x04 : 0x07);
}

// Attende il trigger (o il tempo massimo in modo auto), poi legge n campioni a passo fisso.
// Restituisce false se è arrivato un comando durante l'attesa.
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
  for (int i = 0; i < scopeN; i++) {
    Serial.print(',');
    Serial.print(scopeBuf[i]);
  }
  Serial.println();
}

void startScope(char *args) {
  // args: "<dt_us>,<n>,<livello>,<fronte>,<auto>"
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
  adcFast(true);
  mode = SCOPE;
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.print(F("#ACK,START,SCOPE,"));
  Serial.println(scopeDt);
}

// ---------- comandi ----------

void startMode(Mode m, long interval) {
  if (m == TEMP && interval < 100) interval = 100;      // termistore: almeno 100 ms
  if (m == SONAR && interval < 30) interval = 30;       // HC-SR04: almeno 30 ms tra impulsi
  if (interval > 600000L) interval = 600000L;           // al massimo 10 minuti
  intervalMs = (unsigned long)interval;
  mode = m;
  t0Ms = millis();
  t0Us = micros();
  nextMs = t0Ms;
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.print(F("#ACK,START,"));
  Serial.print(m == TEMP ? F("TEMP,") : F("SONAR,"));
  Serial.println(intervalMs);
}

void handleCommand(char *cmd) {
  if (strcmp(cmd, "ID?") == 0) {
    sendHello();
  } else if (strcmp(cmd, "STOP") == 0) {
    mode = IDLE;
    adcFast(false);
    digitalWrite(LED_BUILTIN, LOW);
    Serial.println(F("#ACK,STOP"));
  } else if (strncmp(cmd, "START,TEMP,", 11) == 0) {
    adcFast(false);
    startMode(TEMP, atol(cmd + 11));
  } else if (strncmp(cmd, "START,SCOPE,", 12) == 0) {
    startScope(cmd + 12);
  } else if (strncmp(cmd, "START,DHT,", 10) == 0) {
    startDht(cmd + 10);
  } else if (strncmp(cmd, "START,SONAR,", 12) == 0) {
    startMode(SONAR, atol(cmd + 12));
  } else if (cmdLen > 0) {
    Serial.print(F("#ERR,"));
    Serial.println(cmd);
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

// ---------- ciclo principale ----------

void loop() {
  pollSerial();
  if (mode == IDLE) return;

  if (mode == SCOPE) {
    bool fired;
    if (scopeCapture(fired)) scopeSend(fired);
    return;
  }

  unsigned long now = millis();
  if ((long)(now - nextMs) < 0) return;   // non è ancora il momento (gestisce l'overflow)
  nextMs += intervalMs;                    // scansione regolare, senza deriva

  if (mode == TEMP) {
    unsigned long t = now - t0Ms;
    float adc = readThermistorAdc();
    Serial.print(F("T,"));
    Serial.print(t);
    Serial.print(',');
    Serial.println(adc, 2);
  } else if (mode == DHT) {
    unsigned long t = now - t0Ms;
    uint8_t err = dhtRead();
    Serial.print(F("H,"));
    Serial.print(t);
    for (uint8_t i = 0; i < 4; i++) {
      Serial.print(',');
      Serial.print(dhtData[i]);
    }
    Serial.print(',');
    Serial.println(err);
  } else if (mode == SONAR) {
    unsigned long tUs;
    unsigned long echo = readSonarUs(tUs);
    Serial.print(F("S,"));
    Serial.print(tUs);
    Serial.print(',');
    Serial.println(echo);
  }

  // Se siamo rimasti molto indietro (es. intervallo troppo breve), riallinea.
  if ((long)(millis() - nextMs) > (long)(5 * intervalMs)) nextMs = millis() + intervalMs;
}
