-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wxUserId" TEXT,
    "username" TEXT,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "routineItems" TEXT,
    "canLogin" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    CONSTRAINT "Resource_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Resource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "UserResourceRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "scopeId" TEXT,
    CONSTRAINT "UserResourceRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserResourceRole_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserResourceRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PositionResourceRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "positionId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "scopeId" TEXT,
    CONSTRAINT "PositionResourceRole_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PositionResourceRole_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PositionResourceRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepartmentResourceRole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "departmentId" INTEGER NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "scopeId" TEXT,
    CONSTRAINT "DepartmentResourceRole_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentResourceRole_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentResourceRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "targetType" TEXT NOT NULL DEFAULT 'department',
    "targetId" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reportId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "completion" TEXT,
    "nextGoal" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "workItemId" INTEGER,
    CONSTRAINT "ReportItem_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reportId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "notes" TEXT,
    "itemsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "targetType" TEXT NOT NULL DEFAULT 'personal',
    "targetId" INTEGER,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkParticipant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workItemId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "wxUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkParticipant_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" TEXT NOT NULL,
    "idNumber" TEXT,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "gender" TEXT,
    "birthDate" TEXT,
    "ethnicity" TEXT,
    "hometown" TEXT,
    "politics" TEXT,
    "education" TEXT,
    "title" TEXT,
    "school" TEXT,
    "major" TEXT,
    "phone" TEXT,
    "workStartDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deleted" BOOLEAN DEFAULT false,
    "deletedTime" TEXT,
    "deletedBy" TEXT,
    "userId" INTEGER,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '在职',
    "currentCompany" TEXT,
    "joinDate" TEXT,
    "leaveDate" TEXT,
    "leaveReason" TEXT,
    "officeLocation" TEXT,
    "attendanceType" TEXT,
    "contracts" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "registeredCapital" TEXT,
    "unifiedCode" TEXT,
    "bankName" TEXT,
    "registeredAddress" TEXT,
    "registeredDate" TEXT,
    "legalPerson" TEXT,
    "queryGroup" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Company_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyRelation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL,
    "shareRatio" REAL,
    "isConsolidated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CompanyRelation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyRelation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagementGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managementGroupId" INTEGER,
    "level" INTEGER NOT NULL DEFAULT 1,
    "levelLabel" TEXT NOT NULL DEFAULT '部门',
    "parentId" INTEGER,
    "managerUserId" INTEGER,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Department_managementGroupId_fkey" FOREIGN KEY ("managementGroupId") REFERENCES "ManagementGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Department_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Department_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managementGroupId" INTEGER,
    "departmentId" INTEGER,
    "positionDescriptionId" INTEGER,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Position_managementGroupId_fkey" FOREIGN KEY ("managementGroupId") REFERENCES "ManagementGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Position_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Position_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeePosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "positionId" INTEGER,
    "system" TEXT,
    "center" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" TEXT,
    "endDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "EmployeePosition_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeePosition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmployeePosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmployeePosition_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'project',
    "description" TEXT,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Project_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeProject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "role" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "EmployeeProject_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeProject_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PositionDescription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentName" TEXT,
    "reportTo" TEXT,
    "positionPurpose" TEXT,
    "summary" TEXT,
    "headcount" INTEGER,
    "version" TEXT,
    "effectiveDate" TEXT,
    "sourceFile" TEXT NOT NULL,
    "managementGroupId" INTEGER NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PositionDescription_managementGroupId_fkey" FOREIGN KEY ("managementGroupId") REFERENCES "ManagementGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    "editedBy" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditHistory_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_wxUserId_key" ON "User"("wxUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_key_key" ON "Resource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserResourceRole_userId_resourceId_roleId_scopeId_key" ON "UserResourceRole"("userId", "resourceId", "roleId", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionResourceRole_positionId_resourceId_roleId_scopeId_key" ON "PositionResourceRole"("positionId", "resourceId", "roleId", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentResourceRole_departmentId_resourceId_roleId_scopeId_key" ON "DepartmentResourceRole"("departmentId", "resourceId", "roleId", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_userId_targetType_targetId_date_key" ON "Report"("userId", "targetType", "targetId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReportHistory_reportId_version_key" ON "ReportHistory"("reportId", "version");

-- CreateIndex
CREATE INDEX "WorkItem_targetType_targetId_category_idx" ON "WorkItem"("targetType", "targetId", "category");

-- CreateIndex
CREATE INDEX "WorkParticipant_workItemId_idx" ON "WorkParticipant"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeId_key" ON "Employee"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_idNumber_key" ON "Employee"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRelation_parentId_childId_key" ON "CompanyRelation"("parentId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementGroup_name_key" ON "ManagementGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_managementGroupId_code_key" ON "Department"("managementGroupId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Position_managementGroupId_code_key" ON "Position"("managementGroupId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProject_employeeId_projectId_key" ON "EmployeeProject"("employeeId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionDescription_code_key" ON "PositionDescription"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EditHistory_entityType_entityId_version_key" ON "EditHistory"("entityType", "entityId", "version");
