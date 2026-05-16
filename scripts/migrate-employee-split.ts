import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrate() {
  console.log("=== 开始数据迁移 ===");

  // Step 1: 备份旧数据
  const oldEmployees = await prisma.employee.findMany();
  console.log(`旧 Employee 表: ${oldEmployees.length} 条`);

  const oldDeptCodes = await prisma.departmentCode.findMany();
  console.log(`旧 DepartmentCode: ${oldDeptCodes.length} 条`);

  const oldPosCodes = await prisma.positionCode.findMany();
  console.log(`旧 PositionCode: ${oldPosCodes.length} 条`);

  // Step 2: 创建 Employee 基础信息（去重）
  console.log("\n--- Step 2: 创建 Employee 基础信息 ---");
  const empGroups = new Map<string, typeof oldEmployees>();
  for (const e of oldEmployees) {
    const list = empGroups.get(e.employeeId) || [];
    list.push(e);
    empGroups.set(e.employeeId, list);
  }

  const employeeIdMap = new Map<string, number>(); // employeeId -> new Employee.id
  for (const [empId, group] of empGroups) {
    const first = group[0];
    const created = await prisma.employee.create({
      data: {
        employeeId: empId,
        name: first.name,
        alias: first.alias,
        gender: first.gender,
        ethnicity: first.ethnicity,
        hometown: first.hometown,
        politics: first.politics,
        education: first.education,
        title: first.title,
        school: first.school,
        major: first.major,
        majorRelevant: first.majorRelevant,
        phone: first.phone,
        joinDate: first.joinDate,
        nature: first.nature,
        status: first.status,
        leaveDate: first.leaveDate,
        deleted: first.deleted,
        deletedTime: first.deletedTime,
        deletedBy: first.deletedBy,
        userId: first.userId,
      },
    });
    employeeIdMap.set(empId, created.id);
    console.log(`  创建 Employee: ${empId} ${first.name} (id=${created.id})`);
  }
  console.log(`共创建 ${employeeIdMap.size} 条 Employee 记录`);

  // Step 3: 创建 Department 表
  console.log("\n--- Step 3: 创建 Department ---");
  const deptNameToId = new Map<string, number>();
  const deptNameToLevel = new Map<string, number>();

  // 3.1 从 DepartmentCode 迁移
  for (const dc of oldDeptCodes) {
    const companyMap: Record<string, string> = {
      "01": "丰华生物",
      "02": "丰华天力通",
      "03": "丰华悦通",
      "04": "丰华制药",
      "05": "加拿大",
    };
    const company = companyMap[dc.companyCode || ""] || dc.companyCode || "";
    // code 前缀推断 level（后续可人工修正）
    const level = 1; // 默认一级，后续人工维护
    const created = await prisma.department.create({
      data: {
        code: dc.code,
        name: dc.name,
        company,
        level,
      },
    });
    deptNameToId.set(dc.name, created.id);
    deptNameToLevel.set(dc.name, level);
    console.log(`  从 DepartmentCode 创建: ${dc.code} ${dc.name} (${company})`);
  }

  // 3.2 从 Employee.dept1 补充缺失的部门
  const dept1Set = new Set(oldEmployees.map((e) => e.dept1).filter(Boolean) as string[]);
  for (const deptName of dept1Set) {
    if (deptNameToId.has(deptName)) continue;
    // 推断 company：取该部门出现最多的公司
    const companies = oldEmployees
      .filter((e) => e.dept1 === deptName && e.company)
      .map((e) => e.company!);
    const company = companies[0] || "";
    // 生成临时 code（后续可人工修正）
    const tempCode = `TMP${deptNameToId.size + 1}`.padStart(5, "0");
    const created = await prisma.department.create({
      data: {
        code: tempCode,
        name: deptName,
        company,
        level: 1,
      },
    });
    deptNameToId.set(deptName, created.id);
    deptNameToLevel.set(deptName, 1);
    console.log(`  从 dept1 补充: ${tempCode} ${deptName} (${company})`);
  }

  // 3.3 从 Employee.dept2 补充缺失的部门（标记为二级）
  const dept2Set = new Set(oldEmployees.map((e) => e.dept2).filter(Boolean) as string[]);
  for (const deptName of dept2Set) {
    if (deptNameToId.has(deptName)) {
      // 已存在，如果当前标记为一级，需要创建一个新的二级部门记录
      const existingId = deptNameToId.get(deptName)!;
      const existingLevel = deptNameToLevel.get(deptName)!;
      if (existingLevel === 1) {
        // 同名但不同层级，创建新的二级记录
        const companies = oldEmployees
          .filter((e) => e.dept2 === deptName && e.company)
          .map((e) => e.company!);
        const company = companies[0] || "";
        const tempCode = `TMP${deptNameToId.size + 1}`.padStart(5, "0");
        const created = await prisma.department.create({
          data: {
            code: tempCode,
            name: deptName,
            company,
            level: 2,
          },
        });
        deptNameToId.set(`${deptName}#L2`, created.id);
        deptNameToLevel.set(`${deptName}#L2`, 2);
        console.log(`  从 dept2 补充(二级同名): ${tempCode} ${deptName} (${company})`);
      }
      continue;
    }
    const companies = oldEmployees
      .filter((e) => e.dept2 === deptName && e.company)
      .map((e) => e.company!);
    const company = companies[0] || "";
    const tempCode = `TMP${deptNameToId.size + 1}`.padStart(5, "0");
    const created = await prisma.department.create({
      data: {
        code: tempCode,
        name: deptName,
        company,
        level: 2,
      },
    });
    deptNameToId.set(deptName, created.id);
    deptNameToLevel.set(deptName, 2);
    console.log(`  从 dept2 补充: ${tempCode} ${deptName} (${company})`);
  }
  console.log(`共创建 ${deptNameToId.size} 条 Department 记录`);

  // Step 4: 创建 Position 表
  console.log("\n--- Step 4: 创建 Position ---");
  const posNameToId = new Map<string, number>();

  // 4.1 从 PositionCode 迁移
  for (const pc of oldPosCodes) {
    const companyMap: Record<string, string> = {
      "01": "丰华生物",
      "02": "丰华天力通",
      "03": "丰华悦通",
      "04": "丰华制药",
      "05": "加拿大",
    };
    const company = companyMap[pc.companyCode || ""] || pc.companyCode || "";
    const created = await prisma.position.create({
      data: {
        code: pc.code,
        name: pc.name,
        company,
      },
    });
    posNameToId.set(`${pc.name}#${company}`, created.id);
    console.log(`  从 PositionCode 创建: ${pc.code} ${pc.name} (${company})`);
  }

  // 4.2 从 Employee.position 补充缺失的岗位
  const posSet = new Set(oldEmployees.map((e) => e.position).filter(Boolean) as string[]);
  for (const posName of posSet) {
    const key = `${posName}#`; // 不区分公司，先用空公司
    if (posNameToId.has(key)) continue;
    // 查找 PositionCode 中是否有同名岗位
    const matchingCode = oldPosCodes.find((pc) => pc.name === posName);
    if (matchingCode) {
      // 已在 4.1 中创建，但公司可能不同
      // 使用第一个匹配的公司
      const companyMap: Record<string, string> = {
        "01": "丰华生物",
        "02": "丰华天力通",
        "03": "丰华悦通",
        "04": "丰华制药",
        "05": "加拿大",
      };
      const company = companyMap[matchingCode.companyCode || ""] || "";
      const existingKey = `${posName}#${company}`;
      if (posNameToId.has(existingKey)) {
        posNameToId.set(key, posNameToId.get(existingKey)!);
        continue;
      }
    }
    const tempCode = `POS${posNameToId.size + 1}`.padStart(5, "0");
    const companies = oldEmployees
      .filter((e) => e.position === posName && e.company)
      .map((e) => e.company!);
    const company = companies[0] || "";
    const created = await prisma.position.create({
      data: {
        code: tempCode,
        name: posName,
        company,
      },
    });
    posNameToId.set(key, created.id);
    posNameToId.set(`${posName}#${company}`, created.id);
    console.log(`  从 position 补充: ${tempCode} ${posName} (${company})`);
  }
  console.log(`共创建 ${(await prisma.position.count())} 条 Position 记录`);

  // Step 5: 创建 EmployeePosition 关联
  console.log("\n--- Step 5: 创建 EmployeePosition ---");
  let epCount = 0;
  for (const oldEmp of oldEmployees) {
    const newEmpId = employeeIdMap.get(oldEmp.employeeId);
    if (!newEmpId) {
      console.log(`  跳过: 找不到新 Employee ${oldEmp.employeeId}`);
      continue;
    }

    // dept1 -> department
    let deptId: number | undefined;
    if (oldEmp.dept1) {
      deptId = deptNameToId.get(oldEmp.dept1);
      if (!deptId) {
        // 尝试查找二级部门
        deptId = deptNameToId.get(`${oldEmp.dept1}#L2`);
      }
    }

    // dept2 -> 如果 dept1 没有匹配，尝试 dept2
    if (!deptId && oldEmp.dept2) {
      deptId = deptNameToId.get(oldEmp.dept2);
      if (!deptId) {
        deptId = deptNameToId.get(`${oldEmp.dept2}#L2`);
      }
    }

    // position
    let posId: number | undefined;
    if (oldEmp.position) {
      posId = posNameToId.get(`${oldEmp.position}#${oldEmp.company || ""}`);
      if (!posId) {
        posId = posNameToId.get(`${oldEmp.position}#`);
      }
    }

    if (!deptId || !posId) {
      console.log(`  跳过: ${oldEmp.employeeId} ${oldEmp.name} 缺少部门(${oldEmp.dept1 || oldEmp.dept2 || "无"})或岗位(${oldEmp.position || "无"})`);
      continue;
    }

    await prisma.employeePosition.create({
      data: {
        employeeId: newEmpId,
        departmentId: deptId,
        positionId: posId,
        center: oldEmp.center,
        isPrimary: epCount === 0,   // 第一个岗位设为主岗位
        sortOrder: epCount,
      },
    });
    epCount++;
  }
  console.log(`共创建 ${epCount} 条 EmployeePosition 记录`);

  // Step 6: 创建 DepartmentPosition 配置
  console.log("\n--- Step 6: 创建 DepartmentPosition ---");
  const eps = await prisma.employeePosition.findMany({
    select: { departmentId: true, positionId: true },
    distinct: ["departmentId", "positionId"],
  });
  let dpCount = 0;
  for (const ep of eps) {
    if (ep.departmentId === 0 || ep.positionId === 0) continue;
    try {
      await prisma.departmentPosition.create({
        data: {
          departmentId: ep.departmentId,
          positionId: ep.positionId,
        },
      });
      dpCount++;
    } catch (e) {
      // 忽略重复
    }
  }
  console.log(`共创建 ${dpCount} 条 DepartmentPosition 记录`);

  // Step 7: 删除旧 Employee 数据（保留 DepartmentCode/PositionCode 作为备份）
  console.log("\n--- Step 7: 清理旧数据 ---");
  // 注意：不能直接删除，因为旧表结构还在。等 API 改造完成后再删除。
  console.log("旧 Employee 数据保留，等 API 改造完成后再清理");

  console.log("\n=== 迁移完成 ===");
  console.log(`Employee: ${await prisma.employee.count()}`);
  console.log(`Department: ${await prisma.department.count()}`);
  console.log(`Position: ${await prisma.position.count()}`);
  console.log(`EmployeePosition: ${await prisma.employeePosition.count()}`);
  console.log(`DepartmentPosition: ${await prisma.departmentPosition.count()}`);
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
