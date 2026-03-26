import { describe, expect, it } from "vitest";
import { NotionCrmWriterPluginConfigSchema } from "../src/config.js";
import { NotionCrmWriterClient } from "../src/notion-client.js";

function buildConfig(overrides: Record<string, unknown> = {}) {
  return NotionCrmWriterPluginConfigSchema.parse({
    notionVersion: "2022-06-28",
    dataSourceId: "01234567-89ab-cdef-0123-456789abcdef",
    propertyMap: {},
    optionalFields: ["status", "connectionNoteDraft", "dmDraft"],
    typeValues: {
      person: "Person",
      company: "Company",
    },
    defaultStatusValue: "New",
    ...overrides,
  });
}

function buildDataSource(properties: Record<string, unknown>) {
  return {
    id: "fedcba98-7654-3210-fedc-ba9876543210",
    properties,
  };
}

function buildProperties(statusType: "select" | "status" = "select") {
  return {
    Name: { id: "name", type: "title" },
    "LinkedIn URL": { id: "linkedin", type: "url" },
    Company: { id: "company", type: "rich_text" },
    Role: { id: "role", type: "rich_text" },
    Type: {
      id: "type",
      type: "select",
      select: {
        options: [
          { id: "person", name: "Person" },
          { id: "company", name: "Company" },
        ],
      },
    },
    Region: { id: "region", type: "rich_text" },
    "Fit Score": { id: "fit-score", type: "number" },
    Status:
      statusType === "select"
        ? {
            id: "status",
            type: "select",
            select: {
              options: [{ id: "new", name: "New" }],
            },
          }
        : {
            id: "status",
            type: "status",
            status: {
              options: [{ id: "new", name: "New" }],
            },
          },
    "Source Notes": { id: "notes", type: "rich_text" },
    "Hook 1": { id: "hook-1", type: "rich_text" },
    "Hook 2": { id: "hook-2", type: "rich_text" },
    "Fit Summary": { id: "fit-summary", type: "rich_text" },
  };
}

const personInput = {
  entityType: "person" as const,
  linkedinUrl: "https://www.linkedin.com/in/ana-lopez/",
  rawEntity: {
    entityType: "person" as const,
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
    fitScore: 81,
    fitSummary: "Perfil con señales claras de recruiting.",
    hook1: "Señal detectada: recruiting en headline.",
    hook2: null,
    sourceNotes: "Perfil: Ana Lopez. Rol actual: Senior Recruiter.",
    region: "Madrid, Spain",
    company: "Acme AI",
    role: "Senior Recruiter",
    type: "Person",
  },
};

describe("NotionCrmWriterClient", () => {
  it("creates a page when the linkedin url does not exist", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = new NotionCrmWriterClient({
      config: buildConfig(),
      notionApi: {
        databases: {
          retrieve: async () => ({ data_sources: [] }),
        },
        dataSources: {
          retrieve: async () => buildDataSource(buildProperties("select")),
          query: async () => ({ results: [] }),
        },
        pages: {
          create: async (payload) => {
            calls.push(payload);
            return { id: "page-created" };
          },
          update: async () => ({ id: "unexpected" }),
        },
      },
    });

    const result = await client.upsertContactableEntity(personInput);
    expect(result.operation).toBe("created");
    expect(result.pageId).toBe("page-created");
    expect(calls[0]).toMatchObject({
      parent: {
        data_source_id: "01234567-89ab-cdef-0123-456789abcdef",
      },
    });
  });

  it("updates a page when the linkedin url already exists and supports status fields", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = new NotionCrmWriterClient({
      config: buildConfig(),
      notionApi: {
        databases: {
          retrieve: async () => ({ data_sources: [] }),
        },
        dataSources: {
          retrieve: async () => buildDataSource(buildProperties("status")),
          query: async () => ({ results: [{ id: "existing-page" }] }),
        },
        pages: {
          create: async () => ({ id: "unexpected" }),
          update: async (payload) => {
            calls.push(payload);
            return { id: "existing-page" };
          },
        },
      },
    });

    const result = await client.upsertContactableEntity(personInput);
    expect(result.operation).toBe("updated");
    expect(calls[0]).toMatchObject({
      page_id: "existing-page",
    });
  });

  it("fails when a required property is missing", async () => {
    const client = new NotionCrmWriterClient({
      config: buildConfig(),
      notionApi: {
        databases: {
          retrieve: async () => ({ data_sources: [] }),
        },
        dataSources: {
          retrieve: async () =>
            buildDataSource({
              "LinkedIn URL": { id: "linkedin", type: "url" },
            }),
          query: async () => ({ results: [] }),
        },
        pages: {
          create: async () => ({ id: "unexpected" }),
          update: async () => ({ id: "unexpected" }),
        },
      },
    });

    await expect(client.upsertContactableEntity(personInput)).rejects.toMatchObject({
      code: "schema_mismatch",
      status: 400,
    });
  });
});
