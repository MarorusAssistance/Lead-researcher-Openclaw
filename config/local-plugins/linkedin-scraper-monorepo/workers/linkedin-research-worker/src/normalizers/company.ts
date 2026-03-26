import {
  CompanyEntitySchema,
  deriveCompanySignalGroups,
  normalizeHttpUrl,
  normalizeLinkedInCompanyUrl,
  normalizeRegionGuess,
} from "@linkedin-research/shared";
import type { ExtractedCompany } from "../extractors/company-extractor.js";

export function normalizeCompanyEntity(companyUrl: string, extracted: ExtractedCompany) {
  const normalizedUrl = normalizeLinkedInCompanyUrl(companyUrl);

  const baseEntity = CompanyEntitySchema.parse({
    entityType: "company",
    companyName: extracted.companyName,
    tagline: extracted.tagline,
    industry: extracted.industry,
    companySize: extracted.companySize,
    headquarters: extracted.headquarters,
    website: extracted.website ? normalizeHttpUrl(extracted.website, "website") : null,
    about: extracted.about,
    specialties: extracted.specialties,
    companyUrl: normalizedUrl,
    regionGuess: normalizeRegionGuess(extracted.headquarters),
    hiringSignals: [],
    genaiSignals: [],
    recruitingSignals: [],
  });

  return CompanyEntitySchema.parse({
    ...baseEntity,
    ...deriveCompanySignalGroups(baseEntity),
  });
}
