const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

let prisma;
const DEFAULT_HR_SEED_DIR = path.join(process.env.HOME || '', 'Desktop', 'workspace', 'input', 'json', 'HR');
const FALLBACK_SEED_DIR = path.join(__dirname, '..', '..', 'prisma', 'seed-data');
const SEED_DIR = process.env.HR_SEED_DIR || (fs.existsSync(DEFAULT_HR_SEED_DIR) ? DEFAULT_HR_SEED_DIR : FALLBACK_SEED_DIR);
const IMPORT_TODAY = '2026-06-18';

function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, filename), 'utf8'));
}

function normalizeAlias(value) {
  if (!value) return null;
  const rawTags = Array.isArray(value) ? value : String(value).split(/[,，、;；\n]+/);
  const seen = new Set();
  const tags = [];
  for (const item of rawTags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.length > 0 ? JSON.stringify(tags) : null;
}

function mergeTextList(...values) {
  const seen = new Set();
  const items = [];
  const add = (value) => {
    if (value === undefined || value === null) return;
    const rawItems = Array.isArray(value) ? value : [value];
    for (const raw of rawItems) {
      const item = String(raw || '').trim();
      if (!item || ['无', '无。', '无；', '无;'].includes(item) || seen.has(item)) continue;
      seen.add(item);
      items.push(item);
    }
  };
  values.forEach(add);
  return items;
}

const undergraduateMajorsCatalog = require('../../../.workspace/data/reference/education/china-undergraduate-majors-2025.json');
const professionalTitlesConfig = require('../../../.workspace/config/hr/professional-titles.json');
const chinaInstitutionsCatalog = require('../../../.workspace/data/reference/education/china-higher-education-institutions-2025.json');
const qsWorldRankingsCatalog = require('../../../.workspace/data/reference/education/qs-world-university-rankings-2027.json');
const schoolWhitelistConfig = require('../../../.workspace/config/hr/school-whitelist.json');

function buildMajorGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const category = String(record.categoryName || '').trim();
    const specialty = String(record.className || '').trim();
    if (!category || !specialty) continue;
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category).add(specialty);
  }
  return [...groups.entries()].map(([category, specialties]) => ({
    category,
    specialties: [...specialties],
  }));
}

const HR_MAJOR_GROUPS = buildMajorGroups(undergraduateMajorsCatalog.records || []);
const HR_PROFESSIONAL_TITLE_GROUPS = professionalTitlesConfig.groups || [];
const HR_PROFESSIONAL_TITLES = new Set(
  HR_PROFESSIONAL_TITLE_GROUPS.flatMap((group) => (group.levels || []).map((item) => item.title)),
);
const HR_ALLOWED_SCHOOLS = new Set([
  ...(schoolWhitelistConfig.specialSchools || []).map((school) => school.name),
  ...(chinaInstitutionsCatalog.records || []).map((school) => school.name),
  ...(qsWorldRankingsCatalog.records || []).map((school) => school.name),
]);

function normalizeProfessionalTitle(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  const aliases = professionalTitlesConfig.aliases || {};
  const normalized = Object.prototype.hasOwnProperty.call(aliases, text) ? aliases[text] : text;
  return normalized && HR_PROFESSIONAL_TITLES.has(normalized) ? normalized : null;
}

function normalizeSchool(value) {
  if (value === undefined || value === null || value === '') return null;
  const school = String(value).trim();
  if (!school) return null;
  if (!HR_ALLOWED_SCHOOLS.has(school)) {
    throw new Error(`Invalid school "${school}". School must come from education reference JSON or HR school whitelist.`);
  }
  return school;
}

function normalizeMajor(value) {
  if (!value) return null;
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = value.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(raw)) return null;
  const valid = new Set(HR_MAJOR_GROUPS.flatMap((group) => group.specialties.map((specialty) => `${group.category}/${specialty}`)));
  const seen = new Set();
  const items = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const category = String(item.category || '').trim();
    const specialty = String(item.specialty || '').trim();
    const key = `${category}/${specialty}`;
    if (!valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    items.push({ category, specialty });
  }
  return items.length > 0 ? JSON.stringify(items) : null;
}

function normalizeManagementGroup(value) {
  if (value === 2 || value === '2' || value === 'GMP') return 'GMP';
  if (value === 1 || value === '1' || value === '常规体系') return '常规体系';
  return value ? String(value) : '常规体系';
}

function normalizeWorkPercentValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  const numberText = text.endsWith('%') ? text.slice(0, -1).trim() : text;
  const parsed = Number(numberText);
  if (!Number.isFinite(parsed)) return text;
  const normalized = text.endsWith('%') || parsed > 1 ? parsed / 100 : parsed;
  return String(normalized);
}

function normalizeDateValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let year;
  let month;
  let day;
  const yearFirst = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  const dayFirst = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (yearFirst) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2]);
    day = Number(yearFirst[3]);
  } else if (dayFirst) {
    year = Number(dayFirst[3]);
    month = Number(dayFirst[2]);
    day = Number(dayFirst[1]);
  } else {
    return '';
  }
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return '';
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function versionNumber(value) {
  const match = String(value || '').trim().match(/\d+/);
  return match ? Number(match[0]) : -1;
}

function latestChangeHistory(records) {
  return [...records].sort((a, b) => {
    const versionDelta = versionNumber(b.version) - versionNumber(a.version);
    if (versionDelta !== 0) return versionDelta;
    const dateA = normalizeDateValue(a.effectiveDate);
    const dateB = normalizeDateValue(b.effectiveDate);
    if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    return 0;
  })[0];
}

function positionDescriptionMeta(data) {
  const records = Array.isArray(data.changeHistory) ? data.changeHistory : [];
  const latest = latestChangeHistory(records);
  return {
    version: String(latest?.version || data.version || '') || null,
    effectiveDate: normalizeDateValue(latest?.effectiveDate) || normalizeDateValue(data.effectiveDate) || null,
  };
}

function normalizeOfficeLocation(value) {
  if (!value) return null;
  const parts = String(value).split(/[\\/、,，;；]+/).map((item) => item.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('上海')) return '上海';
    if (part.includes('北京')) return '北京';
    if (part.includes('盐城') || part.includes('方强') || part.includes('创投')) return '盐城';
    if (part.includes('加拿大') || part.includes('温哥华')) return '加拿大';
  }
  return null;
}

function officeLocationFromCompany(companyName, companyByName) {
  const company = companyByName[companyName];
  return normalizeOfficeLocation(company?.registeredAddress || company?.fullName || company?.name || companyName);
}

function laborContractCompany(employment) {
  const contracts = Array.isArray(employment.contracts) ? employment.contracts : [];
  const laborContracts = contracts.filter((contract) => contract.contractType === '劳动合同');
  return (
    laborContracts.find((contract) => contract.company === employment.currentCompany)?.company ||
    laborContracts.find((contract) => contract.company)?.company ||
    employment.currentCompany ||
    null
  );
}

function deriveOfficeLocation(employment, companyByName) {
  return (
    officeLocationFromCompany(laborContractCompany(employment), companyByName) ||
    normalizeOfficeLocation(employment.officeLocation)
  );
}

function getDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('DATABASE_URL must be an absolute file: path');
  }
  return databaseUrl.slice('file:'.length);
}

async function createPrisma() {
  const mod = await import(path.join(__dirname, '..', '..', 'generated', 'prisma', 'client.ts'));
  return new mod.PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: getDatabasePath() }),
  });
}

function normalizeEmploymentContracts(employment) {
  const contracts = Array.isArray(employment.contracts) ? employment.contracts.map((contract) => ({ ...contract })) : [];
  const mainIndex = contracts.findIndex((contract) => contract.company === employment.currentCompany);
  const target = contracts[mainIndex >= 0 ? mainIndex : 0];
  if (target) {
    if (employment.attendanceType && !target.employmentForm) target.employmentForm = employment.attendanceType;
    if (employment.insuranceStatus && !target.insuranceStatus) target.insuranceStatus = employment.insuranceStatus;
  }
  return contracts.map((contract, index) => {
    const next = { ...contract };
    next.isPrimary = target ? index === (mainIndex >= 0 ? mainIndex : 0) : false;
    delete next.isInsuredHere;
    applyContractPeriods(next);
    next.insuranceStatus = normalizeContractInsuranceStatus(employment, next);
    return next;
  });
}

function applyContractPeriods(contract) {
  const periods = Array.isArray(contract.periods) ? contract.periods : [];
  for (const period of periods) {
    const sequence = Number(period.sequence);
    if (sequence === 1) {
      contract.firstContractStartDate = period.startDate || null;
      contract.firstContractEndDate = period.endDate || null;
    } else if (sequence === 2) {
      contract.secondContractStartDate = period.startDate || null;
      contract.secondContractEndDate = period.endDate || null;
    } else if (sequence === 3) {
      contract.thirdContractStartDate = period.startDate || null;
      contract.thirdContractEndDate = period.endDate || null;
    } else if (sequence === 4) {
      contract.permanentContractDate = period.startDate || null;
    }
  }
  delete contract.periods;
}

function hasCurrentContractPeriod(contract) {
  const endDates = [
    contract.firstContractEndDate,
    contract.secondContractEndDate,
    contract.thirdContractEndDate,
    contract.endDate,
  ].filter(Boolean);
  if (contract.permanentContractDate) return true;
  if (endDates.length === 0) return true;
  return endDates.some((endDate) => String(endDate) >= IMPORT_TODAY);
}

function normalizeContractInsuranceStatus(employment, contract) {
  if (contract.contractType === '返聘协议') return '已退休';
  if (['劳务协议', '顾问协议', '董事协议'].includes(contract.contractType)) return '未参保';
  if (employment.status === '离职' || employment.leaveDate) return '已停保';
  if (contract.company && employment.currentCompany && contract.company !== employment.currentCompany) return '已停保';
  if (!hasCurrentContractPeriod(contract)) return '已停保';
  return contract.insuranceStatus || '已参保';
}

async function main() {
  prisma = await createPrisma();
  console.log(`Using HR seed dir: ${SEED_DIR}`);

  console.log('=== Step 0: Seed base data ===');
  const companies = loadJSON('companies.json');
  const companyByName = Object.fromEntries(companies.map((company) => [company.name, company]));
  for (const c of companies) {
    const companyData = {
      code: c.code,
      name: c.name,
      fullName: c.fullName || null,
      registeredCapital: c.registeredCapital || null,
      unifiedCode: c.unifiedCode || null,
      registeredAddress: c.registeredAddress || null,
      registeredDate: c.registeredDate || null,
      legalPerson: c.legalPerson || c.legalRepresentative || null,
      managementGroup: normalizeManagementGroup(c.managementGroup || c.queryGroup),
      codePoolCode: c.codePoolCode || null,
      isActive: c.isActive ?? true,
      sortOrder: c.sortOrder || 0,
      updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
      editedBy: c.editedBy || null,
      editedAt: c.editedAt ? new Date(c.editedAt) : null,
      version: c.version || 1,
    };
    await prisma.company.upsert({
      where: { id: c.id },
      update: companyData,
      create: {
        id: c.id,
        ...companyData,
        createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
      }
    });
  }
  console.log(`  Company: ${companies.length}`);

  const userByEmployeeId = {};
  const [existingEmployees, users] = await Promise.all([
    prisma.employee.findMany({ select: { employeeId: true, userId: true } }),
    prisma.user.findMany({ where: { employeeId: { not: null } }, select: { id: true, employeeId: true } }),
  ]);
  for (const row of existingEmployees) {
    if (row.employeeId && row.userId) userByEmployeeId[row.employeeId] = row.userId;
  }
  for (const row of users) {
    if (row.employeeId) userByEmployeeId[row.employeeId] = row.id;
  }

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
  await prisma.departmentDescription.deleteMany({});
  console.log('  Cleared DepartmentDescription');
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
  const deptSeedByCode = Object.fromEntries(allDepts.map((department) => [department.code, department]));

  for (const d of allDepts) {
    const parentId = d.parentJsonId ? deptCodeToId[deptJsonIdToCode[d.parentJsonId]] : null;

    const created = await prisma.department.create({
      data: {
        code: d.code,
        name: d.name,
        alias: normalizeAlias(d.alias),
        level: d.level,
        parentId,
      }
    });
    deptCodeToId[d.code] = created.id;
    console.log(`  ${d.code} ${d.name} (L${d.level}) -> id=${created.id}`);
  }

  console.log('\n=== Step 3: Import DepartmentDescription ===');
  const ddDir = path.join(SEED_DIR, 'department-descriptions');
  let departmentDescriptionCount = 0;
  if (fs.existsSync(ddDir)) {
    const ddFiles = fs.readdirSync(ddDir).filter(f => f.endsWith('.json') && !/(^|[._-])legacy([._-]|$)/i.test(f));
    for (const file of ddFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(ddDir, file), 'utf8'));
      if (!data.code) continue;
      const departmentId = deptCodeToId[data.code];
      if (!departmentId) {
        console.log(`  WARNING: Unknown department ${data.code} for department description ${file}`);
        continue;
      }
      const details = data.details ? { ...data.details } : null;
      if (details?.['基本信息'] && typeof details['基本信息'] === 'object' && !Array.isArray(details['基本信息'])) {
        const basicInfo = { ...details['基本信息'] };
        basicInfo['负责人'] = deptSeedByCode[data.code]?.managerPositionName || basicInfo['负责人'] || basicInfo['主管领导'] || '';
        delete basicInfo['主管领导'];
        details['基本信息'] = basicInfo;
      }
      await prisma.departmentDescription.create({
        data: {
          departmentId,
          code: data.code,
          name: data.name || data.details?.['基本信息']?.['部门名称'] || data.code,
          sourceFile: data.sourceFile || file,
          codeRaw: data.code_raw || null,
          details: details ? JSON.stringify(details) : null,
        }
      });
      departmentDescriptionCount += 1;
    }
  } else {
    console.log('  DepartmentDescription: skipped (no seed directory)');
  }
  console.log(`  Imported ${departmentDescriptionCount} department descriptions`);

  console.log('\n=== Step 4: Import PositionDescription (184) ===');
  const pdDir = path.join(SEED_DIR, 'position-descriptions');
  const pdFiles = fs.readdirSync(pdDir).filter(f => f.endsWith('.json'));
  const pdCodeToId = {};

  for (const file of pdFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(pdDir, file), 'utf8'));
    if (!data.code) continue;
    const meta = positionDescriptionMeta(data);

    // Flat fields mapped directly
    const flatFields = {
      name: data.name,
      code: data.code,
      departmentName: data.departmentName || null,
      reportTo: data.reportTo || null,
      positionPurpose: data.positionPurpose || null,
      summary: data.summary || null,
      headcount: data.headcount ? parseInt(data.headcount) || null : null,
      version: meta.version,
      effectiveDate: meta.effectiveDate,
      sourceFile: data.documentSource || file,
    };

    // Everything else goes into details JSON
    const detailFields = [
      'code_raw', 'departmentCode', 'purpose', 'scope',
      'subordinates', 'duties', 'managementDuties',
      'education', 'major', 'experienceRequirements', 'training',
      'skills', 'cert', 'otherRequirements',
      'competencies', 'workEnvironments', 'workSchedule',
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
    const mergedOtherRequirements = mergeTextList(data.otherRequirements, data.other);
    if (mergedOtherRequirements.length > 0) {
      details.otherRequirements = mergedOtherRequirements;
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
        alias: normalizeAlias(p.alias),
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
        otherId: e.otherId || e.passportNo || null,
        name: e.name,
        alias: normalizeAlias(e.alias),
        gender: e.gender === "男" ? true : (e.gender === "女" ? false : null),
        birthDate: e.birthDate,
        ethnicity: e.ethnicity,
        hometown: e.hometown,
        politics: e.politics,
        education: e.education,
        title: normalizeProfessionalTitle(e.technical_title ?? e.title),
        school: normalizeSchool(e.school),
        major: normalizeMajor(e.major),
        phone: e.phone,
        workStartDate: e.workStartDate,
        userId: userByEmployeeId[e.employeeId] || null,
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

    const contracts = normalizeEmploymentContracts(e);

    await prisma.employment.create({
      data: {
        employeeId: empDbId,
        isActive: e.status !== '离职',
        currentCompany: e.currentCompany || null,
        joinDate: e.joinDate || null,
        leaveDate: e.leaveDate || null,
        leaveReason: e.leaveReason || null,
        officeLocation: deriveOfficeLocation(e, companyByName),
        personnelType: e.personnelType || null,
        rank: e.rank || null,
        title: e.title || null,
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
        startDate: e.startDate || null,
        endDate: e.endDate || null,
        reportTo: e.reportTo || null,
        workPercent: normalizeWorkPercentValue(e.workPercent),
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
