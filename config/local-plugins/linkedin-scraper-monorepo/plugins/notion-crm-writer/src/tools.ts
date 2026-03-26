import {
  AppError,
  CrmUpsertInputSchema,
  serializeError,
} from "@linkedin-research/shared";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { NotionCrmWriterPluginConfigSchema } from "./config.js";
import { NotionCrmWriterClient } from "./notion-client.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

function toToolResult(data: Record<string, unknown>): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    details: data,
  };
}

function toErrorToolResult(error: unknown): ToolResult {
  const serialized = serializeError(error);
  return {
    content: [
      {
        type: "text",
        text: serialized.message,
      },
    ],
    details: {
      error: serialized,
    },
  };
}

export function registerNotionCrmWriterTools(api: OpenClawPluginApi): void {
  const config = NotionCrmWriterPluginConfigSchema.parse(api.pluginConfig ?? {});
  const client = new NotionCrmWriterClient({
    config,
    logger: api.logger,
  });

  api.registerTool({
    name: "crm_upsert_contactable_entity",
    label: "CRM Upsert Contactable Entity",
    description: "Create or update a contactable person or company entity in the configured Notion CRM.",
    parameters: zodToJsonSchema(CrmUpsertInputSchema, {
      name: "CrmUpsertInput",
      target: "jsonSchema7",
      $refStrategy: "none",
    }),
    async execute(_toolCallId, rawParams) {
      try {
        const input = CrmUpsertInputSchema.parse(rawParams);
        const result = await client.upsertContactableEntity(input);
        return toToolResult(result);
      } catch (error: unknown) {
        const wrapped =
          error instanceof AppError
            ? error
            : error instanceof ZodError
              ? new AppError("invalid_input", error.message, {
                  status: 400,
                  details: {
                    issues: error.flatten(),
                  },
                })
            : new AppError("validation_error", error instanceof Error ? error.message : String(error), {
                status: 400,
              });
        return toErrorToolResult(wrapped);
      }
    },
  });
}
