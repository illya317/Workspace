#!/usr/bin/env node

import { loadCachePolicy } from "./cache/cache-policy.mjs";
import { pruneCaches } from "./cache/cache-prune.mjs";

const policy = loadCachePolicy({ env: process.env });
const report = pruneCaches({ repositoryRoot: process.cwd(), policy });
process.stdout.write(
  `Unified cache policy retained ${report.totalBytes} bytes after ${report.removed.length} eviction(s); disk ${report.diskUsagePercent.toFixed(1)}%.\n`,
);
