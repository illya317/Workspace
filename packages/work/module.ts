import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";

export const moduleDefinition = getRegisteredModuleDefinition("@workspace/work");

export const workPackage = moduleDefinition;
