/**
 * Agent 头像资产映射。
 * 图片放在 public/assets/agent/avatar/，组件通过路径引用。
 */

import type { AgentMood } from "./types";

export type AgentPose = "front" | "side" | "back" | "45front" | "45back";
export type AgentExpression =
  | "talking" | "questioning" | "surprised" | "disappointed" | "wink" | "sleeping";

const BASE = "/workspace/assets/agent/avatar";

/** 7 个核心 mood → 图片路径 */
export const moodAvatar: Record<AgentMood, string> = {
  idle: `${BASE}/10_status-idle.webp`,
  listening: `${BASE}/23_expr-listening-v2.webp`,
  thinking: `${BASE}/26_expr-loading-v2.webp`,
  success: `${BASE}/21_status-success.webp`,
  warning: `${BASE}/24_expr-warning.webp`,
  confirm: `${BASE}/25_status-confirm-v2.webp`,
  error: `${BASE}/13_status-error.webp`,
};

/** 浮窗主图（默认按钮） */
export const mainAvatar = `${BASE}/01_main-front.webp`;

/** 姿态映射（拖动/展开/收起） */
export const poseAvatar: Record<AgentPose, string> = {
  front: `${BASE}/01_main-front.webp`,
  side: `${BASE}/02_turn-side.webp`,
  back: `${BASE}/03_turn-back.webp`,
  "45front": `${BASE}/14_turn-45front.webp`,
  "45back": `${BASE}/15_turn-45back.webp`,
};

/** 语境表情映射（消息场景临时覆盖） */
export const expressionAvatar: Record<AgentExpression, string> = {
  talking: `${BASE}/22_expr-talking.webp`,
  questioning: `${BASE}/08_expr-questioning.webp`,
  surprised: `${BASE}/16_expr-surprised.webp`,
  disappointed: `${BASE}/17_expr-disappointed.webp`,
  wink: `${BASE}/18_expr-wink.webp`,
  sleeping: `${BASE}/09_expr-sleeping.webp`,
};

/** 动画帧 */
export const animFrames = {
  blink: [`${BASE}/27_anim-blink-mid.webp`, `${BASE}/28_anim-blink-closed.webp`],
  thinking: [
    `${BASE}/04_expr-thinking.webp`,
    `${BASE}/19_expr-loading.webp`,
    `${BASE}/26_expr-loading-v2.webp`,
  ],
};

/** 核心 7 mood — 用于 preload */
export const coreMoods = Object.values(moodAvatar);

/** 预加载一组图片 */
export function preloadImages(urls: string[]) {
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}
