import type { WorkspacePackageRegistration } from "@workspace/core/module-contract";
import { activeModuleDefinitions, effectiveModuleDefinitions } from "./effective-module-registry";

export const platformPackages: WorkspacePackageRegistration[] = effectiveModuleDefinitions;

export const workspacePackages: WorkspacePackageRegistration[] = platformPackages;

export const activeWorkspacePackages: WorkspacePackageRegistration[] = activeModuleDefinitions;
