"use client";

import GenericTableTab from "./GenericTableTab";
import { employeeConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function EmployeeTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={employeeConfig} user={user} />;
}
