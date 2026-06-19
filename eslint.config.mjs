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
    // Claude worktrees (copies of codebase for agent isolation)
    ".claude/**",
    // Temporary research/scrape artifacts are not product or tooling source.
    "tmp/**",
  ]),
  // Core quality gates: 0 warnings target for CI (--max-warnings=0)
  {
    rules: {
      // any 存量需逐步清零；新增 any 直接阻断提交
      "@typescript-eslint/no-explicit-any": "error",
      // 实验性规则，与 React 常见初始化模式冲突；待官方稳定后评估
      "react-hooks/set-state-in-effect": "off",
      // 允许 _ 前缀的故意未使用参数/变量
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Package boundaries: keep the Core -> Platform -> Apps direction enforceable through lint too.
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@workspace/platform",
                "@workspace/platform/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/finance",
                "@workspace/finance/*",
                "@/*",
              ],
              message: "Core must stay framework/runtime/business agnostic. Move platform or business dependencies out of @workspace/core.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/platform/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/*",
                "@/lib/*",
                "@/server/*",
                "@/generated/*",
              ],
              message: "Platform package must use package-owned contracts instead of app-root runtime aliases.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/hr/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/*",
                "@/lib/*",
                "@/server/*",
                "@/generated/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/finance",
                "@workspace/finance/*",
              ],
              message: "HR must depend on @workspace/platform contracts or HR-owned code, not app-root runtime aliases or other Apps.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/production/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/*",
                "@/lib/*",
                "@/server/*",
                "@/generated/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/finance",
                "@workspace/finance/*",
              ],
              message: "Production must depend on @workspace/platform contracts or Production-owned code, not app-root runtime aliases or other Apps.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/finance/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/*",
                "@/lib/*",
                "@/server/*",
                "@/generated/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/production",
                "@workspace/production/*",
              ],
              message: "Finance must depend on @workspace/platform contracts or Finance-owned code, not app-root runtime aliases or other Apps.",
            },
          ],
        },
      ],
    },
  },
  // Scripts: allow CommonJS and relax type rules for tooling
  {
    files: ["scripts/**/*", "config/scripts/**/*", "prisma/**/*"],
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
