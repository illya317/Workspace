type DatabaseTableOwnerRule = {
  resourceKey: string;
  matches: (tableName: string) => boolean;
};

function startsWithAny(tableName: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => tableName.startsWith(prefix));
}

const TABLE_OWNER_RULES: readonly DatabaseTableOwnerRule[] = [
  { resourceKey: "settings.api", matches: (name) => name.startsWith("OpenApi") },
  { resourceKey: "settings.account", matches: (name) => name === "Notification" || name === "NotificationSubscription" },
  { resourceKey: "settings.admin", matches: (name) => startsWithAny(name, ["Approval", "Workflow", "Permission", "UserResource", "PositionResource", "DepartmentResource"]) || name === "User" || name === "Resource" },
  { resourceKey: "settings.governance", matches: (name) => startsWithAny(name, ["DataQuality", "MutationImpact", "BusinessCode", "RelationPolicy"]) || name === "SystemConfig" || name === "LoginAttempt" },
  { resourceKey: "agent", matches: (name) => name.startsWith("Agent") },

  { resourceKey: "administration.erpDiligence", matches: (name) => name.startsWith("ErpDueDiligence") },
  { resourceKey: "administration.contracts", matches: (name) => name.startsWith("Contract") },
  { resourceKey: "capitalSecurities.investments", matches: (name) => name.startsWith("InvestmentEnterprise") },
  { resourceKey: "capitalSecurities.governance", matches: (name) => name.startsWith("CompanyRegistry") },
  { resourceKey: "capitalSecurities.investors", matches: (name) => startsWithAny(name, ["Investor", "Ownership", "Share"]) },
  { resourceKey: "external", matches: (name) => startsWithAny(name, ["Party", "External"]) || name === "EmployeePartyIdentityLink" },
  { resourceKey: "docs.editor", matches: (name) => name.startsWith("DocumentTemplate") },

  { resourceKey: "finance.assets", matches: (name) => name.startsWith("FinanceAsset") },
  { resourceKey: "finance.budget", matches: (name) => name.startsWith("FinanceBudget") },
  { resourceKey: "finance.treasury", matches: (name) => startsWithAny(name, ["FinanceCurrency", "FinanceBank", "FinanceLoan", "FinanceInterest"]) },
  { resourceKey: "finance.tax", matches: (name) => name.startsWith("FinanceTax") },
  { resourceKey: "finance.cost", matches: (name) => startsWithAny(name, ["FinanceDataImport", "FinanceShipment", "FinanceSalesSalary", "FinanceCost", "FinanceWorkshop", "WorkspaceAnalysis"]) },
  { resourceKey: "finance.statements", matches: (name) => startsWithAny(name, ["FinanceStatement", "FinanceCashFlow", "FinanceConsolidation", "FinanceCompanyCurrency"]) },
  { resourceKey: "finance.ledger", matches: (name) => name.startsWith("Finance") || name === "ReclassResult" },

  { resourceKey: "hr.performance", matches: (name) => name.startsWith("HrPerformance") },
  { resourceKey: "hr.roster", matches: (name) => startsWithAny(name, ["Employee", "Employment", "Company", "Department", "Position", "EDP", "EditHistory", "Organization"]) },
  { resourceKey: "inventory.receipts", matches: (name) => name.startsWith("InventoryReceipt") },
  { resourceKey: "inventory.operations", matches: (name) => startsWithAny(name, ["Inventory", "Stock"]) },
  { resourceKey: "production.qc", matches: (name) => name.startsWith("ProductionQc") },
  { resourceKey: "production.products", matches: (name) => name.startsWith("Product") },
  { resourceKey: "library.basicInfo", matches: (name) => startsWithAny(name, ["Library", "DueDiligence"]) },
  { resourceKey: "work.projects", matches: (name) => name.startsWith("Project") || name === "EmployeeProject" },
  { resourceKey: "work.meetings", matches: (name) => name.startsWith("Meeting") },
  { resourceKey: "work.tasks", matches: (name) => startsWithAny(name, ["Work", "DepartmentCollaboration", "DepartmentWork", "PositionResponsibility"]) },
];

export function databaseTableOwnerKey(tableName: string): string | null {
  return TABLE_OWNER_RULES.find((rule) => rule.matches(tableName))?.resourceKey ?? null;
}
