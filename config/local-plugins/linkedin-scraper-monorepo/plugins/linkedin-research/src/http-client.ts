import {
  AppError,
  CompanyEntitySchema,
  PersonEntitySchema,
  createWorkerErrorSchema,
  createWorkerSuccessSchema,
  serializeError,
  type CompanyEntity,
  type MinimalLogger,
  type PersonEntity,
} from "@linkedin-research/shared";
import { z } from "zod";
import { LinkedInResearchPluginConfigSchema, type LinkedInResearchPluginConfig } from "./config.js";

const WorkerErrorEnvelopeSchema = createWorkerErrorSchema();

export class LinkedInResearchWorkerClient {
  private readonly config: LinkedInResearchPluginConfig;

  constructor(config: unknown, private readonly logger?: MinimalLogger) {
    this.config = LinkedInResearchPluginConfigSchema.parse(config);
  }

  async fetchProfile(profileUrl: string): Promise<PersonEntity> {
    return this.post("/v1/linkedin/profile/fetch", { profileUrl }, PersonEntitySchema);
  }

  async fetchCompany(companyUrl: string): Promise<CompanyEntity> {
    return this.post("/v1/linkedin/company/fetch", { companyUrl }, CompanyEntitySchema);
  }

  private async post<TSchema extends z.ZodTypeAny>(
    path: string,
    payload: Record<string, unknown>,
    responseSchema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(new URL(path, this.config.workerBaseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const json = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const parsedError = WorkerErrorEnvelopeSchema.safeParse(json);
        if (parsedError.success) {
          throw new AppError(
            parsedError.data.error.code as never,
            parsedError.data.error.message,
            {
              status: parsedError.data.error.status,
              retryable: parsedError.data.error.retryable,
              details: parsedError.data.error.details,
            },
          );
        }

        throw new AppError("upstream_error", `Worker responded with HTTP ${response.status}.`, {
          status: response.status,
          retryable: response.status >= 500,
          details: {
            body: json,
          },
        });
      }

      const envelopeSchema = createWorkerSuccessSchema(responseSchema);
      const parsed = envelopeSchema.safeParse(json);
      if (!parsed.success) {
        throw new AppError("validation_error", "Worker returned an invalid response payload.", {
          status: 502,
          details: {
            issues: parsed.error.flatten(),
          },
        });
      }

      return parsed.data.data;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        this.logger?.warn?.(
          JSON.stringify({
            component: "linkedin-research-plugin",
            message: "worker_request_failed",
            error: serializeError(error),
          }),
        );
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError(
          "timeout",
          `Worker request timed out after ${this.config.requestTimeoutMs} ms.`,
          {
            status: 504,
            retryable: true,
          },
        );
      }

      throw new AppError("http_error", error instanceof Error ? error.message : String(error), {
        status: 502,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
