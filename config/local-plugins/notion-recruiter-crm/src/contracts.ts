import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const NullableStringSchema = Type.Union([Type.String({ minLength: 1 }), Type.Null()]);
const StringArraySchema = Type.Array(Type.String({ minLength: 1 }));
const NonNegativeIntegerSchema = Type.Integer({ minimum: 0 });

export const ProspectingContractSchema = Type.Union([
  Type.Literal("sourcer_request"),
  Type.Literal("sourcer_response"),
  Type.Literal("qualifier_request"),
  Type.Literal("qualifier_response"),
  Type.Literal("commercial_request"),
  Type.Literal("commercial_response"),
  Type.Literal("crm_request"),
  Type.Literal("crm_response"),
]);

export const CrmActionSchema = Type.Union([
  Type.Literal("GET_CAMPAIGN_STATE"),
  Type.Literal("REGISTER_ACCEPTED_LEAD"),
  Type.Literal("REGISTER_REJECTED_CANDIDATE"),
  Type.Literal("REGISTER_SOURCE_TRACE"),
  Type.Literal("REGISTER_SEARCH_RUN_RESULT"),
  Type.Literal("RESET_QUERY_MEMORY"),
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

export const ExplorationQueryUsageSchema = Type.Object(
  {
    query: Type.String({ minLength: 1 }),
    count: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const ExplorationVisitedHostSchema = Type.Object(
  {
    host: Type.String({ minLength: 1 }),
    count: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const SourcerExplorationHintsSchema = Type.Object(
  {
    overusedQueries: Type.Optional(Type.Array(ExplorationQueryUsageSchema, { maxItems: 20 })),
    visitedUrls: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 200 })),
    visitedHosts: Type.Optional(Type.Array(ExplorationVisitedHostSchema, { maxItems: 20 })),
  },
  { additionalProperties: false },
);

export const SourcerRequestOverridesSchema = Type.Object(
  {
    explicitTargetUrls: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 })),
    explicitTargetCompanyNames: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 }),
    ),
  },
  { additionalProperties: false },
);

export const VisitedUrlRecordSchema = Type.Object(
  {
    url: Type.String({ minLength: 1 }),
    normalizedUrl: Type.String({ minLength: 1 }),
    source: Type.Union([Type.Literal("fetch"), Type.Literal("evidence")]),
    firstSeenAt: Type.String({ minLength: 1 }),
    lastSeenAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const QueryHistoryEntrySchema = Type.Object(
  {
    query: Type.String({ minLength: 1 }),
    normalizedQuery: Type.String({ minLength: 1 }),
    usedAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const ExplorationMemorySchema = Type.Object(
  {
    visitedUrls: Type.Array(VisitedUrlRecordSchema),
    queryHistory: Type.Array(QueryHistoryEntrySchema),
    consecutiveHardMissRuns: NonNegativeIntegerSchema,
  },
  { additionalProperties: false },
);

export const SourceTraceSchema = Type.Object(
  {
    queries: Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 }),
    fetchedUrls: Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 }),
    evidenceUrls: Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 }),
  },
  { additionalProperties: false },
);

export const SearchRunOutcomeSchema = Type.Object(
  {
    outcome: Type.Union([
      Type.Literal("SUCCESS"),
      Type.Literal("SOFT_MISS"),
      Type.Literal("HARD_MISS"),
    ]),
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
    explorationHints: Type.Optional(SourcerExplorationHintsSchema),
    requestOverrides: Type.Optional(SourcerRequestOverridesSchema),
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

export const LeadProfileSchema = Type.Object(
  {
    recruiterType: Type.Union([Type.Literal("in_house"), Type.Literal("agency")]),
    region: Type.String({ minLength: 1 }),
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
    leadProfile: Type.Optional(LeadProfileSchema),
  },
  { additionalProperties: false },
);

export const QualifierRejectResponseSchema = Type.Object(
  {
    status: Type.Literal("REJECT"),
    candidateId: Type.String({ minLength: 1 }),
    decision: QualifierRejectDecisionSchema,
    closeMatch: Type.Optional(CloseMatchSchema),
    leadProfile: Type.Optional(LeadProfileSchema),
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

export const OutreachPackSchema = Type.Object(
  {
    sourceNotes: Type.String({ minLength: 1 }),
    hook1: Type.String({ minLength: 1 }),
    hook2: Type.String({ minLength: 1 }),
    fitSummary: Type.String({ minLength: 1 }),
    connectionNoteDraft: Type.String({ minLength: 1 }),
    dmDraft: Type.String({ minLength: 1 }),
    emailSubjectDraft: Type.String({ minLength: 1 }),
    emailBodyDraft: Type.String({ minLength: 1 }),
    nextActionType: Type.Literal("connection_request"),
  },
  { additionalProperties: false },
);

export const CommercialQualificationSchema = Type.Object(
  {
    status: Type.Union([Type.Literal("ACCEPT"), Type.Literal("REJECT")]),
    reasons: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    closeMatch: Type.Optional(CloseMatchSchema),
    leadProfile: Type.Optional(LeadProfileSchema),
  },
  { additionalProperties: false },
);

export const CommercialChannelRulesSchema = Type.Object(
  {
    languageMode: Type.Union([
      Type.Literal("MATCH_LEAD_LANGUAGE"),
      Type.Literal("FORCE_ES"),
      Type.Literal("FORCE_EN"),
    ]),
    connectionNote: Type.Object(
      {
        maxChars: Type.Integer({ minimum: 1 }),
        targetMinChars: Type.Integer({ minimum: 1 }),
        targetMaxChars: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
    dm: Type.Object(
      {
        minChars: Type.Integer({ minimum: 1 }),
        maxChars: Type.Integer({ minimum: 1 }),
        paragraphCount: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
    emailSubject: Type.Object(
      {
        minWords: Type.Integer({ minimum: 1 }),
        maxWords: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
    emailBody: Type.Object(
      {
        minWords: Type.Integer({ minimum: 1 }),
        maxWords: Type.Integer({ minimum: 1 }),
        minSentences: Type.Integer({ minimum: 1 }),
        maxSentences: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const CommercialRequestSchema = Type.Object(
  {
    action: Type.Literal("GENERATE_OUTREACH_PACK"),
    runId: Type.String({ minLength: 1 }),
    candidate: CandidateSchema,
    qualification: CommercialQualificationSchema,
    channelRules: CommercialChannelRulesSchema,
  },
  { additionalProperties: false },
);

export const CommercialReadyResponseSchema = Type.Object(
  {
    status: Type.Literal("READY"),
    candidateId: Type.String({ minLength: 1 }),
    outreachPack: OutreachPackSchema,
  },
  { additionalProperties: false },
);

export const CommercialErrorResponseSchema = Type.Object(
  {
    status: Type.Literal("ERROR"),
    candidateId: Type.String({ minLength: 1 }),
    error: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const CommercialResponseSchema = Type.Union([
  CommercialReadyResponseSchema,
  CommercialErrorResponseSchema,
]);

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
    leadProfile: Type.Optional(LeadProfileSchema),
    outreachPack: Type.Optional(OutreachPackSchema),
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
      Type.Literal("REGISTER_SOURCE_TRACE"),
      Type.Literal("REGISTER_SEARCH_RUN_RESULT"),
      Type.Literal("RESET_QUERY_MEMORY"),
    ]),
    campaignState: CampaignStateSchema,
    explorationMemory: ExplorationMemorySchema,
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
    leadProfile: Type.Optional(LeadProfileSchema),
    outreachPack: Type.Optional(OutreachPackSchema),
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

export const CrmRegisterSourceTraceRequestSchema = Type.Object(
  {
    action: Type.Literal("REGISTER_SOURCE_TRACE"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    sourceTrace: SourceTraceSchema,
  },
  { additionalProperties: false },
);

export const CrmRegisterSearchRunResultRequestSchema = Type.Object(
  {
    action: Type.Literal("REGISTER_SEARCH_RUN_RESULT"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
    result: SearchRunOutcomeSchema,
  },
  { additionalProperties: false },
);

export const CrmResetQueryMemoryRequestSchema = Type.Object(
  {
    action: Type.Literal("RESET_QUERY_MEMORY"),
    runId: Type.Optional(Type.String({ minLength: 1 })),
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
  CrmRegisterSourceTraceRequestSchema,
  CrmRegisterSearchRunResultRequestSchema,
  CrmResetQueryMemoryRequestSchema,
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

function personLooksLikeCompanyName(personName: string, companyName: string): boolean {
  const normalizedPerson = normalizeLookupName(personName);
  if (normalizedPerson.length === 0) {
    return false;
  }

  return companyMatchKeys(companyName).some((value) => value === normalizedPerson);
}

function normalizeDomainForMatch(input: string): string {
  return input.trim().toLowerCase().replace(/^www\./, "");
}

function extractHostnameForMatch(url: string): string | null {
  try {
    return normalizeDomainForMatch(new URL(url).hostname);
  } catch {
    return null;
  }
}

function personEvidenceTokens(fullName: string): string[] {
  const normalized = normalizeLookupName(fullName);
  const parts = normalized.split(" ").filter((part) => part.length >= 3);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
  return [...new Set([normalized, lastName, ...parts].filter((value): value is string => Boolean(value)))];
}

function evidenceLinksNamedPersonToCompany(
  evidence: Array<{ claim: string; url: string }>,
  fullName: string,
  companyName: string,
  companyDomain: string | null,
): boolean {
  const personTokens = personEvidenceTokens(fullName);
  const companyKeys = companyMatchKeys(companyName).filter((value) => value.length >= 3);
  const normalizedDomain = companyDomain ? normalizeDomainForMatch(companyDomain) : null;

  return evidence.some((item) => {
    const claim = normalizeLookupName(item.claim);
    const host = extractHostnameForMatch(item.url);
    const mentionsPerson = personTokens.some((token) => claim.includes(token));
    if (!mentionsPerson) {
      return false;
    }

    const mentionsCompany = companyKeys.some((key) => claim.includes(key));
    const onCompanyDomain =
      normalizedDomain !== null &&
      host !== null &&
      (host === normalizedDomain || host.endsWith(`.${normalizedDomain}`));

    return mentionsCompany || onCompanyDomain;
  });
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
      parsed.candidate.person.fullName !== null &&
      personLooksLikeCompanyName(
        parsed.candidate.person.fullName,
        parsed.candidate.company.name,
      )
    ) {
      issues.push("person.fullName cannot be the same as company.name.");
    }

    if (
      parsed.candidate.person.linkedinUrl !== null &&
      /linkedin\.com\/company\//i.test(parsed.candidate.person.linkedinUrl)
    ) {
      issues.push("person.linkedinUrl cannot point to a LinkedIn company page.");
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

    if (
      parsed.candidate.person.fullName !== null &&
      !evidenceLinksNamedPersonToCompany(
        parsed.candidate.evidence,
        parsed.candidate.person.fullName,
        parsed.candidate.company.name,
        parsed.candidate.company.domain,
      )
    ) {
      issues.push("candidate evidence must link the named person to the target company.");
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

function validateCommercialResponse(
  payload: unknown,
  context: ProspectingValidationContext,
): ProspectingValidationResult {
  const schemaResult = validateWithSchema("commercial_response", CommercialResponseSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof CommercialResponseSchema>;
  const issues: string[] = [];

  if (context.expectedCandidateId && parsed.candidateId !== context.expectedCandidateId) {
    issues.push("candidateId does not match the current candidate.");
  }

  if (parsed.status === "READY") {
    const connectChars = parsed.outreachPack.connectionNoteDraft.length;
    const emailWordCount = parsed.outreachPack.emailBodyDraft.trim().split(/\s+/).filter(Boolean).length;
    const emailSentenceCount = parsed.outreachPack.emailBodyDraft
      .split(/[.!?]+/)
      .map((value) => value.trim())
      .filter(Boolean).length;
    const subjectWordCount = parsed.outreachPack.emailSubjectDraft.trim().split(/\s+/).filter(Boolean).length;

    if (connectChars > 200) {
      issues.push("connectionNoteDraft must be 200 characters or fewer.");
    }

    if (subjectWordCount < 2 || subjectWordCount > 5) {
      issues.push("emailSubjectDraft must be between 2 and 5 words.");
    }

    if (emailWordCount < 70 || emailWordCount > 130) {
      issues.push("emailBodyDraft must be between 70 and 130 words.");
    }

    if (emailSentenceCount < 3 || emailSentenceCount > 5) {
      issues.push("emailBodyDraft must contain between 3 and 5 sentences.");
    }
  }

  if (issues.length > 0) {
    return invalid("commercial_response", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "commercial_response",
    parsed,
  };
}

function validateCommercialRequest(payload: unknown): ProspectingValidationResult {
  const schemaResult = validateWithSchema("commercial_request", CommercialRequestSchema, payload);
  if (schemaResult) {
    return schemaResult;
  }

  const parsed = payload as Static<typeof CommercialRequestSchema>;
  const issues: string[] = [];

  if (
    parsed.qualification.status === "ACCEPT" &&
    parsed.qualification.closeMatch !== undefined
  ) {
    issues.push("qualification.closeMatch is only valid when status is REJECT.");
  }

  if (
    parsed.channelRules.connectionNote.targetMinChars >
    parsed.channelRules.connectionNote.targetMaxChars
  ) {
    issues.push("connectionNote targetMinChars cannot be greater than targetMaxChars.");
  }

  if (
    parsed.channelRules.connectionNote.targetMaxChars > parsed.channelRules.connectionNote.maxChars
  ) {
    issues.push("connectionNote targetMaxChars cannot be greater than maxChars.");
  }

  if (parsed.channelRules.dm.minChars > parsed.channelRules.dm.maxChars) {
    issues.push("dm minChars cannot be greater than maxChars.");
  }

  if (parsed.channelRules.emailSubject.minWords > parsed.channelRules.emailSubject.maxWords) {
    issues.push("emailSubject minWords cannot be greater than maxWords.");
  }

  if (parsed.channelRules.emailBody.minWords > parsed.channelRules.emailBody.maxWords) {
    issues.push("emailBody minWords cannot be greater than maxWords.");
  }

  if (
    parsed.channelRules.emailBody.minSentences > parsed.channelRules.emailBody.maxSentences
  ) {
    issues.push("emailBody minSentences cannot be greater than maxSentences.");
  }

  if (issues.length > 0) {
    return invalid("commercial_request", "CONTRACT_RULE_VIOLATION", issues);
  }

  return {
    ok: true,
    contract: "commercial_request",
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

  if (parsed.action === "REGISTER_SOURCE_TRACE") {
    const traceCount =
      parsed.sourceTrace.queries.length +
      parsed.sourceTrace.fetchedUrls.length +
      parsed.sourceTrace.evidenceUrls.length;
    if (traceCount === 0) {
      issues.push("REGISTER_SOURCE_TRACE must include at least one query or URL.");
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
    case "commercial_request":
      return validateCommercialRequest(payload);
    case "commercial_response":
      return validateCommercialResponse(payload, context);
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
