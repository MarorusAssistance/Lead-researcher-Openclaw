import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Value } from "@sinclair/typebox/value";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { appendInteractionLog, normalizeHttpUrl, normalizeLinkedInUrl } from "./property-mappers.js";
import {
  CampaignStateSchema,
  CrmClearPendingShortlistRequestSchema,
  CrmGetCampaignStateRequestSchema,
  CrmGetPendingShortlistRequestSchema,
  CrmRegisterAcceptedLeadRequestSchema,
  CrmRegisterRejectedCandidateRequestSchema,
  CrmSavePendingShortlistRequestSchema,
  type ProspectingContract,
  ProspectingContractSchema,
  ProspectingContractValidateInputSchema,
  ProspectingValidationContextSchema,
  parseAndValidateProspectingContract,
  validateProspectingContract,
  type ProspectingContractValidateInput,
} from "./contracts.js";
import { NotionRecruiterClient, RecruiterPluginError } from "./notion-client.js";
import {
  AttachCvSchema,
  GetRecruiterSchema,
  LogTouchpointSchema,
  MarkStatusSchema,
  PluginConfigSchema,
  QueryDueFollowupsSchema,
  SaveDraftsSchema,
  SaveResearchSchema,
  ScheduleNextActionSchema,
  UpsertRecruiterSchema,
  type AttachCvInput,
  type GetRecruiterInput,
  type LogTouchpointInput,
  type MarkStatusInput,
  type PluginConfig,
  type QueryDueFollowupsInput,
  type RecruiterRecord,
  type SaveDraftsInput,
  type SaveResearchInput,
  type ScheduleNextActionInput,
  type UpsertRecruiterInput,
} from "./types.js";
import { loadState, saveState, normalizeName } from "./prospecting-state.js";
import {
  clearPendingShortlist,
  loadPendingShortlist,
  savePendingShortlist,
} from "./pending-shortlist-state.js";
import {
  awaitRunScopedAssistantJson,
  readRunScopedRequestPayload,
  resetAgentSession,
  type AwaitSessionJsonInput,
} from "./session-await.js";

const execFileAsync = promisify(execFile);

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

const DEFAULT_STATUS = "To Contact";
const DEFAULT_NEXT_ACTION_TYPE = "connection_request";
const DEFAULT_CV_SENT = false;
const DEFAULT_CV_URL_EN =
  "https://drive.google.com/file/d/1Bkr_O7egJ4lJ_-rhJlMrSt3aTcrG3oU3/view?usp=sharing";
const DEFAULT_CV_URL_ES =
  "https://drive.google.com/file/d/1boKFfBigABiFCJ2RirVB4J2nRybpGbLg/view?usp=sharing";
const DEFAULT_CV_URL = DEFAULT_CV_URL_EN;

function parsePluginConfig(pluginConfig: unknown): PluginConfig {
  if (Value.Check(PluginConfigSchema, pluginConfig)) {
    return pluginConfig;
  }

  const issues = [...Value.Errors(PluginConfigSchema, pluginConfig)].map((issue) => issue.message);
  throw new RecruiterPluginError(
    "invalid_input",
    `Invalid plugin config for notion-recruiter-crm: ${issues.join("; ")}`,
    400,
    { issues },
  );
}

function createSuccessResult(text: string, details: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text }],
    details: {
      ok: true,
      ...details,
    },
  };
}

function createJsonResult(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    details: payload,
  };
}

function createErrorResult(error: unknown): ToolResult {
  const normalized = normalizeError(error);

  return {
    content: [{ type: "text", text: normalized.message as string }],
    details: {
      ok: false,
      error: normalized,
    },
  };
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof RecruiterPluginError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "unknown",
      message: error.message,
    };
  }

  return {
    code: "unknown",
    message: String(error),
  };
}

function normalizeLinkedInUrlOrThrow(value: string): string {
  try {
    return normalizeLinkedInUrl(value);
  } catch (error: unknown) {
    throw new RecruiterPluginError(
      "invalid_input",
      error instanceof Error ? error.message : "linkedinUrl is invalid.",
      400,
    );
  }
}

function isNonBlankString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalLinkedInUrl(value: string | null | undefined): string | undefined {
  return isNonBlankString(value) ? normalizeLinkedInUrlOrThrow(value) : undefined;
}

function normalizeHttpUrlOrThrow(value: string, label: string): string {
  try {
    return normalizeHttpUrl(value, label);
  } catch (error: unknown) {
    throw new RecruiterPluginError(
      "invalid_input",
      error instanceof Error ? error.message : `${label} is invalid.`,
      400,
    );
  }
}

function requireIsoDateTime(value: string, label: string): string {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new RecruiterPluginError(
      "invalid_input",
      `${label} must be a valid ISO date/time string.`,
      400,
    );
  }

  return parsed.toISOString();
}

function normalizeOptionalIsoDateTime(
  value: string | null | undefined,
  label: string,
): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isNonBlankString(value)) {
    return undefined;
  }

  return requireIsoDateTime(value, label);
}

function summarizeRecruiter(record: RecruiterRecord): string {
  const parts = [record.name];
  if (record.company) {
    parts.push(`@ ${record.company}`);
  }
  if (record.role) {
    parts.push(`(${record.role})`);
  }
  if (record.status) {
    parts.push(`status=${record.status}`);
  }
  if (record.nextActionAt) {
    parts.push(`next=${record.nextActionAt}`);
  }

  return parts.join(" ");
}

function formatFollowupSummary(items: Array<Record<string, unknown>>, beforeIso: string): string {
  if (items.length === 0) {
    return `No recruiters with follow-ups due on or before ${beforeIso}.`;
  }

  return `Found ${items.length} recruiters with follow-ups due on or before ${beforeIso}.`;
}

async function executeTool(handler: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await handler();
  } catch (error: unknown) {
    return createErrorResult(error);
  }
}

function ensureAtLeastOneProvidedField(
  params: Record<string, unknown>,
  keys: string[],
  message: string,
): void {
  if (!keys.some((key) => Object.prototype.hasOwnProperty.call(params, key))) {
    throw new RecruiterPluginError("invalid_input", message, 400);
  }
}

const ProspectingStateGetSchema = Type.Object({
}, { additionalProperties: false });

const ProspectingStateUpdateSchema = Type.Object({
  searchedCompanyNamesAdd: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), { maxItems: 50 }),
  ),
  registeredLeadNamesAdd: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), { maxItems: 50 }),
  ),
}, { additionalProperties: false });

const ProspectingCrmGetCampaignStateSchema = CrmGetCampaignStateRequestSchema;
const ProspectingCrmRegisterAcceptedLeadSchema = CrmRegisterAcceptedLeadRequestSchema;
const ProspectingCrmRegisterRejectedCandidateSchema = CrmRegisterRejectedCandidateRequestSchema;
const ProspectingCrmSavePendingShortlistSchema = CrmSavePendingShortlistRequestSchema;
const ProspectingCrmGetPendingShortlistSchema = CrmGetPendingShortlistRequestSchema;
const ProspectingCrmClearPendingShortlistSchema = CrmClearPendingShortlistRequestSchema;
const ProspectingRequestContractSchema = Type.Union([
  Type.Literal("sourcer_request"),
  Type.Literal("qualifier_request"),
  Type.Literal("commercial_request"),
  Type.Literal("crm_request"),
]);
const ProspectingResponseContractSchema = Type.Union([
  Type.Literal("sourcer_response"),
  Type.Literal("qualifier_response"),
  Type.Literal("commercial_response"),
  Type.Literal("crm_response"),
]);

const ProspectingSessionAwaitJsonSchema = Type.Object({
  sessionKey: Type.String({ minLength: 1 }),
  runId: Type.Optional(Type.String({ minLength: 1 })),
  expectedAction: Type.String({ minLength: 1 }),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120000 })),
  pollIntervalMs: Type.Optional(Type.Integer({ minimum: 200, maximum: 5000 })),
  maxRuntimeMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 900000 })),
}, { additionalProperties: false });

const ProspectingSessionAwaitValidatedJsonSchema = Type.Object({
  sessionKey: Type.String({ minLength: 1 }),
  runId: Type.Optional(Type.String({ minLength: 1 })),
  expectedAction: Type.String({ minLength: 1 }),
  contract: ProspectingResponseContractSchema,
  context: Type.Optional(ProspectingValidationContextSchema),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120000 })),
  pollIntervalMs: Type.Optional(Type.Integer({ minimum: 200, maximum: 5000 })),
  maxRuntimeMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 900000 })),
}, { additionalProperties: false });

const ProspectingResolveValidatedJsonSchema = Type.Object({
  sessionKey: Type.String({ minLength: 1 }),
  runId: Type.Optional(Type.String({ minLength: 1 })),
  expectedAction: Type.String({ minLength: 1 }),
  contract: ProspectingResponseContractSchema,
  replyText: Type.Optional(Type.String()),
  context: Type.Optional(ProspectingValidationContextSchema),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120000 })),
  pollIntervalMs: Type.Optional(Type.Integer({ minimum: 200, maximum: 5000 })),
  maxRuntimeMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 900000 })),
}, { additionalProperties: false });

const ProspectingSessionResetSchema = Type.Object({
  sessionKey: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const ProspectingPrepareRequestSchema = Type.Object({
  contract: ProspectingRequestContractSchema,
  payload: Type.Object({}, { additionalProperties: true }),
}, { additionalProperties: false });
const ProspectingMainWorkerResultSchema = Type.Object({
  contract: ProspectingResponseContractSchema,
  ok: Type.Boolean(),
  status: Type.Union([
    Type.Literal("VALID"),
    Type.Literal("INVALID"),
    Type.Literal("MALFORMED"),
    Type.Literal("TIMEOUT"),
  ]),
  parsed: Type.Optional(Type.Object({}, { additionalProperties: true })),
  error: Type.Optional(Type.String()),
}, { additionalProperties: true });
const ProspectingMainInitialActionSchema = Type.Object({
  userText: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const ProspectingMainContinueActionSchema = Type.Object({
  state: Type.Object({}, { additionalProperties: true }),
  latestResult: ProspectingMainWorkerResultSchema,
}, { additionalProperties: false });

const ProspectingMainNextActionSchema = Type.Object({
  input: Type.Union([
    ProspectingMainInitialActionSchema,
    ProspectingMainContinueActionSchema,
  ]),
}, { additionalProperties: false });
const ProspectingMainRunSchema = Type.Object({
  userText: Type.String({ minLength: 1 }),
  workerTimeoutSeconds: Type.Optional(Type.Integer({ minimum: 30, maximum: 1800 })),
  workerIdleTimeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 180000 })),
  workerMaxRuntimeMs: Type.Optional(Type.Integer({ minimum: 5000, maximum: 1800000 })),
  maxHops: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
}, { additionalProperties: false });

const DEFAULT_QUALIFICATION_RULES = {
  allowedStatuses: ["ACCEPT", "REJECT", "ENRICH"],
  mustExplainDecision: true,
  matchMode: "STRICT",
  targetFilters: {},
} as const;
const DEFAULT_BUYER_ROLE_THEMES = [
  "founder",
  "cofounder",
  "ceo",
  "cto",
  "head of engineering",
  "engineering manager",
] as const;
const DEFAULT_COMPANY_THEMES = [
  "software company",
  "software consultancy",
  "software development",
  "custom software development",
  "software agency",
  "software studio",
  "digital product",
  "digital product studio",
  "product engineering",
  "AI consultancy",
  "AI engineering",
  "automation agency",
  "IT consultancy",
  "IT services",
  "B2B SaaS",
] as const;
const MAIN_MATCH_MODES = ["STRICT", "RELAX_SIZE", "RELAX_GEO", "BEST_AVAILABLE"] as const;
const DEFAULT_LEAD_ATTEMPT_BUDGET = 5;
const MAX_LEAD_ATTEMPT_BUDGET = 15;
const MAX_SHORTLIST_OPTIONS = 3;
const COUNTRY_CODE_ALIASES: Record<string, string> = {
  es: "es",
  spain: "es",
  "españa": "es",
  espana: "es",
  uk: "gb",
  "united kingdom": "gb",
  britain: "gb",
  england: "gb",
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyTrimmedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return undefined;
    }

    const trimmed = item.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    normalized.push(trimmed);
  }

  return normalized;
}

function asMaybeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asMaybeInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? (value as number) : undefined;
}

function asMaybeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function firstNonBlankString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

function toNullableString(value: unknown): string | null {
  return firstNonBlankString(value) ?? null;
}

function normalizeEvidenceItems(
  value: unknown,
): Array<{ type: string; url: string; claim: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: Array<{ type: string; url: string; claim: string }> = [];

  for (const item of value) {
    if (!isPlainRecord(item)) {
      continue;
    }

    const type = firstNonBlankString(item.type);
    const url = firstNonBlankString(item.url);
    const claim = firstNonBlankString(item.claim);

    if (type && url && claim) {
      normalized.push({ type, url, claim });
    }
  }

  return normalized.length > 0 ? normalized : undefined;
}

function deriveDomainFromWebsite(value: unknown): string | null {
  const website = firstNonBlankString(value);
  if (!website) {
    return null;
  }

  try {
    const hostname = new URL(website).hostname.trim().toLowerCase();
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function deriveCandidateIdFromLeadLike(
  candidateId: unknown,
  personName: unknown,
  companyName: unknown,
): string | undefined {
  const explicit = firstNonBlankString(candidateId);
  if (explicit) {
    return explicit;
  }

  const personSlug = normalizeName(firstNonBlankString(personName) ?? "").replace(/\s+/g, "_");
  const companySlug = normalizeName(firstNonBlankString(companyName) ?? "").replace(/\s+/g, "_");

  if (personSlug.length === 0 || companySlug.length === 0) {
    return undefined;
  }

  return `cand_${personSlug}_${companySlug}`;
}

function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered.length === 2) {
    return lowered;
  }

  return COUNTRY_CODE_ALIASES[lowered];
}

function firstStringFromArray(value: unknown): string | undefined {
  const items = asNonEmptyTrimmedStringArray(value);
  return items?.[0];
}

type CanonicalLeadCandidate = {
  candidateId: string | undefined;
  person: {
    fullName: string | null;
    roleTitle: string | null;
    linkedinUrl: string | null;
  };
  company: {
    name: string | undefined;
    website: string | null;
    domain: string | null;
  };
  fitSignals: string[];
  evidence: Array<{ type: string; url: string; claim: string }>;
  notes: string | null;
};

function normalizeResponseContract(
  contract: ProspectingContract,
): "sourcer_response" | "qualifier_response" | "commercial_response" | "crm_response" {
  switch (contract) {
    case "sourcer_request":
    case "sourcer_response":
      return "sourcer_response";
    case "qualifier_request":
    case "qualifier_response":
      return "qualifier_response";
    case "commercial_request":
    case "commercial_response":
      return "commercial_response";
    case "crm_request":
    case "crm_response":
      return "crm_response";
    default:
      return "crm_response";
  }
}

function applyRequestPayloadToValidationContext(
  responseContract: "sourcer_response" | "qualifier_response" | "commercial_response" | "crm_response",
  requestPayload: unknown,
  expectedAction: string,
  baseContext?: ProspectingContractValidateInput["context"],
): ProspectingContractValidateInput["context"] {
  const merged: Record<string, unknown> = {
    ...(baseContext ?? {}),
  };

  if (responseContract === "crm_response" && merged.expectedAction === undefined) {
    merged.expectedAction = expectedAction;
  }

  if (!isPlainRecord(requestPayload)) {
    return merged;
  }

  if (responseContract === "sourcer_response") {
    if (merged.excludedCompanyNames === undefined) {
      const excludedCompanyNames = asNonEmptyTrimmedStringArray(requestPayload.excludedCompanyNames);
      if (excludedCompanyNames !== undefined) {
        merged.excludedCompanyNames = excludedCompanyNames;
      }
    }

    if (merged.excludedLeadNames === undefined) {
      const excludedLeadNames = asNonEmptyTrimmedStringArray(requestPayload.excludedLeadNames);
      if (excludedLeadNames !== undefined) {
        merged.excludedLeadNames = excludedLeadNames;
      }
    }

    if (merged.expectedCandidateId === undefined) {
      const expectedCandidateId = firstNonBlankString(requestPayload.candidateId);
      if (expectedCandidateId) {
        merged.expectedCandidateId = expectedCandidateId;
      }
    }
  }

  if (responseContract === "qualifier_response" && merged.expectedCandidateId === undefined) {
    const requestCandidate = isPlainRecord(requestPayload.candidate) ? requestPayload.candidate : {};
    const expectedCandidateId = firstNonBlankString(requestCandidate.candidateId);
    if (expectedCandidateId) {
      merged.expectedCandidateId = expectedCandidateId;
    }
  }

  if (responseContract === "commercial_response" && merged.expectedCandidateId === undefined) {
    const requestCandidate = isPlainRecord(requestPayload.candidate) ? requestPayload.candidate : {};
    const expectedCandidateId = firstNonBlankString(requestCandidate.candidateId);
    if (expectedCandidateId) {
      merged.expectedCandidateId = expectedCandidateId;
    }
  }

  return merged;
}

function resolveValidationContext(
  responseContract: "sourcer_response" | "qualifier_response" | "commercial_response" | "crm_response",
  params: Pick<
    AwaitSessionJsonInput,
    "sessionKey" | "runId" | "expectedAction"
  > & {
    context?: ProspectingContractValidateInput["context"];
  },
): ProspectingContractValidateInput["context"] {
  const requestPayload = readRunScopedRequestPayload({
    sessionKey: params.sessionKey,
    runId: params.runId,
    expectedAction: params.expectedAction,
  });

  if (!requestPayload) {
    return applyRequestPayloadToValidationContext(
      responseContract,
      undefined,
      params.expectedAction,
      params.context,
    );
  }

  try {
    const parsed = JSON.parse(requestPayload.payloadText) as unknown;
    return applyRequestPayloadToValidationContext(
      responseContract,
      parsed,
      params.expectedAction,
      params.context,
    );
  } catch {
    return applyRequestPayloadToValidationContext(
      responseContract,
      undefined,
      params.expectedAction,
      params.context,
    );
  }
}

function canonicalizeCandidateLike(rawValue: unknown): CanonicalLeadCandidate {
  const rawCandidate: Record<string, unknown> = isPlainRecord(rawValue) ? rawValue : {};
  const rawCandidatePerson: Record<string, unknown> = isPlainRecord(rawCandidate.person)
    ? rawCandidate.person
    : {};
  const rawCandidateCompany: Record<string, unknown> = isPlainRecord(rawCandidate.company)
    ? rawCandidate.company
    : {};
  const personName = firstNonBlankString(
    rawCandidatePerson.fullName,
    rawCandidate.fullName,
    rawCandidate.personName,
    rawCandidate.name,
  );
  const companyName = firstNonBlankString(
    rawCandidateCompany.name,
    rawCandidate.companyName,
    rawCandidate.company,
  );
  const fitSignals = asNonEmptyTrimmedStringArray(rawCandidate.fitSignals) ?? [];
  const evidence = normalizeEvidenceItems(rawCandidate.evidence) ?? [];

  return {
    candidateId: deriveCandidateIdFromLeadLike(rawCandidate.candidateId, personName, companyName),
    person: {
      fullName: toNullableString(personName),
      roleTitle: toNullableString(rawCandidatePerson.roleTitle ?? rawCandidate.roleTitle ?? rawCandidate.role),
      linkedinUrl: toNullableString(
        rawCandidatePerson.linkedinUrl ?? rawCandidate.linkedinUrl ?? rawCandidate.contactLink,
      ),
    },
    company: {
      name: companyName,
      website: toNullableString(
        rawCandidateCompany.website ?? rawCandidate.companyWebsite ?? rawCandidate.website,
      ),
      domain: toNullableString(
        rawCandidateCompany.domain ??
          rawCandidate.companyDomain ??
          rawCandidate.domain ??
          deriveDomainFromWebsite(
            rawCandidateCompany.website ?? rawCandidate.companyWebsite ?? rawCandidate.website,
          ),
      ),
    },
    fitSignals,
    evidence,
    notes: toNullableString(rawCandidate.notes ?? rawCandidate.summary),
  };
}

function canonicalizeTargetThemes(value: unknown): string[] {
  const inputThemes = asNonEmptyTrimmedStringArray(value) ?? [];
  const deduped: string[] = [];

  for (const theme of inputThemes) {
    const normalized = theme.trim();
    if (normalized.length > 0 && !deduped.includes(normalized)) {
      deduped.push(normalized);
    }
  }

  if (deduped.length === 0) {
    for (const theme of [...DEFAULT_COMPANY_THEMES, ...DEFAULT_BUYER_ROLE_THEMES]) {
      if (!deduped.includes(theme)) {
        deduped.push(theme);
      }
    }
    return deduped;
  }

  const hasCompanyTheme = deduped.some((theme) => {
    const lowered = theme.toLowerCase();
    return (
      lowered.includes("software") ||
      lowered.includes("saas") ||
      lowered.includes("consultancy") ||
      lowered.includes("consulting") ||
      lowered.includes("agency") ||
      lowered.includes("studio") ||
      lowered.includes("product studio") ||
      lowered.includes("digital product") ||
      lowered.includes("automation") ||
      lowered.includes("startup") ||
      lowered.includes("company") ||
      lowered.includes("ai company")
    );
  });
  const hasBuyerRole = deduped.some((theme) => {
    const lowered = theme.toLowerCase();
    return DEFAULT_BUYER_ROLE_THEMES.some((role) => lowered.includes(role));
  });

  if (!hasCompanyTheme) {
    for (const theme of DEFAULT_COMPANY_THEMES) {
      if (!deduped.includes(theme)) {
        deduped.push(theme);
      }
    }
  }

  if (!hasBuyerRole) {
    for (const role of DEFAULT_BUYER_ROLE_THEMES) {
      if (!deduped.includes(role)) {
        deduped.push(role);
      }
    }
  }

  return deduped;
}

function pickSourcerConstraintValue(
  rawConstraints: Record<string, unknown>,
  rawCampaignContext: Record<string, unknown>,
  rawQualificationRules: Record<string, unknown>,
  key: "targetCountry" | "minCompanySize" | "maxCompanySize",
): string | number | undefined {
  const rawTargetFilters = isPlainRecord(rawQualificationRules.targetFilters)
    ? rawQualificationRules.targetFilters
    : {};

  if (key === "targetCountry") {
    return (
      normalizeCountryCode(rawConstraints.targetCountry) ??
      normalizeCountryCode(rawConstraints.preferredCountry) ??
      normalizeCountryCode(rawCampaignContext.targetCountry) ??
      normalizeCountryCode(rawTargetFilters.preferredCountry)
    );
  }

  if (key === "minCompanySize") {
    return (
      asMaybeInteger(rawConstraints.minCompanySize) ??
      asMaybeInteger(rawConstraints.preferredMinCompanySize) ??
      asMaybeInteger(rawCampaignContext.minCompanySize) ??
      asMaybeInteger(rawTargetFilters.preferredMinCompanySize)
    );
  }

  return (
    asMaybeInteger(rawConstraints.maxCompanySize) ??
    asMaybeInteger(rawConstraints.preferredMaxCompanySize) ??
    asMaybeInteger(rawCampaignContext.maxCompanySize) ??
    asMaybeInteger(rawTargetFilters.preferredMaxCompanySize)
  );
}

function canonicalizeSourcerRequest(payload: Record<string, unknown>): Record<string, unknown> {
  const action = payload.action;
  if (action === "SOURCE_ONE") {
    const persistedState = loadState();
    const rawCampaignContext = isPlainRecord(payload.campaignContext) ? payload.campaignContext : {};
    const rawConstraints = isPlainRecord(payload.constraints) ? payload.constraints : {};
    const rawExclusions = isPlainRecord(payload.exclusions) ? payload.exclusions : {};
    const rawTopLevelTargetFilters = isPlainRecord(payload.targetFilters) ? payload.targetFilters : {};
    const rawQualificationRules = isPlainRecord(payload.qualificationRules)
      ? payload.qualificationRules
      : isPlainRecord(rawConstraints.qualificationRules)
        ? rawConstraints.qualificationRules
        : {};
    const rawTargetFilters = isPlainRecord(rawQualificationRules.targetFilters)
      ? rawQualificationRules.targetFilters
      : rawTopLevelTargetFilters;

    const rawTargetThemes =
      asNonEmptyTrimmedStringArray(rawCampaignContext.targetThemes) ??
      asNonEmptyTrimmedStringArray(payload.targetThemes) ??
      asNonEmptyTrimmedStringArray(rawTargetFilters.preferredRoleThemes) ??
      asNonEmptyTrimmedStringArray(rawTargetFilters.roles) ??
      [];
    const targetThemes = canonicalizeTargetThemes(rawTargetThemes);
    const excludedCompanyNames = appendNormalizedNames(
      persistedState.searchedCompanyNames,
      asNonEmptyTrimmedStringArray(payload.excludedCompanyNames) ??
        asNonEmptyTrimmedStringArray(rawCampaignContext.excludedCompanyNames) ??
        asNonEmptyTrimmedStringArray(rawExclusions.companyNames) ??
        asNonEmptyTrimmedStringArray(rawExclusions.companies) ??
        [],
    );
    const excludedLeadNames = appendNormalizedNames(
      persistedState.registeredLeadNames,
      asNonEmptyTrimmedStringArray(payload.excludedLeadNames) ??
        asNonEmptyTrimmedStringArray(rawCampaignContext.excludedLeadNames) ??
        asNonEmptyTrimmedStringArray(rawExclusions.personNames) ??
        asNonEmptyTrimmedStringArray(rawExclusions.leadNames) ??
        asNonEmptyTrimmedStringArray(rawExclusions.people) ??
        [],
    );

    const canonicalConstraints: Record<string, unknown> = {
      maxCandidatesToReturn: 1,
      webFirst: asMaybeBoolean(rawConstraints.webFirst) ?? asMaybeBoolean(payload.webFirst) ?? true,
      mustIncludeEvidence:
        asMaybeBoolean(rawConstraints.mustIncludeEvidence) ??
        asMaybeBoolean(payload.mustIncludeEvidence) ??
        true,
    };

    const targetCountry =
      (pickSourcerConstraintValue(
        rawConstraints,
        rawCampaignContext,
        rawQualificationRules,
        "targetCountry",
      ) as string | undefined) ??
      normalizeCountryCode(rawTargetFilters.preferredCountry) ??
      normalizeCountryCode(rawTargetFilters.targetCountry) ??
      normalizeCountryCode(firstStringFromArray(rawTargetFilters.countries)) ??
      normalizeCountryCode(payload.targetCountry);
    const minCompanySize =
      (pickSourcerConstraintValue(
        rawConstraints,
        rawCampaignContext,
        rawQualificationRules,
        "minCompanySize",
      ) as number | undefined) ??
      asMaybeInteger(rawTargetFilters.preferredMinCompanySize) ??
      asMaybeInteger(rawTargetFilters.minCompanySize) ??
      asMaybeInteger(rawTargetFilters.minEmployees) ??
      asMaybeInteger(payload.minCompanySize);
    const maxCompanySize =
      (pickSourcerConstraintValue(
        rawConstraints,
        rawCampaignContext,
        rawQualificationRules,
        "maxCompanySize",
      ) as number | undefined) ??
      asMaybeInteger(rawTargetFilters.preferredMaxCompanySize) ??
      asMaybeInteger(rawTargetFilters.maxCompanySize) ??
      asMaybeInteger(rawTargetFilters.maxEmployees) ??
      asMaybeInteger(payload.maxCompanySize);

    if (typeof targetCountry === "string") {
      canonicalConstraints.targetCountry = targetCountry;
    }

    if (typeof minCompanySize === "number") {
      canonicalConstraints.minCompanySize = minCompanySize;
    }

    if (typeof maxCompanySize === "number") {
      canonicalConstraints.maxCompanySize = maxCompanySize;
    }

    return {
      action: "SOURCE_ONE",
      runId: payload.runId,
      campaignContext: {
        targetThemes,
      },
      excludedCompanyNames,
      excludedLeadNames,
      constraints: canonicalConstraints,
    };
  }

  if (action === "ENRICH_ONE") {
    return {
      action: "ENRICH_ONE",
      runId: payload.runId,
      candidateId: payload.candidateId,
      missingFields: payload.missingFields,
      currentDossier: payload.currentDossier,
      constraints: payload.constraints,
    };
  }

  return payload;
}

function canonicalizeQualifierRequest(payload: Record<string, unknown>): Record<string, unknown> {
  const rawCandidate =
    (isPlainRecord(payload.candidate) ? payload.candidate : undefined) ??
    (isPlainRecord(payload.currentDossier) ? payload.currentDossier : undefined) ??
    (isPlainRecord(payload.dossier) ? payload.dossier : undefined) ??
    payload.candidate;
  const candidate = canonicalizeCandidateLike(rawCandidate);
  const rawQualificationRules = isPlainRecord(payload.qualificationRules)
    ? payload.qualificationRules
    : {};
  const rawTopLevelTargetFilters = isPlainRecord(payload.targetFilters) ? payload.targetFilters : {};
  const rawTargetFilters = isPlainRecord(rawQualificationRules.targetFilters)
    ? rawQualificationRules.targetFilters
    : rawTopLevelTargetFilters;

  const targetFilters: Record<string, unknown> = {};
  const preferredCountry = normalizeCountryCode(
    rawTargetFilters.preferredCountry ??
      rawTargetFilters.targetCountry ??
      firstStringFromArray(rawTargetFilters.countries),
  );
  const preferredRegion = asMaybeString(rawTargetFilters.preferredRegion);
  const preferredMinCompanySize = asMaybeInteger(
    rawTargetFilters.preferredMinCompanySize ??
      rawTargetFilters.minCompanySize ??
      rawTargetFilters.minEmployees,
  );
  const preferredMaxCompanySize = asMaybeInteger(
    rawTargetFilters.preferredMaxCompanySize ??
      rawTargetFilters.maxCompanySize ??
      rawTargetFilters.maxEmployees,
  );
  const preferredRoleThemes =
    asNonEmptyTrimmedStringArray(rawTargetFilters.preferredRoleThemes) ??
    asNonEmptyTrimmedStringArray(rawTargetFilters.roles);
  const preferNamedPerson = asMaybeBoolean(rawTargetFilters.preferNamedPerson);

  if (preferredCountry !== undefined) {
    targetFilters.preferredCountry = preferredCountry;
  }

  if (preferredRegion !== undefined) {
    targetFilters.preferredRegion = preferredRegion;
  }

  if (preferredMinCompanySize !== undefined) {
    targetFilters.preferredMinCompanySize = preferredMinCompanySize;
  }

  if (preferredMaxCompanySize !== undefined) {
    targetFilters.preferredMaxCompanySize = preferredMaxCompanySize;
  }

  if (preferredRoleThemes !== undefined) {
    targetFilters.preferredRoleThemes = preferredRoleThemes;
  }

  if (preferNamedPerson !== undefined) {
    targetFilters.preferNamedPerson = preferNamedPerson;
  }

  return {
    action: "QUALIFY_ONE",
    runId: payload.runId,
    candidate,
    qualificationRules: {
      ...DEFAULT_QUALIFICATION_RULES,
      matchMode:
        asMaybeString(rawQualificationRules.matchMode) ??
        asMaybeString(payload.matchMode) ??
        asMaybeString(payload.relaxation) ??
        DEFAULT_QUALIFICATION_RULES.matchMode,
      targetFilters,
    },
  };
}

function canonicalizeCommercialRequest(payload: Record<string, unknown>): Record<string, unknown> {
  const rawCandidate =
    (isPlainRecord(payload.candidate) ? payload.candidate : undefined) ??
    (isPlainRecord(payload.currentDossier) ? payload.currentDossier : undefined) ??
    payload.candidate;
  const candidate = canonicalizeCandidateLike(rawCandidate);
  const rawQualification = isPlainRecord(payload.qualification) ? payload.qualification : {};
  const rawChannelRules = isPlainRecord(payload.channelRules) ? payload.channelRules : {};
  const rawConnectionNote = isPlainRecord(rawChannelRules.connectionNote)
    ? rawChannelRules.connectionNote
    : {};
  const rawDm = isPlainRecord(rawChannelRules.dm) ? rawChannelRules.dm : {};
  const rawEmailSubject = isPlainRecord(rawChannelRules.emailSubject)
    ? rawChannelRules.emailSubject
    : {};
  const rawEmailBody = isPlainRecord(rawChannelRules.emailBody) ? rawChannelRules.emailBody : {};

  return {
    action: "GENERATE_OUTREACH_PACK",
    runId: payload.runId,
    candidate,
    qualification: {
      status:
        asMaybeString(rawQualification.status) === "REJECT" ? "REJECT" : "ACCEPT",
      reasons: asNonEmptyTrimmedStringArray(rawQualification.reasons) ?? ["Commercially relevant lead."],
      ...(isPlainRecord(rawQualification.closeMatch)
        ? {
            closeMatch: {
              summary: firstNonBlankString(rawQualification.closeMatch.summary) ?? "Close match.",
              missedFilters:
                asNonEmptyTrimmedStringArray(rawQualification.closeMatch.missedFilters) ??
                ["requested filters"],
              reasons:
                asNonEmptyTrimmedStringArray(rawQualification.closeMatch.reasons) ??
                ["Strong lead with a near miss."],
            },
          }
        : {}),
    },
    channelRules: {
      languageMode:
        asMaybeString(rawChannelRules.languageMode) === "FORCE_ES" ||
        asMaybeString(rawChannelRules.languageMode) === "FORCE_EN"
          ? asMaybeString(rawChannelRules.languageMode)
          : "MATCH_LEAD_LANGUAGE",
      connectionNote: {
        maxChars: asMaybeInteger(rawConnectionNote.maxChars) ?? 200,
        targetMinChars: asMaybeInteger(rawConnectionNote.targetMinChars) ?? 140,
        targetMaxChars: asMaybeInteger(rawConnectionNote.targetMaxChars) ?? 190,
      },
      dm: {
        minChars: asMaybeInteger(rawDm.minChars) ?? 320,
        maxChars: asMaybeInteger(rawDm.maxChars) ?? 650,
        paragraphCount: asMaybeInteger(rawDm.paragraphCount) ?? 3,
      },
      emailSubject: {
        minWords: asMaybeInteger(rawEmailSubject.minWords) ?? 2,
        maxWords: asMaybeInteger(rawEmailSubject.maxWords) ?? 5,
      },
      emailBody: {
        minWords: asMaybeInteger(rawEmailBody.minWords) ?? 70,
        maxWords: asMaybeInteger(rawEmailBody.maxWords) ?? 130,
        minSentences: asMaybeInteger(rawEmailBody.minSentences) ?? 3,
        maxSentences: asMaybeInteger(rawEmailBody.maxSentences) ?? 5,
      },
    },
  };
}

function canonicalizeCrmRequest(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.action === "GET_CAMPAIGN_STATE") {
    return {
      action: "GET_CAMPAIGN_STATE",
      runId: payload.runId,
    };
  }

  if (payload.action === "GET_PENDING_SHORTLIST") {
    return {
      action: "GET_PENDING_SHORTLIST",
      runId: payload.runId,
      shortlistId: payload.shortlistId,
    };
  }

  if (payload.action === "CLEAR_PENDING_SHORTLIST") {
    return {
      action: "CLEAR_PENDING_SHORTLIST",
      runId: payload.runId,
      shortlistId: payload.shortlistId,
    };
  }

  if (payload.action === "SAVE_PENDING_SHORTLIST") {
    const pendingShortlist = isPlainRecord(payload.pendingShortlist)
      ? payload.pendingShortlist
      : isPlainRecord(payload.shortlist)
        ? payload.shortlist
        : {};

    return {
      action: "SAVE_PENDING_SHORTLIST",
      runId: payload.runId,
      pendingShortlist: {
        originalRequestSummary: pendingShortlist.originalRequestSummary,
        options: pendingShortlist.options,
      },
    };
  }

  if (payload.action === "REGISTER_ACCEPTED_LEAD") {
    const rawLead: Record<string, unknown> = isPlainRecord(payload.lead) ? payload.lead : {};
    const rawCandidate: Record<string, unknown> =
      (isPlainRecord(payload.candidate) ? payload.candidate : undefined) ??
      (isPlainRecord(payload.currentDossier) ? payload.currentDossier : undefined) ??
      rawLead ??
      {};
    const fitSignals =
      asNonEmptyTrimmedStringArray(rawCandidate.fitSignals) ??
      asNonEmptyTrimmedStringArray(rawLead.fitSignals) ??
      (isPlainRecord(payload.decision)
        ? asNonEmptyTrimmedStringArray(payload.decision.reasons)
        : undefined) ??
      [];
    const evidence =
      normalizeEvidenceItems(rawCandidate.evidence) ??
      normalizeEvidenceItems(rawLead.evidence) ??
      [];
    const candidate = canonicalizeCandidateLike({
      ...rawLead,
      ...rawCandidate,
      fitSignals,
      evidence,
      notes: rawCandidate.notes ?? rawLead.notes ?? rawLead.summary,
      candidateId: rawCandidate.candidateId ?? rawLead.candidateId ?? payload.candidateId,
    });
    const decision = isPlainRecord(payload.decision)
      ? { status: "ACCEPT", reasons: payload.decision.reasons }
      : payload.decision;

    let campaignStateUpdate = payload.campaignStateUpdate;
    if (!isPlainRecord(campaignStateUpdate)) {
      const candidatePersonName = firstNonBlankString(candidate.person.fullName);
      const candidateCompanyName = firstNonBlankString(candidate.company.name);

      if (candidatePersonName !== undefined && candidateCompanyName !== undefined) {
        campaignStateUpdate = {
          searchedCompanyNamesAdd: [candidateCompanyName],
          registeredLeadNamesAdd: [candidatePersonName],
        };
      }
    }

    return {
      action: "REGISTER_ACCEPTED_LEAD",
      runId: payload.runId,
      candidate,
      decision,
      outreachPack: isPlainRecord(payload.outreachPack) ? payload.outreachPack : undefined,
      campaignStateUpdate,
    };
  }

  if (payload.action === "REGISTER_REJECTED_CANDIDATE") {
    const rawCandidate = isPlainRecord(payload.candidate) ? payload.candidate : {};
    const rawPerson = isPlainRecord(rawCandidate.person) ? rawCandidate.person : {};
    const rawCompany = isPlainRecord(rawCandidate.company) ? rawCandidate.company : {};

    let campaignStateUpdate = payload.campaignStateUpdate;
    const companyName =
      asMaybeString(rawCandidate.companyName) ?? asMaybeString(rawCompany.name);
    if (!isPlainRecord(campaignStateUpdate) && companyName !== undefined) {
      campaignStateUpdate = {
        searchedCompanyNamesAdd: [companyName],
        registeredLeadNamesAdd: [],
      };
    }

    return {
      action: "REGISTER_REJECTED_CANDIDATE",
      runId: payload.runId,
      candidate: {
        candidateId: rawCandidate.candidateId,
        personName:
          asMaybeString(rawCandidate.personName) ?? asMaybeString(rawPerson.fullName),
        companyName,
      },
      decision: isPlainRecord(payload.decision)
        ? { status: "REJECT", reasons: payload.decision.reasons }
        : payload.decision,
      campaignStateUpdate,
    };
  }

  return payload;
}

export function canonicalizeProspectingRequest(
  contract: ProspectingContract,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (contract === "sourcer_request") {
    return canonicalizeSourcerRequest(payload);
  }

  if (contract === "qualifier_request") {
    return canonicalizeQualifierRequest(payload);
  }

  if (contract === "commercial_request") {
    return canonicalizeCommercialRequest(payload);
  }

  if (contract === "crm_request") {
    return canonicalizeCrmRequest(payload);
  }

  return payload;
}

type MainLanguage = "es" | "en";
type MainMatchMode = (typeof MAIN_MATCH_MODES)[number];

type MainAcceptedLead = {
  leadName: string;
  companyName: string;
  reasons: string[];
  optionIndex?: number;
};

type MainOutreachPack = {
  sourceNotes: string;
  hook1: string;
  hook2: string;
  fitSummary: string;
  connectionNoteDraft: string;
  dmDraft: string;
  emailSubjectDraft: string;
  emailBodyDraft: string;
  nextActionType: "connection_request";
};

type MainCloseMatch = {
  summary: string;
  missedFilters: string[];
  reasons: string[];
};

type MainShortlistOption = {
  candidate: Record<string, unknown>;
  summary: string;
  missedFilters: string[];
  reasons: string[];
  outreachPack?: MainOutreachPack;
};

type MainLeadSearchState = {
  mode: "lead_search";
  language: MainLanguage;
  requestId: string;
  originalRequestSummary: string;
  requestedLeadCount: number;
  targetFilters: Record<string, unknown>;
  sourcerTargetThemes: string[];
  attemptBudget: number;
  attemptIndex: number;
  acceptedLeads: MainAcceptedLead[];
  shortlistOptions: MainShortlistOption[];
  seenCompanies: string[];
  seenLeadNames: string[];
  currentCandidate: Record<string, unknown> | null;
  currentQualificationReasons: string[];
  currentCloseMatch: MainCloseMatch | null;
  currentOutreachPack: MainOutreachPack | null;
  currentMatchMode: MainMatchMode | null;
  enrichRoundCount: number;
  awaitingAction: string | null;
};

type MainShortlistRegistrationState = {
  mode: "shortlist_registration";
  language: MainLanguage;
  requestId: string;
  selectedIndexes: number[];
  remainingIndexes: number[];
  insertedSelections: MainAcceptedLead[];
  pendingShortlist: Record<string, unknown> | null;
  awaitingAction: string | null;
};

type MainFlowState = MainLeadSearchState | MainShortlistRegistrationState;

type MainNextSendRequest = {
  sessionKey: string;
  contract: "crm_request" | "sourcer_request" | "qualifier_request" | "commercial_request";
  responseContract:
    | "crm_response"
    | "sourcer_response"
    | "qualifier_response"
    | "commercial_response";
  expectedAction: string;
  payload: Record<string, unknown>;
  responseContext?: Record<string, unknown>;
};

type MainWorkerResult = {
  contract: "crm_response" | "sourcer_response" | "qualifier_response" | "commercial_response";
  ok: boolean;
  status: "VALID" | "INVALID" | "MALFORMED" | "TIMEOUT";
  parsed?: Record<string, unknown>;
  error?: string;
};

type MainNextActionResult =
  | {
      ok: true;
      outcome: "send_request";
      state: MainFlowState;
      request: MainNextSendRequest;
    }
  | {
      ok: true;
      outcome: "final";
      state: MainFlowState;
      finalType: "INSERTED" | "SHORTLIST" | "NO_LEAD" | "FAILED";
      userMessage: string;
    }
  | {
      ok: false;
      outcome: "final";
      finalType: "FAILED";
      userMessage: string;
    };

function detectMainLanguage(userText: string): MainLanguage {
  return /(busca|lead|leads|registra|campa|espa[ñn]a|empresa|empleados)/i.test(userText) ? "es" : "en";
}

function shortId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseRequestedLeadCount(userText: string): number {
  const digitMatch = userText.match(/\b(\d+)\s+(?:lead|leads|contacto|contactos)\b/i);
  const count = digitMatch ? Number.parseInt(digitMatch[1]!, 10) : 1;
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function parseCompanySizeRange(userText: string): { min?: number; max?: number } {
  const betweenMatch =
    userText.match(/\bentre\s+(\d+)\s+(?:y|e|-|a)\s+(\d+)\s+emplead/i) ??
    userText.match(/\b(\d+)\s*-\s*(\d+)\s+emplead/i);

  if (!betweenMatch) {
    return {};
  }

  const min = Number.parseInt(betweenMatch[1]!, 10);
  const max = Number.parseInt(betweenMatch[2]!, 10);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {};
  }

  return min <= max ? { min, max } : { min: max, max: min };
}

function parseTargetFiltersFromUserText(userText: string): Record<string, unknown> {
  const lowered = userText.toLowerCase();
  const size = parseCompanySizeRange(userText);
  const roleThemes = asNonEmptyTrimmedStringArray(
    Array.from(new Set([
      lowered.includes("founder") ? "founder" : null,
      lowered.includes("cofounder") ? "cofounder" : null,
      lowered.includes("ceo") ? "ceo" : null,
      lowered.includes("cto") ? "cto" : null,
      lowered.includes("head of engineering") ? "head of engineering" : null,
      lowered.includes("engineering manager") ? "engineering manager" : null,
      lowered.includes("ai lead") ? "ai lead" : null,
      lowered.includes("technical recruiter") ? "technical recruiter" : null,
      lowered.includes("talent") ? "technical recruiter" : null,
    ].filter((value): value is string => value !== null))),
  );
  const normalizedRoleThemes =
    roleThemes && roleThemes.length > 0 ? roleThemes : [...DEFAULT_BUYER_ROLE_THEMES];

  return {
    preferredCountry:
      /(espa[ñn]a|spain|\ben\s+es\b|\bes\b)/i.test(userText) ? "es" : undefined,
    preferredRegion: /(europa|europe)/i.test(userText) ? "europe" : undefined,
    preferredMinCompanySize: size.min,
    preferredMaxCompanySize: size.max,
    preferredRoleThemes: normalizedRoleThemes,
    preferNamedPerson: true,
  };
}

function parseSourcerThemesFromUserText(userText: string): string[] {
  const lowered = userText.toLowerCase();
  const rawThemes = [
    ...DEFAULT_BUYER_ROLE_THEMES,
    ...DEFAULT_COMPANY_THEMES,
    lowered.includes("spain") || lowered.includes("espa") ? "Spain" : null,
    lowered.includes("europa") || lowered.includes("europe") ? "Europe" : null,
    lowered.includes("it") ? "IT company" : null,
    lowered.includes("software") ? "software company" : null,
    lowered.includes("ai") || lowered.includes("genai") ? "AI consultancy" : null,
    lowered.includes("automation") ? "automation agency" : null,
  ].filter((value): value is string => value !== null);

  return canonicalizeTargetThemes(rawThemes);
}

function initialLeadSearchState(userText: string): MainLeadSearchState {
  const language = detectMainLanguage(userText);
  const requestedLeadCount = parseRequestedLeadCount(userText);
  return {
    mode: "lead_search",
    language,
    requestId: shortId("lead"),
    originalRequestSummary: userText.trim(),
    requestedLeadCount,
    targetFilters: parseTargetFiltersFromUserText(userText),
    sourcerTargetThemes: parseSourcerThemesFromUserText(userText),
    attemptBudget: Math.min(
      Math.max(DEFAULT_LEAD_ATTEMPT_BUDGET, requestedLeadCount * DEFAULT_LEAD_ATTEMPT_BUDGET),
      MAX_LEAD_ATTEMPT_BUDGET,
    ),
    attemptIndex: 0,
    acceptedLeads: [],
    shortlistOptions: [],
    seenCompanies: [],
    seenLeadNames: [],
    currentCandidate: null,
    currentQualificationReasons: [],
    currentCloseMatch: null,
    currentOutreachPack: null,
    currentMatchMode: null,
    enrichRoundCount: 0,
    awaitingAction: null,
  };
}

function initialShortlistRegistrationState(
  userText: string,
): MainShortlistRegistrationState {
  const selectedIndexes = Array.from(
    new Set(
      [...userText.matchAll(/\b([1-9]\d*)\b/g)]
        .map((match) => Number.parseInt(match[1]!, 10))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  return {
    mode: "shortlist_registration",
    language: detectMainLanguage(userText),
    requestId: shortId("shortlist"),
    selectedIndexes,
    remainingIndexes: [...selectedIndexes],
    insertedSelections: [],
    pendingShortlist: null,
    awaitingAction: null,
  };
}

function buildFinalResult(
  state: MainFlowState,
  finalType: "INSERTED" | "SHORTLIST" | "NO_LEAD" | "FAILED",
  userMessage: string,
): MainNextActionResult {
  return {
    ok: true,
    outcome: "final",
    state,
    finalType,
    userMessage,
  };
}

function buildFailure(language: MainLanguage, message?: string): MainNextActionResult {
  return {
    ok: false,
    outcome: "final",
    finalType: "FAILED",
    userMessage:
      message ??
      (language === "es"
        ? "No pude completar el flujo por un problema operativo. Inténtalo de nuevo."
        : "I could not complete the flow because of an operational problem. Please retry."),
  };
}

function coerceMainWorkerResult(raw: unknown): MainWorkerResult | null {
  if (!isPlainRecord(raw)) {
    return null;
  }

  const contract =
    raw.contract === "crm_response" ||
    raw.contract === "sourcer_response" ||
    raw.contract === "qualifier_response" ||
    raw.contract === "commercial_response"
      ? raw.contract
      : null;
  const status =
    raw.status === "VALID" ||
    raw.status === "INVALID" ||
    raw.status === "MALFORMED" ||
    raw.status === "TIMEOUT"
      ? raw.status
      : null;

  if (contract === null || status === null || typeof raw.ok !== "boolean") {
    return null;
  }

  return {
    contract,
    ok: raw.ok,
    status,
    parsed: isPlainRecord(raw.parsed) ? raw.parsed : undefined,
    error: firstNonBlankString(raw.error),
  };
}

function coerceAcceptedLead(raw: unknown): MainAcceptedLead | null {
  if (!isPlainRecord(raw)) {
    return null;
  }

  const leadName = firstNonBlankString(raw.leadName);
  const companyName = firstNonBlankString(raw.companyName);
  if (!leadName || !companyName) {
    return null;
  }

  return {
    leadName,
    companyName,
    reasons: asNonEmptyTrimmedStringArray(raw.reasons) ?? [],
    optionIndex: asMaybeInteger(raw.optionIndex),
  };
}

function coerceOutreachPack(raw: unknown): MainOutreachPack | null {
  if (!isPlainRecord(raw)) {
    return null;
  }

  const sourceNotes = firstNonBlankString(raw.sourceNotes);
  const hook1 = firstNonBlankString(raw.hook1);
  const hook2 = firstNonBlankString(raw.hook2);
  const fitSummary = firstNonBlankString(raw.fitSummary);
  const connectionNoteDraft = firstNonBlankString(raw.connectionNoteDraft);
  const dmDraft = firstNonBlankString(raw.dmDraft);
  const emailSubjectDraft = firstNonBlankString(raw.emailSubjectDraft);
  const emailBodyDraft = firstNonBlankString(raw.emailBodyDraft);

  if (
    !sourceNotes ||
    !hook1 ||
    !hook2 ||
    !fitSummary ||
    !connectionNoteDraft ||
    !dmDraft ||
    !emailSubjectDraft ||
    !emailBodyDraft
  ) {
    return null;
  }

  return {
    sourceNotes,
    hook1,
    hook2,
    fitSummary,
    connectionNoteDraft,
    dmDraft,
    emailSubjectDraft,
    emailBodyDraft,
    nextActionType: "connection_request",
  };
}

function trimToSentenceBoundary(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const clipped = trimmed.slice(0, maxChars);
  const lastSentence = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf("!"), clipped.lastIndexOf("?"));
  if (lastSentence >= Math.floor(maxChars * 0.6)) {
    return clipped.slice(0, lastSentence + 1).trim();
  }

  return clipped.trimEnd();
}

function truncateConnectionNote(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 200) {
    return normalized;
  }

  const variants = [
    normalized,
    normalized
      .replace("Me gustaría conectar y compartir una idea concreta.", "Me gustaría conectar y compartir una idea.")
      .replace("Me gustaría conectar y compartirte una idea concreta.", "Me gustaría conectar y compartir una idea.")
      .replace("automatizar trabajo interno", "automatizar trabajo"),
  ];

  for (const variant of variants) {
    if (variant.length <= 200) {
      return variant;
    }
  }

  return trimToSentenceBoundary(variants[variants.length - 1]!, 200);
}

function evidenceClaimSummary(candidate: Record<string, unknown> | null): string | null {
  if (!candidate) {
    return null;
  }

  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : [];
  for (const item of evidence) {
    if (!isPlainRecord(item)) {
      continue;
    }

    const claim = firstNonBlankString(item.claim);
    if (claim) {
      return claim;
    }
  }

  return null;
}

function fallbackHookValues(
  candidate: Record<string, unknown> | null,
  reasons: string[],
): { hook1: string; hook2: string; fitSummary: string; sourceNotes: string } {
  const fitSignals = candidate && Array.isArray(candidate.fitSignals)
    ? candidate.fitSignals
        .map((value) => firstNonBlankString(value))
        .filter((value): value is string => Boolean(value))
    : [];
  const hook1 = fitSignals[0] ?? reasons[0] ?? "Spain-based technical lead";
  const hook2 = fitSignals[1] ?? reasons[1] ?? "Potential fit for agentic automation";
  const fitSummary =
    firstNonBlankString(candidate && isPlainRecord(candidate) ? candidate.notes : undefined) ??
    [hook1, hook2].filter(Boolean).join(". ");
  const sourceNotes = [reasons.join(" "), evidenceClaimSummary(candidate)].filter(Boolean).join(" | ");

  return {
    hook1,
    hook2,
    fitSummary,
    sourceNotes: sourceNotes.length > 0 ? sourceNotes : [hook1, hook2].join(" | "),
  };
}

function buildFallbackOutreachPack(
  language: MainLanguage,
  candidate: Record<string, unknown> | null,
  reasons: string[],
): MainOutreachPack {
  const leadName = candidateLeadName(candidate) ?? (language === "es" ? "equipo" : "team");
  const companyName = candidateCompanyName(candidate) ?? (language === "es" ? "tu empresa" : "your company");
  const person = candidate && isPlainRecord(candidate.person) ? candidate.person : {};
  const roleTitle =
    firstNonBlankString(person.roleTitle) ??
    (language === "es" ? "un rol técnico" : "a technical role");
  const normalizedRole = roleTitle.replace(/\.$/, "");
  const { hook1, hook2, fitSummary, sourceNotes } = fallbackHookValues(candidate, reasons);

  const connectionNote =
    language === "es"
      ? truncateConnectionNote(
          `Hola ${leadName}, vi que en ${companyName} llevas ${normalizedRole}. Diseño sistemas agentic/GenAI para automatizar trabajo interno en equipos IT pequeños. Me gustaría conectar y compartir una idea concreta.`,
        )
      : truncateConnectionNote(
          `Hi ${leadName}, I saw that at ${companyName} you lead ${normalizedRole}. I build agentic/GenAI systems that automate internal work for small IT teams. I’d like to connect and share one relevant idea.`,
        );

  const dmDraft =
    language === "es"
      ? `Hola ${leadName}.\n\nVi que en ${companyName} llevas ${normalizedRole} y pensé que podía ser relevante escribirte porque suelo ayudar a equipos IT pequeños a convertir trabajo interno repetitivo en sistemas agentic/GenAI útiles.\n\nEn contextos como el vuestro eso suele aterrizar en automatización de operaciones, research comercial o preparación de propuestas. Si te interesa, te comparto una idea concreta que sí tendría sentido para vuestro entorno.`
      : `Hi ${leadName}.\n\nI noticed that at ${companyName} you lead ${normalizedRole}, which is why I thought this might be relevant. I usually help small IT teams turn repetitive internal work into useful agentic/GenAI systems.\n\nIn setups like yours that usually means automating operations, commercial research, or proposal preparation. If useful, I can share one concrete idea that would plausibly fit your environment.`;

  const emailSubjectDraft =
    language === "es" ? "automatización interna genai" : "internal genai workflows";

  const emailBodyDraft =
    language === "es"
      ? `Hola ${leadName}. Vi que en ${companyName} llevas ${normalizedRole}, y pensé que podía ser relevante escribirte porque suelo ayudar a equipos IT pequeños a convertir trabajo interno repetitivo en sistemas agentic/GenAI útiles. En contextos como el vuestro eso suele aterrizar en automatización de operaciones, research comercial o preparación de propuestas sin añadir una capa grande de producto. La idea no es vender humo, sino detectar un flujo manual claro y resolverlo de forma pequeña, medible y útil. Si te interesa, te comparto por aquí una idea concreta que sí tendría sentido para vuestro contexto.`
      : `Hi ${leadName}. I saw that at ${companyName} you lead ${normalizedRole}, and I thought it might be relevant to reach out because I help small IT teams turn repetitive internal work into useful agentic/GenAI systems. In setups like yours that usually means automating operations, commercial research, or proposal preparation without adding a heavy product layer. The goal is not vague AI hype, but finding one clear manual workflow and solving it in a small, measurable, useful way. If helpful, I can share one concrete idea that would plausibly fit your context.`;

  return {
    sourceNotes,
    hook1,
    hook2,
    fitSummary,
    connectionNoteDraft: connectionNote,
    dmDraft,
    emailSubjectDraft,
    emailBodyDraft,
    nextActionType: "connection_request",
  };
}

function coerceLeadShortlistOption(raw: unknown): MainShortlistOption | null {
  if (!isPlainRecord(raw)) {
    return null;
  }

  const candidate = asCandidateRecord(raw.candidate);
  const summary = firstNonBlankString(raw.summary);
  const missedFilters = asNonEmptyTrimmedStringArray(raw.missedFilters);
  const reasons = asNonEmptyTrimmedStringArray(raw.reasons);

  if (!candidate || !summary || !missedFilters || !reasons) {
    return null;
  }

  return {
    candidate,
    summary,
    missedFilters,
    reasons,
    outreachPack: coerceOutreachPack(raw.outreachPack) ?? undefined,
  };
}

function coercePositiveIntArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .map((value) => asMaybeInteger(value))
        .filter((value): value is number => value !== undefined && value > 0),
    ),
  );
}

function coerceLeadSearchTargetFilters(
  raw: unknown,
  originalRequestSummary: string,
): Record<string, unknown> {
  const fallbackFilters = parseTargetFiltersFromUserText(originalRequestSummary);

  if (!isPlainRecord(raw)) {
    return fallbackFilters;
  }

  const preferredRoleThemes = asNonEmptyTrimmedStringArray(raw.preferredRoleThemes);

  return {
    preferredCountry:
      normalizeCountryCode(raw.preferredCountry) ??
      fallbackFilters.preferredCountry,
    preferredRegion:
      firstNonBlankString(raw.preferredRegion) ??
      fallbackFilters.preferredRegion,
    preferredMinCompanySize:
      asMaybeInteger(raw.preferredMinCompanySize) ??
      fallbackFilters.preferredMinCompanySize,
    preferredMaxCompanySize:
      asMaybeInteger(raw.preferredMaxCompanySize) ??
      fallbackFilters.preferredMaxCompanySize,
    preferredRoleThemes:
      preferredRoleThemes && preferredRoleThemes.length > 0
        ? preferredRoleThemes
        : [...DEFAULT_BUYER_ROLE_THEMES],
    preferNamedPerson: asMaybeBoolean(raw.preferNamedPerson) ?? true,
  };
}

function coerceMainFlowState(raw: unknown): MainFlowState | null {
  if (!isPlainRecord(raw) || typeof raw.mode !== "string") {
    return null;
  }

  if (raw.mode === "lead_search") {
    const originalRequestSummary = firstNonBlankString(raw.originalRequestSummary);
    if (!originalRequestSummary) {
      return null;
    }

    const requestedLeadCount =
      asMaybeInteger(raw.requestedLeadCount) ?? parseRequestedLeadCount(originalRequestSummary);

    return {
      mode: "lead_search",
      language: raw.language === "en" ? "en" : detectMainLanguage(originalRequestSummary),
      requestId: firstNonBlankString(raw.requestId) ?? shortId("lead"),
      originalRequestSummary,
      requestedLeadCount:
        Number.isFinite(requestedLeadCount) && requestedLeadCount > 0 ? requestedLeadCount : 1,
      targetFilters: coerceLeadSearchTargetFilters(raw.targetFilters, originalRequestSummary),
      sourcerTargetThemes: canonicalizeTargetThemes(
        raw.sourcerTargetThemes ?? parseSourcerThemesFromUserText(originalRequestSummary),
      ),
      attemptBudget: Math.min(
        Math.max(asMaybeInteger(raw.attemptBudget) ?? DEFAULT_LEAD_ATTEMPT_BUDGET, 1),
        MAX_LEAD_ATTEMPT_BUDGET,
      ),
      attemptIndex: Math.max(asMaybeInteger(raw.attemptIndex) ?? 0, 0),
      acceptedLeads: Array.isArray(raw.acceptedLeads)
        ? raw.acceptedLeads
            .map((value) => coerceAcceptedLead(value))
            .filter((value): value is MainAcceptedLead => value !== null)
        : [],
      shortlistOptions: Array.isArray(raw.shortlistOptions)
        ? raw.shortlistOptions
            .map((value) => coerceLeadShortlistOption(value))
            .filter((value): value is MainShortlistOption => value !== null)
        : [],
      seenCompanies: appendCompanyMatchKeys(
        [],
        asNonEmptyTrimmedStringArray(raw.seenCompanies) ?? [],
      ),
      seenLeadNames: appendNormalizedNames(
        [],
        asNonEmptyTrimmedStringArray(raw.seenLeadNames) ?? [],
      ),
      currentCandidate: asCandidateRecord(raw.currentCandidate),
      currentQualificationReasons: asNonEmptyTrimmedStringArray(raw.currentQualificationReasons) ?? [],
      currentCloseMatch:
        isPlainRecord(raw.currentCloseMatch) &&
        firstNonBlankString(raw.currentCloseMatch.summary) &&
        asNonEmptyTrimmedStringArray(raw.currentCloseMatch.missedFilters) &&
        asNonEmptyTrimmedStringArray(raw.currentCloseMatch.reasons)
          ? {
              summary: firstNonBlankString(raw.currentCloseMatch.summary)!,
              missedFilters: asNonEmptyTrimmedStringArray(raw.currentCloseMatch.missedFilters)!,
              reasons: asNonEmptyTrimmedStringArray(raw.currentCloseMatch.reasons)!,
            }
          : null,
      currentOutreachPack: coerceOutreachPack(raw.currentOutreachPack),
      currentMatchMode:
        typeof raw.currentMatchMode === "string" &&
        MAIN_MATCH_MODES.includes(raw.currentMatchMode as MainMatchMode)
          ? (raw.currentMatchMode as MainMatchMode)
          : null,
      enrichRoundCount: Math.max(asMaybeInteger(raw.enrichRoundCount) ?? 0, 0),
      awaitingAction: firstNonBlankString(raw.awaitingAction) ?? null,
    };
  }

  if (raw.mode === "shortlist_registration") {
    return {
      mode: "shortlist_registration",
      language: raw.language === "en" ? "en" : "es",
      requestId: firstNonBlankString(raw.requestId) ?? shortId("shortlist"),
      selectedIndexes: coercePositiveIntArray(raw.selectedIndexes),
      remainingIndexes: coercePositiveIntArray(raw.remainingIndexes),
      insertedSelections: Array.isArray(raw.insertedSelections)
        ? raw.insertedSelections
            .map((value) => coerceAcceptedLead(value))
            .filter((value): value is MainAcceptedLead => value !== null)
        : [],
      pendingShortlist: isPlainRecord(raw.pendingShortlist) ? raw.pendingShortlist : null,
      awaitingAction: firstNonBlankString(raw.awaitingAction) ?? null,
    };
  }

  return null;
}

function currentLeadMatchMode(attemptIndex: number): MainMatchMode {
  if (attemptIndex <= 0) {
    return "STRICT";
  }

  if (attemptIndex <= 2) {
    return "RELAX_SIZE";
  }

  if (attemptIndex <= 4) {
    return "RELAX_GEO";
  }

  return "BEST_AVAILABLE";
}

function asCandidateRecord(candidate: unknown): Record<string, unknown> | null {
  if (!isPlainRecord(candidate)) {
    return null;
  }

  const canonical = canonicalizeCandidateLike(candidate);
  if (!isNonBlankString(canonical.candidateId) || !isNonBlankString(canonical.company.name)) {
    return null;
  }

  return canonical as unknown as Record<string, unknown>;
}

function candidateLeadName(candidate: Record<string, unknown> | null): string | null {
  if (!candidate) {
    return null;
  }

  const person = isPlainRecord(candidate.person) ? candidate.person : {};
  return firstNonBlankString(person.fullName) ?? null;
}

function candidateCompanyName(candidate: Record<string, unknown> | null): string | null {
  if (!candidate) {
    return null;
  }

  const company = isPlainRecord(candidate.company) ? candidate.company : {};
  return firstNonBlankString(company.name) ?? null;
}

function clearCurrentLeadContext(state: MainLeadSearchState): MainLeadSearchState {
  state.currentCandidate = null;
  state.currentQualificationReasons = [];
  state.currentCloseMatch = null;
  state.currentOutreachPack = null;
  state.enrichRoundCount = 0;
  return state;
}

function addSeenCandidate(
  state: MainLeadSearchState,
  candidate: Record<string, unknown> | null,
): MainLeadSearchState {
  const leadName = candidateLeadName(candidate);
  const companyName = candidateCompanyName(candidate);
  state.seenCompanies = appendCompanyMatchKeys(
    state.seenCompanies,
    companyName ? [companyName] : undefined,
  );
  state.seenLeadNames = appendNormalizedNames(
    state.seenLeadNames,
    leadName ? [leadName] : undefined,
  );
  return state;
}

function isDuplicateCandidate(
  state: MainLeadSearchState,
  candidate: Record<string, unknown> | null,
): boolean {
  const leadName = candidateLeadName(candidate);
  const companyName = candidateCompanyName(candidate);
  const companyKeys = companyName !== null ? companyMatchKeys(companyName) : [];
  return (
    companyKeys.some((key) => state.seenCompanies.includes(key)) ||
    (leadName !== null && state.seenLeadNames.includes(normalizeName(leadName)))
  );
}

function buildGetCampaignStateRequest(state: MainLeadSearchState): MainNextSendRequest {
  state.awaitingAction = "GET_CAMPAIGN_STATE";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "GET_CAMPAIGN_STATE",
    responseContext: {
      expectedAction: "GET_CAMPAIGN_STATE",
    },
    payload: {
      action: "GET_CAMPAIGN_STATE",
      runId: `${state.requestId}_state`,
    },
  };
}

function buildSourcerRequest(state: MainLeadSearchState): MainNextSendRequest {
  const matchMode = currentLeadMatchMode(state.attemptIndex);
  state.currentMatchMode = matchMode;

  const targetFilters = isPlainRecord(state.targetFilters) ? state.targetFilters : {};
  const constraints: Record<string, unknown> = {
    maxCandidatesToReturn: 1,
    webFirst: true,
    mustIncludeEvidence: true,
  };

  const preferredCountry = asMaybeString(targetFilters.preferredCountry);
  const preferredMinCompanySize = asMaybeInteger(targetFilters.preferredMinCompanySize);
  const preferredMaxCompanySize = asMaybeInteger(targetFilters.preferredMaxCompanySize);

  if (matchMode === "STRICT") {
    if (preferredCountry) {
      constraints.targetCountry = preferredCountry;
    }
    if (preferredMinCompanySize !== undefined) {
      constraints.minCompanySize = preferredMinCompanySize;
    }
    if (preferredMaxCompanySize !== undefined) {
      constraints.maxCompanySize = preferredMaxCompanySize;
    }
  } else if (matchMode === "RELAX_SIZE") {
    if (preferredCountry) {
      constraints.targetCountry = preferredCountry;
    }
    constraints.minCompanySize = 1;
    constraints.maxCompanySize = Math.max(preferredMaxCompanySize ?? 100, 100);
  } else if (matchMode === "RELAX_GEO") {
    constraints.minCompanySize = 1;
    constraints.maxCompanySize = Math.max(preferredMaxCompanySize ?? 100, 100);
  }

  const targetThemes = [...state.sourcerTargetThemes];
  if (matchMode === "RELAX_GEO" || matchMode === "BEST_AVAILABLE") {
    for (const theme of ["Europe", "CET timezone", "remote Europe"]) {
      if (!targetThemes.includes(theme)) {
        targetThemes.push(theme);
      }
    }
  }

  state.awaitingAction = "SOURCE_ONE";
  return {
    sessionKey: "agent:sourcer:main",
    contract: "sourcer_request",
    responseContract: "sourcer_response",
    expectedAction: "SOURCE_ONE",
    responseContext: {
      excludedCompanyNames: state.seenCompanies,
      excludedLeadNames: state.seenLeadNames,
    },
    payload: {
      action: "SOURCE_ONE",
      runId: `${state.requestId}_source_${state.attemptIndex}`,
      campaignContext: {
        targetThemes,
      },
      excludedCompanyNames: state.seenCompanies,
      excludedLeadNames: state.seenLeadNames,
      constraints,
    },
  };
}

function buildQualifierRequest(
  state: MainLeadSearchState,
  candidate: Record<string, unknown>,
): MainNextSendRequest {
  state.awaitingAction = "QUALIFY_ONE";
  return {
    sessionKey: "agent:qualifier:main",
    contract: "qualifier_request",
    responseContract: "qualifier_response",
    expectedAction: "QUALIFY_ONE",
    responseContext: {
      expectedCandidateId: candidate.candidateId,
      enrichRoundCount: state.enrichRoundCount,
      maxEnrichRounds: 1,
    },
    payload: {
      action: "QUALIFY_ONE",
      runId: `${state.requestId}_qualify_${state.attemptIndex}_${state.enrichRoundCount}`,
      candidate,
      qualificationRules: {
        allowedStatuses: ["ACCEPT", "REJECT", "ENRICH"],
        mustExplainDecision: true,
        matchMode: state.currentMatchMode ?? currentLeadMatchMode(state.attemptIndex),
        targetFilters: state.targetFilters,
      },
    },
  };
}

function buildEnrichRequest(
  state: MainLeadSearchState,
  candidate: Record<string, unknown>,
  missingFields: string[],
): MainNextSendRequest {
  state.awaitingAction = "ENRICH_ONE";
  return {
    sessionKey: "agent:sourcer:main",
    contract: "sourcer_request",
    responseContract: "sourcer_response",
    expectedAction: "ENRICH_ONE",
    responseContext: {
      expectedCandidateId: candidate.candidateId,
      excludedCompanyNames: state.seenCompanies,
      excludedLeadNames: state.seenLeadNames,
    },
    payload: {
      action: "ENRICH_ONE",
      runId: `${state.requestId}_enrich_${state.attemptIndex}`,
      candidateId: candidate.candidateId,
      missingFields,
      currentDossier: candidate,
      constraints: {
        maxCandidatesToReturn: 1,
        webFirst: true,
        mustIncludeEvidence: true,
      },
    },
  };
}

function buildCommercialRequest(
  state: MainLeadSearchState,
  candidate: Record<string, unknown>,
): MainNextSendRequest {
  state.awaitingAction = "GENERATE_OUTREACH_PACK";
  return {
    sessionKey: "agent:commercial:main",
    contract: "commercial_request",
    responseContract: "commercial_response",
    expectedAction: "GENERATE_OUTREACH_PACK",
    responseContext: {
      expectedCandidateId: candidate.candidateId,
    },
    payload: {
      action: "GENERATE_OUTREACH_PACK",
      runId: `${state.requestId}_commercial_${state.attemptIndex}_${state.enrichRoundCount}`,
      candidate,
      qualification: {
        status: state.currentCloseMatch ? "REJECT" : "ACCEPT",
        reasons:
          state.currentQualificationReasons.length > 0
            ? state.currentQualificationReasons
            : ["Commercially relevant lead."],
        ...(state.currentCloseMatch ? { closeMatch: state.currentCloseMatch } : {}),
      },
      channelRules: {
        languageMode: "MATCH_LEAD_LANGUAGE",
        connectionNote: {
          maxChars: 200,
          targetMinChars: 140,
          targetMaxChars: 190,
        },
        dm: {
          minChars: 320,
          maxChars: 650,
          paragraphCount: 3,
        },
        emailSubject: {
          minWords: 2,
          maxWords: 5,
        },
        emailBody: {
          minWords: 70,
          maxWords: 130,
          minSentences: 3,
          maxSentences: 5,
        },
      },
    },
  };
}

function buildRegisterAcceptedRequest(
  state: MainLeadSearchState,
  candidate: Record<string, unknown>,
  reasons: string[],
  outreachPack?: MainOutreachPack | null,
): MainNextSendRequest {
  const leadName = candidateLeadName(candidate);
  const companyName = candidateCompanyName(candidate);
  state.awaitingAction = "REGISTER_ACCEPTED_LEAD";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "REGISTER_ACCEPTED_LEAD",
    responseContext: {
      expectedAction: "REGISTER_ACCEPTED_LEAD",
    },
    payload: {
      action: "REGISTER_ACCEPTED_LEAD",
      runId: `${state.requestId}_accept_${state.attemptIndex}`,
      candidate,
      decision: {
        status: "ACCEPT",
        reasons,
      },
      ...(outreachPack ? { outreachPack } : {}),
      campaignStateUpdate: {
        searchedCompanyNamesAdd: companyName ? [companyName] : [],
        registeredLeadNamesAdd: leadName ? [leadName] : [],
      },
    },
  };
}

function buildRegisterRejectedRequest(
  state: MainLeadSearchState,
  candidate: Record<string, unknown>,
  reasons: string[],
): MainNextSendRequest {
  const leadName = candidateLeadName(candidate);
  const companyName = candidateCompanyName(candidate);
  state.awaitingAction = "REGISTER_REJECTED_CANDIDATE";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "REGISTER_REJECTED_CANDIDATE",
    responseContext: {
      expectedAction: "REGISTER_REJECTED_CANDIDATE",
    },
    payload: {
      action: "REGISTER_REJECTED_CANDIDATE",
      runId: `${state.requestId}_reject_${state.attemptIndex}`,
      candidate: {
        candidateId: candidate.candidateId,
        personName: leadName,
        companyName,
      },
      decision: {
        status: "REJECT",
        reasons,
      },
      campaignStateUpdate: {
        searchedCompanyNamesAdd: companyName ? [companyName] : [],
        registeredLeadNamesAdd: [],
      },
    },
  };
}

function buildSaveShortlistRequest(state: MainLeadSearchState): MainNextSendRequest {
  state.awaitingAction = "SAVE_PENDING_SHORTLIST";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "SAVE_PENDING_SHORTLIST",
    responseContext: {
      expectedAction: "SAVE_PENDING_SHORTLIST",
    },
    payload: {
      action: "SAVE_PENDING_SHORTLIST",
      runId: `${state.requestId}_shortlist`,
      pendingShortlist: {
        originalRequestSummary: state.originalRequestSummary,
        options: state.shortlistOptions,
      },
    },
  };
}

function buildGetShortlistRequest(state: MainShortlistRegistrationState): MainNextSendRequest {
  state.awaitingAction = "GET_PENDING_SHORTLIST";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "GET_PENDING_SHORTLIST",
    responseContext: {
      expectedAction: "GET_PENDING_SHORTLIST",
    },
    payload: {
      action: "GET_PENDING_SHORTLIST",
      runId: `${state.requestId}_get`,
    },
  };
}

function buildClearShortlistRequest(state: MainShortlistRegistrationState): MainNextSendRequest {
  state.awaitingAction = "CLEAR_PENDING_SHORTLIST";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "CLEAR_PENDING_SHORTLIST",
    responseContext: {
      expectedAction: "CLEAR_PENDING_SHORTLIST",
    },
    payload: {
      action: "CLEAR_PENDING_SHORTLIST",
      runId: `${state.requestId}_clear`,
    },
  };
}

function buildRegisterShortlistOptionRequest(
  state: MainShortlistRegistrationState,
  optionIndex: number,
): MainNextSendRequest | null {
  const shortlist = isPlainRecord(state.pendingShortlist) ? state.pendingShortlist : {};
  const options = Array.isArray(shortlist.options) ? shortlist.options : [];
  const option = options[optionIndex - 1];
  if (!isPlainRecord(option) || !isPlainRecord(option.candidate)) {
    return null;
  }

  const candidate = asCandidateRecord(option.candidate);
  if (!candidate) {
    return null;
  }

  state.awaitingAction = "REGISTER_ACCEPTED_LEAD";
  return {
    sessionKey: "agent:crm:main",
    contract: "crm_request",
    responseContract: "crm_response",
    expectedAction: "REGISTER_ACCEPTED_LEAD",
    responseContext: {
      expectedAction: "REGISTER_ACCEPTED_LEAD",
    },
    payload: {
      action: "REGISTER_ACCEPTED_LEAD",
      runId: `${state.requestId}_register_${optionIndex}`,
      candidate,
      decision: {
        status: "ACCEPT",
        reasons:
          asNonEmptyTrimmedStringArray(option.reasons) ??
          ["User approved a near-match shortlisted lead."],
      },
      ...(coerceOutreachPack(isPlainRecord(option) ? option.outreachPack : undefined)
        ? {
            outreachPack: coerceOutreachPack(
              isPlainRecord(option) ? option.outreachPack : undefined,
            ),
          }
        : {}),
      campaignStateUpdate: {
        searchedCompanyNamesAdd: candidateCompanyName(candidate)
          ? [candidateCompanyName(candidate)!]
          : [],
        registeredLeadNamesAdd: candidateLeadName(candidate) ? [candidateLeadName(candidate)!] : [],
      },
    },
  };
}

function buildInsertedMessage(language: MainLanguage, leads: MainAcceptedLead[]): string {
  if (language === "es") {
    if (leads.length === 1) {
      const lead = leads[0]!;
      return `Se ha insertado 1 lead: ${lead.leadName} en ${lead.companyName}.`;
    }

    return `Se han insertado ${leads.length} leads: ${leads.map((lead) => `${lead.leadName} en ${lead.companyName}`).join("; ")}.`;
  }

  if (leads.length === 1) {
    const lead = leads[0]!;
    return `Inserted 1 lead: ${lead.leadName} at ${lead.companyName}.`;
  }

  return `Inserted ${leads.length} leads: ${leads.map((lead) => `${lead.leadName} at ${lead.companyName}`).join("; ")}.`;
}

function buildShortlistMessage(language: MainLanguage, options: MainShortlistOption[]): string {
  const lines = options.map((option, index) => {
    const candidate = asCandidateRecord(option.candidate);
    const leadName = candidateLeadName(candidate) ?? "Lead";
    const companyName = candidateCompanyName(candidate) ?? "Company";
    if (language === "es") {
      return `${index + 1}. ${leadName} en ${companyName}: ${option.summary}`;
    }
    return `${index + 1}. ${leadName} at ${companyName}: ${option.summary}`;
  });

  if (language === "es") {
    return `No encontré un lead exacto, pero sí opciones cercanas:\n${lines.join("\n")}\nResponde con "registra 1", "registra 2" o "registra 3".`;
  }

  return `I did not find an exact lead, but I found close options:\n${lines.join("\n")}\nReply with "register 1", "register 2", or "register 3".`;
}

function buildNoLeadMessage(language: MainLanguage): string {
  return language === "es"
    ? "No encontré ningún lead con esas características. Si quieres, vuelvo a intentarlo."
    : "I did not find any lead with those criteria. If you want, I can try again.";
}

function buildNoShortlistMessage(language: MainLanguage): string {
  return language === "es"
    ? "No hay ninguna shortlist pendiente."
    : "There is no pending shortlist.";
}

function buildInvalidSelectionMessage(language: MainLanguage): string {
  return language === "es"
    ? "No indicaste una opción válida de la shortlist."
    : "You did not provide a valid shortlist option.";
}

function nextLeadSearchAttemptOrFinal(state: MainLeadSearchState): MainNextActionResult {
  clearCurrentLeadContext(state);

  if (state.attemptIndex + 1 >= state.attemptBudget) {
    if (state.shortlistOptions.length > 0) {
      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildSaveShortlistRequest(state),
      };
    }

    if (state.acceptedLeads.length > 0) {
      return buildFinalResult(
        state,
        "INSERTED",
        buildInsertedMessage(state.language, state.acceptedLeads),
      );
    }

    return buildFinalResult(state, "NO_LEAD", buildNoLeadMessage(state.language));
  }

  state.attemptIndex += 1;
  return {
    ok: true,
    outcome: "send_request",
    state,
    request: buildSourcerRequest(state),
  };
}

function handleLeadSearchResponse(
  state: MainLeadSearchState,
  latestResult: MainWorkerResult | undefined,
): MainNextActionResult {
  if (!latestResult) {
    return {
      ok: true,
      outcome: "send_request",
      state,
      request: buildGetCampaignStateRequest(state),
    };
  }

  if (!latestResult.ok || latestResult.status !== "VALID" || !latestResult.parsed) {
    if (
      state.awaitingAction === "GET_CAMPAIGN_STATE" ||
      state.awaitingAction === "REGISTER_ACCEPTED_LEAD" ||
      state.awaitingAction === "REGISTER_REJECTED_CANDIDATE" ||
      state.awaitingAction === "SAVE_PENDING_SHORTLIST"
    ) {
      return buildFailure(state.language);
    }

    if (state.awaitingAction === "GENERATE_OUTREACH_PACK") {
      const candidate = state.currentCandidate;
      if (!candidate) {
        return nextLeadSearchAttemptOrFinal(state);
      }

      const fallbackOutreachPack = buildFallbackOutreachPack(
        state.language,
        candidate,
        state.currentQualificationReasons.length > 0
          ? state.currentQualificationReasons
          : state.currentCloseMatch?.reasons ?? ["Accepted by qualifier."],
      );

      if (state.currentCloseMatch && state.shortlistOptions.length < MAX_SHORTLIST_OPTIONS) {
        state.shortlistOptions.push({
          candidate,
          summary: state.currentCloseMatch.summary,
          missedFilters: [...state.currentCloseMatch.missedFilters],
          reasons: [...state.currentCloseMatch.reasons],
          outreachPack: fallbackOutreachPack,
        });
        addSeenCandidate(state, candidate);
        return nextLeadSearchAttemptOrFinal(state);
      }

      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildRegisterAcceptedRequest(
          state,
          candidate,
          state.currentQualificationReasons.length > 0
            ? state.currentQualificationReasons
            : ["Accepted by qualifier."],
          fallbackOutreachPack,
        ),
      };
    }

    if (state.awaitingAction === "QUALIFY_ONE" || state.awaitingAction === "ENRICH_ONE") {
      addSeenCandidate(state, state.currentCandidate);
    }

    return nextLeadSearchAttemptOrFinal(state);
  }

  if (latestResult.contract === "crm_response") {
    const parsed = latestResult.parsed;
    if (parsed.status === "ERROR") {
      return buildFailure(state.language);
    }

    if (state.awaitingAction === "GET_CAMPAIGN_STATE") {
      const campaignState = isPlainRecord(parsed.campaignState) ? parsed.campaignState : {};
      state.seenCompanies = appendCompanyMatchKeys(
        [],
        asNonEmptyTrimmedStringArray(campaignState.searchedCompanyNames) ?? [],
      );
      state.seenLeadNames = asNonEmptyTrimmedStringArray(campaignState.registeredLeadNames) ?? [];
      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildSourcerRequest(state),
      };
    }

    if (state.awaitingAction === "REGISTER_ACCEPTED_LEAD") {
      const candidate = state.currentCandidate;
      if (candidate) {
        const leadName = candidateLeadName(candidate);
        const companyName = candidateCompanyName(candidate);
        if (leadName && companyName) {
          state.acceptedLeads.push({
            leadName,
            companyName,
            reasons: [],
          });
        }
        addSeenCandidate(state, candidate);
      }
      clearCurrentLeadContext(state);

      if (state.acceptedLeads.length >= state.requestedLeadCount) {
        return buildFinalResult(
          state,
          "INSERTED",
          buildInsertedMessage(state.language, state.acceptedLeads),
        );
      }

      return nextLeadSearchAttemptOrFinal(state);
    }

    if (state.awaitingAction === "REGISTER_REJECTED_CANDIDATE") {
      addSeenCandidate(state, state.currentCandidate);
      return nextLeadSearchAttemptOrFinal(state);
    }

    if (state.awaitingAction === "SAVE_PENDING_SHORTLIST") {
      return buildFinalResult(
        state,
        "SHORTLIST",
        buildShortlistMessage(state.language, state.shortlistOptions),
      );
    }

    return buildFailure(state.language);
  }

  if (latestResult.contract === "sourcer_response") {
    const parsed = latestResult.parsed;
    if (parsed.status === "ERROR") {
      return nextLeadSearchAttemptOrFinal(state);
    }

    if (parsed.status === "FOUND") {
      const candidate = asCandidateRecord(parsed.candidate);
      if (!candidate || isDuplicateCandidate(state, candidate)) {
        return nextLeadSearchAttemptOrFinal(state);
      }

      state.currentQualificationReasons = [];
      state.currentCloseMatch = null;
      state.currentOutreachPack = null;
      state.currentCandidate = candidate;
      if (state.awaitingAction === "ENRICH_ONE") {
        return {
          ok: true,
          outcome: "send_request",
          state,
          request: buildQualifierRequest(state, candidate),
        };
      }

      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildQualifierRequest(state, candidate),
      };
    }

    return nextLeadSearchAttemptOrFinal(state);
  }

  if (latestResult.contract === "qualifier_response") {
    const parsed = latestResult.parsed;
    const candidate = state.currentCandidate;
    if (!candidate) {
      return nextLeadSearchAttemptOrFinal(state);
    }

    if (parsed.status === "ERROR") {
      addSeenCandidate(state, candidate);
      return nextLeadSearchAttemptOrFinal(state);
    }

    if (parsed.status === "ACCEPT") {
      state.currentQualificationReasons =
        asNonEmptyTrimmedStringArray(isPlainRecord(parsed.decision) ? parsed.decision.reasons : undefined) ??
        ["Accepted by qualifier."];
      state.currentCloseMatch = null;
      state.currentOutreachPack = null;
      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildCommercialRequest(state, candidate),
      };
    }

    if (parsed.status === "REJECT") {
      if (isPlainRecord(parsed.closeMatch) && state.shortlistOptions.length < MAX_SHORTLIST_OPTIONS) {
        state.currentQualificationReasons =
          asNonEmptyTrimmedStringArray(isPlainRecord(parsed.decision) ? parsed.decision.reasons : undefined) ??
          ["Rejected by qualifier."];
        state.currentCloseMatch = {
          summary: firstNonBlankString(parsed.closeMatch.summary) ?? "Strong close match.",
          missedFilters:
            asNonEmptyTrimmedStringArray(parsed.closeMatch.missedFilters) ?? ["requested filters"],
          reasons:
            asNonEmptyTrimmedStringArray(parsed.closeMatch.reasons) ?? ["Strong lead with a near miss."],
        };
        state.currentOutreachPack = null;
        return {
          ok: true,
          outcome: "send_request",
          state,
          request: buildCommercialRequest(state, candidate),
        };
      }

      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildRegisterRejectedRequest(
          state,
          candidate,
          asNonEmptyTrimmedStringArray(isPlainRecord(parsed.decision) ? parsed.decision.reasons : undefined) ??
            ["Rejected by qualifier."],
        ),
      };
    }

    if (parsed.status === "ENRICH") {
      if (state.enrichRoundCount >= 1) {
        return nextLeadSearchAttemptOrFinal(state);
      }

      state.enrichRoundCount += 1;
      return {
        ok: true,
        outcome: "send_request",
        state,
        request: buildEnrichRequest(
          state,
          candidate,
          asNonEmptyTrimmedStringArray(isPlainRecord(parsed.decision) ? parsed.decision.missingFields : undefined) ??
            ["company.website"],
        ),
      };
    }
  }

  if (latestResult.contract === "commercial_response") {
    const parsed = latestResult.parsed;
    const candidate = state.currentCandidate;
    if (!candidate) {
      return nextLeadSearchAttemptOrFinal(state);
    }

    const outreachPack =
      (parsed.status === "READY" ? coerceOutreachPack(parsed.outreachPack) : null) ??
      buildFallbackOutreachPack(
        state.language,
        candidate,
        state.currentQualificationReasons.length > 0
          ? state.currentQualificationReasons
          : state.currentCloseMatch?.reasons ?? ["Accepted by qualifier."],
      );

    if (state.currentCloseMatch && state.shortlistOptions.length < MAX_SHORTLIST_OPTIONS) {
      state.shortlistOptions.push({
        candidate,
        summary: state.currentCloseMatch.summary,
        missedFilters: [...state.currentCloseMatch.missedFilters],
        reasons: [...state.currentCloseMatch.reasons],
        outreachPack,
      });
      addSeenCandidate(state, candidate);
      return nextLeadSearchAttemptOrFinal(state);
    }

    state.currentOutreachPack = outreachPack;
    return {
      ok: true,
      outcome: "send_request",
      state,
      request: buildRegisterAcceptedRequest(
        state,
        candidate,
        state.currentQualificationReasons.length > 0
          ? state.currentQualificationReasons
          : ["Accepted by qualifier."],
        outreachPack,
      ),
    };
  }

  return buildFailure(state.language);
}

function handleShortlistRegistrationResponse(
  state: MainShortlistRegistrationState,
  latestResult: MainWorkerResult | undefined,
): MainNextActionResult {
  if (!latestResult) {
    return {
      ok: true,
      outcome: "send_request",
      state,
      request: buildGetShortlistRequest(state),
    };
  }

  if (!latestResult.ok || latestResult.status !== "VALID" || !latestResult.parsed) {
    return buildFailure(state.language);
  }

  if (latestResult.contract !== "crm_response") {
    return buildFailure(state.language);
  }

  const parsed = latestResult.parsed;
  if (parsed.status === "ERROR") {
    return buildFailure(state.language);
  }

  if (state.awaitingAction === "GET_PENDING_SHORTLIST") {
    if (parsed.pendingShortlist === null) {
      return buildFinalResult(state, "NO_LEAD", buildNoShortlistMessage(state.language));
    }

    state.pendingShortlist = isPlainRecord(parsed.pendingShortlist) ? parsed.pendingShortlist : null;
    const shortlist = isPlainRecord(parsed.pendingShortlist) ? parsed.pendingShortlist : {};
    const options = Array.isArray(shortlist.options) ? shortlist.options : [];
    const validIndexes = state.selectedIndexes.filter(
      (index) => index >= 1 && index <= options.length,
    );

    if (validIndexes.length === 0) {
      return buildFinalResult(state, "FAILED", buildInvalidSelectionMessage(state.language));
    }

    state.remainingIndexes = [...validIndexes];
    const nextIndex = state.remainingIndexes.shift()!;
    const request = buildRegisterShortlistOptionRequest(state, nextIndex);
    if (!request) {
      return buildFailure(state.language);
    }

    return {
      ok: true,
      outcome: "send_request",
      state,
      request,
    };
  }

  if (state.awaitingAction === "REGISTER_ACCEPTED_LEAD") {
    const shortlist = isPlainRecord(state.pendingShortlist) ? state.pendingShortlist : {};
    const options = Array.isArray(shortlist.options) ? shortlist.options : [];
    const completedIndex =
      state.selectedIndexes.find(
        (index) => !state.insertedSelections.some((selection) => selection.optionIndex === index),
      ) ?? null;

    if (completedIndex !== null) {
      const option = options[completedIndex - 1];
      const candidate = isPlainRecord(option) ? asCandidateRecord(option.candidate) : null;
      const leadName = candidateLeadName(candidate) ?? `opción ${completedIndex}`;
      const companyName = candidateCompanyName(candidate) ?? "empresa";
      state.insertedSelections.push({
        optionIndex: completedIndex,
        leadName,
        companyName,
        reasons: [],
      });
    }

    if (state.remainingIndexes.length > 0) {
      const nextIndex = state.remainingIndexes.shift()!;
      const request = buildRegisterShortlistOptionRequest(state, nextIndex);
      if (!request) {
        return buildFailure(state.language);
      }

      return {
        ok: true,
        outcome: "send_request",
        state,
        request,
      };
    }

    return {
      ok: true,
      outcome: "send_request",
      state,
      request: buildClearShortlistRequest(state),
    };
  }

  if (state.awaitingAction === "CLEAR_PENDING_SHORTLIST") {
    return buildFinalResult(
      state,
      "INSERTED",
      buildInsertedMessage(state.language, state.insertedSelections),
    );
  }

  return buildFailure(state.language);
}

export function planProspectingMainNextAction(input: {
  userText?: string;
  state?: Record<string, unknown>;
  latestResult?: Record<string, unknown>;
}): MainNextActionResult {
  const existingState = coerceMainFlowState(input.state);
  const latestResult = coerceMainWorkerResult(input.latestResult);

  if (!existingState) {
    if (!isNonBlankString(input.userText)) {
      return buildFailure("es");
    }

    if (/\bregistra(?:r)?\b/i.test(input.userText)) {
      const shortlistState = initialShortlistRegistrationState(input.userText);
      return {
        ok: true,
        outcome: "send_request",
        state: shortlistState,
        request: buildGetShortlistRequest(shortlistState),
      };
    }

    return handleLeadSearchResponse(initialLeadSearchState(input.userText), undefined);
  }

  if (existingState.mode === "lead_search") {
    return handleLeadSearchResponse(existingState, latestResult ?? undefined);
  }

  return handleShortlistRegistrationResponse(existingState, latestResult ?? undefined);
}

type DirectWorkerAgentId = "crm" | "sourcer" | "qualifier" | "commercial";

type ProspectingMainRunTrace = {
  hop: number;
  agentId: DirectWorkerAgentId;
  action: string;
  contract: MainNextSendRequest["responseContract"];
  ok: boolean;
  status: MainWorkerResult["status"];
  error?: string;
};

type ProspectingMainRunResult = {
  ok: boolean;
  finalType: "INSERTED" | "SHORTLIST" | "NO_LEAD" | "FAILED";
  userMessage: string;
  trace: ProspectingMainRunTrace[];
  state?: MainFlowState;
};

type ProspectingMainRunOptions = {
  workerTimeoutSeconds: number;
  workerIdleTimeoutMs: number;
  workerMaxRuntimeMs: number;
  maxHops: number;
};

function directWorkerAgentIdFromRequest(request: MainNextSendRequest): DirectWorkerAgentId {
  const agentId = request.sessionKey.split(":")[1];
  if (
    agentId === "crm" ||
    agentId === "sourcer" ||
    agentId === "qualifier" ||
    agentId === "commercial"
  ) {
    return agentId;
  }

  throw new Error(`Unsupported worker session key: ${request.sessionKey}`);
}

export function extractJsonCandidateText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const candidates: string[] = [];
  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const match of fencedMatches) {
    if (match[1]) {
      candidates.push(match[1].trim());
    }
  }

  candidates.push(trimmed);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (
        isPlainRecord(parsed) &&
        Array.isArray(parsed.payloads)
      ) {
        for (const payload of parsed.payloads) {
          if (!isPlainRecord(payload)) {
            continue;
          }

          const text = firstNonBlankString(payload.text);
          if (!text) {
            continue;
          }

          const nested = extractJsonCandidateText(text);
          if (nested) {
            return nested;
          }
        }
      }

      if (isPlainRecord(parsed) && isPlainRecord(parsed.result) && Array.isArray(parsed.result.payloads)) {
        for (const payload of parsed.result.payloads) {
          if (!isPlainRecord(payload)) {
            continue;
          }

          const text = firstNonBlankString(payload.text);
          if (!text) {
            continue;
          }

          const nested = extractJsonCandidateText(text);
          if (nested) {
            return nested;
          }
        }
      }

      if (isPlainRecord(parsed)) {
        const reply = firstNonBlankString(parsed.reply);
        if (reply) {
          const nested = extractJsonCandidateText(reply);
          if (nested) {
            return nested;
          }
        }
      }

      return candidate;
    } catch {
      // Keep trying.
    }
  }

  return null;
}

function buildInvalidWorkerResult(
  contract: MainNextSendRequest["responseContract"],
  error: string,
): MainWorkerResult {
  return {
    contract,
    ok: false,
    status: "INVALID",
    error,
  };
}

async function executeDirectWorkerHop(
  request: MainNextSendRequest,
  options: ProspectingMainRunOptions,
): Promise<MainWorkerResult> {
  const agentId = directWorkerAgentIdFromRequest(request);
  const sessionKey = request.sessionKey;
  const transportTimeoutSeconds = Math.min(
    options.workerTimeoutSeconds,
    agentId === "sourcer" ? 60 : 45,
  );
  const maxRuntimeMs = Math.min(
    options.workerMaxRuntimeMs,
    agentId === "sourcer" ? 150000 : 90000,
  );
  const idleTimeoutMs = Math.min(
    options.workerIdleTimeoutMs,
    agentId === "sourcer" ? 20000 : 15000,
  );

  resetAgentSession({ sessionKey });

  let canonicalPayload: Record<string, unknown>;
  try {
    canonicalPayload = canonicalizeProspectingRequest(request.contract, request.payload);
  } catch (error: unknown) {
    return buildInvalidWorkerResult(
      request.responseContract,
      error instanceof Error ? error.message : "INVALID_OUTBOUND_REQUEST",
    );
  }

  const outboundValidation = validateProspectingContract(request.contract, canonicalPayload, {});
  if (!outboundValidation.ok) {
    return buildInvalidWorkerResult(
      request.responseContract,
      `${outboundValidation.error}: ${outboundValidation.issues.join("; ")}`,
    );
  }

  const payloadText = JSON.stringify(outboundValidation.parsed);
  const requestRunId =
    isPlainRecord(outboundValidation.parsed) && typeof outboundValidation.parsed.runId === "string"
      ? outboundValidation.parsed.runId
      : undefined;
  const validationContext = applyRequestPayloadToValidationContext(
    request.responseContract,
    outboundValidation.parsed,
    request.expectedAction,
    request.responseContext,
  );

  const validateResponsePayload = (candidatePayloadText: string): MainWorkerResult => {
    const validation = parseAndValidateProspectingContract(
      request.responseContract,
      candidatePayloadText,
      validationContext ?? {},
    );

    if (!validation.ok) {
      return {
        contract: request.responseContract,
        ok: false,
        status: "INVALID",
        error: `${validation.error}: ${validation.issues.join("; ")}`,
      };
    }

    return {
      contract: request.responseContract,
      ok: true,
      status: "VALID",
      parsed: validation.parsed as Record<string, unknown>,
    };
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      process.env.OPENCLAW_CLI_BIN || "openclaw",
      [
        "agent",
        "--agent",
        agentId,
        "--message",
        payloadText,
        "--json",
        "--timeout",
        String(transportTimeoutSeconds),
      ],
      {
        maxBuffer: 1024 * 1024 * 8,
      },
    );

    const directPayloadText =
      extractJsonCandidateText(stdout) ?? extractJsonCandidateText(stderr ?? "");
    if (directPayloadText) {
      return validateResponsePayload(directPayloadText);
    }
  } catch (error: unknown) {
    if (isPlainRecord(error)) {
      const stdout = firstNonBlankString(error.stdout);
      const stderr = firstNonBlankString(error.stderr);
      const directPayloadText =
        (stdout ? extractJsonCandidateText(stdout) : null) ??
        (stderr ? extractJsonCandidateText(stderr) : null);
      if (directPayloadText) {
        return validateResponsePayload(directPayloadText);
      }
    }
  }

  const awaitResult = await awaitRunScopedAssistantJson({
    sessionKey,
    runId: requestRunId,
    expectedAction: request.expectedAction,
    timeoutMs: idleTimeoutMs,
    pollIntervalMs: 1000,
    maxRuntimeMs,
  });

  if (!awaitResult.ok) {
    return {
      contract: request.responseContract,
      ok: false,
      status: awaitResult.status === "MALFORMED" ? "MALFORMED" : "TIMEOUT",
      error: awaitResult.error,
    };
  }

  return validateResponsePayload(awaitResult.payloadText);
}

async function runProspectingMainWorkflow(
  userText: string,
  options: ProspectingMainRunOptions,
): Promise<ProspectingMainRunResult> {
  let nextAction = planProspectingMainNextAction({ userText });
  const trace: ProspectingMainRunTrace[] = [];

  for (let hop = 0; hop < options.maxHops; hop += 1) {
    if (nextAction.outcome === "final") {
      return {
        ok: nextAction.ok,
        finalType: nextAction.finalType,
        userMessage: nextAction.userMessage,
        trace,
        state: nextAction.ok ? nextAction.state : undefined,
      };
    }

    const workerResult = await executeDirectWorkerHop(nextAction.request, options);
    const agentId = directWorkerAgentIdFromRequest(nextAction.request);
    trace.push({
      hop: hop + 1,
      agentId,
      action: nextAction.request.expectedAction,
      contract: nextAction.request.responseContract,
      ok: workerResult.ok,
      status: workerResult.status,
      error: workerResult.error,
    });

    nextAction = planProspectingMainNextAction({
      state: nextAction.state,
      latestResult: workerResult as unknown as Record<string, unknown>,
    });
  }

  const language = detectMainLanguage(userText);
  return {
    ok: false,
    finalType: "FAILED",
    userMessage:
      language === "es"
        ? "No pude completar el flujo por lÃ­mite interno de pasos. IntÃ©ntalo de nuevo."
        : "I could not complete the flow because the internal step limit was reached. Please retry.",
    trace,
  };
}

function appendNormalizedNames(existing: string[], additions?: string[]): string[] {
  const merged = [...existing];

  for (const value of additions ?? []) {
    const normalized = normalizeName(value);
    if (normalized && !merged.includes(normalized)) {
      merged.push(normalized);
    }
  }

  return merged;
}

function normalizeCompanyLookupName(input: string): string {
  return normalizeName(input)
    .replace(/\b(ai|labs?|tech|technologies|technology|software|systems|solutions|studio|consulting|consultancy|agency|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function companyMatchKeys(input: string): string[] {
  const normalized = normalizeName(input);
  const loose = normalizeCompanyLookupName(input);
  return [...new Set([normalized, loose].filter((value) => value.length > 0))];
}

function appendCompanyMatchKeys(existing: string[], additions?: string[]): string[] {
  const merged = [...existing];

  for (const value of additions ?? []) {
    for (const key of companyMatchKeys(value)) {
      if (!merged.includes(key)) {
        merged.push(key);
      }
    }
  }

  return merged;
}

function currentCampaignStatePayload() {
  const state = loadState();
  return {
    state,
    campaignState: {
      searchedCompanyNames: state.searchedCompanyNames,
      registeredLeadNames: state.registeredLeadNames,
    },
  };
}

function currentPendingShortlistPayload(shortlistId?: string) {
  const pendingShortlist = loadPendingShortlist();
  if (shortlistId && pendingShortlist && pendingShortlist.shortlistId !== shortlistId) {
    return {
      pendingShortlist: null,
    };
  }

  return {
    pendingShortlist,
  };
}

function buildAcceptedLeadSourceNotes(
  reasons: string[],
  evidence: Array<{ claim: string; url: string }>,
): string {
  const reasonText = reasons.join(" ");
  const evidenceText = evidence.map((item) => `${item.claim} (${item.url})`).join(" | ");
  return [reasonText, evidenceText].filter(Boolean).join(" | ");
}

function requireAcceptedLeadPersonName(value: string | null): string {
  if (!isNonBlankString(value)) {
    throw new RecruiterPluginError(
      "invalid_input",
      "REGISTER_ACCEPTED_LEAD requires candidate.person.fullName.",
      400,
    );
  }

  return value.trim();
}

function requireCompanyName(value: string): string {
  if (!isNonBlankString(value)) {
    throw new RecruiterPluginError(
      "invalid_input",
      "REGISTER_ACCEPTED_LEAD requires candidate.company.name.",
      400,
    );
  }

  return value.trim();
}

async function registerAcceptedLeadAction(params: {
  candidate: {
    person: { fullName: string | null; roleTitle: string | null; linkedinUrl: string | null };
    company: { name: string; website: string | null; domain: string | null };
    fitSignals: string[];
    evidence: Array<{ claim: string; url: string }>;
    notes: string | null;
  };
  decision: { reasons: string[] };
  outreachPack?: MainOutreachPack;
  campaignStateUpdate: {
    searchedCompanyNamesAdd: string[];
    registeredLeadNamesAdd: string[];
  };
}, client: NotionRecruiterClient) {
  const name = requireAcceptedLeadPersonName(params.candidate.person.fullName);
  const company = requireCompanyName(params.candidate.company.name);
  const outreachPack = coerceOutreachPack(params.outreachPack);
  const schema = await client.loadNotionSchema(true);
  const defaultCvFields = {
    ...(schema.propertiesByKey.cvSent ? { cvSent: DEFAULT_CV_SENT } : {}),
    ...(schema.propertiesByKey.cvUrl ? { cvUrl: DEFAULT_CV_URL } : {}),
    ...(schema.propertiesByKey.cvUrlEn ? { cvUrlEn: DEFAULT_CV_URL_EN } : {}),
    ...(schema.propertiesByKey.cvUrlEs ? { cvUrlEs: DEFAULT_CV_URL_ES } : {}),
  };

  await client.upsertRecruiter({
    name,
    linkedinUrl: normalizeOptionalLinkedInUrl(params.candidate.person.linkedinUrl),
    company,
    role: params.candidate.person.roleTitle ?? undefined,
    fitScore: 95,
    status: DEFAULT_STATUS,
    sourceNotes:
      outreachPack?.sourceNotes ??
      buildAcceptedLeadSourceNotes(params.decision.reasons, params.candidate.evidence),
    hook1: outreachPack?.hook1,
    hook2: outreachPack?.hook2,
    fitSummary: outreachPack?.fitSummary ?? params.candidate.notes ?? params.decision.reasons.join(" "),
    connectionNoteDraft: outreachPack?.connectionNoteDraft,
    dmDraft: outreachPack?.dmDraft,
    emailSubjectDraft: outreachPack?.emailSubjectDraft,
    emailBodyDraft: outreachPack?.emailBodyDraft,
    nextActionType: outreachPack?.nextActionType ?? DEFAULT_NEXT_ACTION_TYPE,
    ...defaultCvFields,
  });

  const state = loadState();
  state.searchedCompanyNames = appendNormalizedNames(
    state.searchedCompanyNames,
    params.campaignStateUpdate.searchedCompanyNamesAdd,
  );
  state.registeredLeadNames = appendNormalizedNames(
    state.registeredLeadNames,
    params.campaignStateUpdate.registeredLeadNamesAdd,
  );
  state.updatedAt = new Date().toISOString();
  saveState(state);

  return {
    status: "OK",
    action: "REGISTER_ACCEPTED_LEAD",
    campaignState: {
      searchedCompanyNames: state.searchedCompanyNames,
      registeredLeadNames: state.registeredLeadNames,
    },
  };
}

async function registerRejectedCandidateAction(params: {
  campaignStateUpdate: {
    searchedCompanyNamesAdd: string[];
    registeredLeadNamesAdd: string[];
  };
}) {
  const state = loadState();
  state.searchedCompanyNames = appendNormalizedNames(
    state.searchedCompanyNames,
    params.campaignStateUpdate.searchedCompanyNamesAdd,
  );
  state.registeredLeadNames = appendNormalizedNames(
    state.registeredLeadNames,
    params.campaignStateUpdate.registeredLeadNamesAdd,
  );
  state.updatedAt = new Date().toISOString();
  saveState(state);

  return {
    status: "OK",
    action: "REGISTER_REJECTED_CANDIDATE",
    campaignState: {
      searchedCompanyNames: state.searchedCompanyNames,
      registeredLeadNames: state.registeredLeadNames,
    },
  };
}

async function savePendingShortlistAction(params: {
  pendingShortlist: {
    originalRequestSummary: string;
    options: Array<{
      candidate: {
        candidateId: string;
        person: { fullName: string | null; roleTitle: string | null; linkedinUrl: string | null };
        company: { name: string; website: string | null; domain: string | null };
        fitSignals: string[];
        evidence: Array<{ type: string; url: string; claim: string }>;
        notes: string | null;
      };
      summary: string;
      missedFilters: string[];
      reasons: string[];
      outreachPack?: MainOutreachPack;
    }>;
  };
}) {
  const pendingShortlist = savePendingShortlist(params.pendingShortlist);
  return {
    status: "OK",
    action: "SAVE_PENDING_SHORTLIST",
    pendingShortlist,
  };
}

async function getPendingShortlistAction(params: { shortlistId?: string }) {
  return {
    status: "OK",
    action: "GET_PENDING_SHORTLIST",
    pendingShortlist: currentPendingShortlistPayload(params.shortlistId).pendingShortlist,
  };
}

async function clearPendingShortlistAction(params: { shortlistId?: string }) {
  return {
    status: "OK",
    action: "CLEAR_PENDING_SHORTLIST",
    clearedShortlistId: clearPendingShortlist(params.shortlistId),
  };
}

export function registerNotionRecruiterTools(api: OpenClawPluginApi): void {
  const config = parsePluginConfig(api.pluginConfig);
  const client = new NotionRecruiterClient(config.databaseId, () => process.env.NOTION_API_KEY, api.logger);

  api.registerTool({
    name: "prospecting_crm_get_campaign_state",
    label: "Prospecting CRM Get Campaign State",
    description: "Return the exact CRM contract payload for GET_CAMPAIGN_STATE.",
    parameters: ProspectingCrmGetCampaignStateSchema,
    async execute() {
      return executeTool(async () => {
        const { campaignState } = currentCampaignStatePayload();
        return createJsonResult({
          status: "OK",
          action: "GET_CAMPAIGN_STATE",
          campaignState,
        });
      });
    },
  });

  api.registerTool({
    name: "prospecting_crm_register_accepted_lead",
    label: "Prospecting CRM Register Accepted Lead",
    description:
      "Persist an accepted lead into Notion and update campaign state, returning the exact CRM contract payload.",
    parameters: ProspectingCrmRegisterAcceptedLeadSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          candidate: {
            person: { fullName: string | null; roleTitle: string | null; linkedinUrl: string | null };
            company: { name: string; website: string | null; domain: string | null };
            fitSignals: string[];
            evidence: Array<{ claim: string; url: string }>;
            notes: string | null;
          };
          decision: { reasons: string[] };
          outreachPack?: MainOutreachPack;
          campaignStateUpdate: {
            searchedCompanyNamesAdd: string[];
            registeredLeadNamesAdd: string[];
          };
        };

        return createJsonResult(
          await registerAcceptedLeadAction(params, client) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_crm_register_rejected_candidate",
    label: "Prospecting CRM Register Rejected Candidate",
    description:
      "Persist a rejected candidate decision into campaign state and return the exact CRM contract payload.",
    parameters: ProspectingCrmRegisterRejectedCandidateSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          campaignStateUpdate: {
            searchedCompanyNamesAdd: string[];
            registeredLeadNamesAdd: string[];
          };
        };

        return createJsonResult(
          await registerRejectedCandidateAction(params) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_crm_save_pending_shortlist",
    label: "Prospecting CRM Save Pending Shortlist",
    description:
      "Persist the latest numbered shortlist of near-match leads and return the exact CRM contract payload.",
    parameters: ProspectingCrmSavePendingShortlistSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          pendingShortlist: {
            originalRequestSummary: string;
            options: Array<{
              candidate: {
                candidateId: string;
                person: {
                  fullName: string | null;
                  roleTitle: string | null;
                  linkedinUrl: string | null;
                };
                company: { name: string; website: string | null; domain: string | null };
                fitSignals: string[];
                evidence: Array<{ type: string; url: string; claim: string }>;
                notes: string | null;
              };
              summary: string;
              missedFilters: string[];
              reasons: string[];
              outreachPack?: MainOutreachPack;
            }>;
          };
        };

        return createJsonResult(
          await savePendingShortlistAction(params) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_crm_get_pending_shortlist",
    label: "Prospecting CRM Get Pending Shortlist",
    description:
      "Return the latest pending shortlist, or the matching shortlistId when provided.",
    parameters: ProspectingCrmGetPendingShortlistSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as { shortlistId?: string };
        return createJsonResult(
          await getPendingShortlistAction(params) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_crm_clear_pending_shortlist",
    label: "Prospecting CRM Clear Pending Shortlist",
    description:
      "Clear the latest pending shortlist, or only the matching shortlistId when provided.",
    parameters: ProspectingCrmClearPendingShortlistSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as { shortlistId?: string };
        return createJsonResult(
          await clearPendingShortlistAction(params) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_state_get",
    label: "Prospecting State Get",
    description: "Get the global prospecting state used by the active sourcer/qualifier flow.",
    parameters: ProspectingStateGetSchema,
    async execute() {
      return executeTool(async () => {
        const state = loadState();
        return createJsonResult({
          status: "OK",
          campaignState: {
            searchedCompanyNames: state.searchedCompanyNames,
            registeredLeadNames: state.registeredLeadNames,
          },
          updatedAt: state.updatedAt,
        });
      });
    },
  });

  api.registerTool({
    name: "prospecting_state_update",
    label: "Prospecting State Update",
    description: "Append normalized searched companies and registered leads to the global prospecting state.",
    parameters: ProspectingStateUpdateSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          searchedCompanyNamesAdd?: string[];
          registeredLeadNamesAdd?: string[];
        };

        const state = loadState();
        state.searchedCompanyNames = appendNormalizedNames(
          state.searchedCompanyNames,
          params.searchedCompanyNamesAdd,
        );
        state.registeredLeadNames = appendNormalizedNames(
          state.registeredLeadNames,
          params.registeredLeadNamesAdd,
        );
        state.updatedAt = new Date().toISOString();
        saveState(state);

        return createJsonResult({
          status: "OK",
          campaignState: {
            searchedCompanyNames: state.searchedCompanyNames,
            registeredLeadNames: state.registeredLeadNames,
          },
          updatedAt: state.updatedAt,
        });
      });
    },
  });

  api.registerTool({
    name: "prospecting_main_run",
    label: "Prospecting Main Run",
    description:
      "Execute the full main->crm->sourcer->qualifier->crm lead workflow in code and return only the final user-facing result plus a debug trace.",
    parameters: ProspectingMainRunSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          userText: string;
          workerTimeoutSeconds?: number;
          workerIdleTimeoutMs?: number;
          workerMaxRuntimeMs?: number;
          maxHops?: number;
        };

        return createJsonResult(
          await runProspectingMainWorkflow(params.userText, {
            workerTimeoutSeconds: params.workerTimeoutSeconds ?? 90,
            workerIdleTimeoutMs: params.workerIdleTimeoutMs ?? 20000,
            workerMaxRuntimeMs: params.workerMaxRuntimeMs ?? 150000,
            maxHops: params.maxHops ?? 80,
          }) as unknown as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_main_start",
    label: "Prospecting Main Start",
    description:
      "Start the main lead-search state machine from a raw user request and return the first worker request or the final user-facing result.",
    parameters: ProspectingMainInitialActionSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as { userText: string };
        return createJsonResult(
          planProspectingMainNextAction({ userText: params.userText }) as unknown as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_main_continue",
    label: "Prospecting Main Continue",
    description:
      "Continue the main lead-search state machine after a worker hop using only the current planner state and the full validated worker result.",
    parameters: ProspectingMainContinueActionSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          state: Record<string, unknown>;
          latestResult: Record<string, unknown>;
        };
        return createJsonResult(
          planProspectingMainNextAction({
            state: params.state,
            latestResult: params.latestResult,
          }) as unknown as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_main_next_action",
    label: "Prospecting Main Next Action",
    description:
      "Drive the thin main-agent lead-search state machine. Given a user request or the latest worker-hop result, return the next request to send or the final user-facing result.",
    parameters: ProspectingMainNextActionSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          input:
            | { userText: string }
            | { state: Record<string, unknown>; latestResult: Record<string, unknown> };
        };
        return createJsonResult(
          planProspectingMainNextAction(params.input) as unknown as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_contract_validate",
    label: "Prospecting Contract Validate",
    description: "Parse JSON text and validate it against the active sourcer, qualifier, or CRM contract.",
    parameters: ProspectingContractValidateInputSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as ProspectingContractValidateInput;
        return createJsonResult(
          parseAndValidateProspectingContract(
            params.contract,
            params.payloadText,
            params.context ?? {},
          ) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_session_reset",
    label: "Prospecting Session Reset",
    description:
      "Archive and remove the stored session for a downstream agent session key so the next handoff starts with fresh context.",
    parameters: ProspectingSessionResetSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as { sessionKey: string };
        return createJsonResult(
          resetAgentSession({ sessionKey: params.sessionKey }) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_prepare_request",
    label: "Prospecting Prepare Request",
    description:
      "Step 2 of 4 for a worker hop: validate a request object and return canonical payloadText. Use that payloadText as the next sessions_send message. Do not call resolve before sending.",
    parameters: ProspectingPrepareRequestSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          contract: ProspectingContractValidateInput["contract"];
          payload: Record<string, unknown>;
        };
        const canonicalPayload = canonicalizeProspectingRequest(params.contract, params.payload);

        const validation = validateProspectingContract(params.contract, canonicalPayload, {});
        if (!validation.ok) {
          return createJsonResult(validation as Record<string, unknown>);
        }

        return createJsonResult({
          ok: true,
          contract: params.contract,
          payloadText: JSON.stringify(validation.parsed),
          parsed: validation.parsed,
        });
      });
    },
  });

  api.registerTool({
    name: "prospecting_session_await_json",
    label: "Prospecting Session Await Json",
    description:
      "Poll a downstream agent session and return only the latest assistant JSON reply for the matching action, optionally scoped to a payload runId.",
    parameters: ProspectingSessionAwaitJsonSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as AwaitSessionJsonInput;
        return createJsonResult(
          await awaitRunScopedAssistantJson(params) as Record<string, unknown>,
        );
      });
    },
  });

  api.registerTool({
    name: "prospecting_session_await_validated_json",
    label: "Prospecting Session Await Validated Json",
    description:
      "Poll a downstream agent session, extract the assistant JSON reply, and validate it against the requested prospecting contract in one step.",
    parameters: ProspectingSessionAwaitValidatedJsonSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as AwaitSessionJsonInput & {
          contract: ProspectingContractValidateInput["contract"];
          context?: ProspectingContractValidateInput["context"];
        };
        const responseContract = normalizeResponseContract(params.contract);
        const validationContext = resolveValidationContext(responseContract, params);

        const awaitResult = await awaitRunScopedAssistantJson(params);
        if (!awaitResult.ok) {
          return createJsonResult(awaitResult as Record<string, unknown>);
        }

        const validation = parseAndValidateProspectingContract(
          responseContract,
          awaitResult.payloadText,
          validationContext ?? {},
        );

        if (!validation.ok) {
          return createJsonResult({
            ok: false,
            status: "INVALID",
            contract: responseContract,
            sessionKey: params.sessionKey,
            payloadText: awaitResult.payloadText,
            messageTimestamp: awaitResult.messageTimestamp,
            sessionFile: awaitResult.sessionFile,
            error: validation.error,
            issues: validation.issues,
          });
        }

        return createJsonResult({
          ok: true,
          status: "VALID",
          contract: responseContract,
          sessionKey: params.sessionKey,
          payloadText: awaitResult.payloadText,
          messageTimestamp: awaitResult.messageTimestamp,
          sessionFile: awaitResult.sessionFile,
          parsed: validation.parsed,
        });
      });
    },
  });

  api.registerTool({
    name: "prospecting_resolve_validated_json",
    label: "Prospecting Resolve Validated Json",
    description:
      "Step 4 of 4 for a worker hop: call only immediately after sessions_send for the same worker. Pass runId and replyText from that sessions_send result when available. This validates the immediate reply or waits for the matching downstream JSON reply.",
    parameters: ProspectingResolveValidatedJsonSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as AwaitSessionJsonInput & {
          contract: ProspectingContractValidateInput["contract"];
          replyText?: string;
          context?: ProspectingContractValidateInput["context"];
        };
        const responseContract = normalizeResponseContract(params.contract);
        const validationContext = resolveValidationContext(responseContract, params);

        const directReplyText = firstNonBlankString(params.replyText);
        if (directReplyText) {
          const directValidation = parseAndValidateProspectingContract(
            responseContract,
            directReplyText,
            validationContext ?? {},
          );

          if (directValidation.ok) {
            return createJsonResult({
              ok: true,
              status: "VALID",
              source: "sessions_send_reply",
              contract: responseContract,
              sessionKey: params.sessionKey,
              payloadText: directReplyText,
              parsed: directValidation.parsed,
            });
          }
        }

        const awaitResult = await awaitRunScopedAssistantJson(params);
        if (!awaitResult.ok) {
          return createJsonResult(awaitResult as Record<string, unknown>);
        }

        const validation = parseAndValidateProspectingContract(
          responseContract,
          awaitResult.payloadText,
          validationContext ?? {},
        );

        if (!validation.ok) {
          return createJsonResult({
            ok: false,
            status: "INVALID",
            contract: responseContract,
            sessionKey: params.sessionKey,
            payloadText: awaitResult.payloadText,
            messageTimestamp: awaitResult.messageTimestamp,
            sessionFile: awaitResult.sessionFile,
            error: validation.error,
            issues: validation.issues,
          });
        }

        return createJsonResult({
          ok: true,
          status: "VALID",
          source: "session_watch",
          contract: responseContract,
          sessionKey: params.sessionKey,
          payloadText: awaitResult.payloadText,
          messageTimestamp: awaitResult.messageTimestamp,
          sessionFile: awaitResult.sessionFile,
          parsed: validation.parsed,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_upsert",
    label: "Notion Recruiter Upsert",
    description:
      "Create or update a recruiter page in the configured Notion CRM using LinkedIn URL as the unique key when present.",
    parameters: UpsertRecruiterSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as UpsertRecruiterInput;
        api.logger.debug?.(
          `[notion-recruiter-crm] notion_recruiter_upsert raw params ${JSON.stringify(rawParams)}`,
        );
        const normalizedInput = {
          name: params.name.trim(),
          linkedinUrl: normalizeOptionalLinkedInUrl(params.linkedinUrl),
          company: params.company,
          role: params.role,
          recruiterType: params.recruiterType,
          region: params.region,
          fitScore: params.fitScore,
          status: isNonBlankString(params.status) ? params.status.trim() : DEFAULT_STATUS,
          sourceNotes: params.sourceNotes,
          hook1: params.hook1,
          hook2: params.hook2,
          fitSummary: params.fitSummary,
          connectionNoteDraft: params.connectionNoteDraft,
          dmDraft: params.dmDraft,
          emailSubjectDraft: params.emailSubjectDraft,
          emailBodyDraft: params.emailBodyDraft,
          followup1Draft: params.followup1Draft,
          followup2Draft: params.followup2Draft,
          lastReplySummary: params.lastReplySummary,
          interactionLog: params.interactionLog,
          lastTouchAt: normalizeOptionalIsoDateTime(params.lastTouchAt, "lastTouchAt"),
          nextActionAt: normalizeOptionalIsoDateTime(params.nextActionAt, "nextActionAt"),
          nextActionType: isNonBlankString(params.nextActionType)
            ? params.nextActionType.trim()
            : DEFAULT_NEXT_ACTION_TYPE,
          cvSent: params.cvSent ?? DEFAULT_CV_SENT,
          cvUrl: params.cvUrl ? normalizeHttpUrlOrThrow(params.cvUrl, "cvUrl") : undefined,
          cvUrlEn:
            params.cvUrlEn === null
              ? null
              : normalizeHttpUrlOrThrow(
                  isNonBlankString(params.cvUrlEn) ? params.cvUrlEn : DEFAULT_CV_URL_EN,
                  "cvUrlEn",
                ),
          cvUrlEs:
            params.cvUrlEs === null
              ? null
              : normalizeHttpUrlOrThrow(
                  isNonBlankString(params.cvUrlEs) ? params.cvUrlEs : DEFAULT_CV_URL_ES,
                  "cvUrlEs",
                ),
        };
        api.logger.debug?.(
          `[notion-recruiter-crm] notion_recruiter_upsert normalized input ${JSON.stringify(normalizedInput)}`,
        );
        const result = await client.upsertRecruiter(normalizedInput);

        return createJsonResult({
          status: "OK",
          action: result.action,
          pageId: result.recruiter.pageId,
          name: result.recruiter.name,
          company: result.recruiter.company,
          recruiterType: result.recruiter.recruiterType,
          summary: summarizeRecruiter(result.recruiter),
          recruiter: result.recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_get",
    label: "Notion Recruiter Get",
    description:
      "Fetch a recruiter by LinkedIn URL or Notion page ID and return the normalized CRM record.",
    parameters: GetRecruiterSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as GetRecruiterInput;
        if (!params.linkedinUrl && !params.pageId) {
          throw new RecruiterPluginError(
            "invalid_input",
            "Provide either linkedinUrl or pageId.",
            400,
          );
        }

        const recruiter = params.pageId
          ? await client.getRecruiterByPageId(params.pageId)
          : await client.getRecruiterByLinkedInOrThrow(normalizeLinkedInUrlOrThrow(params.linkedinUrl!));

        if (params.pageId && params.linkedinUrl) {
          const normalizedInput = normalizeLinkedInUrlOrThrow(params.linkedinUrl);
          const normalizedStored = recruiter.linkedinUrl
            ? normalizeLinkedInUrlOrThrow(recruiter.linkedinUrl)
            : null;
          if (normalizedStored && normalizedStored !== normalizedInput) {
            throw new RecruiterPluginError(
              "invalid_input",
              "pageId and linkedinUrl refer to different recruiters.",
              400,
              {
                expectedLinkedInUrl: normalizedStored,
                providedLinkedInUrl: normalizedInput,
              },
            );
          }
        }

        return createSuccessResult(`Loaded recruiter ${summarizeRecruiter(recruiter)}.`, {
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_query_due_followups",
    label: "Notion Recruiter Query Due Followups",
    description:
      "List recruiters whose Next Action At is due before a given ISO timestamp, optionally filtered by status.",
    parameters: QueryDueFollowupsSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as QueryDueFollowupsInput;
        const beforeIso = params.beforeIso
          ? requireIsoDateTime(params.beforeIso, "beforeIso")
          : new Date().toISOString();
        const statuses = params.statuses?.map((value) => value.trim()).filter(Boolean);
        const items = await client.queryDueFollowups({
          beforeIso,
          statuses: statuses && statuses.length > 0 ? statuses : undefined,
          limit: params.limit ?? 20,
        });

        return createSuccessResult(formatFollowupSummary(items, beforeIso), {
          beforeIso,
          count: items.length,
          recruiters: items,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_save_research",
    label: "Notion Recruiter Save Research",
    description:
      "Persist research fields for a recruiter: source notes, hooks, and fit summary.",
    parameters: SaveResearchSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as SaveResearchInput;
        ensureAtLeastOneProvidedField(
          params as Record<string, unknown>,
          ["sourceNotes", "hook1", "hook2", "fitSummary"],
          "Provide at least one research field to update.",
        );

        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            sourceNotes: params.sourceNotes,
            hook1: params.hook1,
            hook2: params.hook2,
            fitSummary: params.fitSummary,
          },
        );

        return createSuccessResult(`Saved research for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_save_drafts",
    label: "Notion Recruiter Save Drafts",
    description: "Persist message drafts for a recruiter in Notion CRM properties.",
    parameters: SaveDraftsSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as SaveDraftsInput;
        ensureAtLeastOneProvidedField(
          params as Record<string, unknown>,
          [
            "connectionNoteDraft",
            "dmDraft",
            "emailSubjectDraft",
            "emailBodyDraft",
            "followup1Draft",
            "followup2Draft",
          ],
          "Provide at least one draft field to update.",
        );

        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            connectionNoteDraft: params.connectionNoteDraft,
            dmDraft: params.dmDraft,
            emailSubjectDraft: params.emailSubjectDraft,
            emailBodyDraft: params.emailBodyDraft,
            followup1Draft: params.followup1Draft,
            followup2Draft: params.followup2Draft,
          },
        );

        return createSuccessResult(`Saved drafts for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_log_touchpoint",
    label: "Notion Recruiter Log Touchpoint",
    description:
      "Log a recruiter interaction, update Last Touch At, and append a human-readable line to Interaction Log.",
    parameters: LogTouchpointSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as LogTouchpointInput;
        const linkedinUrl = normalizeLinkedInUrlOrThrow(params.linkedinUrl);
        const recruiter = await client.getRecruiterByLinkedInOrThrow(linkedinUrl);
        const atIso = requireIsoDateTime(params.atIso, "atIso");
        const logLine = `[${atIso}] (${params.channel}/${params.touchType}) ${params.summary.trim()}`;
        const updated = await client.updateRecruiterByLinkedIn(linkedinUrl, {
          lastTouchAt: atIso,
          interactionLog: appendInteractionLog(recruiter.interactionLog, logLine),
        });

        return createSuccessResult(`Logged touchpoint for ${summarizeRecruiter(updated)}.`, {
          pageId: updated.pageId,
          recruiter: updated,
          appendedLogLine: logLine,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_mark_status",
    label: "Notion Recruiter Mark Status",
    description:
      "Update the Status property and optionally the Last Reply Summary for a recruiter.",
    parameters: MarkStatusSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as MarkStatusInput;
        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            status: params.status.trim(),
            lastReplySummary: params.lastReplySummary,
          },
        );

        return createSuccessResult(`Updated status for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_schedule_next_action",
    label: "Notion Recruiter Schedule Next Action",
    description: "Set Next Action Type and Next Action At for a recruiter follow-up.",
    parameters: ScheduleNextActionSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as ScheduleNextActionInput;
        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            nextActionType: params.nextActionType.trim(),
            nextActionAt: requireIsoDateTime(params.nextActionAtIso, "nextActionAtIso"),
          },
        );

        return createSuccessResult(`Scheduled next action for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_attach_cv",
    label: "Notion Recruiter Attach CV",
    description: "Store a CV URL for a recruiter and optionally mark CV Sent.",
    parameters: AttachCvSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as AttachCvInput;
        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            cvUrl: normalizeHttpUrlOrThrow(params.cvUrl, "cvUrl"),
            cvSent: params.cvSent,
          },
        );

        return createSuccessResult(`Attached CV info for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });
}
