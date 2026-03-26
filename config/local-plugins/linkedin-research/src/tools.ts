import type { PluginConfig } from "./config.js";
import { analyzeEntityFit } from "./enrichment.js";
import { fetchLinkedInCompany, fetchLinkedInProfile } from "./http-client.js";
import {
  LinkedInCompanyFetchParamsSchema,
  LinkedInEntityEnrichParamsSchema,
  LinkedInProfileFetchParamsSchema,
  type LinkedInCompanyFetchParams,
  type LinkedInEntityEnrichParams,
  type LinkedInProfileFetchParams,
} from "./schemas.js";

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
};

type RegisteredTool = {
  name: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: any) => Promise<ToolResponse>;
};

type PluginApi = {
  registerTool: (tool: RegisteredTool, options?: { optional?: boolean }) => void;
};

function toolText(value: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function registerResearchTools(api: PluginApi, config: PluginConfig): void {
  api.registerTool({
    name: "linkedin_profile_fetch",
    description: "Fetch and normalize a LinkedIn personal profile via the external linkedin-research worker.",
    parameters: LinkedInProfileFetchParamsSchema,
    async execute(_toolCallId: string, params: LinkedInProfileFetchParams) {
      const result = await fetchLinkedInProfile(params, config);
      return toolText(result);
    },
  });

  api.registerTool({
    name: "linkedin_company_fetch",
    description: "Fetch and normalize a LinkedIn company page via the external linkedin-research worker.",
    parameters: LinkedInCompanyFetchParamsSchema,
    async execute(_toolCallId: string, params: LinkedInCompanyFetchParams) {
      const result = await fetchLinkedInCompany(params, config);
      return toolText(result);
    },
  });

  api.registerTool({
    name: "linkedin_entity_enrich",
    description: "Enrich and score a previously extracted LinkedIn person or company entity.",
    parameters: LinkedInEntityEnrichParamsSchema,
    async execute(_toolCallId: string, params: LinkedInEntityEnrichParams) {
      const result = analyzeEntityFit(params.rawEntity);
      return toolText(result);
    },
  });
}
