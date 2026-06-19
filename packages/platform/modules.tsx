import type { WorkspacePackageRegistration } from "@workspace/core";
import { registeredModuleDefinitions } from "./module-registry";

export const platformPackages: WorkspacePackageRegistration[] = registeredModuleDefinitions;

export const workspacePackages: WorkspacePackageRegistration[] = platformPackages;
