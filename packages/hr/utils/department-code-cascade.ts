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

function positionCodeSuffix(code: string): string {
  const match = String(code || "").trim().match(/-(\d{1,2})$/);
  if (match) return match[1].padStart(2, "0");
  const tail = String(code || "").trim().split("-").pop() || "";
  const digits = tail.replace(/\D/g, "").slice(0, 2);
  return digits ? digits.padStart(2, "0") : "";
}

function deriveChildCode(parentCode: string, childLevel: number, childOldCode: string): string {
  const prefix = parentCode.slice(0, 3);
  if (childLevel === 2) {
    // L2: 继承 L1 的前三位字母，保留原数字段（必须以 00 结尾）
    return prefix + childOldCode.slice(3);
  }
  if (childLevel === 3) {
    // L3: 继承 L2 的前三位字母 + 数字段（去掉末尾 00），保留原最后两位
    const parentNumberWithoutTrailingZeros = parentCode.slice(3, -2);
    const childTail = childOldCode.slice(-2);
    return `${prefix}${parentNumberWithoutTrailingZeros}${childTail}`;
  }
  return childOldCode;
}

/**
 * 当某个部门编码发生变化时，自动推算其下所有子孙部门及下属岗位的应更新编码。
 *
 * 规则：
 * - L1 改前缀 -> L2/L3 只换前缀，数字段不变
 * - L2 改数字段 -> L3 只换数字段第一位，最后两位不变
 * - 岗位编码统一为 GW-{部门编码}-{序号}
 */
export function deriveDepartmentCodeCascade(params: {
  changedDepartment: DepartmentNode;
  newCode: string;
  departments: DepartmentNode[];
  positions: PositionNode[];
}): {
  departments: Array<{ id: number; code: string }>;
  positions: Array<{ id: number; code: string }>;
} {
  const { changedDepartment, newCode, departments, positions } = params;
  const newCodeById = new Map<number, string>();
  newCodeById.set(changedDepartment.id, newCode);

  // 从被修改部门开始 BFS，逐层推导子孙部门编码
  const queue = [changedDepartment.id];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parentCode = newCodeById.get(parentId)!;
    for (const child of departments) {
      if (child.parentId !== parentId) continue;
      const childNewCode = deriveChildCode(parentCode, child.level, child.code);
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
      const suffix = positionCodeSuffix(p.code);
      if (!suffix) return { id: p.id, code: p.code };
      return { id: p.id, code: `GW-${departmentCode}-${suffix}` };
    });

  return { departments: departmentUpdates, positions: positionUpdates };
}
