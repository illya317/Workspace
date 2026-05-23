"use client";

import GenericTableTab from "./GenericTableTab";
import { employeeProjectConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function EmployeeProjectTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={employeeProjectConfig} user={user} />;
}
