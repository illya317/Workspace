"use client";

import GenericTableTab from "./GenericTableTab";
import { companyConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function CompanyTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={companyConfig} user={user} />;
}
