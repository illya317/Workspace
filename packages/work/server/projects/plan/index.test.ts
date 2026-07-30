import assert from "node:assert/strict";
import test, { mock } from "node:test";

const ok = async () => ({ ok: true, data: {} });

mock.module("./application", {
  namedExports: {
    createProjectPlanPhase: ok,
    deleteProjectPlanPhase: ok,
    listProjectPlanGantt: ok,
    listProjectPlanPhases: ok,
    saveProjectPlanGantt: ok,
    syncProjectPlanDependencies: ok,
    updateProjectPlanPhase: ok,
  },
} as never);
mock.module("./baselines", {
  namedExports: {
    activateProjectPlanBaseline: ok,
    createProjectPlanBaseline: ok,
    listProjectPlanBaselines: ok,
  },
} as never);

const projectPlan = await import("./index");

test("项目计划能力只暴露路由意图", () => {
  assert.deepEqual(Object.keys(projectPlan).sort(), [
    "activateProjectPlanBaseline",
    "createProjectPlanBaseline",
    "createProjectPlanPhase",
    "deleteProjectPlanPhase",
    "listProjectPlanBaselines",
    "listProjectPlanGantt",
    "listProjectPlanPhases",
    "saveProjectPlanGantt",
    "syncProjectPlanDependencies",
    "updateProjectPlanPhase",
  ]);
});
