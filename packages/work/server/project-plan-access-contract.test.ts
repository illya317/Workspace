import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("project phase creation requires project create access rather than delete access", () => {
  const source = readFileSync(new URL("./project-plan.ts", import.meta.url), "utf8");
  const createStart = source.indexOf("export async function createProjectPlanPhase");
  const updateStart = source.indexOf("export async function updateProjectPlanPhase", createStart);
  assert.notEqual(createStart, -1);
  assert.notEqual(updateStart, -1);

  const createImplementation = source.slice(createStart, updateStart);
  assert.match(createImplementation, /canCreateProjectAction\(input\.userId, input\.projectId\)/);
  assert.doesNotMatch(createImplementation, /canDeleteProjectSubresourceAction/);
});
