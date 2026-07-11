import { requireRouteAccess } from "@workspace/platform/server/auth";
import { activeModuleDefinitions } from "@workspace/platform/effective-module-registry";
import { renderWorkAccountSettingsRoutePage } from "@workspace/work/ui";

function buildApiAccessModules() {
  return activeModuleDefinitions
    .flatMap((definition) => {
      const moduleDef = definition.moduleDef;
      if (!moduleDef || moduleDef.hidden || moduleDef.enabled === false) return [];
      return [{
        key: moduleDef.key,
        label: moduleDef.label,
        apiPrefix: moduleDef.key === "settings" ? "/api/settings/<l2>/*" : `/api/modules/${moduleDef.key}/<l2-kebab>/*`,
        children: (moduleDef.children ?? [])
          .filter((child) => !child.hidden && child.enabled !== false)
          .map((child) => ({
            key: child.key,
            label: child.label,
            resourceKey: child.resourceKey,
            apiPrefixes: child.apiPrefixes ?? [],
            noApiReason: child.noApiReason,
          })),
      }];
    });
}

export default async function SettingsAccountPage() {
  const user = await requireRouteAccess("/settings/account");

  return renderWorkAccountSettingsRoutePage({
    user,
    apiAccessModules: buildApiAccessModules(),
  });
}
