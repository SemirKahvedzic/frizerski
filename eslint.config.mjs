import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Import boundaries (docs/architecture.md §4):
 *
 *   app        → components, modules, lib, i18n
 *   components → components, lib, i18n, modules (types/schemas only by convention)
 *   modules    → modules, lib, i18n, generated
 *   engine     → engine, lib/time only (pure: no I/O, no framework)
 *   lib        → lib, generated
 *   worker     → modules, lib, generated
 *
 * Element order matters: more specific patterns first.
 */
const elements = [
  { type: "engine", pattern: "src/modules/booking/engine/**/*", partialMatch: false },
  { type: "modules", pattern: "src/modules/*", capture: ["module"] },
  { type: "lib-time", pattern: "src/lib/time/**/*", partialMatch: false },
  { type: "lib", pattern: "src/lib/**/*", partialMatch: false },
  { type: "app", pattern: "src/app/**/*", partialMatch: false },
  { type: "components", pattern: "src/components/**/*", partialMatch: false },
  { type: "i18n", pattern: "src/i18n/**/*", partialMatch: false },
  { type: "worker", pattern: "src/worker/**/*", partialMatch: false },
  { type: "generated", pattern: "src/generated/**/*", partialMatch: false },
];

const allow = (from, types) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: types } } } },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*"],
      "boundaries/ignore": ["src/proxy.ts", "src/*.d.ts"],
      "boundaries/elements": elements,
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
        node: true,
      },
    },
    rules: {
      "boundaries/no-unknown-files": "off",
      "boundaries/no-unknown": "off",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "Import crosses a module boundary (see docs/architecture.md §4)",
          policies: [
            allow("app", ["app", "components", "modules", "lib", "lib-time", "i18n", "generated"]),
            allow("components", ["components", "lib", "lib-time", "i18n", "modules"]),
            allow("modules", ["modules", "engine", "lib", "lib-time", "i18n", "generated"]),
            allow("engine", ["engine", "lib-time"]),
            allow("lib-time", ["lib-time"]),
            allow("lib", ["lib", "lib-time", "generated"]),
            allow("i18n", ["i18n", "lib"]),
            allow("worker", ["worker", "modules", "lib", "lib-time", "generated"]),
            // External packages are allowed everywhere except in pure code.
            {
              allow: { to: { module: { origin: "external" } } },
            },
            {
              from: { element: { types: { anyOf: ["engine", "lib-time"] } } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    source: {
                      anyOf: [
                        "@prisma/*",
                        "pg",
                        "next",
                        "next/*",
                        "react",
                        "react-dom",
                        "pino",
                        "server-only",
                      ],
                    },
                  },
                },
              },
              message: "The booking engine must stay pure (no I/O, no framework imports).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/booking/engine/**/*.ts", "src/lib/time/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Pure code must receive `now` as a parameter instead of calling Date.now().",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Pure code must receive `now` as a parameter instead of calling new Date().",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/generated/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
