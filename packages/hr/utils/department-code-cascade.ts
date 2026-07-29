import type {
  BusinessCodeConfig,
  SequentialBusinessCodeRule,
} from "@workspace/platform/business-code-config";

interface DepartmentNode {
  id: number;
  code: string;
  level: number;
  parentId: number | null;
}

interface PositionNode {
  id: number;
  code: string;
  departmentId: number | null;
}

function positionCodeSequence(code: string, rule: SequentialBusinessCodeRule): number | null {
  const tail = rule.separator
    ? String(code || "").trim().split(rule.separator).pop() || ""
    : String(code || "").trim().slice(-rule.sequenceLength);
  if (!/^\d+$/.test(tail) || tail.length > rule.sequenceLength) return null;
  const sequence = Number(tail);
  return Number.isInteger(sequence) && sequence >= rule.sequenceStart ? sequence : null;
}

function renderPositionCode(
  departmentCode: string,
  sequence: number,
  rule: SequentialBusinessCodeRule,
) {
  return [
    rule.prefix,
    departmentCode,
    String(sequence).padStart(rule.sequenceLength, "0"),
  ].filter(Boolean).join(rule.separator);
}

function deriveChildCode(
  parentCode: string,
  childLevel: number,
  childOldCode: string,
  departmentRule: BusinessCodeConfig["department"],
): string {
  const identifierLength = departmentRule.identifierLength;
  const prefix = parentCode.slice(0, identifierLength);
  if (childLevel === 2) {
    // L2: 继承 L1 的组织简称，保留原层级数字段
    return prefix + childOldCode.slice(identifierLength);
  }
  if (childLevel === 3) {
    const parentNumberWithoutLevel2Suffix = parentCode.slice(
      identifierLength + departmentRule.separator.length,
      -departmentRule.level2Suffix.length,
    );
    const childTail = childOldCode.slice(-departmentRule.level3SequenceLength);
    return `${prefix}${departmentRule.separator}${parentNumberWithoutLevel2Suffix}${childTail}`;
  }
  return childOldCode;
}

/**
 * 当某个部门编码发生变化时，自动推算其下所有子孙部门及下属岗位的应更新编码。
 *
 * 规则：
 * - L1 改前缀 -> L2/L3 只换前缀，数字段不变
 * - L2 改数字段 -> L3 只换数字段第一位，最后两位不变
 * - 岗位编码按当前岗位编码规则重组
 */
export function deriveDepartmentCodeCascade(params: {
  changedDepartment: DepartmentNode;
  newCode: string;
  departments: DepartmentNode[];
  positions: PositionNode[];
  departmentRule: BusinessCodeConfig["department"];
  positionRule: SequentialBusinessCodeRule;
}): {
  departments: Array<{ id: number; code: string }>;
  positions: Array<{ id: number; code: string }>;
} {
  const {
    changedDepartment,
    newCode,
    departments,
    positions,
    departmentRule,
    positionRule,
  } = params;
  const newCodeById = new Map<number, string>();
  newCodeById.set(changedDepartment.id, newCode);

  // 从被修改部门开始 BFS，逐层推导子孙部门编码
  const queue = [changedDepartment.id];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parentCode = newCodeById.get(parentId)!;
    for (const child of departments) {
      if (child.parentId !== parentId) continue;
      const childNewCode = deriveChildCode(
        parentCode,
        child.level,
        child.code,
        departmentRule,
      );
      newCodeById.set(child.id, childNewCode);
      queue.push(child.id);
    }
  }

  const departmentUpdates = Array.from(newCodeById.entries())
    .map(([id, code]) => {
      const old = id === changedDepartment.id ? changedDepartment.code : departments.find((d) => d.id === id)?.code;
      return { id, code, changed: old !== code };
    })
    .filter((item) => item.changed)
    .map(({ id, code }) => ({ id, code }));

  const affectedDepartmentIds = new Set(newCodeById.keys());
  const positionUpdates = positions
    .filter((p) => p.departmentId != null && affectedDepartmentIds.has(p.departmentId))
    .map((p) => {
      const departmentCode = newCodeById.get(p.departmentId!)!;
      const sequence = positionCodeSequence(p.code, positionRule);
      if (sequence === null) return { id: p.id, code: p.code };
      return { id: p.id, code: renderPositionCode(departmentCode, sequence, positionRule) };
    });

  return { departments: departmentUpdates, positions: positionUpdates };
}
