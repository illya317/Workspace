import assert from "node:assert/strict";
import test from "node:test";

import { lifecycleGuardBypassEntryNames } from "./domain-validation-engine";

test("flags direct delete and archive Prisma writes", () => {
  const source = `
    export async function deleteGoal(id: number) {
      await prisma.goal.delete({ where: { id } });
    }
    export async function archiveGoal(id: number) {
      await prisma.goal.update({ where: { id }, data: { isArchived: true } });
    }
  `;

  assert.deepEqual(
    lifecycleGuardBypassEntryNames("packages/example/server/goals.ts", source),
    ["deleteGoal", "archiveGoal"],
  );
});

test("accepts guarded lifecycle writes and ignores non-lifecycle cleanup", () => {
  const source = `
    export async function deleteGoal(id: number) {
      return guardedDelete({ id });
    }
    export async function replaceGoalItems(id: number) {
      await tx.goalItem.deleteMany({ where: { goalId: id } });
    }
  `;

  assert.deepEqual(
    lifecycleGuardBypassEntryNames("packages/example/server/goals.ts", source),
    [],
  );
});

test("scans platform lifecycle services through the same rule", () => {
  const source = `
    export async function deleteWorkflowPolicy(id: number) {
      await prisma.workflowPolicy.deleteMany({ where: { id } });
    }
  `;
  assert.deepEqual(
    lifecycleGuardBypassEntryNames("packages/platform/server/workflows.ts", source),
    ["deleteWorkflowPolicy"],
  );
});

test("covers command-style delete names and accepts the audited transaction protocol", () => {
  const baselineCall = ["ensureEditHistory", "Baseline"].join("");
  const snapshotCall = ["snapshot", "History"].join("");
  const unsafe = `
    export async function executeDeleteWidget(id: number) {
      await txDb.widget.delete({ where: { id } });
    }
  `;
  const audited = `
    export async function commitDeleteWidgetCommand(command: { id: number; expectedVersion: number }) {
      return prisma.$transaction(async (tx) => {
        const record = await tx.widget.findUnique({ where: { id: command.id } });
        if (!record || record.version !== command.expectedVersion || record.referenceCount > 0) return;
        await ${baselineCall}("Widget", command.id, 1, tx);
        await ${snapshotCall}("Widget", command.id, 1, tx);
        await tx.widget.delete({ where: { id: command.id } });
      });
    }
  `;
  assert.deepEqual(lifecycleGuardBypassEntryNames("unsafe.ts", unsafe), ["executeDeleteWidget"]);
  assert.deepEqual(lifecycleGuardBypassEntryNames("audited.ts", audited), []);
});

test("accepts the shared mutation-impact lifecycle protocol", () => {
  const source = `
    export async function deleteGoal(id: number) {
      return runSerializableTransaction(async (tx) => {
        const context = { tx };
        return buildAuditedGoalMutationImpactEngine(context).execute({
          context,
          root: { entity: "Goal", id: String(id), intent: "delete" },
          commitRoot: () => tx.goal.delete({ where: { id } }),
        });
      });
    }
  `;

  assert.deepEqual(lifecycleGuardBypassEntryNames("goals.ts", source), []);
});
