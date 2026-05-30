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
