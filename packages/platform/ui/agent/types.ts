/** Agent 浮窗小助手 — 共享类型 */

export type AgentMood =
  | "idle"
  | "listening"
  | "thinking"
  | "success"
  | "warning"
  | "confirm"
  | "error";

export interface Position {
  x: number;
  y: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: number;
  /** 工具返回的原始数据，用于报告抽屉 */
  data?: unknown;
}
