declare module "openclaw/plugin-sdk/core" {
  export type PluginLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  export type OpenClawPluginApi = {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    config: Record<string, unknown>;
    pluginConfig?: Record<string, unknown>;
    runtime: unknown;
    logger: PluginLogger;
    registerTool: (
      tool: {
        name: string;
        label?: string;
        description: string;
        parameters: unknown;
        execute: (toolCallId: string, params: unknown) => Promise<unknown> | unknown;
      },
      opts?: {
        name?: string;
        names?: string[];
        optional?: boolean;
      },
    ) => void;
  };
}
