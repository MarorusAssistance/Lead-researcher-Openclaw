import { describe, expect, it } from "vitest";
import {
  normalizeHttpUrl,
  normalizeLinkedInCompanyUrl,
  normalizeLinkedInProfileUrl,
} from "./linkedin.js";

describe("linkedin normalizers", () => {
  it("normalizes profile urls", () => {
    expect(
      normalizeLinkedInProfileUrl("linkedin.com/in/jane-doe?trk=public_profile"),
    ).toBe("https://linkedin.com/in/jane-doe/");
  });

  it("normalizes company urls", () => {
    expect(normalizeLinkedInCompanyUrl("https://www.linkedin.com/company/acme")).toBe(
      "https://www.linkedin.com/company/acme/",
    );
  });

  it("normalizes generic http urls", () => {
    expect(normalizeHttpUrl("example.com", "website")).toBe("https://example.com/");
  });
});
