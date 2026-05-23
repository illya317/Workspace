"use client";

import GenericTableTab from "./GenericTableTab";
import { companyRelationConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function CompanyRelationTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={companyRelationConfig} user={user} />;
}
