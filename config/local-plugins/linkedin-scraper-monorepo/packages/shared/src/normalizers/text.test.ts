import { describe, expect, it } from "vitest";
import { cleanMultilineText, cleanText, normalizeStringArray } from "./text.js";

describe("text normalizers", () => {
  it("collapses whitespace", () => {
    expect(cleanText("  Senior   Recruiter  ")).toBe("Senior Recruiter");
  });

  it("keeps meaningful multiline text", () => {
    expect(cleanMultilineText(" one \n\n two  \n")).toBe("one\ntwo");
  });

  it("normalizes arrays and removes blanks", () => {
    expect(normalizeStringArray([" AI ", "", "AI", " recruiting "])).toEqual([
      "AI",
      "recruiting",
    ]);
  });
});
