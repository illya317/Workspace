import { prisma } from "@workspace/platform/server/prisma";

import { loadCompanyMap, resolveCompanyCode } from "@workspace/platform/server/company-directory";
import { deleteDepartment } from "./departments";

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

export async function deleteAdminDepartment(departmentId: number, userId: number) {
  const result = await deleteDepartment({ id: departmentId, userId });
  return result.ok
    ? { success: true as const, message: "部门已删除" }
    : { success: false as const, status: result.status || 400, error: result.error };
}
