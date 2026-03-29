import {
  PROPERTY_NAMES,
  RECRUITER_PROPERTY_SPECS,
  type NotionSchemaObservation,
  type NotionSchemaProperty,
  type NotionSchemaSnapshot,
  type NotionSelectOption,
  type NotionStatusGroup,
  type RecruiterFieldKey,
  type RecruiterPropertyValues,
  type RecruiterRecord,
  type RecruiterSummary,
  type SchemaValidationProblem,
  type WritablePropertyType,
} from "./types.js";

const RICH_TEXT_CHUNK_SIZE = 1900;
const UUID_PATTERN =
  /[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

type UnknownRecord = Record<string, unknown>;

const RECRUITER_FIELD_KEYS = Object.keys(PROPERTY_NAMES) as RecruiterFieldKey[];

type ValidationMode = "create" | "update";

type SchemaValidationOptions = {
  mode?: ValidationMode;
  requireKeys?: RecruiterFieldKey[];
};

export class RecruiterSchemaError extends Error {
  constructor(
    public readonly code: "invalid_input" | "schema_mismatch",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecruiterSchemaError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function splitRichText(value: string): Array<{ type: "text"; text: { content: string } }> {
  const normalized = value.replace(/\r\n/g, "\n");
  const chunks: string[] = [];

  for (let index = 0; index < normalized.length; index += RICH_TEXT_CHUNK_SIZE) {
    chunks.push(normalized.slice(index, index + RICH_TEXT_CHUNK_SIZE));
  }

  return chunks.map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
}

function joinTextItems(items: unknown[] | undefined): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const value = items
    .map((item) => {
      if (!isRecord(item)) {
        return "";
      }

      if (typeof item.plain_text === "string") {
        return item.plain_text;
      }

      const text = item.text;
      if (isRecord(text) && typeof text.content === "string") {
        return text.content;
      }

      return "";
    })
    .join("")
    .trim();

  return value.length > 0 ? value : null;
}

function propertyByName(page: unknown, name: string): UnknownRecord | null {
  if (!isRecord(page) || !isRecord(page.properties)) {
    return null;
  }

  const property = page.properties[name];
  return isRecord(property) ? property : null;
}

function normalizeSelectLikeValue(
  value: string,
  label: string,
  options?: NotionSelectOption[],
): { id: string } | { name: string } {
  const trimmed = value.trim();

  if (!options || options.length === 0) {
    return { name: trimmed };
  }

  const match = options.find((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  return match ? { id: match.id } : { name: trimmed };
}

function formatStatusOptions(options?: NotionSelectOption[]): string[] {
  return (options ?? []).map((option) => option.name);
}

function formatStatusGroups(groups?: NotionStatusGroup[]): string[] {
  return (groups ?? []).map((group) => group.name);
}

function getObservedOrMappedProperty(
  schema: NotionSchemaSnapshot,
  key: RecruiterFieldKey,
): NotionSchemaProperty | NotionSchemaObservation | undefined {
  return schema.propertiesByKey[key] ?? schema.observedByKey[key];
}

function getPropertyName(schema: NotionSchemaSnapshot | undefined, key: RecruiterFieldKey): string {
  return schema?.propertiesByKey[key]?.notionName ?? PROPERTY_NAMES[key];
}

function getProvidedFieldKeys(values: RecruiterPropertyValues): RecruiterFieldKey[] {
  return RECRUITER_FIELD_KEYS.filter((key) => values[key] !== undefined);
}

function toDateStart(value: string): string {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new RecruiterSchemaError(
      "invalid_input",
      `Date value "${value}" is not a valid ISO date/time string.`,
      {
        value,
      },
    );
  }

  return trimmed;
}

function formatSchemaProblem(problem: SchemaValidationProblem): string {
  if (problem.reason === "missing") {
    return `${problem.notionName} is missing from the Notion data source`;
  }

  return `${problem.notionName} expects ${problem.expectedTypes.join(" or ")}, got ${problem.actualType ?? "unknown"}`;
}

function throwSchemaProblems(
  schema: NotionSchemaSnapshot,
  problems: SchemaValidationProblem[],
  inputKeys: RecruiterFieldKey[],
  mode: ValidationMode,
): never {
  throw new RecruiterSchemaError(
    "schema_mismatch",
    `The Notion CRM schema is incompatible with this ${mode} operation: ${problems
      .map(formatSchemaProblem)
      .join("; ")}.`,
    {
      databaseId: schema.databaseId,
      dataSourceId: schema.dataSourceId,
      inputKeys,
      problems,
      rawPropertyTypes: schema.rawPropertyTypes,
    },
  );
}

function readUrl(page: unknown, name: string): string | null {
  const property = propertyByName(page, name);
  return typeof property?.url === "string" ? property.url : null;
}

function readNumber(page: unknown, name: string): number | null {
  const property = propertyByName(page, name);
  return typeof property?.number === "number" ? property.number : null;
}

function readSelectOrStatus(page: unknown, name: string): string | null {
  const property = propertyByName(page, name);
  const select = isRecord(property?.select) ? property.select : null;
  if (select && typeof select.name === "string") {
    return select.name;
  }

  const status = isRecord(property?.status) ? property.status : null;
  if (status && typeof status.name === "string") {
    return status.name;
  }

  return null;
}

function readCheckbox(page: unknown, name: string): boolean | null {
  const property = propertyByName(page, name);
  return typeof property?.checkbox === "boolean" ? property.checkbox : null;
}

function readDate(page: unknown, name: string): string | null {
  const property = propertyByName(page, name);
  if (!isRecord(property?.date)) {
    return null;
  }

  return typeof property.date.start === "string" ? property.date.start : null;
}

function readTitle(page: unknown, name: string): string | null {
  const property = propertyByName(page, name);
  return joinTextItems(Array.isArray(property?.title) ? property.title : undefined);
}

function readRichText(page: unknown, name: string): string | null {
  const property = propertyByName(page, name);
  return joinTextItems(Array.isArray(property?.rich_text) ? property.rich_text : undefined);
}

export function normalizeNotionId(input: string): string {
  const match = input.match(UUID_PATTERN);
  const candidate = match?.at(-1) ?? input.trim();
  const compact = candidate.replace(/-/g, "");

  if (!/^[0-9a-fA-F]{32}$/.test(compact)) {
    throw new Error(`Invalid Notion ID: ${input}`);
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20, 32),
  ].join("-").toLowerCase();
}

export function normalizeHttpUrl(raw: string, label: string): string {
  const value = raw.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }

  url.hash = "";
  return url.toString();
}

export function normalizeLinkedInUrl(raw: string): string {
  const normalized = normalizeHttpUrl(raw, "linkedinUrl");
  const url = new URL(normalized);

  if (!url.hostname.toLowerCase().includes("linkedin.com")) {
    throw new Error("linkedinUrl must point to linkedin.com.");
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.search = "";
  url.hash = "";

  if (url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function toTitle(value: string | null | undefined): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    throw new RecruiterSchemaError("invalid_input", "Title values cannot be empty.");
  }

  return {
    title: splitRichText(value!.trim()),
  };
}

export function toRichText(value: string | null | undefined): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    return { rich_text: [] };
  }

  return {
    rich_text: splitRichText(value!.trim()),
  };
}

export function toUrl(value: string | null | undefined): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    return { url: null };
  }

  return {
    url: value!.trim(),
  };
}

export function toNumber(value: number | null | undefined): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return { number: null };
  }

  if (!Number.isFinite(value)) {
    throw new RecruiterSchemaError("invalid_input", "Number values must be finite.");
  }

  return {
    number: value,
  };
}

export function toCheckbox(value: boolean | null | undefined): UnknownRecord | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return {
    checkbox: value,
  };
}

export function toDate(value: string | null | undefined): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    return { date: null };
  }

  return {
    date: {
      start: toDateStart(value!),
    },
  };
}

export function toSelect(
  value: string | null | undefined,
  options?: NotionSelectOption[],
): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    return { select: null };
  }

  return {
    select: normalizeSelectLikeValue(value!, "select", options),
  };
}

export function toStatus(
  value: string | null | undefined,
  availableOptionsOrGroups: {
    options?: NotionSelectOption[];
    groups?: NotionStatusGroup[];
  },
): UnknownRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    return { status: null };
  }

  const trimmed = value!.trim();
  const match = (availableOptionsOrGroups.options ?? []).find(
    (option) => option.name.toLowerCase() === trimmed.toLowerCase(),
  );

  if (!match) {
    throw new RecruiterSchemaError(
      "invalid_input",
      `Status "${trimmed}" is not valid for Notion property "${PROPERTY_NAMES.status}".`,
      {
        property: PROPERTY_NAMES.status,
        provided: trimmed,
        availableOptions: formatStatusOptions(availableOptionsOrGroups.options),
        availableGroups: formatStatusGroups(availableOptionsOrGroups.groups),
      },
    );
  }

  return {
    status: {
      id: match.id,
    },
  };
}

export function validateWritableInputAgainstSchema(
  input: RecruiterPropertyValues,
  schema: NotionSchemaSnapshot,
  options: SchemaValidationOptions = {},
): void {
  const mode = options.mode ?? "update";
  const inputKeys = getProvidedFieldKeys(input);
  const keysToValidate = new Set<RecruiterFieldKey>([...inputKeys, ...(options.requireKeys ?? [])]);
  const problems: SchemaValidationProblem[] = [];

  if (mode === "create") {
    for (const key of RECRUITER_FIELD_KEYS) {
      const spec = RECRUITER_PROPERTY_SPECS[key];
      if ("requiredOnCreate" in spec && spec.requiredOnCreate) {
        keysToValidate.add(key);
      }
    }
  }

  for (const key of keysToValidate) {
    const spec = RECRUITER_PROPERTY_SPECS[key];
    const mappedProperty = schema.propertiesByKey[key];
    const observedProperty = getObservedOrMappedProperty(schema, key);

    if (!mappedProperty) {
      problems.push({
        key,
        notionName: observedProperty?.notionName ?? spec.notionName,
        reason: observedProperty ? "wrong_type" : "missing",
        expectedTypes: [...spec.allowedTypes],
        actualType: observedProperty?.actualType,
      });
    }
  }

  if (problems.length > 0) {
    throwSchemaProblems(schema, problems, inputKeys, mode);
  }

  const statusValue = input.status;
  if (statusValue !== undefined) {
    const statusProperty = schema.propertiesByKey.status;
    if (statusProperty?.type === "status") {
      toStatus(statusValue, {
        options: statusProperty.options,
        groups: statusProperty.groups,
      });
    }
  }
}

export function buildRecruiterProperties(
  input: RecruiterPropertyValues,
  schema: NotionSchemaSnapshot,
): Record<string, unknown> {
  validateWritableInputAgainstSchema(input, schema);

  const properties: Record<string, unknown> = {};

  for (const key of RECRUITER_FIELD_KEYS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }

    const schemaProperty = schema.propertiesByKey[key];
    if (!schemaProperty) {
      continue;
    }

    let propertyValue: UnknownRecord | undefined;

    switch (schemaProperty.type) {
      case "title":
        propertyValue = toTitle(value as string | null | undefined);
        break;
      case "rich_text":
        propertyValue = toRichText(value as string | null | undefined);
        break;
      case "url":
        propertyValue = toUrl(value as string | null | undefined);
        break;
      case "number":
        propertyValue = toNumber(value as number | null | undefined);
        break;
      case "checkbox":
        propertyValue = toCheckbox(value as boolean | null | undefined);
        break;
      case "date":
        propertyValue = toDate(value as string | null | undefined);
        break;
      case "select":
        propertyValue = toSelect(value as string | null | undefined, schemaProperty.options);
        break;
      case "status":
        propertyValue = toStatus(value as string | null | undefined, {
          options: schemaProperty.options,
          groups: schemaProperty.groups,
        });
        break;
      default: {
        const actualType = (schemaProperty as { type: string }).type;
        throw new RecruiterSchemaError(
          "schema_mismatch",
          `Property "${schemaProperty.notionName}" uses unsupported type "${actualType}".`,
          {
            property: schemaProperty.notionName,
            actualType,
          },
        );
      }
    }

    if (propertyValue !== undefined) {
      properties[schemaProperty.notionName] = propertyValue;
    }
  }

  return properties;
}

export function normalizeRecruiterPage(
  page: unknown,
  schema?: NotionSchemaSnapshot,
): RecruiterRecord {
  const pageRecord = isRecord(page) ? page : {};

  return {
    pageId: typeof pageRecord.id === "string" ? pageRecord.id : "",
    notionUrl: typeof pageRecord.url === "string" ? pageRecord.url : null,
    name: readTitle(page, getPropertyName(schema, "name")) ?? "Untitled",
    linkedinUrl: readUrl(page, getPropertyName(schema, "linkedinUrl")),
    company: readRichText(page, getPropertyName(schema, "company")),
    role: readRichText(page, getPropertyName(schema, "role")),
    recruiterType: readSelectOrStatus(page, getPropertyName(schema, "recruiterType")),
    region: readRichText(page, getPropertyName(schema, "region")),
    fitScore: readNumber(page, getPropertyName(schema, "fitScore")),
    status: readSelectOrStatus(page, getPropertyName(schema, "status")),
    sourceNotes: readRichText(page, getPropertyName(schema, "sourceNotes")),
    hook1: readRichText(page, getPropertyName(schema, "hook1")),
    hook2: readRichText(page, getPropertyName(schema, "hook2")),
    fitSummary: readRichText(page, getPropertyName(schema, "fitSummary")),
    connectionNoteDraft: readRichText(page, getPropertyName(schema, "connectionNoteDraft")),
    dmDraft: readRichText(page, getPropertyName(schema, "dmDraft")),
    emailSubjectDraft: readRichText(page, getPropertyName(schema, "emailSubjectDraft")),
    emailBodyDraft: readRichText(page, getPropertyName(schema, "emailBodyDraft")),
    followup1Draft: readRichText(page, getPropertyName(schema, "followup1Draft")),
    followup2Draft: readRichText(page, getPropertyName(schema, "followup2Draft")),
    lastReplySummary: readRichText(page, getPropertyName(schema, "lastReplySummary")),
    interactionLog: readRichText(page, getPropertyName(schema, "interactionLog")),
    lastTouchAt: readDate(page, getPropertyName(schema, "lastTouchAt")),
    nextActionAt: readDate(page, getPropertyName(schema, "nextActionAt")),
    nextActionType: readSelectOrStatus(page, getPropertyName(schema, "nextActionType")),
    cvSent: readCheckbox(page, getPropertyName(schema, "cvSent")),
    cvUrl: readUrl(page, getPropertyName(schema, "cvUrl")),
    cvUrlEn: readUrl(page, getPropertyName(schema, "cvUrlEn")),
    cvUrlEs: readUrl(page, getPropertyName(schema, "cvUrlEs")),
  };
}

export function toRecruiterSummary(record: RecruiterRecord): RecruiterSummary {
  return {
    pageId: record.pageId,
    name: record.name,
    linkedinUrl: record.linkedinUrl,
    company: record.company,
    role: record.role,
    status: record.status,
    lastTouchAt: record.lastTouchAt,
    nextActionAt: record.nextActionAt,
    nextActionType: record.nextActionType,
    cvSent: record.cvSent,
  };
}

export function appendInteractionLog(existingLog: string | null, line: string): string {
  const trimmedExisting = existingLog?.trim() ?? "";
  const trimmedLine = line.trim();

  if (!trimmedExisting) {
    return trimmedLine;
  }

  return `${trimmedExisting}\n${trimmedLine}`;
}
