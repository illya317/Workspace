/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-must-not-import-workspace-layers",
      severity: "error",
      from: { path: "^packages/core" },
      to: { path: "^packages/(platform|administration|finance|hr|library|production|work)" },
    },
    {
      name: "platform-must-not-import-domain-implementation",
      severity: "error",
      from: {
        path: "^packages/platform",
        pathNot: "^packages/platform/modules\\.tsx$",
      },
      to: { path: "^packages/(administration|finance|hr|library|production|work)" },
    },
    {
      name: "administration-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/administration" },
      to: { path: "^packages/(finance|hr|library|production|work)" },
    },
    {
      name: "finance-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/finance" },
      to: { path: "^packages/(administration|hr|library|production|work)" },
    },
    {
      name: "hr-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/hr" },
      to: { path: "^packages/(administration|finance|library|production|work)" },
    },
    {
      name: "library-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/library" },
      to: { path: "^packages/(administration|finance|hr|production|work)" },
    },
    {
      name: "production-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/production" },
      to: { path: "^packages/(administration|finance|hr|library|work)" },
    },
    {
      name: "work-must-not-import-other-domains",
      severity: "error",
      from: { path: "^packages/work" },
      to: { path: "^packages/(administration|finance|hr|library|production)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)node_modules/|(^|/)\\.next/|(^|/)tmp/",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
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
