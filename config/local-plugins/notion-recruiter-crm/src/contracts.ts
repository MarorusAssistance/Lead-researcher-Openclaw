import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const NullableStringSchema = Type.Union([Type.String({ minLength: 1 }), Type.Null()]);
const StringArraySchema = Type.Array(Type.String({ minLength: 1 }));

export const ProspectingContractSchema = Type.Union([
  Type.Literal("sourcer_request"),
  Type.Literal("sourcer_response"),
  Type.Literal("qualifier_request"),
  Type.Literal("qualifier_response"),
  Type.Literal("crm_request"),
  Type.Literal("crm_response"),
]);

export const CrmActionSchema = Type.Union([
  Type.Literal("GET_CAMPAIGN_STATE"),
  Type.Literal("REGISTER_ACCEPTED_LEAD"),
  Type.Literal("REGISTER_REJECTED_CANDIDATE"),
  Type.Literal("SAVE_PENDING_SHORTLIST"),
  Type.Literal("GET_PENDING_SHORTLIST"),
  Type.Literal("CLEAR_PENDING_SHORTLIST"),
]);

export const ProspectingValidationContextSchema = Type.Object(
  {
    expectedCandidateId: Type.Optional(Type.String({ minLength: 1 })),
    expectedAction: Type.Optional(Type.String({ minLength: 1 })),
    enrichRoundCount: Type.Optional(Type.Integer({ minimum: 0 })),
    maxEnrichRounds: Type.Optional(Type.Integer({ minimum: 0 })),
    excludedCompanyNames: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 500 })),
    excludedLeadNames: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 500 })),
  },
  { additionalProperties: false },
);

export const EvidenceItemSchema = Type.Object(
  {
    type: Type.String({ minLength: 1 }),
    url: Type.String({ minLength: 1 }),
    claim: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const CandidatePersonSchema = Type.Object(
  {
    fullName: NullableStringSchema,
    roleTitle: NullableStringSchema,
    linkedinUrl: NullableStringSchema,
  },
  { additionalProperties: false },
);

export const CandidateCompanySchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    website: NullableStringSchema,
    domain: NullableStringSchema,
  },
  { additionalProperties: false },
);

export const CandidateSchema = Type.Object(
  {
    candidateId: Type.String({ minLength: 1 }),
    person: CandidatePersonSchema,
    company: CandidateCompanySchema,
    fitSignals: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    evidence: Type.Array(EvidenceItemSchema, { minItems: 2 }),
    notes: NullableStringSchema,
  },
  { additionalProperties: false },
);

const SourcerCampaignContextSchema = Type.Object(
  {
    targetThemes: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);

const SourcerConstraintsSchema = Type.Object(
  {
    maxCandidatesToReturn: Type.Integer({ minimum: 1, maximum: 1 }),
    webFirst: Type.Literal(true),
    mustIncludeEvidence: Type.Literal(true),
    minCompanySize: Type.Optional(Type.Integer({ minimum: 1 })),
    maxCompanySize: Type.Optional(Type.Integer({ minimum: 1 })),
    targetCountry: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
  },
  { additionalProperties: false },
);

export const SourcerSourceOneRequestSchema = Type.Object(
  {
    action: Type.Literal("SOURCE_ONE"),
    runId: Type.String({ minLength: 1 }),
    campaignContext: SourcerCampaignContextSchema,
    excludedCompanyNames: StringArraySchema,
    excludedLeadNames: StringArraySchema,
    constraints: SourcerConstraintsSchema,
  },
  { additionalProperties: false },
);

export const SourcerEnrichOneRequestSchema = Type.Object(
  {
    action: Type.Literal("ENRICH_ONE"),
    runId: Type.String({ minLength: 1 }),
    candidateId: Type.String({ minLength: 1 }),
    missingFields: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    currentDossier: Type.Object({}, { additionalProperties: true }),
    constraints: SourcerConstraintsSchema,
  },
  { additionalProperties: false },
);

export const SourcerRequestSchema = Type.Union([
  SourcerSourceOneRequestSchema,
  SourcerEnrichOneRequestSchema,
]);

export const SourcerFoundResponseSchema = Type.Object(
  {
    status: Type.Literal("FOUND"),
    candidate: CandidateSchema,
  },
  { additionalProperties: false },
);

export const SourcerNoCandidateResponseSchema = Type.Object(
  {
    status: Type.Literal("NO_CANDIDATE"),
    reason: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const SourcerErrorResponseSchema = Type.Object(
  {
    status: Type.Literal("ERROR"),
    error: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const SourcerResponseSchema = Type.Union([
  SourcerFoundResponseSchema,
  SourcerNoCandidateResponseSchema,
  SourcerErrorResponseSchema,
]);

const QualifierDecisionBaseSchema = Type.Object(
  {
    reasons: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const QualifierAcceptDecisionSchema = Type.Composite([
  QualifierDecisionBaseSchema,
  Type.Object(
    {
      verdict: Type.Literal("ACCEPT"),
      missingFields: Type.Array(Type.String({ minLength: 1 }), { maxItems: 0 }),
    },
    { additionalProperties: false },
  ),
]);

export const QualifierRejectDecisionSchema = Type.Composite([
  QualifierDecisionBaseSchema,
  Type.Object(
    {
      verdict: Type.Literal("REJECT"),
      missingFields: Type.Array(Type.String({ minLength: 1 }), { maxItems: 0 }),
    },
    { additionalProperties: false },
  ),
]);

export const CloseMatchSchema = Type.Object(
  {
    summary: Type.String({ minLength: 1 }),
    missedFilters: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    reasons: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const QualifierEnrichDecisionSchema = Type.Composite([
  QualifierDecisionBaseSchema,
  Type.Object(
    {
      verdict: Type.Literal("ENRICH"),
      missingFields: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    },
    { additionalProperties: false },
  ),
]);

export const QualifierAcceptResponseSchema = Type.Object(
  {
    status: Type.Literal("ACCEPT"),
    candidateId: Type.String({ minLength: 1 }),
    decision: QualifierAcceptDecisionSchema,
  },
  { additionalProperties: false },
);

export const QualifierRejectResponseSchema = Type.Object(
  {
    status: Type.Literal("REJECT"),
    candidateId: Type.String({ minLength: 1 }),
    decision: QualifierRejectDecisionSchema,
    closeMatch: Type.Optional(CloseMatchSchema),
  },
  { additionalProperties: false },
);

export const QualifierEnrichResponseSchema = Type.Object(
  {
    status: Type.Literal("ENRICH"),
    candidateId: Type.String({ minLength: 1 }),
    decision: QualifierEnrichDecisionSchema,
  },
  { additionalProperties: false },
);

export const QualifierResponseSchema = Type.Union([
  QualifierAcceptResponseSchema,
  QualifierRejectResponseSchema,
  QualifierEnrichResponseSchema,
]);

export const QualificationMatchModeSchema = Type.Union([
  Type.Literal("STRICT"),
  Type.Literal("RELAX_SIZE"),
  Type.Literal("RELAX_GEO"),
  Type.Literal("BEST_AVAILABLE"),
]);

export const QualificationTargetFiltersSchema = Type.Object(
  {
    preferredCountry: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
    preferredRegion: Type.Optional(Type.String({ minLength: 1 })),
    preferredMinCompanySize: Type.Optional(Type.Integer({ minimum: 1 })),
    preferredMaxCompanySize: Type.Optional(Type.Integer({ minimum: 1 })),
    preferredRoleThemes: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    ),
    preferNamedPerson: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const QualifierRulesSchema = Type.Object(
  {
    allowedStatuses: Type.Array(
      Type.Union([
        Type.Literal("ACCEPT"),
        Type.Literal("REJECT"),
        Type.Literal("ENRICH"),
      ]),
      { minItems: 3, maxItems: 3 },
    ),
    mustExplainDecision: Type.Literal(true),
    matchMode: QualificationMatchModeSchema,
    targetFilters: QualificationTargetFiltersSchema,
  },
  { additionalProperties: false },
);

export const QualifierRequestSchema = Type.Object(
  {
    action: Type.Literal("QUALIFY_ONE"),
    runId: Type.String({ minLength: 1 }),
    candidate: CandidateSchema,
    qualificationRules: QualifierRulesSchema,
  },
  { additionalProperties: false },
);

export const CampaignStateSchema = Type.Object(
  {
    searchedCompanyNames: StringArraySchema,
    registeredLeadNames: StringArraySchema,
  },
  { additionalProperties: false },
);

export const PendingShortlistOptionSchema = Type.Object(
  {
    candidate: CandidateSchema,
    summary: Type.String({ minLength: 1 }),
    missedFilters: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    reasons: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const PendingShortlistSchema = Type.Object(
  {
    shortlistId: Type.String({ minLength: 1 }),
    originalRequestSummary: Type.String({ minLength: 1 }),
    options: Type.Array(PendingShortlistOptionSchema, { minItems: 1, maxItems: 3 }),
    createdAt: Type.String({ minLength: 1 }),
    expiresAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const CrmCampaignStateOkResponseSchema = Type.Object(
  {
    status: Type.Literal("OK"),
    action: Type.Union([
      Type.Literal("GET_CAMPAIGN_STATE"),
      Type.Literal("REGISTER_ACCEPTED_LEAD"),
      Type.Literal("REGISTER_REJECTED_CANDIDATE"),
    ]),
    campaignState: CampaignStateSchema,
  },
  { additionalProperties: false },
);

export const CrmSavePendingShortlistOkResponseSchema = Type.Object(
  {
    status: Type.Literal("OK"),
    action: Type.Literal("SAVE_PENDING_SHORTLIST"),
    pendingShortlist: PendingShortlistSchema,
  },
  { additionalProperties: false },
);

export const CrmGetPendingShortlistOkResponseSchema = Type.Object(
  {
    status: Type.Literal("OK"),
    action: Type.Literal("GET_PENDING_SHORTLIST"),
    pendingShortlist: Type.Union([PendingShortlistSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const CrmClearPendingShortlistOkResponseSchema = Type.Object(
  {
    status: Type.Literal("OK"),
    action: Type.Literal("CLEAR_PENDING_SHORTLIST"),
    clearedShortlistId: NullableStringSchema,
  },
  { additionalProperties: false },
);

export const CrmErrorResponseSchema = Type.Object(
  {
    status: Type.Literal("ERROR"),
    stage: Type.Union([
      Type.Literal("VALIDATION"),
      Type.Literal("STATE"),
      Type.Literal("NOTION"),
    ]),
    error: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const CrmResponseSchema = Type.Union([
  CrmCampaignStateOkResponseSchema,
  CrmSavePendingShortlistOkResponseSchema,
  CrmGetPendingShortlistOkResponseSchema,
  CrmClearPendingShortlistOkResponseSchema,
  CrmErrorResponseSchema,
]);

const AcceptedLeadDecisionSchema = Type.Object(
  {
    status: Type.Literal("ACCEPT"),
    reasons: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);

const RejectedCandidateDecisionSchema = Type.Object(
  {
    status: Type.Literal("REJECT"),
    reasons: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);

const CampaignStateUpdateSchema = Type.Object(
  {
    searchedCompanyNamesAdd: StringArraySchema,
    registeredLeadNamesAdd: StringArraySchema,
  },
  { additionalProperties: false },
);

export const CrmGetCampaignStateRequestSchema = Type.Object(
  {
    action: Type.Literal("GET_CAMPAIGN_STATE"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const CrmRegisterAcceptedLeadRequestSchema = Type.Object(
  {
    action: Type.Literal("REGISTER_ACCEPTED_LEAD"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    candidate: CandidateSchema,
    decision: AcceptedLeadDecisionSchema,
    campaignStateUpdate: CampaignStateUpdateSchema,
  },
  { additionalProperties: false },
);

export const CrmRegisterRejectedCandidateRequestSchema = Type.Object(
  {
    action: Type.Literal("REGISTER_REJECTED_CANDIDATE"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    candidate: Type.Object(
      {
        candidateId: Type.String({ minLength: 1 }),
        personName: Type.String({ minLength: 1 }),
        companyName: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    decision: RejectedCandidateDecisionSchema,
    campaignStateUpdate: Type.Object(
      {
        searchedCompanyNamesAdd: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
        registeredLeadNamesAdd: Type.Array(Type.String({ minLength: 1 }), { maxItems: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CrmSavePendingShortlistRequestSchema = Type.Object(
  {
    action: Type.Literal("SAVE_PENDING_SHORTLIST"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    pendingShortlist: Type.Object(
      {
        originalRequestSummary: Type.String({ minLength: 1 }),
        options: Type.Array(PendingShortlistOptionSchema, { minItems: 1, maxItems: 3 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CrmGetPendingShortlistRequestSchema = Type.Object(
  {
    action: Type.Literal("GET_PENDING_SHORTLIST"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    shortlistId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const CrmClearPendingShortlistRequestSchema = Type.Object(
  {
    action: Type.Literal("CLEAR_PENDING_SHORTLIST"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    shortlistId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const CrmRequestSchema = Type.Union([
  CrmGetCampaignStateRequestSchema,
  CrmRegisterAcceptedLeadRequestSchema,
  CrmRegisterRejectedCandidateRequestSchema,
  CrmSavePendingShortlistRequestSchema,
  CrmGetPendingShortlistRequestSchema,
  CrmClearPendingShortlistRequestSchema,
]);

export const ProspectingContractValidateInputSchema = Type.Object(
  {
    contract: ProspectingContractSchema,
    payloadText: Type.String(),
    context: Type.Optional(ProspectingValidationContextSchema),
  },
  { additionalProperties: false },
);

export type ProspectingContract = Static<typeof ProspectingContractSchema>;
export type CrmAction = Static<typeof CrmActionSchema>;
export type ProspectingValidationContext = Static<typeof ProspectingValidationContextSchema>;
export type ProspectingContractValidateInput = Static<
  typeof ProspectingContractValidateInputSchema
>;

export type ProspectingValidationResult =
  | {
      ok: true;
      contract: ProspectingContract;
      parsed: unknown;
    }
  | {
      ok: false;
      contract: ProspectingContract;
      error: string;
      issues: string[];
    };

function schemaIssues(schema: TSchema, payload: unknown): string[] {
  return [...Value.Errors(schema, payload)].map((issue) => issue.message);
}

function invalid(
  contract: ProspectingContract,
  error: string,
  issues: string[],
): ProspectingValidationResult {
  return {
    ok: false,
    contract,
    error,
    issues,
  };
}

const PLACEHOLDER_PERSON_VALUES = new Set([
  "no specific individual identified",
  "no individual identified",
  "unknown",
  "n/a",
  "not found",
  "none",
]);

function hasPlaceholderValue(value: unknown): boolean {
  return typeof value === "string" && PLACEHOLDER_PERSON_VALUES.has(value.trim().toLowerCase());
}

function normalizeLookupName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\b(ltd|limited|llc|inc|corp|corporation|sl|s\.l\.|sa|s\.a\.)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompanyLookupName(input: string): string {
  return normalizeLookupName(input)
    .replace(
      /\b(ai|labs?|tech|technologies|technology|software|systems|solutions|studio|consulting|consultancy|agency|company)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function companyMatchKeys(input: string): string[] {
  const strict = normalizeLookupName(input);
  const loose = normalizeCompanyLookupName(input);
  return [...new Set([strict, loose].filter((value) => value.length > 0))];
}

function contextIssues(context: ProspectingValidationContext): string[] {
  const issues: string[] = [];

  if (
    context.enrichRoundCount !== undefined &&
    context.maxEnrichRounds !== undefined &&
    context.enrichRoundCount > context.maxEnrichRounds
  ) {
    issues.push("enrichRoundCount cannot be greater than maxEnrichRounds.");
  }

  return issues;
}

function validateWithSchema(
  contract: ProspectingContract,
  schema: TSchema,
  payload: unknown,
): ProspectingValidationResult | null {
  if (Value.Check(schema, payload)) {
    return null;
  }

  return invalid(contract, "SCHEMA_MISMATCH", schemaIssues(schema, payload));
}

function validateSourcerResponse(
  payload: unknown,
  context: ProspectingValidationContext,
): ProspectingValidationResult {
  const schemaResult = validateWithSchema("sourcer_response", SourcerResponseSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof SourcerResponseSchema>;
  const issues: string[] = [];

  if (parsed.status === "FOUND") {
    if (hasPlaceholderValue(parsed.candidate.person.fullName)) {
      issues.push("person.fullName cannot be a placeholder value.");
    }

    if (hasPlaceholderValue(parsed.candidate.person.roleTitle)) {
      issues.push("person.roleTitle cannot be a placeholder value.");
    }

    if (
      context.expectedCandidateId !== undefined &&
      parsed.candidate.candidateId !== context.expectedCandidateId
    ) {
      issues.push("candidateId does not match the current candidate.");
    }

    const excludedCompanyKeys = new Set(
      (context.excludedCompanyNames ?? []).flatMap((value) => companyMatchKeys(value)),
    );
    if (
      excludedCompanyKeys.size > 0 &&
      companyMatchKeys(parsed.candidate.company.name).some((key) => excludedCompanyKeys.has(key))
    ) {
      issues.push("candidate.company.name matches an excluded company.");
    }

    const excludedLeadNames = new Set(
      (context.excludedLeadNames ?? []).map((value) => normalizeLookupName(value)),
    );
    if (
      parsed.candidate.person.fullName !== null &&
      excludedLeadNames.size > 0 &&
      excludedLeadNames.has(normalizeLookupName(parsed.candidate.person.fullName))
    ) {
      issues.push("candidate.person.fullName matches an excluded lead.");
    }
  }

  if (issues.length > 0) {
    return invalid("sourcer_response", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "sourcer_response",
    parsed,
  };
}

function validateSourcerRequest(payload: unknown): ProspectingValidationResult {
  const schemaResult = validateWithSchema("sourcer_request", SourcerRequestSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof SourcerRequestSchema>;
  const issues: string[] = [];

  if (
    parsed.constraints.minCompanySize !== undefined &&
    parsed.constraints.maxCompanySize !== undefined &&
    parsed.constraints.minCompanySize > parsed.constraints.maxCompanySize
  ) {
    issues.push("constraints.minCompanySize cannot be greater than constraints.maxCompanySize.");
  }

  if (issues.length > 0) {
    return invalid("sourcer_request", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "sourcer_request",
    parsed,
  };
}

function validateQualifierResponse(
  payload: unknown,
  context: ProspectingValidationContext,
): ProspectingValidationResult {
  const schemaResult = validateWithSchema("qualifier_response", QualifierResponseSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof QualifierResponseSchema>;
  const issues: string[] = [];

  if (context.expectedCandidateId && parsed.candidateId !== context.expectedCandidateId) {
    issues.push("candidateId does not match the current candidate.");
  }

  if (parsed.status !== parsed.decision.verdict) {
    issues.push("decision.verdict must match status.");
  }

  if (parsed.status === "ENRICH") {
    if (parsed.decision.missingFields.length === 0) {
      issues.push("ENRICH must include at least one missing field.");
    }

    if (
      context.maxEnrichRounds !== undefined &&
      context.enrichRoundCount !== undefined &&
      context.enrichRoundCount >= context.maxEnrichRounds
    ) {
      issues.push("ENRICH exceeds the configured enrich round limit.");
    }
  } else if (parsed.decision.missingFields.length !== 0) {
    issues.push(`${parsed.status} must include an empty missingFields array.`);
  }

  if (parsed.status === "REJECT" && parsed.closeMatch) {
    if (parsed.closeMatch.reasons.length === 0) {
      issues.push("closeMatch.reasons must include at least one reason.");
    }
  }

  if (issues.length > 0) {
    return invalid("qualifier_response", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "qualifier_response",
    parsed,
  };
}

function validateQualifierRequest(payload: unknown): ProspectingValidationResult {
  const schemaResult = validateWithSchema("qualifier_request", QualifierRequestSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof QualifierRequestSchema>;
  const issues: string[] = [];
  const allowedStatuses = new Set(parsed.qualificationRules.allowedStatuses);
  const { targetFilters } = parsed.qualificationRules;

  for (const status of ["ACCEPT", "REJECT", "ENRICH"] as const) {
    if (!allowedStatuses.has(status)) {
      issues.push(`qualificationRules.allowedStatuses must include ${status}.`);
    }
  }

  if (
    targetFilters.preferredMinCompanySize !== undefined &&
    targetFilters.preferredMaxCompanySize !== undefined &&
    targetFilters.preferredMinCompanySize > targetFilters.preferredMaxCompanySize
  ) {
    issues.push(
      "qualificationRules.targetFilters.preferredMinCompanySize cannot be greater than preferredMaxCompanySize.",
    );
  }

  if (issues.length > 0) {
    return invalid("qualifier_request", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "qualifier_request",
    parsed,
  };
}

function validateCrmResponse(
  payload: unknown,
  context: ProspectingValidationContext,
): ProspectingValidationResult {
  const schemaResult = validateWithSchema("crm_response", CrmResponseSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof CrmResponseSchema>;
  const issues: string[] = [];

  if (
    parsed.status === "OK" &&
    context.expectedAction !== undefined &&
    parsed.action !== context.expectedAction
  ) {
    issues.push("CRM action does not match the expected action.");
  }

  if (issues.length > 0) {
    return invalid("crm_response", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "crm_response",
    parsed,
  };
}

function validateCrmRequest(payload: unknown): ProspectingValidationResult {
  const schemaResult = validateWithSchema("crm_request", CrmRequestSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof CrmRequestSchema>;
  const issues: string[] = [];

  if (parsed.action === "REGISTER_ACCEPTED_LEAD") {
    if (parsed.campaignStateUpdate.searchedCompanyNamesAdd.length === 0) {
      issues.push("REGISTER_ACCEPTED_LEAD must add at least one searched company.");
    }

    if (parsed.campaignStateUpdate.registeredLeadNamesAdd.length === 0) {
      issues.push("REGISTER_ACCEPTED_LEAD must add at least one registered lead.");
    }
  }

  if (parsed.action === "SAVE_PENDING_SHORTLIST") {
    if (parsed.pendingShortlist.options.length === 0) {
      issues.push("SAVE_PENDING_SHORTLIST must include at least one shortlist option.");
    }
  }

  if (issues.length > 0) {
    return invalid("crm_request", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "crm_request",
    parsed,
  };
}

export function validateProspectingContract(
  contract: ProspectingContract,
  payload: unknown,
  context: ProspectingValidationContext = {},
): ProspectingValidationResult {
  const issues = contextIssues(context);
  if (issues.length > 0) {
    return invalid(contract, "INVALID_CONTEXT", issues);
  }

  switch (contract) {
    case "sourcer_request":
      return validateSourcerRequest(payload);
    case "sourcer_response":
      return validateSourcerResponse(payload, context);
    case "qualifier_request":
      return validateQualifierRequest(payload);
    case "qualifier_response":
      return validateQualifierResponse(payload, context);
    case "crm_request":
      return validateCrmRequest(payload);
    case "crm_response":
      return validateCrmResponse(payload, context);
    default:
      return invalid(contract, "UNSUPPORTED_CONTRACT", ["Unsupported prospecting contract."]);
  }
}

export function parseAndValidateProspectingContract(
  contract: ProspectingContract,
  payloadText: string,
  context: ProspectingValidationContext = {},
): ProspectingValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payloadText);
  } catch {
    return invalid(contract, "INVALID_JSON", ["Payload is not valid JSON."]);
  }

  return validateProspectingContract(contract, parsed, context);
}
