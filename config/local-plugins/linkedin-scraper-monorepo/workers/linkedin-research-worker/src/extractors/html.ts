import { load } from "cheerio";
import { cleanMultilineText, cleanText, normalizeStringArray } from "@linkedin-research/shared";

export function loadDocument(html: string) {
  return load(html);
}

export function firstText(html: string, selectors: string[]): string | null {
  const $ = loadDocument(html);

  for (const selector of selectors) {
    const value = cleanText($(selector).first().text());
    if (value) {
      return value;
    }
  }

  return null;
}

export function listTexts(html: string, selectors: string[]): string[] {
  const $ = loadDocument(html);
  const values: string[] = [];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = cleanText($(element).text());
      if (text) {
        values.push(text);
      }
    });
  }

  return normalizeStringArray(values);
}

export function splitMeaningfulLines(input: string): string[] {
  return input
    .replace(/\u00b7/g, "\n")
    .split("\n")
    .map((line) => cleanText(line))
    .filter((line): line is string => Boolean(line));
}

export function extractSectionText(html: string, labels: string[]): string | null {
  const $ = loadDocument(html);
  const loweredLabels = labels.map((label) => label.toLowerCase());

  const sections = $("section, div").toArray();
  for (const section of sections) {
    const sectionText = cleanMultilineText($(section).text());
    if (!sectionText) {
      continue;
    }

    const lowered = sectionText.toLowerCase();
    if (loweredLabels.some((label) => lowered.startsWith(label) || lowered.includes(`\n${label}\n`))) {
      const lines = splitMeaningfulLines(sectionText);
      const filtered = lines.filter((line) => !loweredLabels.includes(line.toLowerCase()));
      if (filtered.length > 0) {
        return filtered.join("\n");
      }
    }
  }

  return null;
}

export function extractDefinitionValue(html: string, labels: string[]): string | null {
  const $ = loadDocument(html);
  const loweredLabels = labels.map((label) => label.toLowerCase());

  const definitionTerms = $("dt, [data-field-label]").toArray();
  for (const term of definitionTerms) {
    const label = cleanText($(term).text())?.toLowerCase();
    if (!label || !loweredLabels.includes(label)) {
      continue;
    }

    const sibling = $(term).next("dd").first();
    const siblingText = cleanText(sibling.text());
    if (siblingText) {
      return siblingText;
    }
  }

  for (const label of loweredLabels) {
    const selector = `[data-field="${label}"], [data-field-label="${label}"]`;
    const direct = cleanText($(selector).first().text());
    if (direct) {
      return direct;
    }
  }

  return null;
}
