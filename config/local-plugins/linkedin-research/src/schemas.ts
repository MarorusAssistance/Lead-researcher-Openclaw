import { Type, type Static } from "@sinclair/typebox";

const NullableTextSchema = Type.Union([Type.String({ minLength: 1 }), Type.Null()]);

export const PersonExperienceSchema = Type.Object(
  {
    title: NullableTextSchema,
    company: NullableTextSchema,
    dateRange: NullableTextSchema,
    location: NullableTextSchema,
    description: NullableTextSchema,
  },
  { additionalProperties: false },
);

export const PersonEducationSchema = Type.Object(
  {
    school: NullableTextSchema,
    degree: NullableTextSchema,
    dateRange: NullableTextSchema,
  },
  { additionalProperties: false },
);

export const PersonEntitySchema = Type.Object(
  {
    entityType: Type.Literal("person"),
    fullName: NullableTextSchema,
    headline: NullableTextSchema,
    location: NullableTextSchema,
    about: NullableTextSchema,
    currentCompany: NullableTextSchema,
    currentRole: NullableTextSchema,
    experience: Type.Array(PersonExperienceSchema),
    education: Type.Array(PersonEducationSchema),
    skills: Type.Array(Type.String({ minLength: 1 })),
    profileUrl: Type.String({ minLength: 1 }),
    companyGuess: NullableTextSchema,
    regionGuess: NullableTextSchema,
    contactabilitySignals: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const CompanyEntitySchema = Type.Object(
  {
    entityType: Type.Literal("company"),
    companyName: NullableTextSchema,
    tagline: NullableTextSchema,
    industry: NullableTextSchema,
    companySize: NullableTextSchema,
    headquarters: NullableTextSchema,
    website: NullableTextSchema,
    about: NullableTextSchema,
    specialties: Type.Array(Type.String({ minLength: 1 })),
    companyUrl: Type.String({ minLength: 1 }),
    regionGuess: NullableTextSchema,
    hiringSignals: Type.Array(Type.String({ minLength: 1 })),
    genaiSignals: Type.Array(Type.String({ minLength: 1 })),
    recruitingSignals: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const RawEntitySchema = Type.Union([PersonEntitySchema, CompanyEntitySchema]);

export const FitAnalysisSchema = Type.Object(
  {
    fitScore: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
    fitSummary: NullableTextSchema,
    hook1: NullableTextSchema,
    hook2: NullableTextSchema,
    sourceNotes: NullableTextSchema,
    region: NullableTextSchema,
    company: NullableTextSchema,
    role: NullableTextSchema,
    type: NullableTextSchema,
  },
  { additionalProperties: false },
);

export const LinkedInProfileFetchParamsSchema = Type.Object(
  {
    profileUrl: Type.String({ minLength: 1 }),
    includeDebug: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const LinkedInCompanyFetchParamsSchema = Type.Object(
  {
    companyUrl: Type.String({ minLength: 1 }),
    includeDebug: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const LinkedInEntityEnrichParamsSchema = Type.Object(
  {
    rawEntity: RawEntitySchema,
  },
  { additionalProperties: false },
);

export const WorkerMetaSchema = Type.Object(
  {
    requestId: Type.String({ minLength: 1 }),
    durationMs: Type.Number({ minimum: 0 }),
    attempts: Type.Number({ minimum: 1 }),
    debugArtifacts: Type.Optional(
      Type.Object(
        {
          htmlPath: Type.Optional(Type.String({ minLength: 1 })),
          screenshotPath: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const WorkerErrorSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    status: Type.Number({ minimum: 100, maximum: 599 }),
    retryable: Type.Boolean(),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export type PersonExperience = Static<typeof PersonExperienceSchema>;
export type PersonEducation = Static<typeof PersonEducationSchema>;
export type PersonEntity = Static<typeof PersonEntitySchema>;
export type CompanyEntity = Static<typeof CompanyEntitySchema>;
export type RawEntity = Static<typeof RawEntitySchema>;
export type FitAnalysis = Static<typeof FitAnalysisSchema>;
export type LinkedInProfileFetchParams = Static<typeof LinkedInProfileFetchParamsSchema>;
export type LinkedInCompanyFetchParams = Static<typeof LinkedInCompanyFetchParamsSchema>;
export type LinkedInEntityEnrichParams = Static<typeof LinkedInEntityEnrichParamsSchema>;
export type WorkerMeta = Static<typeof WorkerMetaSchema>;
export type WorkerError = Static<typeof WorkerErrorSchema>;
