import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import packagePolicy from "./scripts/arch/package-dependency-policy.cjs";

const {
  PACKAGE_NAMES,
  forbiddenPackageDependenciesFor,
  packageDefinition,
  workspacePackageAlias,
} = packagePolicy;

const PACKAGES_WITH_STRICT_APP_ROOT_IMPORTS = new Set(["agent", "core", "docs", "settings"]);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const packageDependencyLintConfigs = PACKAGE_NAMES.map((packageName) => {
  const forbiddenWorkspaceImports = forbiddenPackageDependenciesFor(packageName)
    .flatMap((dependency) => [workspacePackageAlias(dependency), `${workspacePackageAlias(dependency)}/*`]);
  const rootBarrelImportRegex = `^(?:${[packageName, ...packageDefinition(packageName).allowedDependencies]
    .map((dependency) => escapeRegex(workspacePackageAlias(dependency)))
    .join("|")})$`;
  const appRootImports = PACKAGES_WITH_STRICT_APP_ROOT_IMPORTS.has(packageName)
    ? ["@/*"]
    : ["@/app/*", "@/lib/*", "@/server/*", "@/generated/*"];
  return {
    name: `workspace/package-dependency-policy/${packageName}`,
    files: [`packages/${packageName}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: forbiddenWorkspaceImports,
              message: `Package policy does not allow ${packageName} to depend on this workspace package.`,
            },
            {
              regex: rootBarrelImportRegex,
              message: "Implementation code must import an explicit exported subpath, not a workspace package root barrel.",
            },
            {
              group: appRootImports,
              message: `${packageName} must use package-owned interfaces instead of app-root aliases.`,
            },
          ],
        },
      ],
    },
  };
});

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
    // Local check snapshots and caches are generated artifacts, not source.
    ".cache/**",
    // Deploy-unit apps are deterministic mirrors of app/ plus generated runtime
    // wiring. Their byte-for-byte contract is checked by deploy:apps:check.
    "apps/**",
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
  {
    files: [
      "packages/core/ui/services/ui-provider.tsx",
      "packages/core/ui/internal/**/antd-*.{ts,tsx}",
      "packages/core/ui/internal/common/{CommandButton,ConfirmModal,Pagination,Toast}.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^(@mui\\/|react-bootstrap)(\\/.*)?$/]",
          message: "Core Ant Design implementations may import antd only; other UI libraries still require their own reviewed Core implementation.",
        },
        {
          selector: "ExportNamedDeclaration[source.value=/^(@mui\\/|react-bootstrap)(\\/.*)?$/]",
          message: "Core Ant Design implementations must not re-export another third-party UI library.",
        },
      ],
    },
  },
  // File size governance. Keep this in ESLint so hard caps are part of lint, not a parallel check.
  // Canonical hard caps:
  // - API route shell: 120
  // - page facade: 150
  // - app-local UI: 220
  // - server service: 260
  // - package fallback: 500 for TSX, 550 for TS
  // - Core fallback: 450; registry data shards: 500
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
  {
    files: ["packages/**/*.tsx"],
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["packages/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 550, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["packages/core/**/*.tsx"],
    rules: {
      "max-lines": ["error", { max: 450, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 450, skipBlankLines: false, skipComments: false }],
    },
  },
  // Registry data shards are declarative tables; keep a finite budget but do not use the component source budget.
  {
    files: ["packages/core/ui/component-registry-data*.ts"],
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["scripts/**/*.{ts,tsx,js,mjs,cjs}", "config/scripts/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "max-lines": ["error", { max: 900, skipBlankLines: false, skipComments: false }],
    },
  },
  // Package dependency restrictions are generated from the central declarative policy.
  ...packageDependencyLintConfigs,
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
