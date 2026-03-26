import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { PluginConfig } from "./config.js";
import type {
  CompanyEntity,
  LinkedInCompanyFetchParams,
  LinkedInProfileFetchParams,
  PersonEntity,
} from "./schemas.js";
import {
  CompanyEntitySchema,
  PersonEntitySchema,
  WorkerErrorSchema,
  WorkerMetaSchema,
} from "./schemas.js";

type WorkerError = Static<typeof WorkerErrorSchema>;

function buildHeaders(config: PluginConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

  if (config.workerApiKey) {
    headers.authorization = `Bearer ${config.workerApiKey}`;
  }

  return headers;
}

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function schemaError(schema: TSchema, value: unknown, label: string): never {
  const first = Value.Errors(schema, value).First();
  throw new Error(`${label} validation failed: ${first?.message ?? "unknown schema error"}`);
}

function assertSchema<TSchemaType extends TSchema>(
  schema: TSchemaType,
  value: unknown,
  label: string,
): Static<TSchemaType> {
  if (!Value.Check(schema, value)) {
    schemaError(schema, value, label);
  }

  return value as Static<TSchemaType>;
}

function workerSuccessSchema<TSchemaType extends TSchema>(dataSchema: TSchemaType) {
  return Type.Object(
    {
      ok: Type.Literal(true),
      data: dataSchema,
      meta: WorkerMetaSchema,
    },
    { additionalProperties: false },
  );
}

const WorkerFailureSchema = Type.Object(
  {
    ok: Type.Literal(false),
    error: WorkerErrorSchema,
    meta: Type.Optional(Type.Partial(WorkerMetaSchema)),
  },
  { additionalProperties: false },
);

function asWorkerFailure(value: unknown): WorkerError | null {
  if (!Value.Check(WorkerFailureSchema, value)) {
    return null;
  }

  return (value as Static<typeof WorkerFailureSchema>).error;
}

async function postJson<TSchemaType extends TSchema>(
  path: string,
  body: Record<string, unknown>,
  config: PluginConfig,
  responseSchema: TSchemaType,
): Promise<Static<TSchemaType>> {
  const url = `${config.workerBaseUrl}${path}`;
  const signal = AbortSignal.timeout(config.requestTimeoutMs);

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(body),
    signal,
  });

  const rawText = await response.text();
  const parsed = rawText.length > 0 ? parseJsonSafely(rawText) : null;

  if (!response.ok) {
    const failure = asWorkerFailure(parsed);
    if (failure) {
      throw new Error(`${failure.code}: ${failure.message}`);
    }

    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed ?? { status: response.status });
    throw new Error(`Worker request failed (${response.status} ${response.statusText}) at ${path}: ${detail}`);
  }

  const envelope = assertSchema(workerSuccessSchema(responseSchema), parsed, "worker success envelope") as unknown as {
    data: Static<TSchemaType>;
  };
  return envelope.data;
}

export async function fetchLinkedInProfile(
  params: LinkedInProfileFetchParams,
  config: PluginConfig,
): Promise<PersonEntity> {
  return postJson(
    "/v1/linkedin/profile/fetch",
    {
      profileUrl: params.profileUrl,
      includeDebug: params.includeDebug ?? config.debug,
    },
    config,
    PersonEntitySchema,
  );
}

export async function fetchLinkedInCompany(
  params: LinkedInCompanyFetchParams,
  config: PluginConfig,
): Promise<CompanyEntity> {
  return postJson(
    "/v1/linkedin/company/fetch",
    {
      companyUrl: params.companyUrl,
      includeDebug: params.includeDebug ?? config.debug,
    },
    config,
    CompanyEntitySchema,
  );
}
