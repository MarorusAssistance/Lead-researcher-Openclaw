const PLUGIN_ID = "linkedin-research";

export type PluginConfig = {
  workerBaseUrl: string;
  requestTimeoutMs: number;
  debug: boolean;
  workerApiKey?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.trunc(value);
  return rounded >= 1000 ? rounded : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNestedPluginConfig(rawConfig: Record<string, unknown>): Record<string, unknown> | undefined {
  const plugins = rawConfig.plugins;
  if (!isRecord(plugins)) return undefined;

  const entries = plugins.entries;
  if (!isRecord(entries)) return undefined;

  const pluginEntry = entries[PLUGIN_ID];
  if (!isRecord(pluginEntry)) return undefined;

  const nestedConfig = pluginEntry.config;
  if (!isRecord(nestedConfig)) return undefined;

  return nestedConfig;
}

function unwrapConfig(rawConfig: unknown): Record<string, unknown> | undefined {
  if (!isRecord(rawConfig)) return undefined;

  // Caso 1: ya nos llega la config directa del plugin
  if ("workerBaseUrl" in rawConfig || "requestTimeoutMs" in rawConfig || "debug" in rawConfig) {
    return rawConfig;
  }

  // Caso 2: nos llega algo como { enabled, config: { ... } }
  const directNested = rawConfig.config;
  if (isRecord(directNested)) {
    if (
      "workerBaseUrl" in directNested ||
      "requestTimeoutMs" in directNested ||
      "debug" in directNested
    ) {
      return directNested;
    }
  }

  // Caso 3: nos llega la config global entera de OpenClaw
  const globalNested = getNestedPluginConfig(rawConfig);
  if (globalNested) {
    return globalNested;
  }

  return rawConfig;
}

export function getPluginConfig(rawConfig: unknown): PluginConfig {
  const cfg = unwrapConfig(rawConfig);

  if (!cfg) {
    throw new Error(
      `linkedin-research plugin config is missing or invalid for plugin "${PLUGIN_ID}"`,
    );
  }

  const workerBaseUrl = asTrimmedString(cfg.workerBaseUrl);
  if (!workerBaseUrl) {
    const keys = Object.keys(cfg).join(", ");
    throw new Error(
      `linkedin-research requires config.workerBaseUrl in plugins.entries["${PLUGIN_ID}"].config (received keys: ${keys || "none"})`,
    );
  }

  return {
    workerBaseUrl: workerBaseUrl.replace(/\/+$/, ""),
    requestTimeoutMs: asPositiveInteger(cfg.requestTimeoutMs, 30000),
    debug: asBoolean(cfg.debug, false),
    workerApiKey: asTrimmedString(cfg.workerApiKey),
  };
}