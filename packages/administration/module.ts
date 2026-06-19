import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

export const moduleDefinition = getRegisteredModuleDefinition("@workspace/administration");

export const administrationPackage = moduleDefinition;
