import { readFileSync } from "node:fs";

const MODULES = [
  "../release/control/runtime-permission-bootstrap.sh",
  "transport.sh",
  "state.sh",
  "artifact.sh",
  "runtime-supply.sh",
  "runtime-safety.sh",
  "atomic-cutover.sh",
  "health.sh",
];

/**
 * Contract tests inspect the composed deployment program, while production
 * executes the same modules through deploy.sh's private composition root.
 */
export function readDeploySourceContract() {
  return [
    ...MODULES.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")),
    readFileSync(new URL("../deploy.sh", import.meta.url), "utf8"),
  ].join("\n");
}
