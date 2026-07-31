"use strict";

const MAX_CHECK_OLD_SPACE_MIB = 8192;
const OLD_SPACE_OPTION_PATTERN =
  /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=(\d+)|\s+(\d+))(?=\s|$)/g;

function readOldSpaceLimits(nodeOptions = "") {
  const limits = [];
  const value = String(nodeOptions);
  let match;

  while ((match = OLD_SPACE_OPTION_PATTERN.exec(value)) !== null) {
    limits.push(Number(match[1] ?? match[2]));
  }
  OLD_SPACE_OPTION_PATTERN.lastIndex = 0;
  return limits;
}

function enforceCheckMemoryLimit(nodeOptions = "") {
  const value = String(nodeOptions).trim();
  const limits = readOldSpaceLimits(value);
  const excessiveLimit = limits.find((limit) => limit > MAX_CHECK_OLD_SPACE_MIB);

  if (excessiveLimit !== undefined) {
    throw new Error(
      `Local checks cannot use more than ${MAX_CHECK_OLD_SPACE_MIB} MiB Node old-space; received ${excessiveLimit} MiB. Increase CHECK_LOCK_TIMEOUT_MS or the caller wait time instead.`,
    );
  }

  if (limits.length > 0) return value;
  return [value, `--max-old-space-size=${MAX_CHECK_OLD_SPACE_MIB}`].filter(Boolean).join(" ");
}

module.exports = {
  MAX_CHECK_OLD_SPACE_MIB,
  enforceCheckMemoryLimit,
  readOldSpaceLimits,
};
