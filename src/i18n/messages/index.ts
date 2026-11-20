// Messages, one JSON file per area of the app (namespace). English is the reference: its shape
// types every key (see src/i18n/global.d.ts); Italian must have exactly the same keys.

import enCommon from "./en/common.json";
import enApp from "./en/app.json";
import enGuide from "./en/guide.json";
import enLab from "./en/lab.json";
import enSensors from "./en/sensors.json";
import enEngine from "./en/engine.json";
import enRig from "./en/rig.json";
import enWorkbench from "./en/workbench.json";

import itCommon from "./it/common.json";
import itApp from "./it/app.json";
import itGuide from "./it/guide.json";
import itLab from "./it/lab.json";
import itSensors from "./it/sensors.json";
import itEngine from "./it/engine.json";
import itRig from "./it/rig.json";
import itWorkbench from "./it/workbench.json";

export const en = {
  common: enCommon,
  app: enApp,
  guide: enGuide,
  lab: enLab,
  sensors: enSensors,
  engine: enEngine,
  rig: enRig,
  workbench: enWorkbench,
};

export type Messages = typeof en;

export const it: Messages = {
  common: itCommon,
  app: itApp,
  guide: itGuide,
  lab: itLab,
  sensors: itSensors,
  engine: itEngine,
  rig: itRig,
  workbench: itWorkbench,
} as unknown as Messages;
