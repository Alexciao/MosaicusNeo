// Copia il firmware in public/, così l'app lo offre da scaricare (una sola fonte: firmware/).
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/firmware", { recursive: true });
cpSync("firmware/mosaicusneo_firmware/mosaicusneo_firmware.ino", "public/firmware/mosaicusneo_firmware.ino");
