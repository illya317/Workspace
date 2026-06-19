import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

export const moduleDefinition = getRegisteredModuleDefinition("@workspace/hr");

export const hrPackage = moduleDefinition;
