"use client";

import { Flex, Form, Typography } from "antd";
import { AntdFormActions, AntdFormCommands } from "./antd-form-actions";
import { AntdFormItems, resolveAntdFormLayout } from "./antd-form-items";
import type { FormSurfaceLooseItem, FormSurfaceProps } from "../../FormSurface.types";

export function AntdFormSurface<T = FormSurfaceLooseItem>({
  insideFrame = false,
  surface,
}: {
  insideFrame?: boolean;
  surface: FormSurfaceProps<T>;
}) {
  const layout = resolveAntdFormLayout(surface.kind, surface.content.layout);
  const commands = surface.kind === "filters" && surface.commands?.length
    ? <AntdFormCommands commands={surface.commands} />
    : null;
  const inlineCommands = commands && layout.flow === "inline" && layout.commandPlacement === "inline"
    ? <div data-antd-form-command-placement="inline">{commands}</div>
    : undefined;
  const login = surface.kind === "login";
  const hasActions = Boolean(surface.actions?.length);
  const actions = hasActions ? (
    <AntdFormActions
      actions={surface.actions}
      compact={layout.density === "compact"}
      login={login}
    />
  ) : null;
  const headerActions = login ? null : actions;
  const hasHeader = Boolean(surface.header?.title || surface.header?.description || headerActions);

  return (
    <Form
      colon={false}
      component={false}
      disabled={false}
      requiredMark
      size={layout.density === "compact" ? "small" : "middle"}
    >
      <div
        className="space-y-4"
        data-antd-form-surface="true"
        data-form-root-kind={surface.kind}
        data-form-flow={layout.flow}
      >
        {hasHeader ? (
          <Flex justify="space-between" align="flex-start" gap="middle" data-antd-form-header="true">
            <div className="min-w-0">
              {surface.header?.title ? (
                <Typography.Title level={5} className="!mb-0">{surface.header.title}</Typography.Title>
              ) : null}
              {surface.header?.description ? (
                <Typography.Text type="secondary">{surface.header.description}</Typography.Text>
              ) : null}
            </div>
            {headerActions}
          </Flex>
        ) : null}
        <AntdFormItems
          insideFrame={insideFrame}
          inlineCommands={inlineCommands}
          items={surface.content.items}
          kind={surface.kind}
          layout={layout}
        />
        {login ? actions : null}
        {inlineCommands || !commands ? null : (
          <div data-antd-form-command-placement="below">{commands}</div>
        )}
      </div>
    </Form>
  );
}
