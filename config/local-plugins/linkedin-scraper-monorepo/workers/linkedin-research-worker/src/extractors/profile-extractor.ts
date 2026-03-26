import {
  cleanMultilineText,
  cleanText,
  normalizeStringArray,
  type PersonEducation,
  type PersonExperience,
} from "@linkedin-research/shared";
import { loadDocument, splitMeaningfulLines } from "./html.js";

type ProfilePages = {
  mainHtml: string;
  experienceHtml?: string | null;
  educationHtml?: string | null;
  skillsHtml?: string | null;
};

export type ExtractedProfile = {
  fullName: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  currentCompany: string | null;
  currentRole: string | null;
  experience: PersonExperience[];
  education: PersonEducation[];
  skills: string[];
};

function titleFromCard($root: ReturnType<typeof loadDocument>, element: unknown): string | null {
  return cleanText(
    $root(element)
      .find("h3, [data-field='title'], .t-bold span[aria-hidden='true']")
      .first()
      .text(),
  );
}

function companyFromCard($root: ReturnType<typeof loadDocument>, element: unknown): string | null {
  return cleanText(
    $root(element)
      .find(
        "[data-field='company'], .t-14.t-normal span[aria-hidden='true'], .pvs-entity__sub-components span[aria-hidden='true']",
      )
      .first()
      .text(),
  );
}

function dateRangeFromCard($root: ReturnType<typeof loadDocument>, element: unknown): string | null {
  return cleanText(
    $root(element)
      .find("[data-field='dateRange'], .pvs-entity__caption-wrapper[aria-hidden='true']")
      .first()
      .text(),
  );
}

function locationFromCard($root: ReturnType<typeof loadDocument>, element: unknown): string | null {
  return cleanText(
    $root(element)
      .find("[data-field='location'], .t-14.t-normal.t-black--light span[aria-hidden='true']")
      .last()
      .text(),
  );
}

function descriptionFromCard($root: ReturnType<typeof loadDocument>, element: unknown): string | null {
  return cleanMultilineText(
    $root(element)
      .find("[data-field='description'], .inline-show-more-text, .display-flex.t-14.t-normal.t-black span")
      .text(),
  );
}

function dedupeExperience(entries: PersonExperience[]): PersonExperience[] {
  const seen = new Set<string>();
  const result: PersonExperience[] = [];

  for (const entry of entries) {
    const key = [entry.title, entry.company, entry.dateRange, entry.location].join("|");
    if (!seen.has(key) && (entry.title || entry.company)) {
      seen.add(key);
      result.push(entry);
    }
  }

  return result;
}

function dedupeEducation(entries: PersonEducation[]): PersonEducation[] {
  const seen = new Set<string>();
  const result: PersonEducation[] = [];

  for (const entry of entries) {
    const key = [entry.school, entry.degree, entry.dateRange].join("|");
    if (!seen.has(key) && (entry.school || entry.degree)) {
      seen.add(key);
      result.push(entry);
    }
  }

  return result;
}

function parseExperience(html: string | null | undefined): PersonExperience[] {
  if (!html) {
    return [];
  }

  const $ = loadDocument(html);
  const entries: PersonExperience[] = [];

  $("li, .pvs-list__paged-list-item, .artdeco-list__item").each((_, element) => {
    const lines = splitMeaningfulLines($(element).text());
    const title = titleFromCard($, element) ?? lines[0] ?? null;
    const company = companyFromCard($, element) ?? lines[1] ?? null;
    const dateRange = dateRangeFromCard($, element) ?? lines[2] ?? null;
    const location = locationFromCard($, element) ?? lines[3] ?? null;
    const description =
      descriptionFromCard($, element) ?? (lines.length > 4 ? lines.slice(4).join("\n") : null);

    entries.push({
      title,
      company,
      dateRange,
      location,
      description,
    });
  });

  return dedupeExperience(entries);
}

function parseEducation(html: string | null | undefined): PersonEducation[] {
  if (!html) {
    return [];
  }

  const $ = loadDocument(html);
  const entries: PersonEducation[] = [];

  $("li, .pvs-list__paged-list-item, .artdeco-list__item").each((_, element) => {
    const lines = splitMeaningfulLines($(element).text());
    const school =
      cleanText($(element).find("h3, [data-field='school']").first().text()) ?? lines[0] ?? null;
    const degree =
      cleanText($(element).find("[data-field='degree'], .t-14.t-normal").first().text()) ??
      lines[1] ??
      null;
    const dateRange =
      cleanText($(element).find("[data-field='dateRange'], .pvs-entity__caption-wrapper").first().text()) ??
      lines[2] ??
      null;

    entries.push({
      school,
      degree,
      dateRange,
    });
  });

  return dedupeEducation(entries);
}

function parseSkills(html: string | null | undefined): string[] {
  if (!html) {
    return [];
  }

  const $ = loadDocument(html);
  return normalizeStringArray(
    $("li, .pvs-list__paged-list-item, .artdeco-list__item")
      .toArray()
      .map((element) => {
        const direct = cleanText(
          $(element)
            .find("[data-field='skill'], .t-bold span[aria-hidden='true'], span[aria-hidden='true']")
            .first()
            .text(),
        );

        if (direct) {
          return direct;
        }

        return splitMeaningfulLines($(element).text())[0] ?? null;
      }),
  );
}

export function extractProfile(pages: ProfilePages): ExtractedProfile {
  const $ = loadDocument(pages.mainHtml);

  const fullName = cleanText(
    $("h1, .text-heading-xlarge, [data-field='fullName']").first().text(),
  );
  const headline = cleanText(
    $(".text-body-medium, .top-card-layout__headline, [data-field='headline']").first().text(),
  );
  const location = cleanText(
    $(".text-body-small, .top-card-layout__first-subline, [data-field='location']").first().text(),
  );
  const about =
    cleanMultilineText($("[data-section='about']").first().text()) ??
    cleanMultilineText($("[data-field='about']").first().text());
  const experience = parseExperience(pages.experienceHtml);
  const education = parseEducation(pages.educationHtml);
  const skills = parseSkills(pages.skillsHtml);
  const currentRole = cleanText($("[data-field='currentRole']").first().text()) ?? experience[0]?.title ?? null;
  const currentCompany =
    cleanText($("[data-field='currentCompany']").first().text()) ?? experience[0]?.company ?? null;

  return {
    fullName,
    headline,
    location,
    about,
    currentCompany,
    currentRole,
    experience,
    education,
    skills,
  };
}
