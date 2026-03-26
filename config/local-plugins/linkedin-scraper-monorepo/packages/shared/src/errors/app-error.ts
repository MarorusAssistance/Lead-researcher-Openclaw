export type ErrorCode =
  | "invalid_input"
  | "validation_error"
  | "http_error"
  | "timeout"
  | "upstream_error"
  | "notion_error"
  | "schema_mismatch"
  | "session_invalid"
  | "extract_failed"
  | "not_found"
  | "internal_error";

export type SerializedError = {
  code: ErrorCode | "unknown";
  message: string;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  public readonly code: ErrorCode;

  public readonly status: number;

  public readonly retryable: boolean;

  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? 500;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      retryable: error.retryable,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "unknown",
      message: error.message,
      status: 500,
      retryable: false,
    };
  }

  return {
    code: "unknown",
    message: String(error),
    status: 500,
    retryable: false,
  };
}

export function toAppError(
  error: unknown,
  fallback: {
    code?: ErrorCode;
    message?: string;
    status?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  } = {},
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(
      fallback.code ?? "internal_error",
      fallback.message ?? error.message,
      {
        status: fallback.status ?? 500,
        retryable: fallback.retryable ?? false,
        details: fallback.details,
        cause: error,
      },
    );
  }

  return new AppError(
    fallback.code ?? "internal_error",
    fallback.message ?? String(error),
    {
      status: fallback.status ?? 500,
      retryable: fallback.retryable ?? false,
      details: fallback.details,
    },
  );
}
