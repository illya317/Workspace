export interface WorkParticipant {
  id: number;
  workItemId: number;
  name: string;
  wxUserId: string | null;
  createdAt: string;
}

export interface WorkItem {
  id: number;
  departmentId: number;
  category: string;
  content: string;
  importance: number;
  urgency: number;
  isArchived: boolean;
  participants: WorkParticipant[];
  sortOrder: number;
  createdAt: string;
}
