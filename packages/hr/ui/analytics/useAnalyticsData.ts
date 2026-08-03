"use client";

import { workspacePath } from "@workspace/core/routing";
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
  managerPositionId: number | null;
  managerPositionName: string | null;
  managerEmployeeIds: number[];
  managerEmployeeNames: string[];
  managerNames: string[];
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
  reportTo: string | null;
  allocationWeight: number | null;
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
  leaveNote: string | null;
  officeLocation: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
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
  insuranceStatus: string | null;
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
  contractsError: string | null;
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
    contractsError: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function loadJson<T>(path: string): Promise<T> {
      const response = await fetch(workspacePath(path));
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return response.json() as Promise<T>;
    }

    async function load() {
      try {
        const contractRequest = loadJson<{ contracts?: Contract[] }>("/api/modules/hr/roster/contracts?pageSize=500&isActive=true")
          .then((payload) => ({ payload, error: null }))
          .catch(() => ({ payload: { contracts: [] as Contract[] }, error: "合同数据暂不可用" }));
        const [empRes, deptRes, posRes, edpRes, emtRes, contractResult] = await Promise.all([
          loadJson<{ employees?: Employee[] }>("/api/modules/hr/roster/employees?pageSize=500"),
          loadJson<{ departments?: Department[] }>("/api/modules/hr/roster/departments?pageSize=500"),
          loadJson<{ positions?: Position[] }>("/api/modules/hr/roster/positions?pageSize=500"),
          loadJson<{ positions?: EDP[] }>("/api/modules/hr/roster/edps?pageSize=500"),
          loadJson<{ items?: Employment[] }>("/api/modules/hr/roster/employments?pageSize=500"),
          contractRequest,
        ]);

        setData({
          employees: empRes.employees || [],
          departments: deptRes.departments || [],
          positions: posRes.positions || [],
          edps: edpRes.positions || [],
          employments: emtRes.items || [],
          contracts: contractResult.payload.contracts || [],
          contractsError: contractResult.error,
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
