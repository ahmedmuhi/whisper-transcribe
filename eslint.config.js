// eslint.config.js  —  ESLint 9 “flat” configuration
import js from "@eslint/js";                    // recommended rules
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";

export default [

  // 1) Glob‑style ignores (replaces .eslintignore)
  {
    ignores: ["node_modules/**", "coverage/**", "docs/**", "metrics/**"]
  },

  // 2) Base rules that match “eslint:recommended”
  js.configs.recommended,

  // 3) Project‑specific rules
  {
    files: ["**/*.js"],
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { 
        // Browser globals
        window: "readonly", 
        document: "readonly",
        console: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        MediaRecorder: "readonly",
        // Node.js globals (for development tools)
        process: "readonly"
      }
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "import/no-unused-modules": ["error", { unusedExports: true }]
    }
  }
];
