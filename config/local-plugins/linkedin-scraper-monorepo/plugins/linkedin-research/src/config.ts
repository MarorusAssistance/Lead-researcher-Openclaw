import { z } from "zod";

export const LinkedInResearchPluginConfigSchema = z
  .object({
    workerBaseUrl: z.string().min(1),
    requestTimeoutMs: z.number().int().positive().default(30000),
    debug: z.boolean().default(false),
  })
  .strict();

export type LinkedInResearchPluginConfig = z.infer<typeof LinkedInResearchPluginConfigSchema>;
