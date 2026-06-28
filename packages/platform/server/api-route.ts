import "server-only";
import { z } from "zod";
import { isServiceResult, jsonBadRequest, serviceResponse } from "./api";
import { requireApiAccess, type ApiAccessResult } from "./auth";
import {
  domainIssueToResponse,
  isDomainServiceResult,
  toServiceErrorResponse,
  type DomainValidationResult,
} from "./domain-validation";

type SuccessfulApiAccess = Extract<ApiAccessResult, { ok: true }>;

type InferSchema<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : undefined;

type ApiRouteContext<TParams, TQuery, TBody> = {
  request: Request;
  user: SuccessfulApiAccess["user"];
  contract: SuccessfulApiAccess["contract"];
  params: TParams;
  query: TQuery;
  body: TBody;
  searchParams: URLSearchParams;
};

type ApiRouteHandlerOptions<
  TParamsSchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TBodySchema extends z.ZodTypeAny | undefined,
> = {
  paramsSchema?: TParamsSchema;
  querySchema?: TQuerySchema;
  bodySchema?: TBodySchema;
  bodyParser?: "json" | "formData";
  optionalJsonBody?: boolean;
  paramsError?: string;
  queryError?: string;
  bodyError?: string;
  handler: (
    context: ApiRouteContext<
      InferSchema<TParamsSchema>,
      InferSchema<TQuerySchema>,
      InferSchema<TBodySchema>
    >,
  ) => Promise<Response | unknown> | Response | unknown;
};

type ApiRouteRuntimeContext = {
  params?: Promise<Record<string, string>>;
};

type InternalApiRouteContext<TParams, TQuery, TBody> = {
  request: Request;
  params: TParams;
  query: TQuery;
  body: TBody;
  searchParams: URLSearchParams;
};

type InternalApiRouteHandlerOptions<
  TParamsSchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TBodySchema extends z.ZodTypeAny | undefined,
> = Omit<ApiRouteHandlerOptions<TParamsSchema, TQuerySchema, TBodySchema>, "handler"> & {
  authorize: (
    context: InternalApiRouteContext<
      InferSchema<TParamsSchema>,
      InferSchema<TQuerySchema>,
      InferSchema<TBodySchema>
    >,
  ) => Promise<boolean> | boolean;
  authorizeError?: string;
  handler: (
    context: InternalApiRouteContext<
      InferSchema<TParamsSchema>,
      InferSchema<TQuerySchema>,
      InferSchema<TBodySchema>
    >,
  ) => Promise<Response | unknown> | Response | unknown;
};

type CommandRouteResult<T> = Response | T | undefined;
type CommandRouteAction<TCommand, TResult, TContext> = (
  command: TCommand,
  context: TContext,
) => CommandRouteResult<TResult> | Promise<CommandRouteResult<TResult>>;
type CommandRouteAccess<TContext> =
  | ((userId: number) => Promise<boolean> | boolean)
  | ((userId: number, context: TContext) => Promise<boolean> | boolean);

type ApiCommandRouteOptions<
  TParamsSchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TBodySchema extends z.ZodTypeAny | undefined,
  TCommand,
  TResult,
> = Omit<ApiRouteHandlerOptions<TParamsSchema, TQuerySchema, TBodySchema>, "handler"> & {
  access?: CommandRouteAccess<
    ApiRouteContext<
      InferSchema<TParamsSchema>,
      InferSchema<TQuerySchema>,
      InferSchema<TBodySchema>
    >
  >;
  accessError?: string;
  buildCommand: (
    context: ApiRouteContext<
      InferSchema<TParamsSchema>,
      InferSchema<TQuerySchema>,
      InferSchema<TBodySchema>
    >,
  ) => DomainValidationResult<TCommand> | Promise<DomainValidationResult<TCommand>>;
  action: CommandRouteAction<
    TCommand,
    TResult,
    ApiRouteContext<
      InferSchema<TParamsSchema>,
      InferSchema<TQuerySchema>,
      InferSchema<TBodySchema>
    >
  >;
};

function firstZodIssue(error: z.ZodError, fallback: string) {
  return error.issues[0]?.message || fallback;
}

async function parseRouteBody(request: Request, parser: "json" | "formData") {
  if (parser === "formData") return Object.fromEntries((await request.formData()).entries());
  return request.json();
}

function commandActionResponse<TResult>(result: CommandRouteResult<TResult>) {
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  if (isDomainServiceResult(result)) {
    if (result.ok === true) return Response.json(result.data);
    return toServiceErrorResponse(result);
  }
  if (isLegacySuccessErrorResult(result)) return serviceResponse({ ok: false, error: result.error, status: result.status });
  return Response.json(result);
}

function isLegacySuccessErrorResult(value: unknown): value is { success: false; error: string; status?: number } {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.success === false && typeof result.error === "string";
}

export function createApiRouteHandler<
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TBodySchema extends z.ZodTypeAny | undefined = undefined,
>(options: ApiRouteHandlerOptions<TParamsSchema, TQuerySchema, TBodySchema>) {
  return async function apiRouteHandler(
    request: Request,
    runtimeContext: ApiRouteRuntimeContext = {},
  ) {
    const auth = await requireApiAccess(request);
    if (auth.ok === false) return auth.response;

    let params: unknown;
    if (options.paramsSchema) {
      const parsedParams = options.paramsSchema.safeParse(runtimeContext.params ? await runtimeContext.params : {});
      if (!parsedParams.success) {
        return jsonBadRequest(options.paramsError || firstZodIssue(parsedParams.error, "参数错误"));
      }
      params = parsedParams.data;
    }

    const { searchParams } = new URL(request.url);
    let query: unknown;
    if (options.querySchema) {
      const parsedQuery = options.querySchema.safeParse(Object.fromEntries(searchParams.entries()));
      if (!parsedQuery.success) {
        return jsonBadRequest(options.queryError || firstZodIssue(parsedQuery.error, "查询参数错误"));
      }
      query = parsedQuery.data;
    }

    let body: unknown;
    if (options.bodySchema && (!options.optionalJsonBody || request.headers.get("content-type")?.includes("application/json"))) {
      let rawBody: unknown;
      try {
        rawBody = await parseRouteBody(request, options.bodyParser || "json");
      } catch {
        return jsonBadRequest(options.bodyError || "请求体必须是合法 JSON");
      }
      const parsedBody = options.bodySchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return jsonBadRequest(options.bodyError || firstZodIssue(parsedBody.error, "参数错误"));
      }
      body = parsedBody.data;
    }

    const result = await options.handler({
      request,
      user: auth.user,
      contract: auth.contract,
      params: params as InferSchema<TParamsSchema>,
      query: query as InferSchema<TQuerySchema>,
      body: body as InferSchema<TBodySchema>,
      searchParams,
    });
    if (result instanceof Response) return result;
    if (isServiceResult(result)) return serviceResponse(result);
    if (result === undefined) return new Response(null, { status: 204 });
    return Response.json(result);
  };
}

export function createInternalApiRoute<
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TBodySchema extends z.ZodTypeAny | undefined = undefined,
>(options: InternalApiRouteHandlerOptions<TParamsSchema, TQuerySchema, TBodySchema>) {
  return async function internalApiRouteHandler(
    request: Request,
    runtimeContext: ApiRouteRuntimeContext = {},
  ) {
    let params: unknown;
    if (options.paramsSchema) {
      const parsedParams = options.paramsSchema.safeParse(runtimeContext.params ? await runtimeContext.params : {});
      if (!parsedParams.success) {
        return jsonBadRequest(options.paramsError || firstZodIssue(parsedParams.error, "参数错误"));
      }
      params = parsedParams.data;
    }

    const { searchParams } = new URL(request.url);
    let query: unknown;
    if (options.querySchema) {
      const parsedQuery = options.querySchema.safeParse(Object.fromEntries(searchParams.entries()));
      if (!parsedQuery.success) {
        return jsonBadRequest(options.queryError || firstZodIssue(parsedQuery.error, "查询参数错误"));
      }
      query = parsedQuery.data;
    }

    let body: unknown;
    if (options.bodySchema && (!options.optionalJsonBody || request.headers.get("content-type")?.includes("application/json"))) {
      let rawBody: unknown;
      try {
        rawBody = await parseRouteBody(request, options.bodyParser || "json");
      } catch {
        return jsonBadRequest(options.bodyError || "请求体必须是合法 JSON");
      }
      const parsedBody = options.bodySchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return jsonBadRequest(options.bodyError || firstZodIssue(parsedBody.error, "参数错误"));
      }
      body = parsedBody.data;
    }

    const context = {
      request,
      params: params as InferSchema<TParamsSchema>,
      query: query as InferSchema<TQuerySchema>,
      body: body as InferSchema<TBodySchema>,
      searchParams,
    };

    if (!(await options.authorize(context))) {
      return serviceResponse({ ok: false, error: options.authorizeError || "无权限", status: 403 });
    }

    const result = await options.handler(context);
    if (result instanceof Response) return result;
    if (isServiceResult(result)) return serviceResponse(result);
    if (result === undefined) return new Response(null, { status: 204 });
    return Response.json(result);
  };
}

export function createCommandRoute<
  TParamsSchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TBodySchema extends z.ZodTypeAny | undefined = undefined,
  TCommand = unknown,
  TResult = unknown,
>(options: ApiCommandRouteOptions<TParamsSchema, TQuerySchema, TBodySchema, TCommand, TResult>) {
  const {
    access,
    accessError,
    action,
    buildCommand,
    ...routeOptions
  } = options;
  return createApiRouteHandler({
    ...routeOptions,
    handler: async (context) => {
      if (access && !(await (access as (userId: number, routeContext: unknown) => Promise<boolean> | boolean)(context.user.userId, context))) {
        return serviceResponse({ ok: false, error: accessError || "无权限", status: 403 });
      }

      const command = await buildCommand(context);
      if (command.ok === false) return domainIssueToResponse(command.issue);

      return commandActionResponse(await action(command.data, context));
    },
  });
}
