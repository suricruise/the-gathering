import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
export default tseslint.config(
  { ignores: ["dist", "node_modules", ".next", "next-env.d.ts"] },
  js.configs.recommended,
  {
    files: ["e2e/**/*.ts"],
    rules: {
      "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }],
    },
  },
  { files: ["**/*.{js,mjs}"], languageOptions: { globals: globals.node } },
  {
    files: ["public/sw.js", "scripts/pwa/service-worker.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  { files: ["public/pwa/*.js"], languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
