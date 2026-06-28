import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAccess, isSuperAdmin, getManageableResourceKeys } from "@workspace/platform/server/auth";
import { getEmployeesWithPermissions, syncUserGrants } from "@workspace/hr/server/employee-permissions";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const grantSchema = z.object({
  resourceKey: z.string().trim().min(1),
  roleKey: z.string().trim().min(1),
  value: z.boolean(),
});

const syncUserGrantsSchema = z.object({
  employeeId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  grants: z.array(grantSchema).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const isSysAdmin = await isSuperAdmin(payload.userId);
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return jsonErrorResponse("无权限", 403);
  }

  const employees = await getEmployeesWithPermissions();

  // Filter resourceRoles to only show manageable resources
  const filtered = employees.map((emp) => ({
    ...emp,
    resourceRoles: isSysAdmin
      ? emp.resourceRoles
      : emp.resourceRoles.filter((rr) => manageableKeys.has(rr.resource.key)),
    permissions: isSysAdmin
      ? emp.permissions
      : emp.permissions.filter((p) => {
          const resourceKey = p.split(".")[0];
          return manageableKeys.has(resourceKey);
        }),
  }));

  return NextResponse.json({ employees: filtered });
}

export async function PUT(request: Request) {
  // Bulk sync is too complex for resource admins; only root admin is allowed.
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  const parsedBody = syncUserGrantsSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return jsonErrorResponse("参数错误: 需要 employeeId, name, grants", 400);
  }

  const result = await syncUserGrants(
    parsedBody.data.employeeId,
    parsedBody.data.name,
    parsedBody.data.grants
  );

  if (!result.success) {
    return jsonErrorResponse(result.error, result.status || 400);
  }

  return NextResponse.json({ success: true });
}
