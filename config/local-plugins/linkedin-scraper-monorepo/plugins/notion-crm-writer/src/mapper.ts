import {
  AppError,
  CrmUpsertInputSchema,
  normalizeLinkedInCompanyUrl,
  normalizeLinkedInProfileUrl,
  type CrmUpsertInput,
} from "@linkedin-research/shared";
import {
  DEFAULT_PROPERTY_MAP,
  resolvePropertyName,
  type NotionCrmWriterPluginConfig,
  type PropertyKey,
} from "./config.js";

export type CrmFieldValues = Partial<Record<PropertyKey, string | number | boolean | Date>>;

function normalizeLinkedinUrlByEntityType(input: CrmUpsertInput): string {
  if (input.entityType === "person") {
    return normalizeLinkedInProfileUrl(input.linkedinUrl);
  }

  return normalizeLinkedInCompanyUrl(input.linkedinUrl);
}

export function mapCrmInputToFieldValues(
  rawInput: unknown,
  config: NotionCrmWriterPluginConfig,
): CrmFieldValues {
  const input = CrmUpsertInputSchema.parse(rawInput);
  if (input.rawEntity.entityType !== input.entityType) {
    throw new AppError("invalid_input", "entityType does not match rawEntity.entityType.", {
      status: 400,
    });
  }

  const common = {
    linkedinUrl: normalizeLinkedinUrlByEntityType(input),
    region: input.fitAnalysis.region ?? input.rawEntity.regionGuess ?? undefined,
    fitScore: input.fitAnalysis.fitScore ?? undefined,
    status: config.defaultStatusValue,
    sourceNotes: input.fitAnalysis.sourceNotes ?? undefined,
    hook1: input.fitAnalysis.hook1 ?? undefined,
    hook2: input.fitAnalysis.hook2 ?? undefined,
    fitSummary: input.fitAnalysis.fitSummary ?? undefined,
    type: input.entityType === "person" ? config.typeValues.person : config.typeValues.company,
  } satisfies CrmFieldValues;

  if (input.entityType === "person") {
    return {
      ...common,
      name: input.rawEntity.fullName ?? undefined,
      company: input.rawEntity.currentCompany ?? undefined,
      role: input.rawEntity.currentRole ?? undefined,
    };
  }

  return {
    ...common,
    name: input.rawEntity.companyName ?? undefined,
    company: input.rawEntity.companyName ?? undefined,
    role: input.rawEntity.tagline ?? undefined,
  };
}

export function describeWrittenProperties(
  config: NotionCrmWriterPluginConfig,
  values: CrmFieldValues,
): string[] {
  return (Object.keys(values) as PropertyKey[])
    .filter((key) => values[key] !== undefined && values[key] !== null)
    .map((key) => resolvePropertyName(config, key));
}

export { DEFAULT_PROPERTY_MAP };
