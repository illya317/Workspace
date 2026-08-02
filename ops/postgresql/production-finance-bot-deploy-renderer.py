WORKSPACE_VERSIONED_DEPLOY_RENDERER = 1


def deploy_total_seconds(event):
    explicit = event.get("endToEndDurationSeconds")
    if isinstance(explicit, int) and explicit >= 0:
        return explicit
    timing = event.get("timing")
    if isinstance(timing, dict):
        explicit = timing.get("endToEndSeconds")
        if isinstance(explicit, int) and explicit >= 0:
            return explicit
        legacy = timing.get("opsTotalSeconds")
        if isinstance(legacy, int) and legacy >= 0:
            return legacy
    legacy = event.get("opsDurationSeconds")
    if isinstance(legacy, int) and legacy >= 0:
        return legacy
    return event.get("durationSeconds")


def should_send_deploy_event(event):
    status = str(event.get("status") or "").strip().lower()
    if status in {"succeeded", "failed", "cancelled"}:
        return True
    return status == "running" and event.get("softThresholdExceeded") is True


def format_deploy_message(event):
    status = str(event.get("status") or "").strip().lower()
    deployment_kind = str(event.get("deploymentKind") or "").strip()
    modules = format_deploy_modules(event)
    total = format_duration(deploy_total_seconds(event))
    mutation_seconds = event.get("mutationDurationSeconds")
    mutation = format_duration(mutation_seconds) if isinstance(mutation_seconds, int) else "未进入生产变更窗口"
    phase = str(event.get("currentPhase") or event.get("stage") or "未知阶段").strip()

    if status == "running" and event.get("softThresholdExceeded") is True:
        blocker = str(event.get("blocker") or "无明确卡点，部署仍在执行").strip()
        return "\n".join([
            "## ⏳ Workspace 部署耗时提醒",
            f"- 当前阶段：**{phase}**",
            f"- 已耗时：**{total}**",
            f"- 卡点：{blocker}",
        ])

    if status in {"failed", "cancelled"}:
        title = "## 🚨 Workspace 部署失败" if status == "failed" else "## ⚠️ Workspace 部署已取消"
        fingerprint = str(event.get("errorFingerprint") or "未记录").strip()
        return "\n".join([
            title,
            f"- 端到端耗时：**{total}**",
            f"- 失败阶段：**{phase}**",
            f"- 错误指纹：`{fingerprint}`",
            f"- 状态：{'部署失败' if status == 'failed' else '部署已取消'}",
        ])

    if status != "succeeded":
        raise ValueError("Workspace deployment notification status is invalid")
    if deployment_kind == "full" or not modules:
        title = "## 🚀 Workspace Full 全量部署完成"
    else:
        title = "## 🚀 Workspace 模块部署完成"
    lines = [title]
    if modules:
        lines.append(f"- 模块：**{modules}**")
    lines.extend([
        f"- 端到端耗时：**{total}**",
        f"- 生产变更窗口：**{mutation}**",
        "- 状态：health/version/content digest 验收通过",
    ])
    if event.get("test") is True:
        lines[0] = "## 🧪 Neko 部署自动汇报测试"
        lines[-1] = "- 状态：非业务测试；health/version/content digest 验收通过"
    return "\n".join(lines)
