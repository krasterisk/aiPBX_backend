import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

/** @type {import('eslint').Linter.Config[]} */
export default [
    {files: ["**/*.{ts}"]},
    {files: ["**/*.ts"], languageOptions: {sourceType: "commonjs"}},
    {languageOptions: {globals: globals.node}},
  {
    plugins: {
      unusedImports: unusedImports
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-useless-escape": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unusedImports/no-unused-imports": "error",
      "unusedImports/no-unused-vars": [
        "warn",
        { "vars": "all", "varsIgnorePattern": "^_", "args": "after-used", "argsIgnorePattern": "^_" }
      ]
    }
  },
  pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
  {
    ignores: ["dist/*","node_modules/*","**/*.{js}"]
  }
];
