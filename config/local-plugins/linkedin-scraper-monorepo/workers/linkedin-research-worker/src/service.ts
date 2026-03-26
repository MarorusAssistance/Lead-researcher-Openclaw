import {
  AppError,
  retryWithBackoff,
  serializeError,
  toAppError,
  type CompanyEntity,
  type PersonEntity,
} from "@linkedin-research/shared";
import type { FastifyBaseLogger } from "fastify";
import { captureDebugArtifacts } from "./debug-artifacts.js";
import { extractCompany } from "./extractors/company-extractor.js";
import { extractProfile } from "./extractors/profile-extractor.js";
import { normalizeCompanyEntity } from "./normalizers/company.js";
import { normalizePersonEntity } from "./normalizers/person.js";
import type { WorkerConfig } from "./config.js";
import type { BrowserPageLike, BrowserSessionFactory, DebugArtifacts } from "./types.js";

type ExecutionMeta = {
  requestId: string;
  durationMs: number;
  attempts: number;
  debugArtifacts?: DebugArtifacts;
};

type ExecutionResult<T> = {
  data: T;
  meta: ExecutionMeta;
};

class ConcurrencyQueue {
  private active = 0;

  private readonly pending: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => this.pending.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    const next = this.pending.shift();
    if (next) {
      next();
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

function isSessionHtml(pageUrl: string, html: string): boolean {
  const lowerUrl = pageUrl.toLowerCase();
  const lowerHtml = html.toLowerCase();

  return (
    lowerUrl.includes("/login") ||
    lowerUrl.includes("/checkpoint") ||
    lowerHtml.includes("sign in") ||
    lowerHtml.includes("join now") ||
    lowerHtml.includes("session has expired")
  );
}

async function visit(page: BrowserPageLike, url: string, timeoutMs: number): Promise<string> {
  await page.goto(url, {
    timeout: timeoutMs,
    waitUntil: "domcontentloaded",
  });

  try {
    await page.waitForLoadState("networkidle", {
      timeout: Math.min(timeoutMs, 5000),
    });
  } catch {
    // LinkedIn often keeps long-lived requests open; domcontentloaded plus a short wait is enough for V1.
  }

  return page.content();
}

function enrichError(
  error: unknown,
  context: {
    requestId: string;
    attempt: number;
    debugArtifacts?: DebugArtifacts;
    url: string;
  },
): AppError {
  const appError = toAppError(error, {
    code: "extract_failed",
    status: 500,
    retryable: true,
  });

  return new AppError(appError.code, appError.message, {
    status: appError.status,
    retryable: appError.retryable,
    cause: appError,
    details: {
      ...appError.details,
      requestId: context.requestId,
      attempts: context.attempt,
      url: context.url,
      debugArtifacts: context.debugArtifacts,
    },
  });
}

async function safeVisitOptional(
  page: BrowserPageLike,
  url: string,
  timeoutMs: number,
  logger: FastifyBaseLogger,
): Promise<string | null> {
  try {
    const html = await visit(page, url, timeoutMs);
    if (isSessionHtml(page.url(), html)) {
      throw new AppError("session_invalid", "LinkedIn session is no longer valid.", {
        status: 401,
      });
    }
    return html;
  } catch (error: unknown) {
    const serialized = serializeError(error);
    if (serialized.code === "session_invalid") {
      throw error;
    }

    logger.warn({
      component: "linkedin-research-worker",
      message: "optional_detail_page_failed",
      url,
      error: serialized,
    });
    return null;
  }
}

export class LinkedInResearchService {
  private readonly queue: ConcurrencyQueue;

  constructor(
    private readonly config: WorkerConfig,
    private readonly browserFactory: BrowserSessionFactory,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.queue = new ConcurrencyQueue(config.concurrency);
  }

  async close(): Promise<void> {
    await this.browserFactory.close();
  }

  async fetchProfile(profileUrl: string, requestId: string): Promise<ExecutionResult<PersonEntity>> {
    const startedAt = Date.now();

    return this.queue.run(async () => {
      const { result, attempts } = await retryWithBackoff(
        async (attempt) => this.fetchProfileAttempt(profileUrl, requestId, attempt),
        {
          retries: this.config.retries,
          shouldRetry: (error) => error.retryable,
        },
      );

      return {
        data: result.data,
        meta: {
          requestId,
          durationMs: Date.now() - startedAt,
          attempts,
          debugArtifacts: result.debugArtifacts,
        },
      };
    });
  }

  async fetchCompany(companyUrl: string, requestId: string): Promise<ExecutionResult<CompanyEntity>> {
    const startedAt = Date.now();

    return this.queue.run(async () => {
      const { result, attempts } = await retryWithBackoff(
        async (attempt) => this.fetchCompanyAttempt(companyUrl, requestId, attempt),
        {
          retries: this.config.retries,
          shouldRetry: (error) => error.retryable,
        },
      );

      return {
        data: result.data,
        meta: {
          requestId,
          durationMs: Date.now() - startedAt,
          attempts,
          debugArtifacts: result.debugArtifacts,
        },
      };
    });
  }

  private async fetchProfileAttempt(
    profileUrl: string,
    requestId: string,
    attempt: number,
  ): Promise<{ data: PersonEntity; debugArtifacts?: DebugArtifacts }> {
    return this.browserFactory.withPage(async (page) => {
      let currentHtml = "";
      try {
        currentHtml = await visit(page, profileUrl, this.config.pageTimeoutMs);
        if (isSessionHtml(page.url(), currentHtml)) {
          throw new AppError("session_invalid", "LinkedIn session is no longer valid.", {
            status: 401,
            retryable: false,
          });
        }

        const experienceHtml = await safeVisitOptional(
          page,
          `${profileUrl.replace(/\/+$/, "")}/details/experience/`,
          this.config.pageTimeoutMs,
          this.logger,
        );
        const educationHtml = await safeVisitOptional(
          page,
          `${profileUrl.replace(/\/+$/, "")}/details/education/`,
          this.config.pageTimeoutMs,
          this.logger,
        );
        const skillsHtml = await safeVisitOptional(
          page,
          `${profileUrl.replace(/\/+$/, "")}/details/skills/`,
          this.config.pageTimeoutMs,
          this.logger,
        );

        const extracted = extractProfile({
          mainHtml: currentHtml,
          experienceHtml,
          educationHtml,
          skillsHtml,
        });
        const data = normalizePersonEntity(profileUrl, extracted);
        const debugArtifacts = await captureDebugArtifacts({
          page,
          html: currentHtml,
          baseDir: this.config.debugArtifactsDir,
          requestId,
          label: "profile-main",
          captureScreenshot: this.config.debug,
          captureHtml: this.config.debug,
        });

        return {
          data,
          debugArtifacts,
        };
      } catch (error: unknown) {
        const html = currentHtml || (await page.content().catch(() => ""));
        const debugArtifacts = await captureDebugArtifacts({
          page,
          html,
          baseDir: this.config.debugArtifactsDir,
          requestId,
          label: `profile-error-attempt-${attempt}`,
          captureScreenshot: this.config.debugOnError,
          captureHtml: this.config.debugOnError,
        }).catch(() => undefined);

        throw enrichError(error, {
          requestId,
          attempt,
          debugArtifacts,
          url: profileUrl,
        });
      }
    });
  }

  private async fetchCompanyAttempt(
    companyUrl: string,
    requestId: string,
    attempt: number,
  ): Promise<{ data: CompanyEntity; debugArtifacts?: DebugArtifacts }> {
    return this.browserFactory.withPage(async (page) => {
      let currentHtml = "";
      try {
        currentHtml = await visit(page, companyUrl, this.config.pageTimeoutMs);
        if (isSessionHtml(page.url(), currentHtml)) {
          throw new AppError("session_invalid", "LinkedIn session is no longer valid.", {
            status: 401,
            retryable: false,
          });
        }

        const aboutHtml = await safeVisitOptional(
          page,
          `${companyUrl.replace(/\/+$/, "")}/about/`,
          this.config.pageTimeoutMs,
          this.logger,
        );

        const extracted = extractCompany({
          mainHtml: currentHtml,
          aboutHtml,
        });
        const data = normalizeCompanyEntity(companyUrl, extracted);
        const debugArtifacts = await captureDebugArtifacts({
          page,
          html: aboutHtml ?? currentHtml,
          baseDir: this.config.debugArtifactsDir,
          requestId,
          label: "company-main",
          captureScreenshot: this.config.debug,
          captureHtml: this.config.debug,
        });

        return {
          data,
          debugArtifacts,
        };
      } catch (error: unknown) {
        const html = currentHtml || (await page.content().catch(() => ""));
        const debugArtifacts = await captureDebugArtifacts({
          page,
          html,
          baseDir: this.config.debugArtifactsDir,
          requestId,
          label: `company-error-attempt-${attempt}`,
          captureScreenshot: this.config.debugOnError,
          captureHtml: this.config.debugOnError,
        }).catch(() => undefined);

        throw enrichError(error, {
          requestId,
          attempt,
          debugArtifacts,
          url: companyUrl,
        });
      }
    });
  }
}
