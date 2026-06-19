import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Прагматичный конфиг: ловим реальные ошибки (необъявленные имена, нарушения
// правил хуков), а стилевое держим как предупреждения, чтобы не блокировать сборку.
// .ts/.tsx разбираются парсером typescript-eslint.
export default [
  // .claude/skills — вендоренные сторонние скиллы (их скрипты не наш код)
  { ignores: ["dist/**", "node_modules/**", ".claude/**"] },
  js.configs.recommended,
  // typescript-eslint только для .ts/.tsx, чтобы не трогать существующий .jsx-код
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.{ts,tsx}"] })),
  // Общие правила React для всех исходников
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      // JSX-трансформ автоматический (vite-react) — React в области видимости не нужен
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/prop-types": "off",
      // Правила хуков — главное ради чего нужен линтер
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // JS/JSX: базовое no-unused-vars как предупреждение
  {
    files: ["**/*.{js,jsx}"],
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // TS/TSX: версия правила из typescript-eslint, тоже предупреждение
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.test.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
