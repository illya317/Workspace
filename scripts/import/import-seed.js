const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const SEED_DIR = path.join(__dirname, '..', '..', 'prisma', 'seed');
const WEB_DIR = path.join(__dirname, '..', '..', 'web');

function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, filename), 'utf8'));
}

async function main() {
  const prisma = await createPrisma();
  console.log('=== Step 0: Seed base data ===');
  const companies = loadJSON('companies.json');
  for (const c of companies) {
    await prisma.company.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        code: c.code,
        name: c.name,
        fullName: c.fullName || null,
        registeredCapital: c.registeredCapital || null,
        unifiedCode: c.unifiedCode || null,
        registeredAddress: c.registeredAddress || null,
        registeredDate: c.registeredDate || null,
        legalPerson: c.legalRepresentative || null,
        queryGroup: c.queryGroup || null,
        sortOrder: c.sortOrder || 0,
        createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
        updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
        editedBy: c.editedBy || null,
        editedAt: c.editedAt ? new Date(c.editedAt) : null,
        version: c.version || 1,
      }
    });
  }
  console.log(`  Company: ${companies.length}`);

  // Import CompanyRelation
  console.log('\n  Importing CompanyRelation...');
  try {
    const relations = loadJSON('company-relations.json');
    await prisma.companyRelation.deleteMany({});
    for (const r of relations) {
      await prisma.companyRelation.create({
        data: {
          parentId: r.parentId,
          childId: r.childId,
          shareRatio: r.shareRatio || null,
          isConsolidated: r.isConsolidated ?? false,
        },
      });
    }
    console.log(`  CompanyRelation: ${relations.length}`);
  } catch {
    console.log('  CompanyRelation: skipped (no seed file)');
  }

  console.log('\n=== Step 1: Clear roster data ===');
  // Delete in reverse dependency order
  await prisma.eDP.deleteMany({});
  console.log('  Cleared EDP');
  await prisma.employment.deleteMany({});
  console.log('  Cleared Employment');
  await prisma.position.deleteMany({});
  console.log('  Cleared Position');
  await prisma.positionDescription.deleteMany({});
  console.log('  Cleared PositionDescription');
  await prisma.employee.deleteMany({});
  console.log('  Cleared Employee');
  await prisma.department.deleteMany({});
  console.log('  Cleared Department');

  console.log('\n=== Step 2: Import Department (44) ===');
  const deptTree = loadJSON('department.json');
  const deptCodeToId = {}; // code -> db id
  const deptJsonIdToCode = {}; // json id -> code (for parent mapping)

  // Flatten tree and collect all nodes
  const allDepts = [];
  function collect(node, parentJsonId) {
    allDepts.push({ ...node, parentJsonId });
    deptJsonIdToCode[node.id] = node.code;
    if (node.children) {
      node.children.forEach(child => collect(child, node.id));
    }
  }
  deptTree.forEach(node => collect(node, null));

  // Sort by level (L1 -> L2 -> L3)
  allDepts.sort((a, b) => a.level - b.level);

  for (const d of allDepts) {
    const parentId = d.parentJsonId ? deptCodeToId[deptJsonIdToCode[d.parentJsonId]] : null;

    const created = await prisma.department.create({
      data: {
        code: d.code,
        name: d.name,
        alias: Array.isArray(d.alias) ? d.alias.join('、') : (d.alias || null),
        level: d.level,
        parentId,
      }
    });
    deptCodeToId[d.code] = created.id;
    console.log(`  ${d.code} ${d.name} (L${d.level}) -> id=${created.id}`);
  }

  console.log('\n=== Step 4: Import PositionDescription (184) ===');
  const pdDir = path.join(WEB_DIR, 'position-descriptions');
  const pdFiles = fs.readdirSync(pdDir).filter(f => f.endsWith('.json'));
  const pdCodeToId = {};

  for (const file of pdFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(pdDir, file), 'utf8'));
    if (!data.code) continue;

    // Flat fields mapped directly
    const flatFields = {
      name: data.name,
      code: data.code,
      departmentName: data.departmentName || null,
      reportTo: data.reportTo || null,
      positionPurpose: data.positionPurpose || null,
      summary: data.summary || null,
      headcount: data.headcount ? parseInt(data.headcount) || null : null,
      version: data.version || null,
      effectiveDate: data.effectiveDate || null,
      sourceFile: data.documentSource || file,
    };

    // Everything else goes into details JSON
    const detailFields = [
      'code_raw', 'departmentCode', 'purpose', 'scope',
      'subordinates', 'duties', 'managementDuties',
      'education', 'major', 'experience', 'training',
      'skills', 'cert', 'other', 'otherRequirements',
      'competencies', 'workingConditions', 'workSchedule',
      'equipment', 'externalCollaboration',
      'distributionDeptNames', 'trainingPositionNames',
      'attachments', 'changeHistory',
      'drafter', 'reviewer1', 'reviewer2', 'approver',
      'salaryType', 'officeLocation', 'rank', 'isResearch'
    ];
    const details = {};
    for (const key of detailFields) {
      if (data[key] !== undefined && data[key] !== '' && data[key] !== null) {
        if (Array.isArray(data[key]) && data[key].length === 0) continue;
        details[key] = data[key];
      }
    }

    const created = await prisma.positionDescription.create({
      data: {
        ...flatFields,
        details: Object.keys(details).length > 0 ? JSON.stringify(details) : null,
      }
    });
    pdCodeToId[data.code] = created.id;
  }
  console.log(`  Imported ${Object.keys(pdCodeToId).length} position descriptions`);

  console.log('\n=== Step 3: Import Position (185) ===');
  const positions = loadJSON('position.json');
  const posCodeToId = {};

  for (const p of positions) {
    const deptId = deptCodeToId[p.departmentCode];
    if (!deptId) {
      console.log(`  WARNING: Unknown department ${p.departmentCode} for ${p.code}`);
      continue;
    }

    const pdId = pdCodeToId[p.code] || null;

    const created = await prisma.position.create({
      data: {
        code: p.code,
        alias: Array.isArray(p.alias) ? p.alias.join('、') : (p.alias || null),
        name: p.name,
        departmentId: deptId,
        positionDescriptionId: pdId,
      }
    });
    posCodeToId[p.code] = created.id;
  }
  console.log(`  Imported ${Object.keys(posCodeToId).length} positions`);

  console.log('\n=== Step 4: Import Employee (343) ===');
  const employees = loadJSON('employees.json');
  const empIdMap = {}; // string employeeId -> db id

  for (const e of employees) {
    const created = await prisma.employee.create({
      data: {
        employeeId: e.employeeId,
        idNumber: e.idNumber,
        otherId: e.otherId || null,
        name: e.name,
        alias: e.alias,
        gender: e.gender === "男" ? true : (e.gender === "女" ? false : null),
        birthDate: e.birthDate,
        ethnicity: e.ethnicity,
        hometown: e.hometown,
        politics: e.politics,
        education: e.education,
        title: e.title,
        school: e.school,
        major: e.major,
        phone: e.phone,
        workStartDate: e.workStartDate,
      }
    });
    empIdMap[e.employeeId] = created.id;
  }
  console.log(`  Imported ${Object.keys(empIdMap).length} employees`);

  console.log('\n=== Step 5: Import Employment (343) ===');
  const employments = loadJSON('employments.json');
  let empCount = 0;

  for (const e of employments) {
    const empDbId = empIdMap[e.employeeId];
    if (!empDbId) {
      console.log(`  WARNING: Unknown employee ${e.employeeId}`);
      continue;
    }

    const contracts = e.contracts || [];

    await prisma.employment.create({
      data: {
        employeeId: empDbId,
        isActive: e.status !== '离职',
        currentCompany: e.currentCompany || null,
        joinDate: e.joinDate || null,
        leaveDate: e.leaveDate || null,
        leaveReason: e.leaveReason || null,
        officeLocation: e.officeLocation || null,
        attendanceType: e.attendanceType || null,
        contracts: contracts.length > 0 ? JSON.stringify(contracts) : null,
      }
    });
    empCount++;
  }
  console.log(`  Imported ${empCount} employment records`);

  console.log('\n=== Step 6: Import EDP (583) ===');
  const edps = loadJSON('employee_positions.json');
  let edpCount = 0;
  let skipCount = 0;

  for (const e of edps) {
    const empDbId = empIdMap[e.employeeId];
    const deptDbId = e.departmentCode ? deptCodeToId[e.departmentCode] : null;
    const posDbId = e.positionCode ? posCodeToId[e.positionCode] : null;

    if (!empDbId) {
      console.log(`  WARNING: Unknown employee ${e.employeeId}`);
      skipCount++;
      continue;
    }
    if (e.departmentCode && !deptDbId) {
      console.log(`  WARNING: Unknown department ${e.departmentCode} for ${e.employeeId}`);
    }
    if (e.positionCode && !posDbId) {
      console.log(`  WARNING: Unknown position ${e.positionCode} for ${e.employeeId}`);
    }

    await prisma.eDP.create({
      data: {
        employeeId: empDbId,
        departmentId: deptDbId,
        positionId: posDbId,
        isPrimary: e.isPrimary === true,
        personnelType: e.personnelType || null,
        rank: e.rank || null,
        title: e.title || null,
        reportTo: e.reportTo || null,
        reportTo2: e.reportTo2 || null,
        workPercent: e.workPercent || null,
        isResearch: e.isResearch === true || e.isResearch === '是' ? true : (e.isResearch === false || e.isResearch === '否' ? false : null),
      }
    });
    edpCount++;
  }
  console.log(`  Imported ${edpCount} EDP records (skipped ${skipCount})`);

  console.log('\n=== Done ===');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
