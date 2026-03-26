import { describe, expect, it } from "vitest";
import { DEFAULT_PROPERTY_MAP, NotionCrmWriterPluginConfigSchema } from "../src/config.js";
import { describeWrittenProperties, mapCrmInputToFieldValues } from "../src/mapper.js";

const config = NotionCrmWriterPluginConfigSchema.parse({
  notionVersion: "2022-06-28",
  dataSourceId: "01234567-89ab-cdef-0123-456789abcdef",
  propertyMap: {},
  optionalFields: ["status", "connectionNoteDraft", "dmDraft"],
  typeValues: {
    person: "Person",
    company: "Company",
  },
  defaultStatusValue: "New",
});

describe("mapCrmInputToFieldValues", () => {
  it("maps person entities to the CRM fields", () => {
    const values = mapCrmInputToFieldValues(
      {
        entityType: "person",
        linkedinUrl: "https://www.linkedin.com/in/ana-lopez/",
        rawEntity: {
          entityType: "person",
          fullName: "Ana Lopez",
          headline: "Senior Recruiter",
          location: "Madrid, Spain",
          about: null,
          currentCompany: "Acme AI",
          currentRole: "Senior Recruiter",
          experience: [],
          education: [],
          skills: [],
          profileUrl: "https://www.linkedin.com/in/ana-lopez/",
          companyGuess: "Acme AI",
          regionGuess: "Madrid, Spain",
          contactabilitySignals: [],
        },
        fitAnalysis: {
          fitScore: 78,
          fitSummary: "Perfil con señales fuertes de recruiting.",
          hook1: "Señal detectada: recruiting en headline.",
          hook2: null,
          sourceNotes: "Perfil: Ana Lopez. Rol actual: Senior Recruiter.",
          region: "Madrid, Spain",
          company: "Acme AI",
          role: "Senior Recruiter",
          type: "Person",
        },
      },
      config,
    );

    expect(values.name).toBe("Ana Lopez");
    expect(values.company).toBe("Acme AI");
    expect(values.type).toBe("Person");
    expect(values.status).toBe("New");
  });

  it("describes the written property names with defaults", () => {
    const written = describeWrittenProperties(config, {
      name: "Ana Lopez",
      linkedinUrl: "https://www.linkedin.com/in/ana-lopez/",
      fitScore: 80,
    });

    expect(written).toEqual([
      DEFAULT_PROPERTY_MAP.name,
      DEFAULT_PROPERTY_MAP.linkedinUrl,
      DEFAULT_PROPERTY_MAP.fitScore,
    ]);
  });
});
