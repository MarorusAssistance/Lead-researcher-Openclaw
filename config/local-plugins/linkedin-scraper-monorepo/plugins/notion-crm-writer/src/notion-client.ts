import { Client } from "@notionhq/client";
import {
  AppError,
  CrmUpsertResultSchema,
  isRecord,
  normalizeHttpUrl,
  serializeError,
  type CrmUpsertInput,
  type CrmUpsertResult,
  type MinimalLogger,
} from "@linkedin-research/shared";
import {
  DEFAULT_PROPERTY_MAP,
  NotionCrmWriterPluginConfigSchema,
  resolvePropertyName,
  type NotionCrmWriterPluginConfig,
  type PropertyKey,
} from "./config.js";
import { describeWrittenProperties, mapCrmInputToFieldValues, type CrmFieldValues } from "./mapper.js";

type UnknownRecord = Record<string, unknown>;

type WritablePropertyType =
  | "title"
  | "rich_text"
  | "url"
  | "number"
  | "checkbox"
  | "date"
  | "select"
  | "status";

type SelectOption = {
  id: string;
  name: string;
};

type SchemaProperty = {
  key: PropertyKey;
  notionName: string;
  type: WritablePropertyType;
  options?: SelectOption[];
};

type SchemaSnapshot = {
  databaseId?: string;
  dataSourceId: string;
  propertiesByKey: Partial<Record<PropertyKey, SchemaProperty>>;
  rawPropertyTypes: Record<string, unknown>;
};

type NotionApiLike = {
  databases: {
    retrieve: (args: Record<string, unknown>) => Promise<unknown>;
  };
  dataSources: {
    retrieve: (args: Record<string, unknown>) => Promise<unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
  };
  pages: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

const UUID_PATTERN =
  /[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

function splitRichText(value: string): Array<{ type: "text"; text: { content: string } }> {
  const normalized = value.replace(/\r\n/g, "\n");
  const result: Array<{ type: "text"; text: { content: string } }> = [];

  for (let index = 0; index < normalized.length; index += 1900) {
    result.push({
      type: "text",
      text: {
        content: normalized.slice(index, index + 1900),
      },
    });
  }

  return result;
}

function normalizeNotionId(input: string): string {
  const match = input.match(UUID_PATTERN);
  const candidate = match?.at(-1) ?? input.trim();
  const compact = candidate.replace(/-/g, "");

  if (!/^[0-9a-fA-F]{32}$/.test(compact)) {
    throw new AppError("invalid_input", `Invalid Notion ID: ${input}`, {
      status: 400,
    });
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20, 32),
  ].join("-").toLowerCase();
}

function extractOptions(value: unknown): SelectOption[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.options)) {
    return undefined;
  }

  return value.options.flatMap((option) => {
    if (!isRecord(option) || typeof option.id !== "string" || typeof option.name !== "string") {
      return [];
    }

    return [{ id: option.id, name: option.name }];
  });
}

function toSelectLikeValue(value: string, options?: SelectOption[]): { id: string } | { name: string } {
  const trimmed = value.trim();
  const match = options?.find((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  return match ? { id: match.id } : { name: trimmed };
}

function ensureConfiguredApiKey(getApiKey: () => string | undefined): string {
  const apiKey = getApiKey()?.trim();
  if (!apiKey) {
    throw new AppError("notion_error", "NOTION_API_KEY is missing.", {
      status: 401,
    });
  }

  return apiKey;
}

function makeNotionApi(
  config: NotionCrmWriterPluginConfig,
  getApiKey: () => string | undefined,
): NotionApiLike {
  return new Client({
    auth: ensureConfiguredApiKey(getApiKey),
    notionVersion: config.notionVersion,
  }) as unknown as NotionApiLike;
}

function buildRawPropertyTypes(rawProperties: Record<string, UnknownRecord>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rawProperties).map(([name, property]) => [name, property.type ?? "unknown"]),
  );
}

function buildSchemaSnapshot(
  config: NotionCrmWriterPluginConfig,
  rawProperties: Record<string, UnknownRecord>,
  ids: { databaseId?: string; dataSourceId: string },
): SchemaSnapshot {
  const propertiesByKey: Partial<Record<PropertyKey, SchemaProperty>> = {};

  for (const [key, defaultName] of Object.entries(DEFAULT_PROPERTY_MAP) as Array<[PropertyKey, string]>) {
    const notionName = resolvePropertyName(config, key);
    const rawProperty = rawProperties[notionName];
    if (!rawProperty || typeof rawProperty.type !== "string") {
      continue;
    }

    const type = rawProperty.type as WritablePropertyType;
    if (!["title", "rich_text", "url", "number", "checkbox", "date", "select", "status"].includes(type)) {
      continue;
    }

    propertiesByKey[key] = {
      key,
      notionName: notionName ?? defaultName,
      type,
      options:
        type === "select"
          ? extractOptions(rawProperty.select)
          : type === "status"
            ? extractOptions(rawProperty.status)
            : undefined,
    };
  }

  return {
    databaseId: ids.databaseId,
    dataSourceId: ids.dataSourceId,
    propertiesByKey,
    rawPropertyTypes: buildRawPropertyTypes(rawProperties),
  };
}

function getPageId(page: unknown): string {
  if (!isRecord(page) || typeof page.id !== "string") {
    throw new AppError("notion_error", "Notion did not return a valid page id.", {
      status: 502,
    });
  }

  return page.id;
}

export class NotionCrmWriterClient {
  private readonly config: NotionCrmWriterPluginConfig;

  private readonly notion: NotionApiLike;

  private schemaPromise: Promise<SchemaSnapshot> | null = null;

  constructor(options: {
    config: unknown;
    getApiKey?: () => string | undefined;
    logger?: MinimalLogger;
    notionApi?: NotionApiLike;
  }) {
    this.config = NotionCrmWriterPluginConfigSchema.parse(options.config);
    this.notion =
      options.notionApi ?? makeNotionApi(this.config, options.getApiKey ?? (() => process.env.NOTION_API_KEY));
    this.logger = options.logger;
  }

  private readonly logger?: MinimalLogger;

  private async loadSchema(): Promise<SchemaSnapshot> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.resolveSchema();
    }

    return this.schemaPromise;
  }

  private async resolveSchema(): Promise<SchemaSnapshot> {
    if (this.config.dataSourceId) {
      const dataSourceId = normalizeNotionId(this.config.dataSourceId);
      const response = (await this.notion.dataSources.retrieve({
        data_source_id: dataSourceId,
      })) as UnknownRecord;
      const properties = isRecord(response.properties)
        ? (response.properties as Record<string, UnknownRecord>)
        : {};

      return buildSchemaSnapshot(this.config, properties, { dataSourceId });
    }

    const databaseId = normalizeNotionId(this.config.databaseId ?? "");
    const database = (await this.notion.databases.retrieve({
      database_id: databaseId,
    })) as UnknownRecord;
    const dataSources = Array.isArray(database.data_sources) ? database.data_sources : [];
    const first = dataSources.find(
      (entry): entry is UnknownRecord => isRecord(entry) && typeof entry.id === "string",
    );

    if (!first || typeof first.id !== "string") {
      throw new AppError("schema_mismatch", "No Notion data source was found for the configured database.", {
        status: 400,
        details: {
          databaseId,
        },
      });
    }

    const dataSourceId = normalizeNotionId(first.id);
    const response = (await this.notion.dataSources.retrieve({
      data_source_id: dataSourceId,
    })) as UnknownRecord;
    const properties = isRecord(response.properties)
      ? (response.properties as Record<string, UnknownRecord>)
      : {};

    return buildSchemaSnapshot(this.config, properties, { databaseId, dataSourceId });
  }

  private buildPropertiesPayload(
    values: CrmFieldValues,
    schema: SchemaSnapshot,
    mode: "create" | "update",
  ): { properties: Record<string, unknown>; writtenProperties: string[] } {
    const properties: Record<string, unknown> = {};
    const writtenProperties: string[] = [];

    for (const [key, value] of Object.entries(values) as Array<[PropertyKey, CrmFieldValues[PropertyKey]]>) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      const property = schema.propertiesByKey[key];
      if (!property) {
        if (this.config.optionalFields.includes(key)) {
          continue;
        }

        throw new AppError(
          "schema_mismatch",
          `The Notion CRM is missing the property "${resolvePropertyName(this.config, key)}".`,
          {
            status: 400,
            details: {
              key,
              rawPropertyTypes: schema.rawPropertyTypes,
            },
          },
        );
      }

      switch (property.type) {
        case "title": {
          properties[property.notionName] = {
            title: splitRichText(String(value)),
          };
          break;
        }
        case "rich_text": {
          properties[property.notionName] = {
            rich_text: splitRichText(String(value)),
          };
          break;
        }
        case "url": {
          properties[property.notionName] = {
            url: normalizeHttpUrl(String(value), property.notionName),
          };
          break;
        }
        case "number": {
          properties[property.notionName] = {
            number: Number(value),
          };
          break;
        }
        case "checkbox": {
          properties[property.notionName] = {
            checkbox: Boolean(value),
          };
          break;
        }
        case "date": {
          properties[property.notionName] = {
            date: {
              start:
                value instanceof Date
                  ? value.toISOString()
                  : new Date(String(value)).toISOString(),
            },
          };
          break;
        }
        case "select": {
          properties[property.notionName] = {
            select: toSelectLikeValue(String(value), property.options),
          };
          break;
        }
        case "status": {
          properties[property.notionName] = {
            status: toSelectLikeValue(String(value), property.options),
          };
          break;
        }
      }

      writtenProperties.push(property.notionName);
    }

    if (mode === "create") {
      if (!properties[resolvePropertyName(this.config, "name")]) {
        throw new AppError("invalid_input", "Cannot create a CRM entity without a Name value.", {
          status: 400,
        });
      }

      if (!properties[resolvePropertyName(this.config, "linkedinUrl")]) {
        throw new AppError("invalid_input", "Cannot create a CRM entity without a LinkedIn URL.", {
          status: 400,
        });
      }
    }

    return {
      properties,
      writtenProperties,
    };
  }

  private async findExistingPageId(schema: SchemaSnapshot, linkedinUrl: string): Promise<string | null> {
    const property = schema.propertiesByKey.linkedinUrl;
    if (!property) {
      throw new AppError("schema_mismatch", "The Notion CRM is missing the LinkedIn URL property.", {
        status: 400,
      });
    }

    const response = (await this.notion.dataSources.query({
      data_source_id: schema.dataSourceId,
      filter: {
        property: property.notionName,
        url: {
          equals: linkedinUrl,
        },
      },
      page_size: 1,
    })) as UnknownRecord;

    const results = Array.isArray(response.results) ? response.results : [];
    const first = results[0];
    if (!isRecord(first) || typeof first.id !== "string") {
      return null;
    }

    return first.id;
  }

  async upsertContactableEntity(input: unknown): Promise<CrmUpsertResult> {
    try {
      const values = mapCrmInputToFieldValues(input, this.config);
      const schema = await this.loadSchema();
      const linkedinUrl = String(values.linkedinUrl);
      const existingPageId = await this.findExistingPageId(schema, linkedinUrl);
      const mode = existingPageId ? "update" : "create";
      const payload = this.buildPropertiesPayload(values, schema, mode);

      const page =
        mode === "create"
          ? await this.notion.pages.create({
              parent: {
                data_source_id: schema.dataSourceId,
              },
              properties: payload.properties,
            })
          : await this.notion.pages.update({
              page_id: existingPageId,
              properties: payload.properties,
            });

      const result = CrmUpsertResultSchema.parse({
        pageId: getPageId(page),
        operation: mode === "create" ? "created" : "updated",
        entityType: (input as CrmUpsertInput).entityType,
        linkedinUrl,
        writtenProperties: payload.writtenProperties,
      });

      this.logger?.info?.(
        JSON.stringify({
          component: "notion-crm-writer",
          message: "crm_upsert_contactable_entity_completed",
          operation: result.operation,
          pageId: result.pageId,
          writtenProperties: result.writtenProperties,
        }),
      );

      return result;
    } catch (error: unknown) {
      this.logger?.warn?.(
        JSON.stringify({
          component: "notion-crm-writer",
          message: "crm_upsert_contactable_entity_failed",
          error: serializeError(error),
        }),
      );
      throw error;
    }
  }
}
