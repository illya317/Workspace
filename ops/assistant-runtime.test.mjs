import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAssistantRuntimeEnvironment,
  bundleAssistantRuntime,
  readAssistantRuntimeDescriptor,
} from "./assistant-runtime.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-assistant-runtime-"));
  const output = path.join(root, "standalone");
  fs.mkdirSync(output);
  for (const file of ["wecom-agent-bot.mjs", "wecom-agent-delivery.mjs", "wecom-agent-input.mjs", "wecom-agent-stream.mjs"]) {
    const target = path.join(root, "scripts/runtime", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `// ${file}\n`);
  }
  const packages = {
    "@wecom/aibot-node-sdk": { dependencies: { axios: "1" } },
    axios: { optionalDependencies: { ws: "1" } },
    ws: {},
  };
  for (const [packageName, packageJson] of Object.entries(packages)) {
    const directory = path.join(root, "node_modules", ...packageName.split("/"));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({ name: packageName, ...packageJson })}\n`);
  }
  return { root, output };
}

test("Assistant runtime bundle carries the exact sidecar and transitive dependency closure", () => {
  const files = fixture();
  const result = bundleAssistantRuntime({ repositoryRoot: files.root, standaloneRoot: files.output });
  assert.deepEqual(result.packageNames, ["@wecom/aibot-node-sdk", "axios", "ws"]);
  assert.equal(fs.existsSync(path.join(files.output, "scripts/runtime/wecom-agent-bot.mjs")), true);
  assert.equal(fs.existsSync(path.join(files.output, "node_modules/axios/package.json")), true);
  assert.equal(readAssistantRuntimeDescriptor(files.output).sidecars[0].activation, "active-slot-only");
  assert.equal(readAssistantRuntimeDescriptor(files.output).sidecars[0].memoryMiB, 256);
});

test("Assistant runtime refuses activation without every declared sidecar secret", () => {
  const files = fixture();
  bundleAssistantRuntime({ repositoryRoot: files.root, standaloneRoot: files.output });
  assert.throws(
    () => assertAssistantRuntimeEnvironment({
      releaseRoot: files.output,
      environment: { WECHAT_BOT_ID: "bot" },
    }),
    /WECHAT_BOT_SECRET/,
  );
  assert.doesNotThrow(() => assertAssistantRuntimeEnvironment({
    releaseRoot: files.output,
    environment: { WECHAT_BOT_ID: "bot", WECHAT_BOT_SECRET: "secret" },
  }));
});

test("Assistant runtime descriptor rejects drift", () => {
  const files = fixture();
  bundleAssistantRuntime({ repositoryRoot: files.root, standaloneRoot: files.output });
  const descriptorFile = path.join(files.output, ".assistant-runtime.json");
  const descriptor = JSON.parse(fs.readFileSync(descriptorFile, "utf8"));
  descriptor.sidecars[0].entry = "../../escape.mjs";
  fs.writeFileSync(descriptorFile, JSON.stringify(descriptor));
  assert.throws(() => readAssistantRuntimeDescriptor(files.output), /invalid or unsupported/);
});
