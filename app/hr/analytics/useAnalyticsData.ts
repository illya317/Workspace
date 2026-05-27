"use client";

import { useEffect, useState } from "react";

export interface Employee {
  id: number;
  employeeId: string;
  name: string;
  alias: string | null;
  gender: boolean | null;
  birthDate: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  workStartDate: string | null;
  idNumber: string | null;
  otherId: string | null;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  company: string;
  level: number;
  levelLabel: string;
  parentId: number | null;
  parentName: string | null;
  managerUserId: number | null;
  managerName: string | null;
  headcount: number;
  children: { id: number; name: string }[];
}

export interface Position {
  id: number;
  code: string;
  codeRaw: string | null;
  name: string;
  alias: string | null;
  company: string;
  departmentId: number | null;
  departmentName: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  headcount: number;
}

export interface EDP {
  id: number;
  employeeId: number;
  employeeName: string;
  departmentId: number | null;
  departmentName: string | null;
  positionId: number | null;
  positionName: string | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
  reportTo: string | null;
  reportTo2: string | null;
  workPercent: number | null;
  isResearch: boolean | null;
}

export interface Employment {
  id: number;
  employeeId: number;
  employeeName: string;
  isActive: boolean;
  currentCompany: string | null;
  joinDate: string | null;
  leaveDate: string | null;
  leaveReason: string | null;
  officeLocation: string | null;
  attendanceType: string | null;
  contracts: Contract[];
}

export interface Contract {
  id: number;
  employmentId: number;
  employeeId: string;
  employeeName: string;
  company: string;
  isPrimary: boolean;
  isInsuredHere: boolean;
  legalRelation: string;
  contractType: string;
  employmentForm: string;
  firstContractStartDate: string | null;
  firstContractEndDate: string | null;
  secondContractStartDate: string | null;
  secondContractEndDate: string | null;
  thirdContractStartDate: string | null;
  thirdContractEndDate: string | null;
  permanentContractDate: string | null;
  confidentialityDate: string | null;
  nonCompeteDate: string | null;
  endDate: string | null;
}

export interface AnalyticsData {
  employees: Employee[];
  departments: Department[];
  positions: Position[];
  edps: EDP[];
  employments: Employment[];
  contracts: Contract[];
  loading: boolean;
  error: string | null;
}

export function useAnalyticsData() {
  const [data, setData] = useState<AnalyticsData>({
    employees: [],
    departments: [],
    positions: [],
    edps: [],
    employments: [],
    contracts: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function load() {
      try {
        const [empRes, deptRes, posRes, edpRes, emtRes, conRes] = await Promise.all([
          fetch("/api/hr/employees?pageSize=500").then((r) => r.json()),
          fetch("/api/hr/departments?pageSize=500").then((r) => r.json()),
          fetch("/api/hr/positions?pageSize=500").then((r) => r.json()),
          fetch("/api/hr/edps?pageSize=500").then((r) => r.json()),
          fetch("/api/hr/employments?pageSize=500").then((r) => r.json()),
          fetch("/api/hr/contracts?pageSize=500").then((r) => r.json()),
        ]);

        setData({
          employees: empRes.employees || [],
          departments: deptRes.departments || [],
          positions: posRes.positions || [],
          edps: edpRes.positions || [],
          employments: emtRes.items || [],
          contracts: conRes.contracts || [],
          loading: false,
          error: null,
        });
      } catch (_err) {
        setData((prev) => ({ ...prev, loading: false, error: "数据加载失败" }));
      }
    }
    load();
  }, []);

  return data;
}
