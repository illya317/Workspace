// Shared types for HR module

export interface HRUser {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
}

export interface RosterEmployee {
  id: number;
  employeeId: string;
  name: string;
  company: string | null;
  center: string | null;
  dept1: string | null;
  dept2: string | null;
  position: string | null;
  gender: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  joinDate: string | null;
  nature: string | null;
  status?: string | null;
  leaveDate?: string | null;
  alias?: string | null;
  deleted?: boolean | null;
  deletedTime?: string | null;
  deletedBy?: string | null;
}

export interface CodeItem {
  code: string;
  name: string;
}
