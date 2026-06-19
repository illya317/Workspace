import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

export const moduleDefinition = getRegisteredModuleDefinition("@workspace/production");

export const productionPackage = moduleDefinition;
