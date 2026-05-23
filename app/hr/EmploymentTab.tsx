"use client";

import GenericTableTab from "./GenericTableTab";
import { employmentConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function EmploymentTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={employmentConfig} user={user} />;
}
