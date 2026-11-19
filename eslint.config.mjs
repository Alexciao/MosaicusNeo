import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // motori su canvas portati dalla versione originale: stile compatto con a ? b() : c()
    files: ["src/lib/mosaicus/**/*.js"],
    rules: { "@typescript-eslint/no-unused-expressions": "off" },
  },
  {
    // icone SVG statiche: <img> va benissimo, non serve l'ottimizzazione di next/image
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
  ]),
]);

export default eslintConfig;
