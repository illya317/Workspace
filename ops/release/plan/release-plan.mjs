#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export * from "./release-plan-contract.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import("./release-plan-cli.mjs")
    .then(({ main }) => main())
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
