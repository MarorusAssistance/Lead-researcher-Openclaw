export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const collapsed = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

export function cleanMultilineText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return [...deduped];
}

export function preferFirstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
