import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // TypeScript handles these
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // No any allowed - use proper types or unknown
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js", "*.config.ts"],
  }
);
