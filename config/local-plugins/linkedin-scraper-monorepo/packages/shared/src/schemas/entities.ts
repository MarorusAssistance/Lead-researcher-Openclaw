import { z } from "zod";

export const NullableTextSchema = z.string().min(1).nullable();

export const PersonExperienceSchema = z
  .object({
    title: NullableTextSchema,
    company: NullableTextSchema,
    dateRange: NullableTextSchema,
    location: NullableTextSchema,
    description: NullableTextSchema,
  })
  .strict();

export const PersonEducationSchema = z
  .object({
    school: NullableTextSchema,
    degree: NullableTextSchema,
    dateRange: NullableTextSchema,
  })
  .strict();

export const PersonEntitySchema = z
  .object({
    entityType: z.literal("person"),
    fullName: NullableTextSchema,
    headline: NullableTextSchema,
    location: NullableTextSchema,
    about: NullableTextSchema,
    currentCompany: NullableTextSchema,
    currentRole: NullableTextSchema,
    experience: z.array(PersonExperienceSchema),
    education: z.array(PersonEducationSchema),
    skills: z.array(z.string().min(1)),
    profileUrl: z.string().url(),
    companyGuess: NullableTextSchema,
    regionGuess: NullableTextSchema,
    contactabilitySignals: z.array(z.string().min(1)),
  })
  .strict();

export const CompanyEntitySchema = z
  .object({
    entityType: z.literal("company"),
    companyName: NullableTextSchema,
    tagline: NullableTextSchema,
    industry: NullableTextSchema,
    companySize: NullableTextSchema,
    headquarters: NullableTextSchema,
    website: NullableTextSchema,
    about: NullableTextSchema,
    specialties: z.array(z.string().min(1)),
    companyUrl: z.string().url(),
    regionGuess: NullableTextSchema,
    hiringSignals: z.array(z.string().min(1)),
    genaiSignals: z.array(z.string().min(1)),
    recruitingSignals: z.array(z.string().min(1)),
  })
  .strict();

export const RawEntitySchema = z.discriminatedUnion("entityType", [
  PersonEntitySchema,
  CompanyEntitySchema,
]);

export const FitAnalysisSchema = z
  .object({
    fitScore: z.number().min(0).max(100).nullable(),
    fitSummary: NullableTextSchema,
    hook1: NullableTextSchema,
    hook2: NullableTextSchema,
    sourceNotes: NullableTextSchema,
    region: NullableTextSchema,
    company: NullableTextSchema,
    role: NullableTextSchema,
    type: NullableTextSchema,
  })
  .strict();

export const LinkedinProfileFetchInputSchema = z
  .object({
    profileUrl: z.string().min(1),
  })
  .strict();

export const LinkedinCompanyFetchInputSchema = z
  .object({
    companyUrl: z.string().min(1),
  })
  .strict();

export const LinkedinEntityEnrichInputSchema = z
  .object({
    rawEntity: RawEntitySchema,
  })
  .strict();

export const CrmUpsertInputSchema = z
  .object({
    entityType: z.enum(["person", "company"]),
    linkedinUrl: z.string().min(1),
    rawEntity: RawEntitySchema,
    fitAnalysis: FitAnalysisSchema,
  })
  .strict();

export const CrmUpsertResultSchema = z
  .object({
    pageId: z.string().min(1),
    operation: z.enum(["created", "updated"]),
    entityType: z.enum(["person", "company"]),
    linkedinUrl: z.string().url(),
    writtenProperties: z.array(z.string().min(1)),
  })
  .strict();

export const WorkerMetaSchema = z
  .object({
    requestId: z.string().min(1),
    durationMs: z.number().nonnegative(),
    attempts: z.number().int().positive(),
    debugArtifacts: z
      .object({
        screenshotPath: z.string().min(1).optional(),
        htmlPath: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const WorkerErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    status: z.number().int(),
    retryable: z.boolean(),
    details: z.record(z.unknown()).optional(),
  })
  .strict();

export function createWorkerSuccessSchema<TSchema extends z.ZodTypeAny>(dataSchema: TSchema) {
  return z
    .object({
      ok: z.literal(true),
      data: dataSchema,
      meta: WorkerMetaSchema,
    })
    .strict();
}

export function createWorkerErrorSchema() {
  return z
    .object({
      ok: z.literal(false),
      error: WorkerErrorSchema,
      meta: WorkerMetaSchema.optional(),
    })
    .strict();
}

export type PersonExperience = z.infer<typeof PersonExperienceSchema>;
export type PersonEducation = z.infer<typeof PersonEducationSchema>;
export type PersonEntity = z.infer<typeof PersonEntitySchema>;
export type CompanyEntity = z.infer<typeof CompanyEntitySchema>;
export type RawEntity = z.infer<typeof RawEntitySchema>;
export type FitAnalysis = z.infer<typeof FitAnalysisSchema>;
export type LinkedinProfileFetchInput = z.infer<typeof LinkedinProfileFetchInputSchema>;
export type LinkedinCompanyFetchInput = z.infer<typeof LinkedinCompanyFetchInputSchema>;
export type LinkedinEntityEnrichInput = z.infer<typeof LinkedinEntityEnrichInputSchema>;
export type CrmUpsertInput = z.infer<typeof CrmUpsertInputSchema>;
export type CrmUpsertResult = z.infer<typeof CrmUpsertResultSchema>;
export type WorkerMeta = z.infer<typeof WorkerMetaSchema>;
export type WorkerError = z.infer<typeof WorkerErrorSchema>;
