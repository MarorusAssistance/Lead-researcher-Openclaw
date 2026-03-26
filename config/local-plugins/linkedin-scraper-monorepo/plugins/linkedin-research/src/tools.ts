import {
  AppError,
  LinkedinCompanyFetchInputSchema,
  LinkedinEntityEnrichInputSchema,
  LinkedinProfileFetchInputSchema,
  analyzeEntityFit,
  normalizeLinkedInCompanyUrl,
  normalizeLinkedInProfileUrl,
  serializeError,
} from "@linkedin-research/shared";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { LinkedInResearchPluginConfigSchema } from "./config.js";
import { LinkedInResearchWorkerClient } from "./http-client.js";

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

function toParameters(schema: Parameters<typeof zodToJsonSchema>[0], name: string): unknown {
  return zodToJsonSchema(schema, {
    name,
    target: "jsonSchema7",
    $refStrategy: "none",
  });
}

export function registerLinkedInResearchTools(api: OpenClawPluginApi): void {
  const config = LinkedInResearchPluginConfigSchema.parse(api.pluginConfig ?? {});
  const client = new LinkedInResearchWorkerClient(config, api.logger);

  api.registerTool({
    name: "linkedin_profile_fetch",
    label: "LinkedIn Profile Fetch",
    description: "Fetch a LinkedIn personal profile through the external research worker.",
    parameters: toParameters(LinkedinProfileFetchInputSchema, "LinkedinProfileFetchInput"),
    async execute(_toolCallId, rawParams) {
      try {
        const params = LinkedinProfileFetchInputSchema.parse(rawParams);
        const profileUrl = normalizeLinkedInProfileUrl(params.profileUrl);
        const data = await client.fetchProfile(profileUrl);
        return toToolResult(data);
      } catch (error: unknown) {
        return toErrorToolResult(
          error instanceof ZodError
            ? new AppError("invalid_input", error.message, {
                status: 400,
                details: {
                  issues: error.flatten(),
                },
              })
            : error,
        );
      }
    },
  });

  api.registerTool({
    name: "linkedin_company_fetch",
    label: "LinkedIn Company Fetch",
    description: "Fetch a LinkedIn company page through the external research worker.",
    parameters: toParameters(LinkedinCompanyFetchInputSchema, "LinkedinCompanyFetchInput"),
    async execute(_toolCallId, rawParams) {
      try {
        const params = LinkedinCompanyFetchInputSchema.parse(rawParams);
        const companyUrl = normalizeLinkedInCompanyUrl(params.companyUrl);
        const data = await client.fetchCompany(companyUrl);
        return toToolResult(data);
      } catch (error: unknown) {
        return toErrorToolResult(
          error instanceof ZodError
            ? new AppError("invalid_input", error.message, {
                status: 400,
                details: {
                  issues: error.flatten(),
                },
              })
            : error,
        );
      }
    },
  });

  api.registerTool({
    name: "linkedin_entity_enrich",
    label: "LinkedIn Entity Enrich",
    description: "Score and enrich a previously extracted LinkedIn person or company entity.",
    parameters: toParameters(LinkedinEntityEnrichInputSchema, "LinkedinEntityEnrichInput"),
    async execute(_toolCallId, rawParams) {
      try {
        const params = LinkedinEntityEnrichInputSchema.parse(rawParams);
        const fitAnalysis = analyzeEntityFit(params.rawEntity);
        return toToolResult(fitAnalysis);
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
