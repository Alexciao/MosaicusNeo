/// <reference types="web-bluetooth" />
// MosaicusNeo — collegamento con Arduino tramite un modulo Bluetooth Low Energy (BLE).
//
// Moduli economici come HM-10, AT-09 / BT05, HC-08, JDY-08 offrono una "seriale su BLE":
// un servizio con una caratteristica da cui arrivano i byte (notifiche) e su cui si scrive.
// Il modulo sta su D0/D1 come l'HC-06 e il protocollo è identico a quello via cavo: per il
// resto dell'app è un Arduino come gli altri.
//
// Servizi riconosciuti:
//  • 0xFFE0 / caratteristica 0xFFE1 (HM-10, AT-09, BT05, HC-08, JDY-08, MLT-BT05)
//  • Nordic UART Service (alcune schede e moduli nRF)
// Web Bluetooth: Chrome su computer e Android; su iPhone e iPad il browser Bluefy.
// Le scritture BLE portano al massimo 20 byte per volta: i comandi vengono spezzati.

const HM10_SERVICE = 0xffe0;
const HM10_CHAR = 0xffe1;
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";   // scrittura (verso il modulo)
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";   // notifiche (dal modulo)
const CHUNK = 20;

export const bleSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

export class BleLink {
  kind = "arduino" as const;
  transport = "ble" as const;
  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;   // ci scrivo
  private tx: BluetoothRemoteGATTCharacteristic | null = null;   // mi notifica
  private lineCb: (l: string) => void = () => {};
  private closeCb: () => void = () => {};
  private buf = "";
  private decoder = new TextDecoder();
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  onLine(cb: (l: string) => void) { this.lineCb = cb; }
  onClose(cb: () => void) { this.closeCb = cb; }

  /** Va chiamata dentro un clic: il browser mostra l'elenco dei dispositivi BLE vicini. */
  async open() {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [HM10_SERVICE] }, { services: [NUS_SERVICE] },
        { namePrefix: "MosaicusNeo" }, { namePrefix: "HMSoft" }, { namePrefix: "BT05" }, { namePrefix: "HC-08" },
        { namePrefix: "MLT-BT05" }, { namePrefix: "JDY" }, { namePrefix: "AT-09" },
      ],
      optionalServices: [HM10_SERVICE, NUS_SERVICE],
    });
    this.device.addEventListener("gattserverdisconnected", this.onDisconnect);
    const server = await this.device.gatt!.connect();
    try {
      const svc = await server.getPrimaryService(HM10_SERVICE);
      this.tx = this.rx = await svc.getCharacteristic(HM10_CHAR);
    } catch {
      try {
        const svc = await server.getPrimaryService(NUS_SERVICE);
        this.rx = await svc.getCharacteristic(NUS_RX);
        this.tx = await svc.getCharacteristic(NUS_TX);
      } catch {
        server.disconnect();
        throw new Error("il dispositivo non offre una seriale BLE (servizio FFE0 o Nordic UART)");
      }
    }
    this.tx.addEventListener("characteristicvaluechanged", this.onData);
    await this.tx.startNotifications();
  }

  private onData = (e: Event) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!v) return;
    this.buf += this.decoder.decode(v, { stream: true });
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, "").trim();
      this.buf = this.buf.slice(i + 1);
      if (line) this.lineCb(line);
    }
    if (this.buf.length > 4096) this.buf = "";   // protezione da dati senza a capo
  };

  private onDisconnect = () => this.finish();

  /** Scritture in fila, a pezzi da 20 byte. */
  write(text: string): Promise<void> {
    const bytes = new TextEncoder().encode(`${text}\n`);
    this.queue = this.queue.then(async () => {
      if (!this.rx || this.closed) return;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const part = bytes.slice(i, i + CHUNK);
        if (this.rx.properties.writeWithoutResponse) await this.rx.writeValueWithoutResponse(part);
        else await this.rx.writeValueWithResponse(part);
      }
    }).catch(() => { /* collegamento perso: ci pensa gattserverdisconnected */ });
    return this.queue;
  }

  async close() {
    try { await this.tx?.stopNotifications(); } catch { /* già chiuso */ }
    this.device?.gatt?.disconnect();
    this.finish();
  }

  private finish() {
    if (this.closed) return;
    this.closed = true;
    this.device?.removeEventListener("gattserverdisconnected", this.onDisconnect);
    this.tx?.removeEventListener("characteristicvaluechanged", this.onData);
    this.closeCb();
  }
}
