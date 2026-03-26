import { cleanMultilineText, cleanText, normalizeStringArray } from "@linkedin-research/shared";
import { extractDefinitionValue, loadDocument } from "./html.js";

type CompanyPages = {
  mainHtml: string;
  aboutHtml?: string | null;
};

export type ExtractedCompany = {
  companyName: string | null;
  tagline: string | null;
  industry: string | null;
  companySize: string | null;
  headquarters: string | null;
  website: string | null;
  about: string | null;
  specialties: string[];
};

function readSpecialties(html: string | null | undefined): string[] {
  if (!html) {
    return [];
  }

  const $ = loadDocument(html);
  const fromList = $("li[data-field='specialty'], [data-field='specialty']")
    .toArray()
    .map((element) => cleanText($(element).text()));

  const fromDefinition = extractDefinitionValue(html, ["specialties"]);
  return normalizeStringArray([
    ...fromList,
    ...(fromDefinition ? fromDefinition.split(",") : []),
  ]);
}

export function extractCompany(pages: CompanyPages): ExtractedCompany {
  const main$ = loadDocument(pages.mainHtml);
  const aboutHtml = pages.aboutHtml ?? pages.mainHtml;
  const about$ = loadDocument(aboutHtml);

  const companyName = cleanText(
    main$("h1, .org-top-card-summary__title, [data-field='companyName']").first().text(),
  );
  const tagline = cleanText(
    main$(".org-top-card-summary__tagline, .text-body-medium, [data-field='tagline']")
      .first()
      .text(),
  );
  const industry =
    extractDefinitionValue(aboutHtml, ["industry"]) ??
    cleanText(about$("[data-field='industry']").first().text());
  const companySize =
    extractDefinitionValue(aboutHtml, ["company size", "size"]) ??
    cleanText(about$("[data-field='companySize']").first().text());
  const headquarters =
    extractDefinitionValue(aboutHtml, ["headquarters"]) ??
    cleanText(about$("[data-field='headquarters']").first().text());
  const website =
    cleanText(about$("a[data-field='website']").attr("href")) ??
    extractDefinitionValue(aboutHtml, ["website"]);
  const about =
    cleanMultilineText(about$("[data-section='about']").first().text()) ??
    cleanMultilineText(about$("[data-field='about']").first().text());
  const specialties = readSpecialties(aboutHtml);

  return {
    companyName,
    tagline,
    industry,
    companySize,
    headquarters,
    website,
    about,
    specialties,
  };
}
