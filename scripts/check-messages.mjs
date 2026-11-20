// Checks that every Italian message file has exactly the keys of its English counterpart
// and that every message parses as ICU. Run: node scripts/check-messages.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";

const dir = new URL("../src/i18n/messages/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out); else out[key] = v;
  }
  return out;
};
let bad = 0;
for (const file of readdirSync(join(dir, "en"))) {
  const en = flat(JSON.parse(readFileSync(join(dir, "en", file), "utf8")));
  const it = flat(JSON.parse(readFileSync(join(dir, "it", file), "utf8")));
  for (const k of Object.keys(en)) if (!(k in it)) { console.log(`it/${file}: missing ${k}`); bad++; }
  for (const k of Object.keys(it)) if (!(k in en)) { console.log(`it/${file}: extra ${k}`); bad++; }
  for (const [lang, m] of [["en", en], ["it", it]]) {
    for (const [k, v] of Object.entries(m)) {
      if (typeof v !== "string") { console.log(`${lang}/${file}: ${k} is not a string`); bad++; continue; }
      try { new IntlMessageFormat(v, lang); } catch (e) { console.log(`${lang}/${file}: ${k}: ${e.message}`); bad++; }
    }
  }
}
console.log(bad ? `${bad} problem(s)` : "messages OK");
process.exit(bad ? 1 : 0);
