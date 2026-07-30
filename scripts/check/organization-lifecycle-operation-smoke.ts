import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  OrganizationStructureConcurrentUpdateError,
  applyDepartmentStructureChange,
  applyPositionStructureChange,
  createDepartmentWithInitialVersion,
  createPositionWithInitialVersion,
  runOrganizationStructureTransaction,
} from "@workspace/hr/server/organization-structure-lifecycle-service";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { prisma } from "@workspace/platform/server/prisma";

const ROLLBACK = Symbol("organization-lifecycle-operation-smoke-rollback");

async function main() {
  const actor = await prisma.user.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
  assert.ok(actor, "生命周期操作烟测需要至少一个用户作为操作人");

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const today = workspaceBusinessDate(new Date());
  const departmentCode = `ZZ${suffix}`;
  const positionCode = `${departmentCode}01`;
  let departmentId: number | null = null;
  let positionId: number | null = null;

  try {
    await runOrganizationStructureTransaction(async (tx) => {
      const departmentPayload = {
        code: departmentCode,
        name: `生命周期烟测组织 ${suffix}`,
        alias: null,
        hierarchyKind: "M",
        level: 1,
        parentId: null,
        managerPositionId: null,
      };
      const department = await createDepartmentWithInitialVersion(tx, departmentPayload, {
        kind: "schedule",
        effectiveOn: today,
        expectedSequence: 0,
        idempotencyKey: `smoke-department-create-${suffix}`,
        reason: null,
        targetVersionId: null,
      }, actor.id);
      departmentId = department.id;

      const positionPayload = {
        code: positionCode,
        name: `生命周期烟测岗位 ${suffix}`,
        alias: null,
        departmentId: department.id,
        reportToPositionId: null,
      };
      const position = await createPositionWithInitialVersion(tx, positionPayload, {
        kind: "schedule",
        effectiveOn: today,
        expectedSequence: 0,
        idempotencyKey: `smoke-position-create-${suffix}`,
        reason: null,
        targetVersionId: null,
      }, actor.id, { positionDescriptionId: null });
      positionId = position.id;

      const archivedPosition = await applyPositionStructureChange(tx, {
        positionId: position.id,
        payload: positionPayload,
        meta: {
          kind: "end-date",
          effectiveOn: today,
          expectedSequence: position.version,
          idempotencyKey: `smoke-position-archive-${suffix}`,
          reason: "生命周期烟测归档",
          targetVersionId: null,
        },
        userId: actor.id,
      });
      assert.equal(archivedPosition.isArchived, true);

      const repeatedPositionArchive = await applyPositionStructureChange(tx, {
        positionId: position.id,
        payload: positionPayload,
        meta: {
          kind: "end-date",
          effectiveOn: today,
          expectedSequence: position.version,
          idempotencyKey: `smoke-position-archive-${suffix}`,
          reason: "生命周期烟测归档",
          targetVersionId: null,
        },
        userId: actor.id,
      });
      assert.equal(repeatedPositionArchive.version, archivedPosition.version, "重复岗位归档不得追加版本");

      const restoredPosition = await applyPositionStructureChange(tx, {
        positionId: position.id,
        payload: positionPayload,
        meta: {
          kind: "schedule",
          effectiveOn: today,
          expectedSequence: archivedPosition.version,
          idempotencyKey: `smoke-position-restore-${suffix}`,
          reason: null,
          targetVersionId: null,
        },
        userId: actor.id,
      });
      assert.equal(restoredPosition.isArchived, false);
      await assert.rejects(
        applyPositionStructureChange(tx, {
          positionId: position.id,
          payload: positionPayload,
          meta: {
            kind: "end-date",
            effectiveOn: today,
            expectedSequence: archivedPosition.version,
            idempotencyKey: `smoke-position-stale-${suffix}`,
            reason: "生命周期烟测旧版本冲突",
            targetVersionId: null,
          },
          userId: actor.id,
        }),
        OrganizationStructureConcurrentUpdateError,
      );

      const archivedDepartment = await applyDepartmentStructureChange(tx, {
        departmentId: department.id,
        payload: departmentPayload,
        meta: {
          kind: "end-date",
          effectiveOn: today,
          expectedSequence: department.version,
          idempotencyKey: `smoke-department-archive-${suffix}`,
          reason: "生命周期烟测归档",
          targetVersionId: null,
        },
        userId: actor.id,
      });
      assert.equal(archivedDepartment.isArchived, true);

      const repeatedDepartmentArchive = await applyDepartmentStructureChange(tx, {
        departmentId: department.id,
        payload: departmentPayload,
        meta: {
          kind: "end-date",
          effectiveOn: today,
          expectedSequence: department.version,
          idempotencyKey: `smoke-department-archive-${suffix}`,
          reason: "生命周期烟测归档",
          targetVersionId: null,
        },
        userId: actor.id,
      });
      assert.equal(repeatedDepartmentArchive.version, archivedDepartment.version, "重复组织归档不得追加版本");

      const restoredDepartment = await applyDepartmentStructureChange(tx, {
        departmentId: department.id,
        payload: departmentPayload,
        meta: {
          kind: "schedule",
          effectiveOn: today,
          expectedSequence: archivedDepartment.version,
          idempotencyKey: `smoke-department-restore-${suffix}`,
          reason: null,
          targetVersionId: null,
        },
        userId: actor.id,
      });
      assert.equal(restoredDepartment.isArchived, false);
      await assert.rejects(
        applyDepartmentStructureChange(tx, {
          departmentId: department.id,
          payload: departmentPayload,
          meta: {
            kind: "end-date",
            effectiveOn: today,
            expectedSequence: archivedDepartment.version,
            idempotencyKey: `smoke-department-stale-${suffix}`,
            reason: "生命周期烟测旧版本冲突",
            targetVersionId: null,
          },
          userId: actor.id,
        }),
        OrganizationStructureConcurrentUpdateError,
      );

      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  assert.equal(await prisma.department.count({ where: { code: departmentCode } }), 0, "烟测组织必须随事务回滚");
  assert.equal(await prisma.position.count({ where: { code: positionCode } }), 0, "烟测岗位必须随事务回滚");
  assert.equal(await prisma.organizationStructureChange.count({
    where: {
      OR: [
        ...(departmentId === null ? [] : [{ aggregateType: "Department", aggregateId: departmentId }]),
        ...(positionId === null ? [] : [{ aggregateType: "Position", aggregateId: positionId }]),
      ],
    },
  }), 0, "烟测生命周期台账必须随事务回滚");

  console.log("组织/岗位生命周期操作烟测通过：归档、幂等重试、恢复、旧版本冲突均符合预期，烟测数据已回滚。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
