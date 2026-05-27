import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Global: downgrade high-noise rules that require systematic migration
  {
    rules: {
      // 200+ legacy any usages; migrate incrementally (TODO: remove after cleanup)
      "@typescript-eslint/no-explicit-any": "warn",
      // Experimental rule that flags common initialization patterns;
      // revisit after React 19 stable guidance
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Scripts: allow CommonJS and relax type rules for tooling
  {
    files: ["scripts/**/*", "prisma/**/*"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
