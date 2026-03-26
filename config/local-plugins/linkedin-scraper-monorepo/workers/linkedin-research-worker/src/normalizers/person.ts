import {
  PersonEntitySchema,
  derivePersonContactabilitySignals,
  normalizeCompanyGuess,
  normalizeLinkedInProfileUrl,
  normalizeRegionGuess,
} from "@linkedin-research/shared";
import type { ExtractedProfile } from "../extractors/profile-extractor.js";

export function normalizePersonEntity(profileUrl: string, extracted: ExtractedProfile) {
  const normalizedUrl = normalizeLinkedInProfileUrl(profileUrl);
  const currentCompany = extracted.currentCompany ?? extracted.experience[0]?.company ?? null;
  const currentRole = extracted.currentRole ?? extracted.experience[0]?.title ?? null;

  const entity = PersonEntitySchema.parse({
    entityType: "person",
    fullName: extracted.fullName,
    headline: extracted.headline,
    location: extracted.location,
    about: extracted.about,
    currentCompany,
    currentRole,
    experience: extracted.experience,
    education: extracted.education,
    skills: extracted.skills,
    profileUrl: normalizedUrl,
    companyGuess: normalizeCompanyGuess(currentCompany),
    regionGuess: normalizeRegionGuess(extracted.location),
    contactabilitySignals: [],
  });

  return PersonEntitySchema.parse({
    ...entity,
    contactabilitySignals: derivePersonContactabilitySignals(entity),
  });
}
