import { prisma } from "@/lib/prisma";

export const SEARCH_CONFIG: Record<string, {
  model: keyof typeof prisma;
  searchFields: string[];
  select: Record<string, boolean>;
  labelField: string;
  subtitleField?: string;
  take: number;
}> = {
  employee: {
    model: "employee",
    searchFields: ["name", "employeeId"],
    select: { id: true, name: true, employeeId: true, alias: true },
    labelField: "name",
    subtitleField: "employeeId",
    take: 100,
  },
  department: {
    model: "department",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
  position: {
    model: "position",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
  project: {
    model: "project",
    searchFields: ["name"],
    select: { id: true, name: true },
    labelField: "name",
    take: 100,
  },
  company: {
    model: "company",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
  user: {
    model: "user",
    searchFields: ["name", "username"],
    select: { id: true, name: true, username: true },
    labelField: "name",
    subtitleField: "username",
    take: 100,
  },
  positionDescription: {
    model: "positionDescription",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
};
