import { FINANCE_CAPABILITY_INTERFACE_FILES } from "./finance";
import { HR_CAPABILITY_INTERFACE_FILES } from "./hr";
import { PLATFORM_CAPABILITY_INTERFACE_FILES } from "./platform";
import { WORK_CAPABILITY_INTERFACE_FILES } from "./work";

/**
 * Exact public Interface files for recursive source Modules. Directory-wide
 * exposure is intentionally unsupported: adding a new public seam requires an
 * explicit path review in the owning L1 catalog.
 */
export const SOURCE_CAPABILITY_INTERFACE_FILES: Readonly<Record<string, readonly string[]>> = {
  ...FINANCE_CAPABILITY_INTERFACE_FILES,
  ...HR_CAPABILITY_INTERFACE_FILES,
  ...PLATFORM_CAPABILITY_INTERFACE_FILES,
  ...WORK_CAPABILITY_INTERFACE_FILES,
};
