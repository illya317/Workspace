import { getBusinessCodeConfig } from "@workspace/platform/server/system-config";
import { prisma } from "@workspace/platform/server/prisma";
import { deriveDepartmentCodeCascade } from "@workspace/hr/utils/department-code-cascade";

function hierarchyKind(value: string | null | undefined) {
  return value === "G" ? "G" : "M";
}

function configuredPositionCode(input: {
  currentCode: string;
  departmentCode: string;
  prefix: string;
  separator: string;
  sequenceLength: number;
}) {
  const suffix = input.separator
    ? input.currentCode.trim().split(input.separator).pop() || ""
    : input.currentCode.trim().slice(-input.sequenceLength);
  if (!/^\d+$/.test(suffix) || suffix.length > input.sequenceLength) {
    return input.currentCode;
  }
  return [
    input.prefix,
    input.departmentCode,
    suffix.padStart(input.sequenceLength, "0"),
  ].filter(Boolean).join(input.separator);
}

export async function configuredDepartmentCodeCascade(
  departmentId: number,
  newCode: string,
) {
  const [codeConfig, existing] = await Promise.all([
    getBusinessCodeConfig(),
    prisma.department.findUnique({
      where: { id: departmentId },
      select: { code: true, hierarchyKind: true, level: true },
    }),
  ]);
  if (!existing || newCode === existing.code) return null;
  const [allDepartments, allPositions] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, code: true, hierarchyKind: true, level: true, parentId: true },
    }),
    prisma.position.findMany({ select: { id: true, code: true, departmentId: true } }),
  ]);
  if (hierarchyKind(existing.hierarchyKind) === "M") {
    return deriveDepartmentCodeCascade({
      changedDepartment: {
        id: departmentId,
        code: existing.code,
        level: existing.level,
        parentId: null,
      },
      newCode,
      departments: allDepartments.filter(
        (department) => hierarchyKind(department.hierarchyKind) === "M",
      ),
      positions: allPositions,
      departmentRule: codeConfig.department,
      positionRule: codeConfig.position,
    });
  }
  const positions = allPositions
    .filter((position) => position.departmentId === departmentId)
    .map((position) => ({
      id: position.id,
      code: configuredPositionCode({
        currentCode: position.code,
        departmentCode: newCode,
        ...codeConfig.position,
      }),
    }))
    .filter((position) => (
      allPositions.find((item) => item.id === position.id)?.code !== position.code
    ));
  return { departments: [], positions };
}
