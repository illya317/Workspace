#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const standaloneRoot = path.resolve(__dirname, "../../.next/standalone");
fs.rmSync(standaloneRoot, { recursive: true, force: true });
console.log("✓ Removed previous standalone output before tracing.");
