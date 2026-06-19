import { prisma } from "@workspace/platform/server/prisma";

import { loadCompanyMap, resolveCompanyCode } from "./company-directory";

type CompanyMapEntry = {
  name?: string;
  managementGroup?: string;
};

export async function listAdminDepartments() {
  const [departments, companyMap] = await Promise.all([
    prisma.department.findMany({
      where: { level: 2 },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    loadCompanyMap(),
  ]);

  return {
    departments: departments.map((department) => {
      const companyCode = resolveCompanyCode(companyMap, department.code);
      const company = companyMap.get(companyCode) as CompanyMapEntry | undefined;
      return {
        id: department.id,
        name: department.name,
        managementGroup: company?.managementGroup ?? "常规体系",
        company: company?.name ?? department.code,
        count: 0,
      };
    }),
  };
}

export async function deleteAdminDepartment(departmentId: number) {
  try {
    await prisma.department.delete({
      where: { id: departmentId },
    });
    return { success: true as const, message: "部门已删除" };
  } catch {
    return { success: false as const, status: 400, error: "删除失败，部门可能不存在或有关联数据" };
  }
}
