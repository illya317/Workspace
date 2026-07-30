const VERIFIED_API_ROUTE_FACTORIES = Object.freeze([
  Object.freeze({
    importedName: "createHrWorkspaceAnalysisSourceRoute",
    source: "@workspace/hr/server/analysis",
  }),
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importedBindingNames(code, importedName, source) {
  const escapedSource = escapeRegExp(source);
  const importPattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escapedSource}["']`,
    "g",
  );
  const bindingNames = [];
  let importMatch;

  while ((importMatch = importPattern.exec(code))) {
    for (const rawBinding of importMatch[1].split(",")) {
      const binding = rawBinding.trim();
      const match = binding.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (match?.[1] === importedName) bindingNames.push(match[2] ?? match[1]);
    }
  }

  return bindingNames;
}

function usesVerifiedApiRouteFactory(code) {
  return VERIFIED_API_ROUTE_FACTORIES.some(({ importedName, source }) => (
    importedBindingNames(code, importedName, source).some((bindingName) => (
      new RegExp(`\\bexport\\s+const\\s+(?:GET|POST|PUT|PATCH|DELETE)\\s*=\\s*${escapeRegExp(bindingName)}\\s*\\(`).test(code)
    ))
  ));
}

module.exports = {
  usesVerifiedApiRouteFactory,
};
