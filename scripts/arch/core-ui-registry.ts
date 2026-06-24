import {
  coreUiComponentRegistry,
  registeredCoreUiComponentNames,
} from "../../packages/core/ui/component-registry";
import type { CoreUiComponentRegistration } from "../../packages/core/ui/component-registry";

const TIER_ORDER: Record<string, number> = {
  foundation: 0,
  primitive: 1,
  assembly: 2,
  frame: 3,
};

export function validateCoreUiRegistry() {
  const errors: string[] = [];
  const byName = new Map<string, CoreUiComponentRegistration>();

  for (const component of coreUiComponentRegistry) {
    const registration = component as CoreUiComponentRegistration;
    byName.set(registration.name, registration);
  }

  // 1. 引用的名字必须存在
  for (const registration of byName.values()) {
    const allTargets = [
      ...(registration.composes ?? []),
      ...(registration.foundations ?? []),
      ...(registration.includes ?? []),
    ];
    for (const target of allTargets) {
      if (!registeredCoreUiComponentNames.has(target)) {
        errors.push(`${registration.name} 引用了未注册的 core UI 入口：${target}`);
      }
    }
  }

  // 2. composes/includes 不能成环
  function visit(name: string, path: string[], seen: Set<string>) {
    if (seen.has(name)) {
      const cycleStart = path.indexOf(name);
      const cycle = path.slice(cycleStart).concat(name);
      errors.push(`composes/includes 出现循环：${cycle.join(" -> ")}`);
      return;
    }
    const registration = byName.get(name);
    if (!registration) return;
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      visit(target, [...path, name], new Set(seen).add(name));
    }
  }
  for (const registration of byName.values()) {
    visit(registration.name, [], new Set());
  }

  // 3. foundation 不能反向依赖 primitive/assembly/frame
  //    foundation 只能有 foundations，且目标也必须是 foundation
  for (const registration of byName.values()) {
    if (registration.tier === "foundation") {
      if ((registration.composes && registration.composes.length > 0) || (registration.includes && registration.includes.length > 0)) {
        errors.push(`${registration.name} 是 foundation，不能声明 composes/includes`);
      }
      for (const target of registration.foundations ?? []) {
        const targetReg = byName.get(target);
        if (targetReg && targetReg.tier !== "foundation") {
          errors.push(`${registration.name}.foundations 指向了非 foundation 入口 ${target}（${targetReg.tier}）`);
        }
      }
    }
  }

  // 4. 非 foundation 不能通过 composes/includes 依赖 foundation
  //    应该使用 foundations 字段
  for (const registration of byName.values()) {
    if (registration.tier === "foundation") continue;
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      const targetReg = byName.get(target);
      if (targetReg && targetReg.tier === "foundation") {
        errors.push(`${registration.name}（${registration.tier}）通过 composes/includes 依赖了 foundation ${target}，应改为 foundations 字段`);
      }
    }
  }

  // 5. 同一来源的目标不能重复；同一目标不能同时出现在 composes/includes 和 foundations 中
  for (const registration of byName.values()) {
    const targets = new Set<string>();
    const check = (target: string, field: string) => {
      if (targets.has(target)) {
        errors.push(`${registration.name} 在多个关系字段中重复声明了 ${target}`);
      }
      targets.add(target);
    };
    for (const target of registration.composes ?? []) check(target, "composes");
    for (const target of registration.includes ?? []) check(target, "includes");
    for (const target of registration.foundations ?? []) check(target, "foundations");
  }

  // 6. 层级方向：composes/includes 的目标 tier 不能高于来源（不能反向依赖）
  for (const registration of byName.values()) {
    const targets = [...(registration.composes ?? []), ...(registration.includes ?? [])];
    for (const target of targets) {
      const targetReg = byName.get(target);
      if (!targetReg) continue;
      if (TIER_ORDER[targetReg.tier] > TIER_ORDER[registration.tier]) {
        errors.push(`${registration.name}（${registration.tier}）composes/includes 了更高层 ${target}（${targetReg.tier}）`);
      }
    }
  }

  return errors;
}

export function checkCoreUiRegistry() {
  const errors = validateCoreUiRegistry();
  if (errors.length === 0) {
    console.log("✓ Core UI registry relation validation passed");
    return true;
  }

  console.error("✗ Core UI registry relation validation failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  return false;
}
