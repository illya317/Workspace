#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

const REQUIRED_VOLUMES = [
  "workspace-release-npm-v1:/root/.npm:copy-on-write",
  "workspace-release-next-v1:./.next/cache:copy-on-write",
  "workspace-release-next-units-v1:./.cache/next-units:copy-on-write",
  "workspace-release-types-v1:./.cache/types:copy-on-write",
  "workspace-release-tsbuild-v1:./.cache/tsbuild:copy-on-write",
  "workspace-release-playwright-v1:./.cache/release-check/playwright:copy-on-write",
  "workspace-release-check-results-v1:./.cache/check-results:read-write",
  "workspace-release-artifacts-v1:./.cache/release-artifacts:read-write",
];
const REQUIRED_BUILD_INPUTS = [".node-version", "ops/cnb-builder.Dockerfile"];
const REQUIRED_STAGE_NAMES = ["verify-builder", "install-dependencies", "release-gate", "build-release-target", "deploy-to-server"];
const REQUIRED_PIPELINE_ENV = {
  RUN_LOCAL_CHECKS: "0",
  RELEASE_SOURCE_BRANCH: "release",
};
const REQUIRED_BUILD_ENV = {
  CI: "true",
  NEXTAUTH_SECRET: "cnb-build-only-secret-2026",
  DATABASE_URL: "postgresql://workspace:workspace@127.0.0.1:5432/workspace_ci",
  DIRECT_URL: "postgresql://workspace:workspace@127.0.0.1:5432/workspace_ci",
  SHADOW_DATABASE_URL: "postgresql://workspace:workspace@127.0.0.1:5432/workspace_ci_shadow",
};
const ALLOWED_DEPLOY_ENV_KEYS = [
  "HEALTHCHECK_URL",
  "EXPECTED_CNB_REPOSITORY",
  "INSTALL_LIBRARY_RUNTIME_DEPS",
  "REMOTE_DIR",
  "REMOTE_WORKSPACE_CONFIG_DIR",
];
const REQUIRED_STAGE_SCRIPTS = {
  "verify-builder": "bash ./ops/run-cnb-release-stage.sh builder.verify -- bash ./ops/verify-cnb-builder.sh",
  "install-dependencies": "bash ./ops/run-cnb-release-stage.sh dependencies.install -- bash ./ops/install-cnb-release-dependencies.sh",
  "release-gate": "bash ./ops/run-cnb-release-stage.sh release.gate -- bash ./ops/run-cnb-release-gate.sh",
  "build-release-target": "bash ./ops/run-cnb-release-stage.sh artifact.build -- bash ./ops/build-cnb-release-target.sh",
  "deploy-to-server": [
    "missing=0",
    "for key in SERVER REMOTE_DIR REMOTE_WORKSPACE_CONFIG_DIR HEALTHCHECK_URL KEY_CONTENT; do",
    "  if [ -z \"$(eval \"printf '%s' \\\"\\${$key:-}\\\"\")\" ]; then",
    "    echo \"[错误] 缺少部署环境变量: $key\"",
    "    missing=1",
    "  fi",
    "done",
    "if [ \"$missing\" = \"1\" ]; then",
    "  echo \"[提示] 请检查租户 CNB 发布配置和 env import 授权。\"",
    "  exit 1",
    "fi",
    "bash ./ops/run-cnb-release-stage.sh server.deploy -- bash ./ops/deploy-cnb-release-target.sh",
  ].join("\n"),
};

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(requireObject(value, label)).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`);
  }
  return value;
}

function requireExactStringMap(value, expected, label) {
  const object = requireExactKeys(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (object[key] !== expectedValue) throw new Error(`${label}.${key} does not satisfy the release contract`);
  }
  return object;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    throw new Error(`${label} must be a non-empty string array`);
  }
  return value;
}

function requireExactStringArray(value, expected, label) {
  const actual = requireStringArray(value, label);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must match the governed release list exactly`);
  }
  return actual;
}

function requireExactScript(value, expected, label) {
  if (typeof value !== "string" || value.trim() !== expected) {
    throw new Error(`${label} must match the governed release command exactly`);
  }
}

export function validateCnbReleaseConfig(source, options = {}) {
  const deployUnitId = options.deployUnitId ?? "";
  const deployUnitMode = options.deployUnitMode ?? "shadow";
  const releaseAction = options.releaseAction ?? "";
  const validationBaseSha = options.validationBaseSha ?? "";
  if (typeof deployUnitId !== "string" || (deployUnitId && !/^[a-z][a-z0-9-]*$/.test(deployUnitId))) {
    throw new Error("deploy unit id is invalid");
  }
  if (deployUnitMode !== "shadow" && deployUnitMode !== "activate") {
    throw new Error("CNB publish supports only shadow or activate unit deployment");
  }
  if (releaseAction && !["validate", "build", "deploy"].includes(releaseAction)) {
    throw new Error("release action must be validate, build, or deploy");
  }
  if (releaseAction && !/^[0-9a-f]{40}$/.test(validationBaseSha)) {
    throw new Error("rendered release config requires a full validation base SHA");
  }
  let document;
  try {
    document = parse(source);
  } catch (error) {
    throw new Error(`tenant CNB release config is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = requireExactKeys(document, ["cnb-release"], "tenant CNB release config");
  const release = requireExactKeys(root["cnb-release"], ["api_trigger_manual"], "cnb-release");
  const pipelines = release.api_trigger_manual;
  if (!Array.isArray(pipelines) || pipelines.length !== 1) {
    throw new Error("tenant CNB release config must declare only one deploy-prod pipeline");
  }
  const pipeline = requireExactKeys(pipelines[0], ["name", "docker", "env", "stages"], "deploy-prod pipeline");
  if (pipeline.name !== "deploy-prod") throw new Error("tenant CNB release config pipeline must be deploy-prod");
  requireExactStringMap(
    pipeline.env,
    {
      ...REQUIRED_PIPELINE_ENV,
      DEPLOY_UNIT_ID: deployUnitId,
      DEPLOY_UNIT_MODE: deployUnitMode,
      ...(releaseAction ? { RELEASE_ACTION: releaseAction, RELEASE_VALIDATION_BASE_SHA: validationBaseSha } : {}),
    },
    "deploy-prod.env",
  );

  const docker = requireExactKeys(pipeline.docker, ["build", "volumes"], "deploy-prod.docker");
  const build = requireExactKeys(docker.build, ["dockerfile", "by", "versionBy"], "deploy-prod.docker.build");
  if (build.dockerfile !== "ops/cnb-builder.Dockerfile") {
    throw new Error("deploy-prod must use ops/cnb-builder.Dockerfile");
  }
  for (const key of ["by", "versionBy"]) {
    requireExactStringArray(build[key], REQUIRED_BUILD_INPUTS, `deploy-prod.docker.build.${key}`);
  }
  requireExactStringArray(docker.volumes, REQUIRED_VOLUMES, "deploy-prod.docker.volumes");

  if (!Array.isArray(pipeline.stages) || pipeline.stages.length !== REQUIRED_STAGE_NAMES.length) {
    throw new Error("deploy-prod.stages must contain exactly the governed release stages");
  }
  const stageNames = pipeline.stages.map((stage) => stage?.name);
  if (JSON.stringify(stageNames) !== JSON.stringify(REQUIRED_STAGE_NAMES)) {
    throw new Error("deploy-prod stage order does not satisfy the release contract");
  }

  const [verifyBuilder, installDependencies, releaseGate, buildStandalone, deployToServer] = pipeline.stages;
  for (const stage of [verifyBuilder, installDependencies]) {
    requireExactKeys(stage, ["name", "script"], `deploy-prod stage ${stage?.name ?? "<unknown>"}`);
  }
  requireExactKeys(releaseGate, ["name", "env", "script"], "deploy-prod stage release-gate");
  requireExactStringMap(releaseGate.env, REQUIRED_BUILD_ENV, "release-gate.env");
  requireExactKeys(buildStandalone, ["name", "env", "script"], "deploy-prod stage build-release-target");
  requireExactStringMap(buildStandalone.env, REQUIRED_BUILD_ENV, "build-release-target.env");
  if (["validate", "build"].includes(releaseAction)) {
    requireExactKeys(deployToServer, ["name", "script"], `deploy-prod ${releaseAction} stage deploy-to-server`);
  } else {
    requireExactKeys(deployToServer, ["name", "imports", "env", "script"], "deploy-prod stage deploy-to-server");
    const deployImports = requireStringArray(deployToServer.imports, "deploy-to-server.imports");
    if (deployImports.length !== 1 || !/^https:\/\/cnb\.cool\/.+\/-\/blob\/main\/server-prod\.yaml$/.test(deployImports[0])) {
      throw new Error("deploy-to-server must import exactly one governed server-prod.yaml");
    }
    const deployEnv = requireObject(deployToServer.env, "deploy-to-server.env");
    const unexpectedDeployEnv = Object.keys(deployEnv).filter((key) => !ALLOWED_DEPLOY_ENV_KEYS.includes(key));
    if (unexpectedDeployEnv.length > 0) {
      throw new Error(`deploy-to-server.env contains unsupported key: ${unexpectedDeployEnv[0]}`);
    }
    for (const [key, value] of Object.entries(deployEnv)) {
      if (typeof value !== "string") throw new Error(`deploy-to-server.env.${key} must be a string`);
    }
    for (const key of ["EXPECTED_CNB_REPOSITORY", "HEALTHCHECK_URL", "INSTALL_LIBRARY_RUNTIME_DEPS", "REMOTE_DIR", "REMOTE_WORKSPACE_CONFIG_DIR"]) {
      if (!Object.hasOwn(deployEnv, key)) throw new Error(`deploy-to-server.env.${key} is required`);
    }
  }
  for (const name of REQUIRED_STAGE_NAMES) {
    const stage = pipeline.stages.find((candidate) => candidate.name === name);
    const expectedScript = name === "deploy-to-server" && ["validate", "build"].includes(releaseAction)
      ? REQUIRED_STAGE_SCRIPTS[name].split("\n").at(-1)
      : REQUIRED_STAGE_SCRIPTS[name];
    requireExactScript(stage.script, expectedScript, `deploy-prod stage ${name}`);
  }
  return pipeline;
}

function main(argv) {
  const [file, ...rest] = argv;
  if (!file) throw new Error("usage: validate-cnb-release-config.mjs FILE");
  const unitIndex = rest.indexOf("--deploy-unit");
  const modeIndex = rest.indexOf("--deploy-unit-mode");
  const deployUnitId = unitIndex >= 0 ? rest[unitIndex + 1] : "";
  const deployUnitMode = modeIndex >= 0 ? rest[modeIndex + 1] : "shadow";
  if ((unitIndex >= 0 && !deployUnitId) || (modeIndex >= 0 && !deployUnitMode)) {
    throw new Error("deploy unit option is missing a value");
  }
  validateCnbReleaseConfig(readFileSync(file, "utf8"), { deployUnitId, deployUnitMode });
  process.stdout.write(`CNB release config validated: ${file}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
