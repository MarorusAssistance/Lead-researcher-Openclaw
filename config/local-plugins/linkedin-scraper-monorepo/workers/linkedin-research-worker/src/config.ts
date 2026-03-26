import { z } from "zod";

const WorkerEnvSchema = z
  .object({
    LINKEDIN_WORKER_HOST: z.string().min(1).default("0.0.0.0"),
    LINKEDIN_WORKER_PORT: z.coerce.number().int().positive().default(8787),
    LINKEDIN_STORAGE_STATE_PATH: z.string().min(1),
    LINKEDIN_USER_AGENT: z.string().min(1).optional(),
    LINKEDIN_WORKER_PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    LINKEDIN_WORKER_RETRIES: z.coerce.number().int().min(0).default(2),
    LINKEDIN_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
    LINKEDIN_WORKER_DEBUG: z.coerce.boolean().default(false),
    LINKEDIN_WORKER_DEBUG_ON_ERROR: z.coerce.boolean().default(true),
    LINKEDIN_DEBUG_ARTIFACTS_DIR: z.string().min(1).default("./debug-artifacts"),
  })
  .strict();

export type WorkerConfig = {
  host: string;
  port: number;
  storageStatePath: string;
  userAgent?: string;
  pageTimeoutMs: number;
  retries: number;
  concurrency: number;
  debug: boolean;
  debugOnError: boolean;
  debugArtifactsDir: string;
};

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = WorkerEnvSchema.parse(env);

  return {
    host: parsed.LINKEDIN_WORKER_HOST,
    port: parsed.LINKEDIN_WORKER_PORT,
    storageStatePath: parsed.LINKEDIN_STORAGE_STATE_PATH,
    userAgent: parsed.LINKEDIN_USER_AGENT,
    pageTimeoutMs: parsed.LINKEDIN_WORKER_PAGE_TIMEOUT_MS,
    retries: parsed.LINKEDIN_WORKER_RETRIES,
    concurrency: parsed.LINKEDIN_WORKER_CONCURRENCY,
    debug: parsed.LINKEDIN_WORKER_DEBUG,
    debugOnError: parsed.LINKEDIN_WORKER_DEBUG_ON_ERROR,
    debugArtifactsDir: parsed.LINKEDIN_DEBUG_ARTIFACTS_DIR,
  };
}
