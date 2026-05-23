"use client";

import GenericTableTab from "./GenericTableTab";
import { departmentConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function DepartmentTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={departmentConfig} user={user} />;
}
