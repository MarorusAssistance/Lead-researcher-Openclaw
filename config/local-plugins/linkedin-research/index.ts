import { getPluginConfig } from "./src/config.js";
import { registerResearchTools } from "./src/tools.js";

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
  config: unknown;
  registerTool: (tool: RegisteredTool, options?: { optional?: boolean }) => void;
};

export default {
  id: "linkedin-research",
  name: "LinkedIn Research",
  description: "Research LinkedIn profiles and company pages via an external worker",
  register(api: PluginApi) {
    const config = getPluginConfig(api.config);
    registerResearchTools(api, config);
  },
};