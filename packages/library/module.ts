import type { WorkspacePackageRegistration } from "@workspace/core";

export const moduleDefinition: WorkspacePackageRegistration = {
  packageName: "@workspace/library",
  layer: "domain",
  moduleDef: {
    key: "library",
    label: "资料库",
    desc: "内部资料存档",
    href: "/library",
    iconKey: "library",
    color: "orange",
    resourceKey: "library",
  },
  resourceDefs: [
    { key: "library", name: "资料库", maxRoleKey: "write", sortOrder: 7 },
    { key: "library.write", name: "资料库编辑", parentKey: "library", maxRoleKey: "admin", sortOrder: 0 },
    { key: "library.secret", name: "保密资料", parentKey: "library", maxRoleKey: "access", sortOrder: 1 },
    { key: "library.top_secret", name: "绝密资料", parentKey: "library", maxRoleKey: "access", sortOrder: 2 },
  ],
  routes: ["/library"],
  apiGuards: [
    { method: "GET", pathPrefix: "/api/library", resourceKey: "library", action: "access" },
    { method: "POST", pathPrefix: "/api/library", resourceKey: "library.write", action: "write" },
    { method: "PATCH", pathPrefix: "/api/library", resourceKey: "library.write", action: "write" },
    { method: "DELETE", pathPrefix: "/api/library", resourceKey: "library.write", action: "delete" },
  ],
};

export const libraryPackage = moduleDefinition;
