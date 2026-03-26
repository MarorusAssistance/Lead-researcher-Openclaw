export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type MinimalLogger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export function formatStructuredLog(
  component: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  return JSON.stringify({
    component,
    message,
    context: context ?? {},
  });
}

export function logStructured(
  logger: MinimalLogger,
  level: StructuredLogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  const formatted = formatStructuredLog(component, message, context);
  const sink = logger[level] ?? logger.info;
  if (sink) {
    sink(formatted);
  }
}
