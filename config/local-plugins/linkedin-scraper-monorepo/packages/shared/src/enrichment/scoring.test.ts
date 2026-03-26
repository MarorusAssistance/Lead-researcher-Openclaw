import { describe, expect, it } from "vitest";
import { analyzeEntityFit } from "./scoring.js";
import type { CompanyEntity, PersonEntity } from "../schemas/entities.js";

const personFixture: PersonEntity = {
  entityType: "person",
  fullName: "Ana Lopez",
  headline: "Senior Recruiter for GenAI teams",
  location: "Madrid, Spain",
  about: "Hiring applied AI engineers and building talent acquisition processes.",
  currentCompany: "Acme AI",
  currentRole: "Senior Recruiter",
  experience: [
    {
      title: "Recruiter",
      company: "Acme AI",
      dateRange: "2024 - Present",
      location: "Madrid",
      description: "Own recruiting for ML platform and GenAI hires.",
    },
  ],
  education: [],
  skills: ["Talent Acquisition", "Sourcing"],
  profileUrl: "https://www.linkedin.com/in/ana-lopez/",
  companyGuess: "Acme AI",
  regionGuess: "Madrid, Spain",
  contactabilitySignals: ["Señal recruiting en headline"],
};

const companyFixture: CompanyEntity = {
  entityType: "company",
  companyName: "TalentFlow",
  tagline: "AI-powered recruiting platform",
  industry: "HR Tech",
  companySize: "51-200 employees",
  headquarters: "Barcelona, Spain",
  website: "https://talentflow.example.com/",
  about: "We build GenAI tooling for talent teams and recruiting operations.",
  specialties: ["Recruiting", "Generative AI", "Talent Ops"],
  companyUrl: "https://www.linkedin.com/company/talentflow/",
  regionGuess: "Barcelona, Spain",
  hiringSignals: ["Señal hiring en tagline"],
  genaiSignals: ["Señal GenAI aplicada a recruiting en about"],
  recruitingSignals: ["Señal recruiting en specialty"],
};

describe("analyzeEntityFit", () => {
  it("scores strong personal recruiting signals", () => {
    const analysis = analyzeEntityFit(personFixture);
    expect(analysis.fitScore).not.toBeNull();
    expect((analysis.fitScore ?? 0) >= 40).toBe(true);
    expect(analysis.type).toBe("Person");
    expect(analysis.company).toBe("Acme AI");
  });

  it("scores strong company recruiting signals", () => {
    const analysis = analyzeEntityFit(companyFixture);
    expect(analysis.fitScore).not.toBeNull();
    expect((analysis.fitScore ?? 0) >= 40).toBe(true);
    expect(analysis.type).toBe("Company");
    expect(analysis.region).toBe("Barcelona, Spain");
  });

  it("returns null or low score for sparse data", () => {
    const analysis = analyzeEntityFit({
      ...companyFixture,
      tagline: null,
      industry: null,
      about: null,
      specialties: [],
      hiringSignals: [],
      genaiSignals: [],
      recruitingSignals: [],
    });

    expect(analysis.fitScore === null || analysis.fitScore <= 15).toBe(true);
  });
});
