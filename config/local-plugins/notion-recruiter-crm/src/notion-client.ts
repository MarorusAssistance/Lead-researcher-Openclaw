import {
  APIErrorCode,
  Client,
  LogLevel,
  isFullPage,
  isNotionClientError,
} from "@notionhq/client";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  RECRUITER_PROPERTY_SPECS,
  type NotionSchemaObservation,
  type NotionSchemaProperty,
  type NotionSchemaSnapshot,
  type NotionSelectOption,
  type NotionStatusGroup,
  type PluginErrorCode,
  type RecruiterFieldKey,
  type RecruiterPropertyValues,
  type RecruiterRecord,
  type RecruiterSummary,
  type WritablePropertyType,
} from "./types.js";
import {
  RecruiterSchemaError,
  buildRecruiterProperties,
  normalizeLinkedInUrl,
  normalizeNotionId,
  normalizeRecruiterPage,
  toRecruiterSummary,
  toStatus,
  validateWritableInputAgainstSchema,
} from "./property-mappers.js";

type UnknownRecord = Record<string, unknown>;

type DueFollowupQuery = {
  beforeIso: string;
  statuses?: string[];
  limit: number;
};

type LoadNotionSchemaArgs = {
  notion: Client;
  databaseId: string;
  logger?: OpenClawPluginApi["logger"];
};

const SUPPORTED_PROPERTY_TYPES = new Set<WritablePropertyType>([
  "title",
  "rich_text",
  "url",
  "number",
  "checkbox",
  "date",
  "select",
  "status",
]);

const RECRUITER_FIELD_KEYS = Object.keys(RECRUITER_PROPERTY_SPECS) as RecruiterFieldKey[];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readPlainTextArray(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const content = value
    .map((entry) => {
      if (!isRecord(entry)) {
        return "";
      }

      if (typeof entry.plain_text === "string") {
        return entry.plain_text;
      }

      const text = entry.text;
      if (isRecord(text) && typeof text.content === "string") {
        return text.content;
      }

      return "";
    })
    .join("")
    .trim();

  return content.length > 0 ? content : null;
}

function extractOptions(source: unknown): NotionSelectOption[] | undefined {
  if (!isRecord(source) || !Array.isArray(source.options)) {
    return undefined;
  }

  const options = source.options.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      return [];
    }

    return [
      {
        id: entry.id,
        name: entry.name,
        color: typeof entry.color === "string" ? entry.color : undefined,
      },
    ];
  });

  return options.length > 0 ? options : undefined;
}

function extractStatusGroups(source: unknown): NotionStatusGroup[] | undefined {
  if (!isRecord(source) || !Array.isArray(source.groups)) {
    return undefined;
  }

  const groups = source.groups.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      return [];
    }

    const optionIds = Array.isArray(entry.option_ids)
      ? entry.option_ids.filter((item): item is string => typeof item === "string")
      : [];

    return [
      {
        id: entry.id,
        name: entry.name,
        color: typeof entry.color === "string" ? entry.color : undefined,
        optionIds,
      },
    ];
  });

  return groups.length > 0 ? groups : undefined;
}

function mapSchemaProperty(
  key: RecruiterFieldKey,
  notionName: string,
  property: UnknownRecord,
): {
  observation: NotionSchemaObservation;
  mapped?: NotionSchemaProperty;
} {
  const actualType = typeof property.type === "string" ? property.type : "unknown";
  const observation: NotionSchemaObservation = {
    key,
    notionName,
    id: typeof property.id === "string" ? property.id : notionName,
    actualType,
  };

  if (!SUPPORTED_PROPERTY_TYPES.has(actualType as WritablePropertyType)) {
    return { observation };
  }

  if (
    !RECRUITER_PROPERTY_SPECS[key].allowedTypes.includes(actualType as WritablePropertyType)
  ) {
    return { observation };
  }

  const mapped: NotionSchemaProperty = {
    key,
    notionName,
    id: observation.id,
    type: actualType as WritablePropertyType,
    actualType: actualType as WritablePropertyType,
  };

  if (mapped.type === "select") {
    mapped.options = extractOptions(property.select);
  }

  if (mapped.type === "status") {
    mapped.options = extractOptions(property.status);
    mapped.groups = extractStatusGroups(property.status);
  }

  return {
    observation,
    mapped,
  };
}

function pickSchemaCandidate(
  rawProperties: Record<string, UnknownRecord>,
  key: RecruiterFieldKey,
): { notionName: string; property: UnknownRecord } | null {
  const spec = RECRUITER_PROPERTY_SPECS[key];
  const exact = rawProperties[spec.notionName];
  if (exact) {
    return {
      notionName: spec.notionName,
      property: exact,
    };
  }

  if (!("fallbackToAnyTitle" in spec) || !spec.fallbackToAnyTitle) {
    return null;
  }

  for (const [name, property] of Object.entries(rawProperties)) {
    if (property.type === "title") {
      return {
        notionName: name,
        property,
      };
    }
  }

  return null;
}

function relevantPropertyTypes(schema: NotionSchemaSnapshot): Record<string, unknown> {
  return Object.fromEntries(
    RECRUITER_FIELD_KEYS.map((key) => {
      const observed = schema.observedByKey[key];
      return [
        key,
        observed
          ? {
              notionName: observed.notionName,
              actualType: observed.actualType,
            }
          : null,
      ];
    }),
  );
}

export async function loadNotionSchema({
  notion,
  databaseId,
  logger,
}: LoadNotionSchemaArgs): Promise<NotionSchemaSnapshot> {
  let resolvedDatabaseId = databaseId;
  let rawDatabase: UnknownRecord = {};
  let dataSourceId = databaseId;
  let sourceKind: "database" | "data_source" = "database";
  let dataSourceResponse: unknown;

  try {
    const databaseResponse = await notion.databases.retrieve({
      database_id: databaseId,
    });
    rawDatabase = isRecord(databaseResponse) ? databaseResponse : {};
    const dataSources = Array.isArray(rawDatabase.data_sources) ? rawDatabase.data_sources : [];
    const firstDataSource = dataSources.find(
      (entry): entry is UnknownRecord => isRecord(entry) && typeof entry.id === "string",
    );

    if (!firstDataSource || typeof firstDataSource.id !== "string") {
      throw new RecruiterSchemaError(
        "schema_mismatch",
        "The configured Notion database has no accessible data source. Share the database with the integration and verify databaseId.",
        {
          databaseId,
        },
      );
    }

    dataSourceId = normalizeNotionId(firstDataSource.id);
    dataSourceResponse = await notion.dataSources.retrieve({
      data_source_id: dataSourceId,
    });
  } catch (error: unknown) {
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ObjectNotFound) {
      throw error;
    }

    sourceKind = "data_source";
    dataSourceId = databaseId;
    dataSourceResponse = await notion.dataSources.retrieve({
      data_source_id: dataSourceId,
    });

    const rawDataSource = isRecord(dataSourceResponse) ? dataSourceResponse : {};
    const parent = isRecord(rawDataSource.parent) ? rawDataSource.parent : {};
    if (parent.type === "database_id" && typeof parent.database_id === "string") {
      resolvedDatabaseId = normalizeNotionId(parent.database_id);
    }
  }

  if (
    !isRecord(dataSourceResponse) ||
    typeof dataSourceResponse.id !== "string" ||
    !isRecord(dataSourceResponse.properties)
  ) {
    throw new RecruiterSchemaError(
      "schema_mismatch",
      "Notion returned a partial data source object; the CRM schema could not be inspected.",
      {
        databaseId,
        dataSourceId,
      },
    );
  }

  const rawProperties: Record<string, UnknownRecord> = Object.fromEntries(
    Object.entries(dataSourceResponse.properties).flatMap(([name, value]) =>
      isRecord(value) ? [[name, value]] : [],
    ),
  );
  const rawPropertyTypes = Object.fromEntries(
    Object.entries(rawProperties).map(([name, value]) => [
      name,
      typeof value.type === "string" ? value.type : "unknown",
    ]),
  );
  const propertiesByKey: Partial<Record<RecruiterFieldKey, NotionSchemaProperty>> = {};
  const observedByKey: Partial<Record<RecruiterFieldKey, NotionSchemaObservation>> = {};
  const propertiesByName: Record<string, NotionSchemaProperty> = {};

  for (const key of RECRUITER_FIELD_KEYS) {
    const candidate = pickSchemaCandidate(rawProperties, key);
    if (!candidate) {
      continue;
    }

    const { observation, mapped } = mapSchemaProperty(key, candidate.notionName, candidate.property);
    observedByKey[key] = observation;

    if (mapped) {
      propertiesByKey[key] = mapped;
      propertiesByName[mapped.notionName] = mapped;
    }
  }

  const snapshot: NotionSchemaSnapshot = {
    databaseId: resolvedDatabaseId,
    dataSourceId,
    databaseTitle: readPlainTextArray(rawDatabase.title),
    loadedAt: new Date().toISOString(),
    propertiesByKey,
    observedByKey,
    propertiesByName,
    rawPropertyTypes,
  };

  logger?.debug?.(
    `[notion-recruiter-crm] schema loaded ${JSON.stringify({
      databaseId: snapshot.databaseId,
      dataSourceId: snapshot.dataSourceId,
      sourceKind,
      loadedAt: snapshot.loadedAt,
      relevantProperties: relevantPropertyTypes(snapshot),
    })}`,
  );

  return snapshot;
}

export class RecruiterPluginError extends Error {
  constructor(
    public readonly code: PluginErrorCode,
    message: string,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecruiterPluginError";
  }
}

export class NotionRecruiterClient {
  private readonly databaseId: string;
  private schemaPromise?: Promise<NotionSchemaSnapshot>;

  constructor(
    databaseId: string,
    private readonly getApiKey: () => string | undefined,
    private readonly logger?: OpenClawPluginApi["logger"],
  ) {
    this.databaseId = this.normalizeIdentifier(databaseId, "databaseId");
  }

  async loadNotionSchema(refresh = false): Promise<NotionSchemaSnapshot> {
    if (!refresh && this.schemaPromise) {
      return this.schemaPromise;
    }

    const promise = (async () => {
      try {
        return await loadNotionSchema({
          notion: this.createClient(),
          databaseId: this.databaseId,
          logger: this.logger,
        });
      } catch (error: unknown) {
        throw this.mapNotionError(error);
      }
    })();

    this.schemaPromise = promise;

    try {
      return await promise;
    } catch (error) {
      if (this.schemaPromise === promise) {
        this.schemaPromise = undefined;
      }
      throw error;
    }
  }

  async findRecruiterByLinkedInUrl(linkedinUrl: string): Promise<RecruiterRecord | null> {
    const schema = await this.loadNotionSchema();
    const page = await this.findRecruiterPageByLinkedInUrl(linkedinUrl, schema);
    return page ? normalizeRecruiterPage(page, schema) : null;
  }

  async getRecruiterByPageId(pageId: string): Promise<RecruiterRecord> {
    const notion = this.createClient();
    const schema = await this.loadNotionSchema();
    const response = await this.runNotionCall(() =>
      notion.pages.retrieve({
        page_id: this.normalizeIdentifier(pageId, "pageId"),
      }),
    );
    const page = await this.ensureFullPage(response, notion);
    const pageRecord = isRecord(page) ? page : {};
    const parent = isRecord(pageRecord.parent) ? pageRecord.parent : {};
    const parentType = typeof parent.type === "string" ? parent.type : null;
    const parentId =
      parentType === "data_source_id" && typeof parent.data_source_id === "string"
        ? normalizeNotionId(parent.data_source_id)
        : parentType === "database_id" && typeof parent.database_id === "string"
          ? normalizeNotionId(parent.database_id)
          : null;

    if (parentId && parentId !== schema.dataSourceId && parentId !== schema.databaseId) {
      throw new RecruiterPluginError(
        "not_found",
        "The requested page does not belong to the configured Notion CRM data source.",
        404,
        {
          pageId: this.normalizeIdentifier(pageId, "pageId"),
          expectedDataSourceId: schema.dataSourceId,
          expectedDatabaseId: schema.databaseId,
        },
      );
    }

    return normalizeRecruiterPage(page, schema);
  }

  async getRecruiterByLinkedInOrThrow(linkedinUrl: string): Promise<RecruiterRecord> {
    const schema = await this.loadNotionSchema();
    const page = await this.findRecruiterPageByLinkedInUrl(linkedinUrl, schema);
    if (!page) {
      throw new RecruiterPluginError(
        "not_found",
        `No recruiter found for LinkedIn URL ${normalizeLinkedInUrl(linkedinUrl)}.`,
        404,
      );
    }

    return normalizeRecruiterPage(page, schema);
  }

  async upsertRecruiter(values: RecruiterPropertyValues): Promise<{
    action: "created" | "updated";
    recruiter: RecruiterRecord;
  }> {
    const linkedinUrl = values.linkedinUrl;
    if (!linkedinUrl) {
      throw new RecruiterPluginError("invalid_input", "linkedinUrl is required.", 400);
    }

    const schema = await this.loadNotionSchema(true);
    this.requireSchemaProperty(schema, "linkedinUrl", "upsert recruiters");
    const existingPage = await this.findRecruiterPageByLinkedInUrl(linkedinUrl, schema);

    if (existingPage) {
      validateWritableInputAgainstSchema(values, schema, { mode: "update" });
      const properties = buildRecruiterProperties(values, schema);
      this.debug("prepared Notion update payload", {
        action: "update",
        pageId: existingPage.id,
        properties,
      });
      const recruiter = await this.updateRecruiter(String(existingPage.id), properties, schema);
      return { action: "updated", recruiter };
    }

    validateWritableInputAgainstSchema(values, schema, {
      mode: "create",
      requireKeys: ["name", "linkedinUrl"],
    });
    const properties = buildRecruiterProperties(values, schema);
    this.debug("prepared Notion create payload", {
      action: "create",
      dataSourceId: schema.dataSourceId,
      properties,
    });
    const recruiter = await this.createRecruiter(properties, schema);
    return { action: "created", recruiter };
  }

  async updateRecruiterByLinkedIn(
    linkedinUrl: string,
    values: RecruiterPropertyValues,
  ): Promise<RecruiterRecord> {
    const schema = await this.loadNotionSchema(true);
    const existingPage = await this.findRecruiterPageByLinkedInUrl(linkedinUrl, schema);

    if (!existingPage) {
      throw new RecruiterPluginError(
        "not_found",
        `No recruiter found for LinkedIn URL ${normalizeLinkedInUrl(linkedinUrl)}.`,
        404,
      );
    }

    validateWritableInputAgainstSchema(values, schema, { mode: "update" });
    const properties = buildRecruiterProperties(values, schema);

    if (Object.keys(properties).length === 0) {
      throw new RecruiterPluginError(
        "invalid_input",
        "At least one updatable field must be provided.",
        400,
      );
    }

    this.debug("prepared Notion update payload", {
      action: "update",
      pageId: existingPage.id,
      properties,
    });

    return this.updateRecruiter(String(existingPage.id), properties, schema);
  }

  async queryDueFollowups(params: DueFollowupQuery): Promise<RecruiterSummary[]> {
    const notion = this.createClient();
    const schema = await this.loadNotionSchema();
    const nextActionProperty = this.requireSchemaProperty(
      schema,
      "nextActionAt",
      "query due follow-ups",
    );
    const filters: Array<Record<string, unknown>> = [
      {
        property: nextActionProperty.notionName,
        date: {
          on_or_before: params.beforeIso,
        },
      },
    ];

    if (params.statuses && params.statuses.length > 0) {
      const statusProperty = this.requireSchemaProperty(schema, "status", "filter by status");
      if (statusProperty.type === "status") {
        for (const status of params.statuses) {
          toStatus(status, {
            options: statusProperty.options,
            groups: statusProperty.groups,
          });
        }
      }

      filters.push({
        or: params.statuses.map((status) => ({
          property: statusProperty.notionName,
          [statusProperty.type === "status" ? "status" : "select"]: { equals: status },
        })),
      });
    }

    this.debug("querying due follow-ups", {
      beforeIso: params.beforeIso,
      limit: params.limit,
      filters,
      sorts: [
        {
          property: nextActionProperty.notionName,
          direction: "ascending",
        },
      ],
    });

    const response = await this.runNotionCall(() =>
      notion.dataSources.query({
        data_source_id: schema.dataSourceId,
        filter: filters.length === 1 ? (filters[0] as Parameters<typeof notion.dataSources.query>[0]["filter"]) : (({ and: filters } as unknown) as Parameters<typeof notion.dataSources.query>[0]["filter"]),
        sorts: [
          {
            property: nextActionProperty.notionName,
            direction: "ascending",
          },
        ],
        page_size: params.limit,
      }),
    );

    const items: RecruiterSummary[] = [];
    for (const result of response.results) {
      if (!isFullPage(result)) {
        continue;
      }

      items.push(toRecruiterSummary(normalizeRecruiterPage(result, schema)));
    }

    return items;
  }

  private async createRecruiter(
    properties: Record<string, unknown>,
    schema: NotionSchemaSnapshot,
  ): Promise<RecruiterRecord> {
    const notion = this.createClient();

    const response = await this.runNotionCall(() =>
      notion.pages.create({
        parent: {
          data_source_id: schema.dataSourceId,
        },
        properties: properties as Parameters<typeof notion.pages.create>[0]["properties"],
      }),
    );

    const page = await this.ensureFullPage(response, notion);
    return normalizeRecruiterPage(page, schema);
  }

  private async updateRecruiter(
    pageId: string,
    properties: Record<string, unknown>,
    schema: NotionSchemaSnapshot,
  ): Promise<RecruiterRecord> {
    const notion = this.createClient();
    const response = await this.runNotionCall(() =>
      notion.pages.update({
        page_id: this.normalizeIdentifier(pageId, "pageId"),
        properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
      }),
    );

    const page = await this.ensureFullPage(response, notion);
    return normalizeRecruiterPage(page, schema);
  }

  private async findRecruiterPageByLinkedInUrl(
    linkedinUrl: string,
    schema: NotionSchemaSnapshot,
  ): Promise<UnknownRecord | null> {
    const notion = this.createClient();
    const linkedinProperty = this.requireSchemaProperty(
      schema,
      "linkedinUrl",
      "find recruiters by LinkedIn URL",
    );
    const normalized = normalizeLinkedInUrl(linkedinUrl);
    const candidates = Array.from(new Set([normalized, linkedinUrl.trim()]));

    for (const candidate of candidates) {
      this.debug("querying recruiter by LinkedIn URL", {
        property: linkedinProperty.notionName,
        candidate,
      });

      const response = await this.runNotionCall(() =>
        notion.dataSources.query({
          data_source_id: schema.dataSourceId,
          filter: {
            property: linkedinProperty.notionName,
            url: {
              equals: candidate,
            },
          },
          page_size: 1,
        }),
      );

      for (const result of response.results) {
        if (isFullPage(result)) {
          return result as UnknownRecord;
        }
      }
    }

    return null;
  }

  private createClient(): Client {
    const apiKey = this.getApiKey()?.trim();
    if (!apiKey) {
      throw new RecruiterPluginError(
        "missing_env",
        "Environment variable NOTION_API_KEY is missing. Export it before using this plugin.",
        401,
      );
    }

    return new Client({
      auth: apiKey,
      logLevel: LogLevel.WARN,
      logger: (level, message) => {
        const formatted = `[notion:${String(level).toLowerCase()}] ${message}`;
        if (level === LogLevel.ERROR) {
          this.logger?.error(formatted);
          return;
        }

        if (level === LogLevel.WARN) {
          this.logger?.warn(formatted);
          return;
        }

        this.logger?.debug?.(formatted);
      },
    });
  }

  private requireSchemaProperty(
    schema: NotionSchemaSnapshot,
    key: RecruiterFieldKey,
    purpose: string,
  ): NotionSchemaProperty {
    const property = schema.propertiesByKey[key];
    if (property) {
      return property;
    }

    const spec = RECRUITER_PROPERTY_SPECS[key];
    const observed = schema.observedByKey[key];
    if (observed) {
      throw new RecruiterPluginError(
        "schema_mismatch",
        `Notion property "${observed.notionName}" has type "${observed.actualType}", but ${purpose} requires ${spec.allowedTypes.join(" or ")}.`,
        400,
        {
          databaseId: schema.databaseId,
          dataSourceId: schema.dataSourceId,
          property: observed.notionName,
          actualType: observed.actualType,
          expectedTypes: spec.allowedTypes,
        },
      );
    }

    throw new RecruiterPluginError(
      "schema_mismatch",
      `Notion property "${spec.notionName}" is missing, but ${purpose} requires it.`,
      400,
      {
        databaseId: schema.databaseId,
        dataSourceId: schema.dataSourceId,
        property: spec.notionName,
        expectedTypes: spec.allowedTypes,
        availableProperties: schema.rawPropertyTypes,
      },
    );
  }

  private async ensureFullPage(response: unknown, notion: Client): Promise<unknown> {
    if (isRecord(response) && isFullPage(response as Parameters<typeof isFullPage>[0])) {
      return response;
    }

    const pageId = isRecord(response) && typeof response.id === "string" ? response.id : null;
    if (!pageId) {
      throw new RecruiterPluginError(
        "bad_response",
        "Notion did not return a usable page object.",
        502,
      );
    }

    const page = await this.runNotionCall(() =>
      notion.pages.retrieve({
        page_id: pageId,
      }),
    );

    if (!isFullPage(page)) {
      throw new RecruiterPluginError(
        "bad_response",
        "Notion did not return a full page object after retrieval.",
        502,
        { pageId },
      );
    }

    return page;
  }

  private async runNotionCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      throw this.mapNotionError(error);
    }
  }

  private mapNotionError(error: unknown): RecruiterPluginError {
    if (error instanceof RecruiterPluginError) {
      return error;
    }

    if (error instanceof RecruiterSchemaError) {
      return new RecruiterPluginError(
        error.code,
        error.message,
        error.code === "invalid_input" ? 400 : 422,
        error.details,
      );
    }

    if (isNotionClientError(error)) {
      switch (error.code) {
        case APIErrorCode.Unauthorized:
          return new RecruiterPluginError(
            "unauthorized",
            "Notion rejected NOTION_API_KEY. Verify the integration token.",
            401,
          );
        case APIErrorCode.RestrictedResource:
          return new RecruiterPluginError(
            "forbidden",
            "The Notion integration does not have permission to access this resource. Share the database with the integration and confirm it has read/write capabilities.",
            403,
          );
        case APIErrorCode.ObjectNotFound:
          return new RecruiterPluginError(
            "not_found",
            "The requested Notion resource was not found, or the integration cannot access it. Confirm databaseId/pageId and share the database with the integration.",
            404,
          );
        case APIErrorCode.RateLimited:
          return new RecruiterPluginError(
            "rate_limited",
            "Notion rate-limited the request. Retry in a moment.",
            429,
          );
        case APIErrorCode.ValidationError:
          return new RecruiterPluginError(
            "bad_request",
            `Notion rejected the request payload: ${error.message}`,
            400,
          );
        default:
          return new RecruiterPluginError(
            "unknown",
            `Unexpected Notion error: ${error.message}`,
            (error as { status?: number }).status,
          );
      }
    }

    if (error instanceof Error) {
      return new RecruiterPluginError("unknown", error.message);
    }

    return new RecruiterPluginError("unknown", String(error));
  }

  private normalizeIdentifier(value: string, label: string): string {
    try {
      return normalizeNotionId(value);
    } catch (error: unknown) {
      throw new RecruiterPluginError(
        "invalid_input",
        error instanceof Error ? `${label}: ${error.message}` : `${label} is invalid.`,
        400,
      );
    }
  }

  private debug(message: string, details?: Record<string, unknown>): void {
    if (!this.logger?.debug) {
      return;
    }

    if (!details) {
      this.logger.debug(`[notion-recruiter-crm] ${message}`);
      return;
    }

    this.logger.debug(`[notion-recruiter-crm] ${message} ${JSON.stringify(details)}`);
  }
}
