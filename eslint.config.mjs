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
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^(antd|@mui\\/|react-bootstrap)(\\/.*)?$/]",
          message: "UI imports must come from @workspace/core/ui; add the missing Core primitive before using a third-party UI library.",
        },
        {
          selector: "ExportNamedDeclaration[source.value=/^(antd|@mui\\/|react-bootstrap)(\\/.*)?$/]",
          message: "UI re-exports must come from @workspace/core/ui, not third-party UI libraries.",
        },
      ],
    },
  },
  // File size governance. Keep this in ESLint so line budgets are part of lint, not a parallel check.
  {
    files: ["app/api/**/route.ts"],
    rules: {
      "max-lines": ["error", { max: 120, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["app/**/page.tsx"],
    rules: {
      "max-lines": ["error", { max: 150, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["app/**/*.tsx"],
    ignores: ["app/api/**", "app/**/page.tsx"],
    rules: {
      "max-lines": ["error", { max: 220, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["server/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 260, skipBlankLines: false, skipComments: false }],
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
                "@workspace/administration",
                "@workspace/administration/*",
                "@workspace/library",
                "@workspace/library/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/finance",
                "@workspace/finance/*",
                "@workspace/work",
                "@workspace/work/*",
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
                "@workspace/administration/*/server/*",
                "@workspace/finance/*/server/*",
                "@workspace/hr/*/server/*",
                "@workspace/library/*/server/*",
                "@workspace/production/*/server/*",
                "@workspace/work/*/server/*",
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
                "@workspace/administration",
                "@workspace/administration/*",
                "@workspace/library",
                "@workspace/library/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/finance",
                "@workspace/finance/*",
                "@workspace/work",
                "@workspace/work/*",
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
                "@workspace/administration",
                "@workspace/administration/*",
                "@workspace/library",
                "@workspace/library/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/finance",
                "@workspace/finance/*",
                "@workspace/work",
                "@workspace/work/*",
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
                "@workspace/administration",
                "@workspace/administration/*",
                "@workspace/library",
                "@workspace/library/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/work",
                "@workspace/work/*",
              ],
              message: "Finance must depend on @workspace/platform contracts or Finance-owned code, not app-root runtime aliases or other Apps.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/administration/**/*.{ts,tsx}"],
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
                "@workspace/finance",
                "@workspace/finance/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/library",
                "@workspace/library/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/work",
                "@workspace/work/*",
              ],
              message: "Administration must depend on @workspace/platform contracts or Administration-owned code, not app-root runtime aliases or other Apps.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/library/**/*.{ts,tsx}"],
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
                "@workspace/administration",
                "@workspace/administration/*",
                "@workspace/finance",
                "@workspace/finance/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/production",
                "@workspace/production/*",
                "@workspace/work",
                "@workspace/work/*",
              ],
              message: "Library must depend on @workspace/platform contracts or Library-owned code, not app-root runtime aliases or other Apps.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/work/**/*.{ts,tsx}"],
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
                "@workspace/administration",
                "@workspace/administration/*",
                "@workspace/finance",
                "@workspace/finance/*",
                "@workspace/hr",
                "@workspace/hr/*",
                "@workspace/library",
                "@workspace/library/*",
                "@workspace/production",
                "@workspace/production/*",
              ],
              message: "Work must depend on @workspace/platform contracts or Work-owned code, not app-root runtime aliases or other Apps.",
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
