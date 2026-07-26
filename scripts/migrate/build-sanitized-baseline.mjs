#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const inputs = [];
  let output = "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[++index];
    if (!value || value.startsWith("--")) fail(`missing value for ${argument ?? "argument"}`);
    if (argument === "--input") inputs.push(path.resolve(value));
    else if (argument === "--output") output = path.resolve(value);
    else fail(`unknown argument: ${argument}`);
  }
  if (inputs.length === 0 || !output) fail("usage: build-sanitized-baseline.mjs --input FILE [--input FILE...] --output FILE");
  return { inputs, output };
}

function validateSql(sql, file) {
  const forbidden = [
    /^\s*(?:INSERT|UPDATE|DELETE|MERGE|COPY)\b/im,
    /(?:^|["'`])\/(?:Users|home)\/[^/\s"'`]+\//m,
    /\b(?:data\.release\.receipt|locationHint|stagedPath)\b/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(sql)) fail(`sanitized baseline input contains forbidden content: ${file} (${pattern})`);
  }
}

function main() {
  const { inputs, output } = parseArguments(process.argv.slice(2));
  const sections = inputs.map((file) => {
    const sql = readFileSync(file, "utf8").trim();
    validateSql(sql, file);
    return sql;
  });
  const result = `-- workspace:migration-mode=maintenance\n-- Sanitized structural baseline. Contains schema only; tenant facts belong outside Git.\n\n${sections.join("\n\n")}\n`;
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, result, { mode: 0o644 });
  const digest = createHash("sha256").update(result).digest("hex");
  process.stdout.write(`${JSON.stringify({ output, sha256: digest, bytes: Buffer.byteLength(result) })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
