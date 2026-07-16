#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIFF_MODES = new Set(["two-dot", "three-dot"]);
const MIGRATION_MODE_PATTERN = /^-- workspace:migration-mode=(expand|maintenance)$/;
const MIGRATION_MARKER_CANDIDATE_PATTERN = /^--\s*workspace:migration-mode=/i;
const MIGRATION_PATH_PATTERN = /^prisma\/migrations\/([0-9]{14}_[a-z0-9_]+)\/migration\.sql$/;

function runGit(cwd, args, { encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, { cwd, encoding });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`git ${args.join(" ")} failed${stderr?.trim() ? `: ${stderr.trim()}` : ""}`);
  }
  return result.stdout;
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function violation({ code, message, source, offset }) {
  return { code, line: lineNumberAt(source, offset), message };
}

function isSqlIdentifierContinuation(character) {
  if (!character) return false;
  return /[A-Za-z0-9_$]/.test(character) || character.codePointAt(0) >= 0x80;
}

function hasSqlTokenBoundaryBefore(sql, index) {
  return index === 0 || !isSqlIdentifierContinuation(sql[index - 1]);
}

function hasSqlTokenBoundaryAfter(sql, index) {
  return index >= sql.length || !isSqlIdentifierContinuation(sql[index]);
}

function dollarQuoteDelimiterAt(sql, index) {
  if (sql[index] !== "$" || !hasSqlTokenBoundaryBefore(sql, index)) return null;
  const delimiterEnd = sql.indexOf("$", index + 1);
  if (delimiterEnd < 0) return null;
  const tag = sql.slice(index + 1, delimiterEnd);
  if (tag.length > 0) {
    const [first, ...rest] = [...tag];
    if (!/[A-Za-z_]/.test(first) && first.codePointAt(0) < 0x80) return null;
    if (rest.some((character) => !/[A-Za-z0-9_]/.test(character) && character.codePointAt(0) < 0x80)) {
      return null;
    }
  }
  return sql.slice(index, delimiterEnd + 1);
}

export function parseMigrationMode(sql, { filePath = "migration.sql" } = {}) {
  if (typeof sql !== "string") throw new Error(`${filePath}: SQL must be a string`);
  const normalized = sql.startsWith("\uFEFF") ? sql.slice(1) : sql;
  const lines = normalized.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) {
    throw new Error(`${filePath}: migration is empty and has no migration-mode marker`);
  }

  const firstContent = lines[firstContentIndex].trim();
  const markerMatch = firstContent.match(MIGRATION_MODE_PATTERN);
  if (!markerMatch) {
    throw new Error(
      `${filePath}:${firstContentIndex + 1}: first non-empty line must be `
      + "-- workspace:migration-mode=expand or -- workspace:migration-mode=maintenance",
    );
  }

  const markerLines = lines
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((entry) => MIGRATION_MARKER_CANDIDATE_PATTERN.test(entry.line));
  if (markerLines.length !== 1) {
    throw new Error(`${filePath}: exactly one migration-mode marker is required`);
  }
  return markerMatch[1];
}

/**
 * Replace comments, quoted identifiers, and string/dollar-quoted literals with
 * spaces while preserving offsets. The policy scanner then sees executable SQL
 * only, and reported line numbers still refer to the original migration.
 */
export function stripSqlCommentsAndLiterals(sql, { preserveQuotedIdentifiers = false } = {}) {
  const output = sql.split("");
  let index = 0;
  let blockCommentDepth = 0;

  const blank = (position) => {
    if (output[position] !== "\n" && output[position] !== "\r") output[position] = " ";
  };

  while (index < sql.length) {
    if (blockCommentDepth > 0) {
      if (sql.startsWith("/*", index)) {
        blank(index);
        blank(index + 1);
        blockCommentDepth += 1;
        index += 2;
      } else if (sql.startsWith("*/", index)) {
        blank(index);
        blank(index + 1);
        blockCommentDepth -= 1;
        index += 2;
      } else {
        blank(index);
        index += 1;
      }
      continue;
    }

    if (sql.startsWith("--", index)) {
      while (index < sql.length && sql[index] !== "\n") {
        blank(index);
        index += 1;
      }
      continue;
    }
    if (sql.startsWith("/*", index)) {
      blank(index);
      blank(index + 1);
      blockCommentDepth = 1;
      index += 2;
      continue;
    }

    const delimiter = dollarQuoteDelimiterAt(sql, index);
    if (delimiter) {
      const end = sql.indexOf(delimiter, index + delimiter.length);
      const stop = end < 0 ? sql.length : end + delimiter.length;
      while (index < stop) {
        blank(index);
        index += 1;
      }
      continue;
    }

    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      if (quote === '"' && preserveQuotedIdentifiers) {
        index += 1;
        while (index < sql.length) {
          if (sql[index] === '"' && sql[index + 1] === '"') index += 2;
          else if (sql[index] === '"') {
            index += 1;
            break;
          } else index += 1;
        }
        continue;
      }
      const escapeString = quote === "'"
        && /[eE]/.test(sql[index - 1] ?? "")
        && hasSqlTokenBoundaryBefore(sql, index - 1);
      blank(index);
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "\\" && escapeString) {
          blank(index);
          if (index + 1 < sql.length) blank(index + 1);
          index += 2;
        } else if (sql[index] === quote && sql[index + 1] === quote) {
          blank(index);
          blank(index + 1);
          index += 2;
        } else if (sql[index] === quote) {
          blank(index);
          index += 1;
          break;
        } else {
          blank(index);
          index += 1;
        }
      }
      continue;
    }
    index += 1;
  }
  return output.join("");
}

function statementRanges(sql) {
  const ranges = [];
  let start = 0;
  for (let index = 0; index <= sql.length; index += 1) {
    if (index === sql.length || sql[index] === ";") {
      ranges.push({ start, end: index, text: sql.slice(start, index) });
      start = index + 1;
    }
  }
  return ranges;
}

function topLevelCommaRanges(statement) {
  const ranges = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index <= statement.length; index += 1) {
    const character = statement[index];
    if (character === "(") depth += 1;
    else if (character === ")" && depth > 0) depth -= 1;
    if (index === statement.length || (character === "," && depth === 0)) {
      ranges.push({ start, text: statement.slice(start, index) });
      start = index + 1;
    }
  }
  return ranges;
}

function hasTopLevelKeyword(statement, keyword) {
  const normalizedKeyword = keyword.toUpperCase();
  let depth = 0;
  for (let index = 0; index < statement.length; index += 1) {
    const character = statement[index];
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth !== 0) continue;
    if (statement.slice(index, index + normalizedKeyword.length).toUpperCase() !== normalizedKeyword) {
      continue;
    }
    if (hasSqlTokenBoundaryBefore(statement, index)
      && hasSqlTokenBoundaryAfter(statement, index + normalizedKeyword.length)) return true;
  }
  return false;
}

function firstMatch(statement, pattern) {
  const match = pattern.exec(statement);
  pattern.lastIndex = 0;
  return match;
}

const IDENTIFIER_SOURCE = '(?:\"(?:[^\"]|\"\")*\"|[A-Za-z_][A-Za-z0-9_$]*)';
const QUALIFIED_IDENTIFIER_SOURCE = IDENTIFIER_SOURCE + '(?:\\s*\\.\\s*' + IDENTIFIER_SOURCE + ')?';

function normalizeIdentifier(identifier) {
  const compact = identifier.trim().replace(/\s*\.\s*/g, ".");
  return compact.replace(
    /(^|\.)([A-Za-z_][A-Za-z0-9_$]*)/g,
    (_match, prefix, name) => prefix + name.toLowerCase(),
  );
}

function unsupportedExpandViolation({ sql, statement, offset = 0, message }) {
  return violation({
    code: "unsupported-expand-statement",
    message,
    source: sql,
    offset: statement.start + offset,
  });
}

function findStatementAllowlistViolations(sql, executableSql) {
  const structuralSql = stripSqlCommentsAndLiterals(sql, { preserveQuotedIdentifiers: true });
  const violations = [];
  const createdTables = new Set();
  const nullableColumnsByTable = new Map();
  let inExplicitTransaction = false;

  for (const statement of statementRanges(executableSql)) {
    const executableRaw = statement.text;
    const leading = executableRaw.search(/\S/);
    if (leading < 0) continue;
    const executable = executableRaw.slice(leading).trimEnd();
    const structural = structuralSql.slice(statement.start + leading, statement.end).trimEnd();
    const statementOffset = leading;

    if (/^BEGIN(?:\s+(?:WORK|TRANSACTION))?$/i.test(executable)) {
      inExplicitTransaction = true;
      continue;
    }
    if (/^(?:COMMIT|END|ROLLBACK)(?:\s+(?:WORK|TRANSACTION))?$/i.test(executable)) {
      inExplicitTransaction = false;
      continue;
    }

    const createTable = structural.match(new RegExp(
      '^CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?('
        + QUALIFIED_IDENTIFIER_SOURCE + ')(?=\\s|$|\\()',
      "i",
    ));
    if (createTable) {
      if (!createTable[1]) createdTables.add(normalizeIdentifier(createTable[2]));
      continue;
    }

    const createIndex = structural.match(new RegExp(
      '^CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(CONCURRENTLY\\s+)?'
        + '(?:IF\\s+NOT\\s+EXISTS\\s+)?' + IDENTIFIER_SOURCE
        + '\\s+ON\\s+(?:ONLY\\s+)?(' + QUALIFIED_IDENTIFIER_SOURCE + ')(?=\\s|$|\\()',
      "i",
    ));
    if (createIndex) {
      const targetTable = normalizeIdentifier(createIndex[3]);
      if (createIndex[2] && inExplicitTransaction) {
        violations.push(unsupportedExpandViolation({
          sql,
          statement,
          offset: statementOffset,
          message: "CREATE INDEX CONCURRENTLY cannot run inside an explicit transaction",
        }));
        continue;
      }
      if (!createdTables.has(targetTable) && (createIndex[1] || !createIndex[2])) {
        violations.push(unsupportedExpandViolation({
          sql,
          statement,
          offset: statementOffset,
          message: createIndex[1]
            ? "CREATE UNIQUE INDEX on an existing table requires maintenance"
            : "CREATE INDEX on an existing table must use CONCURRENTLY or maintenance",
        }));
      }
      continue;
    }

    const alterTable = structural.match(new RegExp(
      '^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?('
        + QUALIFIED_IDENTIFIER_SOURCE + ')\\s+',
      "i",
    ));
    if (alterTable) {
      const table = normalizeIdentifier(alterTable[1]);
      const structuralClauses = structural.slice(alterTable[0].length);
      const executableClauses = executable.slice(alterTable[0].length);
      const clauseRanges = topLevelCommaRanges(executableClauses);
      const addedNullableColumns = nullableColumnsByTable.get(table) ?? new Set();
      nullableColumnsByTable.set(table, addedNullableColumns);

      for (const clause of clauseRanges) {
        const clauseLeading = clause.text.search(/\S/);
        if (clauseLeading < 0) continue;
        const executableClause = clause.text.slice(clauseLeading).trim();
        const structuralClause = structuralClauses
          .slice(clause.start + clauseLeading, clause.start + clause.text.length)
          .trim();
        const clauseOffset = statementOffset + alterTable[0].length + clause.start + clauseLeading;

        const dropNotNull = structuralClause.match(new RegExp(
          '^ALTER\\s+(?:COLUMN\\s+)?' + IDENTIFIER_SOURCE + '\\s+DROP\\s+NOT\\s+NULL$',
          "i",
        ));
        if (dropNotNull) continue;

        const addConstraint = structuralClause.match(new RegExp(
          '^ADD\\s+CONSTRAINT\\s+' + IDENTIFIER_SOURCE + '\\s+([\\s\\S]+)$',
          "i",
        ));
        if (addConstraint) {
          if (createdTables.has(table)) continue;
          const foreignKey = addConstraint[1].match(/^FOREIGN\s+KEY\s*\(([^)]+)\)/i);
          const foreignKeyColumns = foreignKey
            ? foreignKey[1].split(",").map((column) => normalizeIdentifier(column.trim()))
            : [];
          if (
            foreignKeyColumns.length > 0
            && foreignKeyColumns.every((column) => addedNullableColumns.has(column))
          ) {
            continue;
          }
          violations.push(unsupportedExpandViolation({
            sql,
            statement,
            offset: clauseOffset,
            message: "constraints on existing columns require maintenance",
          }));
          continue;
        }

        if (/^ADD\s+(?:CHECK|UNIQUE|PRIMARY|FOREIGN|EXCLUDE)\b/i.test(executableClause)) {
          violations.push(unsupportedExpandViolation({
            sql,
            statement,
            offset: clauseOffset,
            message: "constraints on an existing table require maintenance",
          }));
          continue;
        }

        const addColumn = structuralClause.match(new RegExp(
          '^ADD\\s+(?:COLUMN\\s+)?(' + IDENTIFIER_SOURCE + ')\\s+([\\s\\S]+)$',
          "i",
        ));
        if (addColumn) {
          if (/\b(?:GENERATED|IDENTITY|PRIMARY\s+KEY|UNIQUE|CHECK|REFERENCES)\b/i.test(executableClause)) {
            violations.push(unsupportedExpandViolation({
              sql,
              statement,
              offset: clauseOffset,
              message: "generated, identity, or constrained columns require maintenance",
            }));
            continue;
          }
          const isNotNull = /\bNOT\s+NULL\b/i.test(executableClause);
          const hasNonNullDefault = /\bDEFAULT\b/i.test(executableClause)
            && !/\bDEFAULT\s*(?:\(\s*)?NULL\b/i.test(executableClause);
          if (isNotNull && !hasNonNullDefault) continue;
          if (!isNotNull) addedNullableColumns.add(normalizeIdentifier(addColumn[1]));
          continue;
        }

        violations.push(unsupportedExpandViolation({
          sql,
          statement,
          offset: clauseOffset,
          message: "ALTER TABLE operation is not in the expand allowlist",
        }));
      }
      continue;
    }

    if (/^INSERT\s+INTO\b/i.test(executable)) continue;
    if (/^UPDATE\b/i.test(executable)) {
      if (!hasTopLevelKeyword(executable, "WHERE")) {
        violations.push(unsupportedExpandViolation({
          sql,
          statement,
          offset: statementOffset,
          message: "UPDATE without a top-level WHERE clause requires maintenance",
        }));
      }
      continue;
    }
    if (/^COMMENT\s+ON\b/i.test(executable)) continue;
    const bareCreateSchema = structural.match(new RegExp(
      '^CREATE\\s+SCHEMA\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'
        + '(?:' + QUALIFIED_IDENTIFIER_SOURCE
        + '(?:\\s+AUTHORIZATION\\s+' + IDENTIFIER_SOURCE + ')?'
        + '|AUTHORIZATION\\s+' + IDENTIFIER_SOURCE + ')$',
      "i",
    ));
    if (bareCreateSchema) continue;
    if (/^CREATE\s+(?:SEQUENCE|TYPE)\b/i.test(executable)) continue;

    violations.push(unsupportedExpandViolation({
      sql,
      statement,
      offset: statementOffset,
      message: "statement type is not in the expand allowlist",
    }));
  }
  return violations;
}

export function findExpandViolations(sql) {
  if (sql.startsWith("\uFEFF")) sql = sql.slice(1);
  const executableSql = stripSqlCommentsAndLiterals(sql);
  const violations = findStatementAllowlistViolations(sql, executableSql);
  const rules = [
    ["delete-data", "DELETE FROM is not expand-compatible", /\bDELETE\s+FROM\b/i],
    ["truncate-table", "TRUNCATE is not expand-compatible", /\bTRUNCATE\s+(?:TABLE\s+)?/i],
    ["drop-table", "DROP TABLE is not expand-compatible", /\bDROP\s+TABLE\b/i],
    ["drop-index", "DROP INDEX is not expand-compatible", /\bDROP\s+INDEX\b/i],
    ["drop-column", "DROP COLUMN is not expand-compatible", /\bDROP\s+COLUMN\b/i],
    ["drop-type", "DROP TYPE is not expand-compatible", /\bDROP\s+TYPE\b/i],
    [
      "alter-type-destructive",
      "destructive ALTER TYPE is not expand-compatible",
      /\bALTER\s+TYPE\b[\s\S]*?\b(?:DROP\s+ATTRIBUTE|ALTER\s+ATTRIBUTE|RENAME)\b/i,
    ],
    ["rename", "RENAME is not expand-compatible", /\bRENAME\b/i],
    ["set-not-null", "SET NOT NULL requires a contract/maintenance migration", /\bSET\s+NOT\s+NULL\b/i],
  ];

  const dropPattern = /\bDROP\b/gi;
  for (const match of executableSql.matchAll(dropPattern)) {
    const offset = match.index;
    const remaining = executableSql.slice(offset);
    if (/^DROP\s+NOT\s+NULL\b/i.test(remaining)) continue;
    violations.push(violation({
      code: "drop-operation",
      message: "DROP is maintenance-only unless it is exactly DROP NOT NULL",
      source: sql,
      offset,
    }));
  }

  for (const [code, message, pattern] of rules) {
    let searchOffset = 0;
    while (searchOffset < executableSql.length) {
      const match = executableSql.slice(searchOffset).match(pattern);
      if (!match) break;
      const offset = searchOffset + match.index;
      violations.push(violation({ code, message, source: sql, offset }));
      searchOffset = offset + Math.max(match[0].length, 1);
    }
  }

  for (const statement of statementRanges(executableSql)) {
    if (!/\bALTER\s+TABLE\b/i.test(statement.text)) continue;
    for (const clause of topLevelCommaRanges(statement.text)) {
      const dropColumn = firstMatch(
        clause.text,
        /\bDROP\s+(?!(?:CONSTRAINT|TRIGGER|RULE|POLICY|DEFAULT|NOT\s+NULL|EXPRESSION|IDENTITY)\b)(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?/i,
      );
      if (dropColumn) {
        violations.push(violation({
          code: "drop-column",
          message: "DROP COLUMN is not expand-compatible",
          source: sql,
          offset: statement.start + clause.start + dropColumn.index,
        }));
      }
      const dropConstraint = firstMatch(clause.text, /\bDROP\s+CONSTRAINT\b/i);
      if (dropConstraint) {
        violations.push(violation({
          code: "drop-constraint",
          message: "DROP CONSTRAINT requires a contract/maintenance migration",
          source: sql,
          offset: statement.start + clause.start + dropConstraint.index,
        }));
      }
      const alterColumnType = firstMatch(
        clause.text,
        /\bALTER\s+COLUMN\b[\s\S]*?\b(?:SET\s+DATA\s+)?TYPE\b/i,
      );
      if (alterColumnType) {
        violations.push(violation({
          code: "alter-column-type",
          message: "ALTER COLUMN TYPE requires a contract/maintenance migration",
          source: sql,
          offset: statement.start + clause.start + alterColumnType.index,
        }));
      }
      const addColumn = firstMatch(
        clause.text,
        /\bADD\s+(?!(?:CONSTRAINT|CHECK|UNIQUE|PRIMARY|FOREIGN|EXCLUDE)\b)(?:COLUMN\s+)?/i,
      );
      if (!addColumn || !/\bNOT\s+NULL\b/i.test(clause.text)) continue;
      const hasNonNullDefault = /\bDEFAULT\b/i.test(clause.text)
        && !/\bDEFAULT\s*(?:\(\s*)?NULL\b/i.test(clause.text);
      if (!hasNonNullDefault) {
        violations.push(violation({
          code: "add-not-null-without-default",
          message: "ADD COLUMN NOT NULL requires a non-NULL DEFAULT in an expand migration",
          source: sql,
          offset: statement.start + clause.start + addColumn.index,
        }));
      }
    }
  }

  return violations
    .sort((left, right) => left.line - right.line || left.code.localeCompare(right.code))
    .filter((item, index, values) => (
      index === 0 || item.line !== values[index - 1].line || item.code !== values[index - 1].code
    ));
}

export function inspectMigrationSql({ filePath, sql }) {
  const mode = parseMigrationMode(sql, { filePath });
  const violations = mode === "expand" ? findExpandViolations(sql) : [];
  return { path: filePath, mode, violations };
}

export function inspectMigrationFile(filePath) {
  const sql = readFileSync(filePath, "utf8");
  const result = inspectMigrationSql({ filePath, sql });
  if (result.violations.length > 0) {
    throw new Error(
      `migration policy failed:\n- ${result.violations
        .map((item) => `${filePath}:${item.line} [${item.code}] ${item.message}`)
        .join("\n- ")}`,
    );
  }
  return result;
}

function parseNameStatusZero(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2 !== 0) throw new Error("git diff emitted an incomplete name-status record");
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const filePath = fields[index + 1];
    if (!/^[A-Z][0-9]*$/.test(status) || !filePath) {
      throw new Error("git diff emitted an invalid name-status record");
    }
    changes.push({ status, path: filePath });
  }
  return changes;
}

function validateCommitSha(cwd, name, sha) {
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`${name} must be a full lowercase 40-character Git SHA`);
  }
  const resolved = runGit(cwd, ["rev-parse", "--verify", `${sha}^{commit}`]).trim();
  if (resolved !== sha) throw new Error(`${name} SHA did not resolve exactly: ${sha}`);
}

export function readChangedMigrations({ cwd, baseSha, headSha, diffMode = "three-dot" }) {
  const repositoryRoot = path.resolve(cwd);
  if (!DIFF_MODES.has(diffMode)) throw new Error("diff mode must be two-dot or three-dot");
  validateCommitSha(repositoryRoot, "base", baseSha);
  validateCommitSha(repositoryRoot, "head", headSha);

  const range = diffMode === "two-dot" ? `${baseSha}..${headSha}` : `${baseSha}...${headSha}`;
  const output = runGit(
    repositoryRoot,
    ["diff", "--name-status", "-z", "--no-renames", range, "--", "prisma/migrations"],
    { encoding: "buffer" },
  );
  const relevant = parseNameStatusZero(output).filter(({ path: filePath }) => (
    filePath.startsWith("prisma/migrations/") && filePath.endsWith("/migration.sql")
  ));

  const baseMigrationNames = runGit(
    repositoryRoot,
    ["ls-tree", "-r", "--name-only", baseSha, "--", "prisma/migrations"],
  )
    .split("\n")
    .map((filePath) => filePath.match(MIGRATION_PATH_PATTERN)?.[1])
    .filter(Boolean)
    .sort();
  const baseMaxMigration = baseMigrationNames.at(-1) ?? null;

  return relevant.map((change) => {
    const migrationPath = change.path.match(MIGRATION_PATH_PATTERN);
    if (!migrationPath) {
      throw new Error(`migration path is not canonical: ${change.path}`);
    }
    if (change.status === "D") {
      throw new Error(`migration deletion is not allowed: ${change.path}`);
    }
    if (change.status === "M") {
      throw new Error(`migration modification is not allowed after it enters the trusted base: ${change.path}`);
    }
    if (change.status !== "A") {
      throw new Error(`unsupported migration change ${change.status}: ${change.path}`);
    }
    if (baseMaxMigration && migrationPath[1] <= baseMaxMigration) {
      throw new Error(
        `new migration ${migrationPath[1]} must sort after trusted base maximum ${baseMaxMigration}`,
      );
    }
    const sql = runGit(repositoryRoot, ["show", `${headSha}:${change.path}`]);
    return { ...change, sql };
  });
}

export function checkMigrationPolicy({ cwd = process.cwd(), baseSha, headSha, diffMode = "three-dot" }) {
  const migrations = readChangedMigrations({ cwd, baseSha, headSha, diffMode });
  const inspected = [];
  const errors = [];

  for (const migration of migrations) {
    try {
      const result = inspectMigrationSql({ filePath: migration.path, sql: migration.sql });
      inspected.push({ path: migration.path, status: migration.status, mode: result.mode });
      for (const item of result.violations) {
        errors.push(`${migration.path}:${item.line} [${item.code}] ${item.message}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    throw new Error(`migration policy failed:\n- ${errors.join("\n- ")}`);
  }
  return {
    schemaVersion: 1,
    baseSha,
    headSha,
    diffMode,
    changedMigrations: inspected.sort((left, right) => left.path.localeCompare(right.path)),
    requiresMaintenance: inspected.some((migration) => migration.mode === "maintenance"),
  };
}

function parseArguments(argv) {
  const options = { cwd: process.cwd(), diffMode: "three-dot" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cwd") options.cwd = argv[++index];
    else if (argument === "--base") options.baseSha = argv[++index];
    else if (argument === "--head") options.headSha = argv[++index];
    else if (argument === "--diff-mode") options.diffMode = argv[++index];
    else if (argument === "--file") options.filePath = argv[++index];
    else if (argument === "--print-mode") options.printMode = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.filePath) {
    if (options.baseSha || options.headSha) throw new Error("--file cannot be combined with --base or --head");
    return options;
  }
  if (options.printMode) throw new Error("--print-mode requires --file");
  if (!options.baseSha || !options.headSha) throw new Error("--base and --head are required");
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.filePath) {
    const result = inspectMigrationFile(options.filePath);
    process.stdout.write(options.printMode ? `${result.mode}\n` : `${JSON.stringify(result)}\n`);
    return;
  }
  const result = checkMigrationPolicy(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
