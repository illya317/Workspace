import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

export const moduleDefinition = getRegisteredModuleDefinition("@workspace/finance");

export const financePackage = moduleDefinition;
