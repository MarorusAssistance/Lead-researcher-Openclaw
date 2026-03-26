import Fastify from "fastify";
import {
  AppError,
  LinkedinCompanyFetchInputSchema,
  LinkedinProfileFetchInputSchema,
  serializeError,
  toAppError,
} from "@linkedin-research/shared";
import type { FastifyBaseLogger } from "fastify";
import { ZodError } from "zod";
import { loadWorkerConfig, type WorkerConfig } from "../config.js";
import { PlaywrightSessionFactory } from "../session/browser-session.js";
import { LinkedInResearchService } from "../service.js";
import type { BrowserSessionFactory } from "../types.js";

type BuildWorkerAppOptions = {
  config?: WorkerConfig;
  browserFactory?: BrowserSessionFactory;
  logger?: FastifyBaseLogger;
};

function buildErrorMeta(error: unknown, requestId: string, startedAt: number) {
  const appError = toAppError(error);
  const attempts =
    typeof appError.details?.attempts === "number" && Number.isFinite(appError.details.attempts)
      ? appError.details.attempts
      : 1;

  return {
    requestId,
    durationMs: Date.now() - startedAt,
    attempts,
    debugArtifacts:
      appError.details?.debugArtifacts && typeof appError.details.debugArtifacts === "object"
        ? (appError.details.debugArtifacts as Record<string, unknown>)
        : undefined,
  };
}

export function buildWorkerApp(options: BuildWorkerAppOptions = {}) {
  const config = options.config ?? loadWorkerConfig();
  const app = Fastify({
    logger: options.logger ? false : true,
    loggerInstance: options.logger,
  });
  const browserFactory =
    options.browserFactory ??
    new PlaywrightSessionFactory({
      storageStatePath: config.storageStatePath,
      userAgent: config.userAgent,
      pageTimeoutMs: config.pageTimeoutMs,
    });
  const service = new LinkedInResearchService(config, browserFactory, app.log);

  app.get("/healthz", async () => ({
    ok: true,
    status: "healthy",
  }));

  app.post("/v1/linkedin/profile/fetch", async (request, reply) => {
    const startedAt = Date.now();
    const requestId = request.id;

    try {
      const input = LinkedinProfileFetchInputSchema.parse(request.body);
      const result = await service.fetchProfile(input.profileUrl, requestId);

      return {
        ok: true,
        data: result.data,
        meta: result.meta,
      };
    } catch (error: unknown) {
      const normalized =
        error instanceof ZodError
          ? new AppError("invalid_input", error.message, {
              status: 400,
              details: {
                issues: error.flatten(),
              },
            })
          : error;
      const serialized = serializeError(normalized);
      reply.code(serialized.status);

      return {
        ok: false,
        error: serialized,
        meta: buildErrorMeta(normalized, requestId, startedAt),
      };
    }
  });

  app.post("/v1/linkedin/company/fetch", async (request, reply) => {
    const startedAt = Date.now();
    const requestId = request.id;

    try {
      const input = LinkedinCompanyFetchInputSchema.parse(request.body);
      const result = await service.fetchCompany(input.companyUrl, requestId);

      return {
        ok: true,
        data: result.data,
        meta: result.meta,
      };
    } catch (error: unknown) {
      const normalized =
        error instanceof ZodError
          ? new AppError("invalid_input", error.message, {
              status: 400,
              details: {
                issues: error.flatten(),
              },
            })
          : error;
      const serialized = serializeError(normalized);
      reply.code(serialized.status);

      return {
        ok: false,
        error: serialized,
        meta: buildErrorMeta(normalized, requestId, startedAt),
      };
    }
  });

  app.addHook("onClose", async () => {
    await service.close();
  });

  return app;
}
