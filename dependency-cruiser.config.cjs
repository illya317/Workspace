/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-must-not-import-workspace-layers",
      severity: "error",
      from: { path: "^packages/core" },
      to: { path: "^packages/(platform|administration|capital-securities|external|finance|hr|inventory|library|production|work)" },
    },
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "platform-must-not-import-domain-packages",
      severity: "error",
      from: { path: "^packages/platform" },
      to: { path: "^packages/(administration|capital-securities|external|finance|hr|inventory|library|production|work)" },
    },
    {
      name: "administration-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/administration" },
      to: { path: "^packages/(capital-securities|external|finance|hr|inventory|library|production|work)" },
    },
    {
      name: "capital-securities-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/capital-securities" },
      to: { path: "^packages/(administration|external|finance|hr|inventory|library|production|work)" },
    },
    {
      name: "external-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/external" },
      to: { path: "^packages/(administration|capital-securities|finance|hr|inventory|library|production|work)" },
    },
    {
      name: "finance-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/finance" },
      to: { path: "^packages/(administration|capital-securities|external|hr|inventory|library|production|work)" },
    },
    {
      name: "hr-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/hr" },
      to: { path: "^packages/(administration|capital-securities|external|finance|inventory|library|production|work)" },
    },
    {
      name: "inventory-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/inventory" },
      to: { path: "^packages/(administration|capital-securities|external|finance|hr|library|production|work)" },
    },
    {
      name: "library-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/library" },
      to: { path: "^packages/(administration|capital-securities|external|finance|hr|inventory|production|work)" },
    },
    {
      name: "production-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/production" },
      to: { path: "^packages/(administration|capital-securities|external|finance|hr|inventory|library|work)" },
    },
    {
      name: "work-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/work" },
      to: { path: "^packages/(administration|capital-securities|external|finance|hr|inventory|library|production)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)node_modules/|(^|/)\\.next/|(^|/)tmp/|(^|/)generated/",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
