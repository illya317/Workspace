import { matchText } from "@workspace/platform/search";

const DEFAULT_AGENT_EMPLOYEE_LIMIT = 20;

export type AgentEmployeeCandidate = {
  id: number;
  employeeId: string;
  name: string;
  alias: string | null;
  title: string | null;
  employments: Array<{ isActive: boolean }>;
};

export type AgentEmployeeSearchItem = {
  id: number;
  employeeId: string;
  name: string;
  aliases: string[];
  title: string | null;
  department: string | null;
  position: string | null;
  employmentStatus: "在职" | "非在职";
};

export async function searchAgentEmployeeDirectory(keyword: string, limit = DEFAULT_AGENT_EMPLOYEE_LIMIT) {
  const normalized = normalize(keyword);
  if (!normalized) return { totalMatches: 0, items: [] as AgentEmployeeSearchItem[] };
  const { prisma } = await import("@workspace/platform/server/prisma");

  const candidates = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeId: { contains: keyword } },
        { name: { contains: keyword } },
        { alias: { contains: keyword } },
      ],
    },
    select: {
      id: true,
      employeeId: true,
      name: true,
      alias: true,
      title: true,
      employments: {
        select: { isActive: true },
        orderBy: { id: "desc" },
        take: 1,
      },
    },
    orderBy: { employeeId: "asc" },
  });
  const selected = rankAgentEmployeeCandidates(keyword, candidates, limit);
  const positions = selected.length > 0
    ? await prisma.eDP.findMany({
        where: { employeeId: { in: selected.map((item) => item.id) } },
        select: {
          employeeId: true,
          isPrimary: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      })
    : [];
  const primaryPositionByEmployee = new Map<number, (typeof positions)[number]>();
  for (const position of positions) {
    if (!primaryPositionByEmployee.has(position.employeeId)) {
      primaryPositionByEmployee.set(position.employeeId, position);
    }
  }

  return {
    totalMatches: candidates.length,
    items: selected.map((candidate) => {
      const position = primaryPositionByEmployee.get(candidate.id);
      return {
        id: candidate.id,
        employeeId: candidate.employeeId,
        name: candidate.name,
        aliases: parseAliases(candidate.alias),
        title: candidate.title,
        department: position?.department?.name ?? null,
        position: position?.position?.name ?? null,
        employmentStatus: candidate.employments[0]?.isActive ? "在职" as const : "非在职" as const,
      };
    }),
  };
}

export function rankAgentEmployeeCandidates(
  keyword: string,
  candidates: AgentEmployeeCandidate[],
  limit = DEFAULT_AGENT_EMPLOYEE_LIMIT,
) {
  const query = normalize(keyword);
  return [...candidates]
    .sort((left, right) => candidateScore(right, query) - candidateScore(left, query)
      || left.employeeId.localeCompare(right.employeeId))
    .slice(0, Math.max(1, Math.min(DEFAULT_AGENT_EMPLOYEE_LIMIT, Math.floor(limit))));
}

function candidateScore(candidate: AgentEmployeeCandidate, query: string) {
  const employeeId = normalize(candidate.employeeId);
  const name = normalize(candidate.name);
  const aliases = parseAliases(candidate.alias).map(normalize);
  if (employeeId === query) return 500;
  if (name === query) return 480;
  if (aliases.some((alias) => alias === query)) return 460;
  if (employeeId.startsWith(query)) return 400;
  if (name.startsWith(query)) return 380;
  if (aliases.some((alias) => alias.startsWith(query))) return 360;
  if (matchText(employeeId, query)) return 300;
  if (matchText(name, query)) return 280;
  if (aliases.some((alias) => matchText(alias, query))) return 260;
  return 0;
}

function parseAliases(value: string | null) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [value.trim()].filter(Boolean);
  } catch {
    return value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
  }
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}
