import { AppError, toAppError } from "../errors/app-error.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffDelayMs(attempt: number, baseDelayMs = 500): number {
  return baseDelayMs * Math.max(1, attempt);
}

export async function retryWithBackoff<T>(
  task: (attempt: number) => Promise<T>,
  options: {
    retries: number;
    baseDelayMs?: number;
    shouldRetry?: (error: AppError, attempt: number) => boolean;
  },
): Promise<{ result: T; attempts: number }> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      const result = await task(attempt);
      return { result, attempts: attempt };
    } catch (error: unknown) {
      const appError = toAppError(error);
      const canRetry =
        attempt <= options.retries &&
        (options.shouldRetry ? options.shouldRetry(appError, attempt) : appError.retryable);

      if (!canRetry) {
        throw appError;
      }

      await sleep(backoffDelayMs(attempt, options.baseDelayMs));
    }
  }
}
