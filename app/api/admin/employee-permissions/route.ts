import { NextResponse } from "next/server";
import { authenticate, checkPermission } from "@/lib/auth";
import { getManageableResourceKeys } from "@workspace/platform/server/auth";
import { getEmployeesWithPermissions, syncUserGrants } from "@workspace/hr/server/employee-permissions";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const isSysAdmin = await checkPermission(payload.userId, "system", "admin");
  const manageableKeys = await getManageableResourceKeys(payload.userId);

  if (!isSysAdmin && manageableKeys.size === 0) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
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
  // Bulk sync is too complex for resource admins; only system.admin allowed
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const { employeeId, name, grants } = body as {
    employeeId: string;
    name: string;
    grants?: { resourceKey: string; roleKey: string; value: boolean }[];
  };

  const result = await syncUserGrants(employeeId, name, grants);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json({ success: true });
}
