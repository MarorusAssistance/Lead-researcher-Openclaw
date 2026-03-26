import { AppError } from "../errors/app-error.js";
import { cleanText, preferFirstNonEmpty } from "./text.js";

export type LinkedInUrlKind = "profile" | "company" | "any";

function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new AppError("invalid_input", `Invalid URL: ${raw}`, { status: 400 });
  }

  if (!url.hostname.toLowerCase().includes("linkedin.com")) {
    throw new AppError("invalid_input", `Expected a LinkedIn URL, received: ${raw}`, {
      status: 400,
    });
  }

  url.hash = "";
  url.search = "";
  return url;
}

export function normalizeLinkedInUrl(raw: string, kind: LinkedInUrlKind = "any"): string {
  const url = normalizeUrl(raw);
  const pathname = url.pathname.replace(/\/+/g, "/");

  if (kind === "profile" && !/^\/in\/[^/]+\/?$/i.test(pathname)) {
    throw new AppError("invalid_input", `Expected a LinkedIn profile URL, received: ${raw}`, {
      status: 400,
    });
  }

  if (kind === "company" && !/^\/company\/[^/]+\/?$/i.test(pathname)) {
    throw new AppError("invalid_input", `Expected a LinkedIn company URL, received: ${raw}`, {
      status: 400,
    });
  }

  url.pathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return url.toString();
}

export function normalizeLinkedInProfileUrl(raw: string): string {
  return normalizeLinkedInUrl(raw, "profile");
}

export function normalizeLinkedInCompanyUrl(raw: string): string {
  return normalizeLinkedInUrl(raw, "company");
}

export function normalizeHttpUrl(raw: string, label = "URL"): string {
  const trimmed = raw.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    url.hash = "";
    return url.toString();
  } catch {
    throw new AppError("invalid_input", `Invalid ${label}: ${raw}`, { status: 400 });
  }
}

export function toDetailUrl(baseUrl: string, suffix: string): string {
  const normalizedBase = normalizeLinkedInUrl(baseUrl);
  const trimmedBase = normalizedBase.replace(/\/+$/, "");
  const trimmedSuffix = suffix.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedSuffix}`;
}

export function normalizeRegionGuess(value: string | null | undefined): string | null {
  return cleanText(value);
}

export function normalizeCompanyGuess(value: string | null | undefined): string | null {
  return cleanText(value);
}

export function deriveRegionFromFields(...values: Array<string | null | undefined>): string | null {
  return preferFirstNonEmpty(...values);
}
