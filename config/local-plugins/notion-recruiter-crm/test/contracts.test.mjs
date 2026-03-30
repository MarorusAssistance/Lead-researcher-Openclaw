import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  parseAndValidateProspectingContract,
  validateProspectingContract,
} from "../dist/src/contracts.js";
import { coerceProspectingState, saveState } from "../dist/src/prospecting-state.js";
import {
  awaitRunScopedAssistantJson,
  findRunScopedAssistantReply,
  readRunScopedRequestPayload,
  readRunScopedToolTrace,
} from "../dist/src/session-await.js";
import {
  canonicalizeProspectingRequest,
  classifyLoloRoute,
  extractJsonCandidateText,
  planProspectingMainNextAction,
} from "../dist/src/tools.js";

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function runAsync(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempState(state, fn) {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousDataDir = process.env.NOTION_RECRUITER_CRM_DATA_DIR;
  const previousProspectingStatePath = process.env.PROSPECTING_STATE_PATH;
  const previousPendingShortlistStatePath = process.env.PENDING_SHORTLIST_STATE_PATH;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prospecting-state-"));
  const tempDataDir = path.join(tempRoot, "plugin-state", "notion-recruiter-crm");
  process.env.OPENCLAW_STATE_DIR = tempRoot;
  process.env.NOTION_RECRUITER_CRM_DATA_DIR = tempDataDir;
  process.env.PROSPECTING_STATE_PATH = path.join(tempDataDir, "prospecting-state.json");
  process.env.PENDING_SHORTLIST_STATE_PATH = path.join(tempDataDir, "pending-shortlist-state.json");

  if (state) {
    saveState(coerceProspectingState(state));
  }

  try {
    fn();
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }

    if (previousDataDir === undefined) {
      delete process.env.NOTION_RECRUITER_CRM_DATA_DIR;
    } else {
      process.env.NOTION_RECRUITER_CRM_DATA_DIR = previousDataDir;
    }

    if (previousProspectingStatePath === undefined) {
      delete process.env.PROSPECTING_STATE_PATH;
    } else {
      process.env.PROSPECTING_STATE_PATH = previousProspectingStatePath;
    }

    if (previousPendingShortlistStatePath === undefined) {
      delete process.env.PENDING_SHORTLIST_STATE_PATH;
    } else {
      process.env.PENDING_SHORTLIST_STATE_PATH = previousPendingShortlistStatePath;
    }
  }
}

run("accepts a valid sourcer FOUND response", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_response",
    JSON.stringify({
      status: "FOUND",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jane Doe",
          roleTitle: "Head of Talent Operations",
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Hiring AI talent"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/careers",
            claim: "Hiring technical roles",
          },
          {
            type: "team_page",
            url: "https://example.ai/about",
            claim: "Jane Doe owns talent operations",
          },
        ],
        notes: "Potential fit",
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("accepts a valid sourcer SOURCE_ONE request", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_request",
    JSON.stringify({
      action: "SOURCE_ONE",
      runId: "run_001",
      campaignContext: {
        targetThemes: ["GenAI engineering", "CTO"],
      },
      excludedCompanyNames: ["example ai"],
      excludedLeadNames: ["jane doe"],
      constraints: {
        maxCandidatesToReturn: 1,
        webFirst: true,
        mustIncludeEvidence: true,
        targetCountry: "es",
        minCompanySize: 5,
        maxCompanySize: 50,
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("classifies lead-search requests into the lead workflow route", () => {
  assert.equal(
    classifyLoloRoute("busca 3 leads que trabajen en españa y esten en empresas de entre 5 y 50 empleados"),
    "lead_workflow",
  );
});

run("classifies non-lead requests as unsupported for the gateway router", () => {
  assert.equal(
    classifyLoloRoute("ponme un recordatorio para mañana a las 9"),
    "unsupported",
  );
});

run("canonicalizes SOURCE_ONE exploration hints and explicit overrides", () => {
  withTempState(
    {
      searchedCompanyNames: [],
      registeredLeadNames: [],
      updatedAt: "2026-03-29T08:00:00.000Z",
    },
    () => {
      const canonical = canonicalizeProspectingRequest("sourcer_request", {
        action: "SOURCE_ONE",
        runId: "run_hints_001",
        campaignContext: {
          targetThemes: ["GenAI engineering"],
          explorationHints: {
            overusedQueries: [
              { query: "GenAI engineer Spain", count: 4 },
              { query: "  genai engineer   spain  ", count: 2 },
            ],
            visitedUrls: [
              "https://example.ai/team?utm_source=test",
              "https://example.ai/team",
            ],
            visitedHosts: [
              { host: "Example.ai", count: 3 },
              { host: "example.ai", count: 1 },
            ],
          },
          requestOverrides: {
            explicitTargetUrls: [
              "https://example.ai/team?utm_source=test",
              "https://example.ai/team",
            ],
            explicitTargetCompanyNames: ["Example AI", "example ai"],
          },
        },
        excludedCompanyNames: [],
        excludedLeadNames: [],
        constraints: {
          webFirst: true,
          mustIncludeEvidence: true,
        },
      });

      assert.deepEqual(canonical.campaignContext.explorationHints, {
        overusedQueries: [{ query: "GenAI engineer Spain", count: 4 }],
        visitedUrls: ["https://example.ai/team"],
        visitedHosts: [{ host: "example.ai", count: 3 }],
      });
      assert.deepEqual(canonical.campaignContext.requestOverrides, {
        explicitTargetUrls: ["https://example.ai/team"],
        explicitTargetCompanyNames: ["Example AI"],
      });

      const result = validateProspectingContract("sourcer_request", canonical);
      assert.equal(result.ok, true);
    },
  );
});

run("canonicalizes SOURCE_ONE requests with misplaced exclusions", () => {
  withTempState(
    {
      searchedCompanyNames: [],
      registeredLeadNames: [],
      updatedAt: "2026-03-28T00:00:00.000Z",
    },
    () => {
      const canonical = canonicalizeProspectingRequest("sourcer_request", {
        action: "SOURCE_ONE",
        runId: "run_001",
        campaignContext: {
          targetThemes: ["GenAI engineering", "CTO"],
          excludedCompanyNames: ["example ai"],
          excludedLeadNames: ["jane doe"],
          targetCountry: "es",
          minCompanySize: 5,
          maxCompanySize: 50,
        },
        constraints: {
          maxCandidatesToReturn: 1,
          webFirst: true,
          mustIncludeEvidence: true,
        },
      });

      assert.deepEqual(canonical, {
        action: "SOURCE_ONE",
        runId: "run_001",
        campaignContext: {
          targetThemes: [
            "GenAI engineering",
            "CTO",
            "software company",
            "software consultancy",
            "software development",
            "custom software development",
            "software agency",
            "software studio",
            "digital product",
            "digital product studio",
            "product engineering",
            "AI consultancy",
            "AI engineering",
            "automation agency",
            "IT consultancy",
            "IT services",
            "B2B SaaS",
          ],
        },
        excludedCompanyNames: ["example ai"],
        excludedLeadNames: ["jane doe"],
        constraints: {
          maxCandidatesToReturn: 1,
          webFirst: true,
          mustIncludeEvidence: true,
          targetCountry: "es",
          minCompanySize: 5,
          maxCompanySize: 50,
        },
      });

      const result = validateProspectingContract("sourcer_request", canonical);
      assert.equal(result.ok, true);
    },
  );
});

run("canonicalizes SOURCE_ONE requests that incorrectly include qualifier metadata", () => {
  withTempState(
    {
      searchedCompanyNames: [],
      registeredLeadNames: [],
      updatedAt: "2026-03-28T00:00:00.000Z",
    },
    () => {
      const canonical = canonicalizeProspectingRequest("sourcer_request", {
        action: "SOURCE_ONE",
        runId: "run_002",
        campaignContext: {
          targetThemes: ["AI engineer", "technical recruiter", "Spain", "remote"],
        },
        excludedCompanyNames: ["example ai"],
        excludedLeadNames: ["jane doe"],
        constraints: {
          maxCandidatesToReturn: 10,
          webFirst: true,
          mustIncludeEvidence: true,
          preferredCountry: "es",
          preferredMinCompanySize: 5,
          preferredMaxCompanySize: 50,
          preferNamedPerson: true,
          matchMode: "STRICT",
          qualificationRules: {
            matchMode: "STRICT",
          },
        },
      });

      assert.deepEqual(canonical, {
        action: "SOURCE_ONE",
        runId: "run_002",
        campaignContext: {
          targetThemes: [
            "AI engineer",
            "technical recruiter",
            "Spain",
            "remote",
            "software company",
            "software consultancy",
            "software development",
            "custom software development",
            "software agency",
            "software studio",
            "digital product",
            "digital product studio",
            "product engineering",
            "AI consultancy",
            "AI engineering",
            "automation agency",
            "IT consultancy",
            "IT services",
            "B2B SaaS",
            "founder",
            "cofounder",
            "ceo",
            "cto",
            "head of engineering",
            "engineering manager",
          ],
        },
        excludedCompanyNames: ["example ai"],
        excludedLeadNames: ["jane doe"],
        constraints: {
          maxCandidatesToReturn: 1,
          webFirst: true,
          mustIncludeEvidence: true,
          targetCountry: "es",
          minCompanySize: 5,
          maxCompanySize: 50,
        },
      });

      const result = validateProspectingContract("sourcer_request", canonical);
      assert.equal(result.ok, true);
    },
  );
});

run("canonicalizes the traced main->sourcer drift payload into the strict SOURCE_ONE contract", () => {
  withTempState(
    {
      searchedCompanyNames: [],
      registeredLeadNames: [],
      updatedAt: "2026-03-28T00:00:00.000Z",
    },
    () => {
      const canonical = canonicalizeProspectingRequest("sourcer_request", {
        action: "SOURCE_ONE",
        runId: "run_drift_001",
        matchMode: "STRICT",
        webFirst: true,
        mustIncludeEvidence: true,
        targetFilters: {
          roles: [
            "founder",
            "cofounder",
            "ceo",
            "cto",
            "head of engineering",
            "engineering manager",
          ],
          countries: ["es"],
          minEmployees: 5,
          maxEmployees: 50,
        },
        exclusions: {
          companyNames: ["maisa"],
          personNames: ["david villalón"],
        },
        attempt: 0,
        relaxation: "STRICT",
        maxAttempts: 10,
        searchBudget: 1,
        searchMethod: "exact",
        searchQuery: "founder site:es",
      });

      assert.deepEqual(canonical, {
        action: "SOURCE_ONE",
        runId: "run_drift_001",
        campaignContext: {
          targetThemes: [
            "founder",
            "cofounder",
            "ceo",
            "cto",
            "head of engineering",
            "engineering manager",
            "software company",
            "software consultancy",
            "software development",
            "custom software development",
            "software agency",
            "software studio",
            "digital product",
            "digital product studio",
            "product engineering",
            "AI consultancy",
            "AI engineering",
            "automation agency",
            "IT consultancy",
            "IT services",
            "B2B SaaS",
          ],
        },
        excludedCompanyNames: ["maisa"],
        excludedLeadNames: ["david villalón"],
        constraints: {
          maxCandidatesToReturn: 1,
          webFirst: true,
          mustIncludeEvidence: true,
          targetCountry: "es",
          minCompanySize: 5,
          maxCompanySize: 50,
        },
      });

      const result = validateProspectingContract("sourcer_request", canonical);
      assert.equal(result.ok, true);
    },
  );
});

run("canonicalizes country names into ISO-2 codes for sourcer and qualifier requests", () => {
  const sourcerCanonical = canonicalizeProspectingRequest("sourcer_request", {
    action: "SOURCE_ONE",
    runId: "run_003",
    campaignContext: {
      targetThemes: ["software consultancy"],
    },
    excludedCompanyNames: [],
    excludedLeadNames: [],
    constraints: {
      targetCountry: "Spain",
    },
  });

  assert.equal(sourcerCanonical.constraints.targetCountry, "es");

  const qualifierCanonical = canonicalizeProspectingRequest("qualifier_request", {
    action: "QUALIFY_ONE",
    runId: "run_003",
    candidate: {
      candidateId: "cand_123",
      person: {
        fullName: "Jane Doe",
        roleTitle: "CTO",
        linkedinUrl: null,
      },
      company: {
        name: "Example AI",
        website: "https://example.ai",
        domain: "example.ai",
      },
      fitSignals: ["Spain-based AI company"],
      evidence: [
        {
          type: "company_site",
          url: "https://example.ai/about",
          claim: "Jane Doe is listed as CTO.",
        },
        {
          type: "company_profile",
          url: "https://profiles.example/example-ai",
          claim: "Company profile lists 20 employees in Spain.",
        },
      ],
      notes: "Potential fit",
    },
    qualificationRules: {
      matchMode: "STRICT",
      targetFilters: {
        preferredCountry: "Spain",
      },
    },
  });

  assert.equal(qualifierCanonical.qualificationRules.targetFilters.preferredCountry, "es");
});

run("canonicalizes qualifier target filter aliases from main", () => {
  const canonical = canonicalizeProspectingRequest("qualifier_request", {
    action: "QUALIFY_ONE",
    runId: "run_aliases",
    candidate: {
      candidateId: "cand_123",
      person: {
        fullName: "Jane Doe",
        roleTitle: "CTO",
        linkedinUrl: null,
      },
      company: {
        name: "Example AI",
        website: "https://example.ai",
        domain: "example.ai",
      },
      fitSignals: ["Spain-based AI company"],
      evidence: [
        {
          type: "company_site",
          url: "https://example.ai/about",
          claim: "Jane Doe is listed as CTO.",
        },
        {
          type: "company_profile",
          url: "https://profiles.example/example-ai",
          claim: "Company profile lists 20 employees in Spain.",
        },
      ],
      notes: "Potential fit",
    },
    qualificationRules: {
      matchMode: "STRICT",
      targetFilters: {
        targetCountry: "Spain",
        minCompanySize: 5,
        maxCompanySize: 50,
      },
    },
  });

  assert.deepEqual(canonical.qualificationRules.targetFilters, {
    preferredCountry: "es",
    preferredMinCompanySize: 5,
    preferredMaxCompanySize: 50,
  });
});

run("canonicalizes qualifier requests that use top-level targetFilters and relaxation aliases", () => {
  const canonical = canonicalizeProspectingRequest("qualifier_request", {
    action: "QUALIFY_ONE",
    runId: "run_top_level_filters",
    candidate: {
      candidateId: "cand_123",
      person: {
        fullName: "Jane Doe",
        roleTitle: "CTO",
        linkedinUrl: null,
      },
      company: {
        name: "Example AI",
        website: "https://example.ai",
        domain: "example.ai",
      },
      fitSignals: ["Spain-based AI company"],
      evidence: [
        {
          type: "company_site",
          url: "https://example.ai/about",
          claim: "Jane Doe is listed as CTO.",
        },
        {
          type: "company_profile",
          url: "https://profiles.example/example-ai",
          claim: "Company profile lists 20 employees in Spain.",
        },
      ],
      notes: "Potential fit",
    },
    matchMode: "RELAX_SIZE",
    targetFilters: {
      countries: ["Spain"],
      minEmployees: 5,
      maxEmployees: 50,
      roles: ["CTO", "Head of Engineering"],
      preferNamedPerson: true,
    },
  });

  assert.deepEqual(canonical.qualificationRules, {
    allowedStatuses: ["ACCEPT", "REJECT", "ENRICH"],
    mustExplainDecision: true,
    matchMode: "RELAX_SIZE",
    targetFilters: {
      preferredCountry: "es",
      preferredMinCompanySize: 5,
      preferredMaxCompanySize: 50,
      preferredRoleThemes: ["CTO", "Head of Engineering"],
      preferNamedPerson: true,
    },
  });
});

run("canonicalizes flattened candidate dossiers before sending them to qualifier", () => {
  const canonical = canonicalizeProspectingRequest("qualifier_request", {
    action: "QUALIFY_ONE",
    runId: "run_flat_candidate",
    candidate: {
      candidateId: "cand_123",
      personName: "Rob Käll",
      companyName: "Cien",
      roleTitle: "CEO / Co-Founder",
      linkedinUrl: "https://www.linkedin.com/in/robertkall/",
      companyWebsite: "https://www.cien.ai",
      companyDomain: "cien.ai",
      fitSignals: [
        "Spain-based AI consultancy",
        "Company size is 11-50 employees",
      ],
      evidence: [
        {
          type: "company_site",
          url: "https://www.cien.ai",
          claim: "Cien is an AI company with offices in Barcelona, Spain.",
        },
        {
          type: "team_page",
          url: "https://www.cien.ai/people/",
          claim: "Rob Käll is listed as CEO and Co-Founder.",
        },
      ],
      notes: "Strong fit",
    },
    qualificationRules: {
      matchMode: "STRICT",
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
      },
    },
  });

  assert.deepEqual(canonical.candidate, {
    candidateId: "cand_123",
    person: {
      fullName: "Rob Käll",
      roleTitle: "CEO / Co-Founder",
      linkedinUrl: "https://www.linkedin.com/in/robertkall/",
    },
    company: {
      name: "Cien",
      website: "https://www.cien.ai",
      domain: "cien.ai",
    },
    fitSignals: [
      "Spain-based AI consultancy",
      "Company size is 11-50 employees",
    ],
    evidence: [
      {
        type: "company_site",
        url: "https://www.cien.ai",
        claim: "Cien is an AI company with offices in Barcelona, Spain.",
      },
      {
        type: "team_page",
        url: "https://www.cien.ai/people/",
        claim: "Rob Käll is listed as CEO and Co-Founder.",
      },
    ],
    notes: "Strong fit",
  });

  const result = validateProspectingContract("qualifier_request", canonical);
  assert.equal(result.ok, true);
});

run("rejects sourcer requests with misplaced company filters", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_request",
    JSON.stringify({
      action: "SOURCE_ONE",
      runId: "run_001",
      campaignContext: {
        targetThemes: ["GenAI engineering", "CTO"],
        targetCountry: "es",
        minCompanySize: 5,
        maxCompanySize: 50,
      },
      excludedCompanyNames: ["example ai"],
      excludedLeadNames: ["jane doe"],
      constraints: {
        maxCandidatesToReturn: 1,
        webFirst: true,
        mustIncludeEvidence: true,
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "SCHEMA_MISMATCH");
});

run("rejects sourcer FOUND responses without enough evidence", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_response",
    JSON.stringify({
      status: "FOUND",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jane Doe",
          roleTitle: "Head of Talent Operations",
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Hiring AI talent"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/careers",
            claim: "Hiring technical roles",
          },
        ],
        notes: "Potential fit",
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "SCHEMA_MISMATCH");
});

run("rejects sourcer placeholder person names", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_response",
    JSON.stringify({
      status: "FOUND",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "No specific individual identified",
          roleTitle: null,
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Hiring AI talent"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/careers",
            claim: "Hiring technical roles",
          },
          {
            type: "service_page",
            url: "https://example.ai",
            claim: "Provides hiring automation services",
          },
        ],
        notes: "Potential fit",
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "CONTRACT_RULE_VIOLATION");
});

run("rejects sourcer dossiers when the named person is actually the company", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_response",
    JSON.stringify({
      status: "FOUND",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Co.dx",
          roleTitle: "CTO",
          linkedinUrl: "https://www.linkedin.com/company/co-dx",
        },
        company: {
          name: "Co.dx",
          website: "https://codx.ai",
          domain: "codx.ai",
        },
        fitSignals: ["Spain-based software company", "Company size is 11-50 employees"],
        evidence: [
          {
            type: "company_profile",
            url: "https://www.linkedin.com/company/co-dx",
            claim: "Co.dx has 11-50 employees.",
          },
          {
            type: "company_site",
            url: "https://codx.ai",
            claim: "Co.dx is an AI-powered platform built under TheMathCompany's product division.",
          },
        ],
        notes: "Invalid dossier because the company was reused as the person.",
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "CONTRACT_RULE_VIOLATION");
});

run("rejects sourcer dossiers when evidence does not link the named person to the company", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_response",
    JSON.stringify({
      status: "FOUND",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Javier Torremocha",
          roleTitle: "Co-founder and Managing Partner",
          linkedinUrl: null,
        },
        company: {
          name: "Cactus",
          website: "https://cactus-now.com",
          domain: "cactus-now.com",
        },
        fitSignals: ["Spain-based software company", "Company size is 11-50 employees"],
        evidence: [
          {
            type: "company_site",
            url: "https://cactus-now.com/es/about-us/",
            claim: "Cactus is a Spain-based AI software consultancy.",
          },
          {
            type: "news_article",
            url: "https://sifted.eu/articles/11-spanish-ai-startups-to-watch-according-to-investors",
            claim: "Javier Torremocha is co-founder and managing partner at Kibo Ventures.",
          },
        ],
        notes: "Mixed-entity dossier that should be rejected.",
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "CONTRACT_RULE_VIOLATION");
});

run("rejects sourcer responses that match excluded company or lead aliases", () => {
  const result = parseAndValidateProspectingContract(
    "sourcer_response",
    JSON.stringify({
      status: "FOUND",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "David Villalón",
          roleTitle: "CEO",
          linkedinUrl: null,
        },
        company: {
          name: "Maisa AI",
          website: "https://maisa.ai",
          domain: "maisa.ai",
        },
        fitSignals: ["Spain-based AI company"],
        evidence: [
          {
            type: "company_profile",
            url: "https://example.com/maisa",
            claim: "Maisa AI has 35 employees in Spain.",
          },
          {
            type: "team_page",
            url: "https://maisa.ai/team",
            claim: "David Villalón is listed as CEO.",
          },
        ],
        notes: "Duplicate under a loose alias.",
      },
    }),
    {
      excludedCompanyNames: ["maisa"],
      excludedLeadNames: ["david villalon"],
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "CONTRACT_RULE_VIOLATION");
});

run("accepts a valid qualifier ACCEPT response", () => {
  const result = validateProspectingContract(
    "qualifier_response",
    {
      status: "ACCEPT",
      candidateId: "cand_123",
      decision: {
        verdict: "ACCEPT",
        reasons: ["Relevant talent leader", "Strong hiring fit"],
        missingFields: [],
      },
    },
    {
      expectedCandidateId: "cand_123",
      enrichRoundCount: 0,
      maxEnrichRounds: 1,
    },
  );

  assert.equal(result.ok, true);
});

run("accepts a qualifier REJECT response with closeMatch metadata", () => {
  const result = validateProspectingContract(
    "qualifier_response",
    {
      status: "REJECT",
      candidateId: "cand_123",
      decision: {
        verdict: "REJECT",
        reasons: ["Company size is slightly above the preferred range."],
        missingFields: [],
      },
      closeMatch: {
        summary: "Strong CTO lead in Spain, but company size is 70 instead of 5-50.",
        missedFilters: ["company size 5-50"],
        reasons: ["Named CTO", "Spain-based company", "Size is close but above target"],
      },
    },
    {
      expectedCandidateId: "cand_123",
      enrichRoundCount: 0,
      maxEnrichRounds: 1,
    },
  );

  assert.equal(result.ok, true);
});

run("accepts a valid qualifier request", () => {
  const result = validateProspectingContract(
    "qualifier_request",
    {
      action: "QUALIFY_ONE",
      runId: "run_001",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jane Doe",
          roleTitle: "CTO",
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Hiring AI talent"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/careers",
            claim: "Hiring technical roles",
          },
          {
            type: "team_page",
            url: "https://example.ai/about",
            claim: "Jane Doe leads engineering",
          },
        ],
        notes: "Potential fit",
      },
      qualificationRules: {
        allowedStatuses: ["ACCEPT", "REJECT", "ENRICH"],
        mustExplainDecision: true,
        matchMode: "RELAX_SIZE",
        targetFilters: {
          preferredCountry: "es",
          preferredMinCompanySize: 5,
          preferredMaxCompanySize: 50,
          preferredRoleThemes: ["CTO", "AI lead"],
          preferNamedPerson: true,
        },
      },
    },
  );

  assert.equal(result.ok, true);
});

run("canonicalizes qualifier requests and preserves relaxation metadata", () => {
  const canonical = canonicalizeProspectingRequest("qualifier_request", {
    action: "QUALIFY_ONE",
    runId: "run_001",
    candidate: {
      candidateId: "cand_123",
      person: {
        fullName: "Jane Doe",
        roleTitle: "CTO",
        linkedinUrl: null,
      },
      company: {
        name: "Example AI",
        website: "https://example.ai",
        domain: "example.ai",
      },
      fitSignals: ["Hiring AI talent"],
      evidence: [
        {
          type: "company_site",
          url: "https://example.ai/careers",
          claim: "Hiring technical roles",
        },
        {
          type: "team_page",
          url: "https://example.ai/about",
          claim: "Jane Doe leads engineering",
        },
      ],
      notes: "Potential fit",
    },
    qualificationRules: {
      allowedStatuses: ["ACCEPT", "REJECT", "ENRICH"],
      mustExplainDecision: true,
      matchMode: "BEST_AVAILABLE",
      targetFilters: {
        preferredCountry: "es",
        preferredRegion: "europe",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["CTO", "Head of Engineering"],
        preferNamedPerson: true,
      },
    },
  });

  assert.deepEqual(canonical.qualificationRules, {
    allowedStatuses: ["ACCEPT", "REJECT", "ENRICH"],
    mustExplainDecision: true,
    matchMode: "BEST_AVAILABLE",
    targetFilters: {
      preferredCountry: "es",
      preferredRegion: "europe",
      preferredMinCompanySize: 5,
      preferredMaxCompanySize: 50,
      preferredRoleThemes: ["CTO", "Head of Engineering"],
      preferNamedPerson: true,
    },
  });
});

run("rejects qualifier responses that exceed the enrich limit", () => {
  const result = validateProspectingContract(
    "qualifier_response",
    {
      status: "ENRICH",
      candidateId: "cand_123",
      decision: {
        verdict: "ENRICH",
        reasons: ["Need more evidence"],
        missingFields: ["company.website"],
      },
    },
    {
      expectedCandidateId: "cand_123",
      enrichRoundCount: 1,
      maxEnrichRounds: 1,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "CONTRACT_RULE_VIOLATION");
});

run("accepts a valid CRM OK response", () => {
  const result = validateProspectingContract(
    "crm_response",
    {
      status: "OK",
      action: "REGISTER_ACCEPTED_LEAD",
      campaignState: {
        searchedCompanyNames: ["example ai"],
        registeredLeadNames: ["jane doe"],
      },
      explorationMemory: {
        visitedUrls: [],
        queryHistory: [],
        consecutiveHardMissRuns: 0,
      },
    },
    {
      expectedAction: "REGISTER_ACCEPTED_LEAD",
    },
  );

  assert.equal(result.ok, true);
});

run("accepts a valid CRM accepted-lead request", () => {
  const result = validateProspectingContract(
    "crm_request",
    {
      action: "REGISTER_ACCEPTED_LEAD",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jane Doe",
          roleTitle: "CTO",
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Hiring AI talent"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/careers",
            claim: "Hiring technical roles",
          },
          {
            type: "team_page",
            url: "https://example.ai/about",
            claim: "Jane Doe leads engineering",
          },
        ],
        notes: "Potential fit",
      },
      decision: {
        status: "ACCEPT",
        reasons: ["Relevant buyer role", "Strong fit"],
      },
      campaignStateUpdate: {
        searchedCompanyNamesAdd: ["Example AI"],
        registeredLeadNamesAdd: ["Jane Doe"],
      },
    },
  );

  assert.equal(result.ok, true);
});

run("canonicalizes a loose REGISTER_ACCEPTED_LEAD payload from main", () => {
  const canonical = canonicalizeProspectingRequest("crm_request", {
    action: "REGISTER_ACCEPTED_LEAD",
    runId: "run_accept_001",
    lead: {
      fullName: "Eric Merritt",
      roleTitle: "Co-Founder and Hiring Manager",
      companyName: "Aluxion",
      companyWebsite: "https://www.aluxion.com/",
      contactLink: "https://www.linkedin.com/in/eric-merritt-5a3b4a185/",
      fitSignals: [
        "Company specializes in AI consultancy and digital product development in Spain",
      ],
      evidence: [
        {
          type: "company_site",
          url: "https://www.aluxion.com/",
          claim: "Aluxion specializes in AI strategy and digital transformation.",
        },
        {
          type: "external_profile",
          url: "https://rocketreach.co/aluxion-profile_b589ea35f6937e20",
          claim: "Eric Merritt is listed as Co-Founder and Hiring Manager in Madrid, Spain.",
        },
      ],
      notes: "Strong fit",
    },
    decision: {
      reasons: ["Named decision-maker", "Spain-based AI consultancy"],
    },
  });

  assert.equal(canonical.runId, "run_accept_001");
  assert.equal(canonical.candidate.person.fullName, "Eric Merritt");
  assert.equal(canonical.candidate.company.name, "Aluxion");
  assert.equal(canonical.candidate.company.domain, "aluxion.com");
  assert.deepEqual(canonical.campaignStateUpdate, {
    searchedCompanyNamesAdd: ["Aluxion"],
    registeredLeadNamesAdd: ["Eric Merritt"],
  });

  const result = validateProspectingContract("crm_request", canonical);
  assert.equal(result.ok, true);
});

run("canonicalizes a flattened candidate payload for REGISTER_ACCEPTED_LEAD", () => {
  const canonical = canonicalizeProspectingRequest("crm_request", {
    action: "REGISTER_ACCEPTED_LEAD",
    candidate: {
      candidateId: "cand_123",
      personName: "David Villalón",
      companyName: "Maisa AI",
      companyWebsite: "https://maisa.ai",
      companyDomain: "maisa.ai",
      roleTitle: "CEO",
      linkedinUrl: null,
      fitSignals: [
        "Spain-based AI consultancy",
        "Company size is 11-50 employees",
      ],
      evidence: [
        {
          type: "company_site",
          url: "https://maisa.ai",
          claim: "Maisa AI is a Spanish software company.",
        },
        {
          type: "press_article",
          url: "https://example.com/maisa",
          claim: "David Villalón is the CEO of Maisa AI.",
        },
      ],
      notes: "Strong fit",
    },
    decision: {
      status: "ACCEPT",
      reasons: ["Named CEO", "Spain-based company"],
    },
    campaignStateUpdate: {
      searchedCompanyNamesAdd: ["Maisa AI"],
      registeredLeadNamesAdd: ["David Villalón"],
    },
  });

  assert.equal(canonical.candidate.person.fullName, "David Villalón");
  assert.equal(canonical.candidate.company.name, "Maisa AI");
  assert.equal(canonical.candidate.company.website, "https://maisa.ai");
  assert.equal(canonical.candidate.company.domain, "maisa.ai");

  const result = validateProspectingContract("crm_request", canonical);
  assert.equal(result.ok, true);
});

run("accepts a valid CRM save-pending-shortlist request", () => {
  const result = validateProspectingContract(
    "crm_request",
    {
      action: "SAVE_PENDING_SHORTLIST",
      pendingShortlist: {
        originalRequestSummary: "Lead in Spain, company size 5-50 employees",
        options: [
          {
            candidate: {
              candidateId: "cand_123",
              person: {
                fullName: "Jane Doe",
                roleTitle: "CTO",
                linkedinUrl: null,
              },
              company: {
                name: "Example AI",
                website: "https://example.ai",
                domain: "example.ai",
              },
              fitSignals: ["Spain-based AI company"],
              evidence: [
                {
                  type: "company_site",
                  url: "https://example.ai/about",
                  claim: "Jane Doe is listed as CTO.",
                },
                {
                  type: "company_profile",
                  url: "https://profiles.example/example-ai",
                  claim: "Company profile lists 70 employees in Spain.",
                },
              ],
              notes: "Near miss on company size only.",
            },
            summary: "Strong CTO lead in Spain; company size is 70.",
            missedFilters: ["company size 5-50"],
            reasons: ["Named CTO", "Spain-based", "Only size is outside target"],
          },
        ],
      },
    },
  );

  assert.equal(result.ok, true);
});

run("accepts a valid CRM get-pending-shortlist response with a stored shortlist", () => {
  const result = validateProspectingContract(
    "crm_response",
    {
      status: "OK",
      action: "GET_PENDING_SHORTLIST",
      pendingShortlist: {
        shortlistId: "short_001",
        originalRequestSummary: "Lead in Spain, company size 5-50 employees",
        options: [
          {
            candidate: {
              candidateId: "cand_123",
              person: {
                fullName: "Jane Doe",
                roleTitle: "CTO",
                linkedinUrl: null,
              },
              company: {
                name: "Example AI",
                website: "https://example.ai",
                domain: "example.ai",
              },
              fitSignals: ["Spain-based AI company"],
              evidence: [
                {
                  type: "company_site",
                  url: "https://example.ai/about",
                  claim: "Jane Doe is listed as CTO.",
                },
                {
                  type: "company_profile",
                  url: "https://profiles.example/example-ai",
                  claim: "Company profile lists 70 employees in Spain.",
                },
              ],
              notes: "Near miss on company size only.",
            },
            summary: "Strong CTO lead in Spain; company size is 70.",
            missedFilters: ["company size 5-50"],
            reasons: ["Named CTO", "Spain-based", "Only size is outside target"],
          },
        ],
        createdAt: "2026-03-28T12:00:00.000Z",
        expiresAt: "2026-03-29T12:00:00.000Z",
      },
    },
    {
      expectedAction: "GET_PENDING_SHORTLIST",
    },
  );

  assert.equal(result.ok, true);
});

run("planner starts a lead search by requesting CRM campaign state", () => {
  const result = planProspectingMainNextAction({
    userText:
      "utiliza una de las campañas ya creadas y busca un lead que trabaje en españa y en una empresa de entre 5 y 50 empleados",
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "crm_request");
  assert.equal(result.request.expectedAction, "GET_CAMPAIGN_STATE");
});

run("planner continues after sourcer NO_CANDIDATE instead of stopping immediately", () => {
  const initial = planProspectingMainNextAction({
    userText:
      "utiliza una de las campañas ya creadas y busca un lead que trabaje en españa y en una empresa de entre 5 y 50 empleados",
  });

  const afterState = planProspectingMainNextAction({
    state: initial.state,
    latestResult: {
      contract: "crm_response",
      ok: true,
      status: "VALID",
      parsed: {
        status: "OK",
        action: "GET_CAMPAIGN_STATE",
        campaignState: {
          searchedCompanyNames: [],
          registeredLeadNames: [],
        },
      },
    },
  });

  const afterNoCandidate = planProspectingMainNextAction({
    state: afterState.state,
    latestResult: {
      contract: "sourcer_response",
      ok: true,
      status: "VALID",
      parsed: {
        status: "NO_CANDIDATE",
        reason: "No credible named-person dossier found within budget.",
      },
    },
  });

  assert.equal(afterNoCandidate.ok, true);
  assert.equal(afterNoCandidate.outcome, "send_request");
  assert.equal(afterNoCandidate.request.contract, "sourcer_request");
  assert.equal(afterNoCandidate.request.expectedAction, "SOURCE_ONE");
  assert.equal(afterNoCandidate.state.attemptIndex, 1);
});

run("planner routes close matches through commercial before shortlist save", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_test",
      originalRequestSummary: "lead en españa 5-50",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["cto"],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["cto", "software company", "Spain"],
      attemptBudget: 1,
      attemptIndex: 0,
      acceptedLeads: [],
      shortlistOptions: [],
      seenCompanies: [],
      seenLeadNames: [],
      currentCandidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jane Doe",
          roleTitle: "CTO",
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Spain-based company", "Company size is 70 employees"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/about",
            claim: "Jane Doe is listed as CTO.",
          },
          {
            type: "company_profile",
            url: "https://profiles.example/example-ai",
            claim: "Example AI has 70 employees in Spain.",
          },
        ],
        notes: "Near miss on company size.",
      },
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "QUALIFY_ONE",
    },
    latestResult: {
      contract: "qualifier_response",
      ok: true,
      status: "VALID",
      parsed: {
        status: "REJECT",
        candidateId: "cand_123",
        decision: {
          verdict: "REJECT",
          reasons: ["Size is slightly above target."],
          missingFields: [],
        },
        closeMatch: {
          summary: "Strong CTO lead in Spain, but the company has 70 employees.",
          missedFilters: ["company size 5-50"],
          reasons: ["Named CTO", "Spain-based company", "Only size is outside target"],
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "commercial_request");
  assert.equal(result.request.expectedAction, "GENERATE_OUTREACH_PACK");
});

run("planner treats company aliases like 'Maisa' and 'Maisa AI' as duplicates", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_dup",
      originalRequestSummary: "lead en españa 5-50",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["ceo"],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["ceo", "software company", "Spain"],
      attemptBudget: 4,
      attemptIndex: 0,
      acceptedLeads: [],
      shortlistOptions: [],
      seenCompanies: ["maisa"],
      seenLeadNames: ["david villalón"],
      currentCandidate: null,
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "SOURCE_ONE",
    },
    latestResult: {
      contract: "sourcer_response",
      ok: true,
      status: "VALID",
      parsed: {
        status: "FOUND",
        candidate: {
          candidateId: "cand_123",
          person: {
            fullName: "David Villalón",
            roleTitle: "CEO",
            linkedinUrl: null,
          },
          company: {
            name: "Maisa AI",
            website: "https://maisa.ai",
            domain: "maisa.ai",
          },
          fitSignals: ["Spain-based company", "Company size is 11-50 employees"],
          evidence: [
            {
              type: "company_site",
              url: "https://maisa.ai",
              claim: "Maisa AI has 11-50 employees.",
            },
            {
              type: "news_article",
              url: "https://example.com/maisa",
              claim: "David Villalón is the CEO of Maisa AI in Valencia, Spain.",
            },
          ],
          notes: "Duplicate company under a slightly different name.",
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "sourcer_request");
  assert.equal(result.state.attemptIndex, 1);
});

run("planner retries the next sourcing attempt after an invalid sourcer hop", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_invalid_hop",
      originalRequestSummary: "lead en españa 5-50",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["ceo"],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["ceo", "software company", "Spain"],
      attemptBudget: 4,
      attemptIndex: 0,
      acceptedLeads: [],
      shortlistOptions: [],
      seenCompanies: [],
      seenLeadNames: [],
      currentCandidate: null,
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "SOURCE_ONE",
    },
    latestResult: {
      contract: "sourcer_response",
      ok: false,
      status: "INVALID",
      error: "candidate.company.name matches an excluded company.",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "sourcer_request");
  assert.equal(result.state.attemptIndex, 1);
});

run("planner repairs corrupted lead-search state before routing the next hop", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_corrupt",
      originalRequestSummary:
        "utiliza una de las campañas ya creadas y busca un lead que trabaje en españa y en una empresa de entre 5 y 50 empleados",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "Spain",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: [],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["Spain"],
      attemptBudget: 12,
      attemptIndex: 0,
      acceptedLeads: [{ leadName: "", companyName: "" }],
      shortlistOptions: [
        {
          candidate: "cand_bad",
          summary: "invalid option",
          missedFilters: ["company size 5-50"],
          reasons: ["bad data"],
        },
      ],
      seenCompanies: ["maisa"],
      seenLeadNames: ["david villalón"],
      currentCandidate: "cand_bad",
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "GET_CAMPAIGN_STATE",
    },
    latestResult: {
      contract: "crm_response",
      ok: true,
      status: "VALID",
      parsed: {
        status: "OK",
        action: "GET_CAMPAIGN_STATE",
        campaignState: {
          searchedCompanyNames: ["maisa"],
          registeredLeadNames: ["david villalón"],
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "sourcer_request");
  assert.equal(result.state.currentCandidate, null);
  assert.deepEqual(result.state.shortlistOptions, []);
  assert.deepEqual(result.state.acceptedLeads, []);
  assert.deepEqual(result.state.targetFilters.preferredRoleThemes, [
    "founder",
    "cofounder",
    "ceo",
    "cto",
    "head of engineering",
    "engineering manager",
  ]);
});

run("planner defaults role themes when the user request did not specify one explicitly", () => {
  const result = planProspectingMainNextAction({
    userText:
      "utiliza una de las campañas ya creadas y busca un lead que trabaje en españa y en una empresa de entre 5 y 50 empleados",
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.deepEqual(result.state.targetFilters.preferredRoleThemes, [
    "founder",
    "cofounder",
    "ceo",
    "cto",
    "head of engineering",
    "engineering manager",
  ]);
});

run("planner fails fast when CRM persistence hop is invalid", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_invalid_crm",
      originalRequestSummary: "lead en españa 5-50",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["ceo"],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["ceo", "software company", "Spain"],
      attemptBudget: 4,
      attemptIndex: 0,
      acceptedLeads: [],
      shortlistOptions: [],
      seenCompanies: [],
      seenLeadNames: [],
      currentCandidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jane Doe",
          roleTitle: "CEO",
          linkedinUrl: null,
        },
        company: {
          name: "Example AI",
          website: "https://example.ai",
          domain: "example.ai",
        },
        fitSignals: ["Spain-based company"],
        evidence: [
          {
            type: "company_site",
            url: "https://example.ai/about",
            claim: "Jane Doe is listed as CEO.",
          },
          {
            type: "company_profile",
            url: "https://profiles.example/example-ai",
            claim: "Example AI has 20 employees in Spain.",
          },
        ],
        notes: "Strong fit.",
      },
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "REGISTER_ACCEPTED_LEAD",
    },
    latestResult: {
      contract: "crm_response",
      ok: false,
      status: "TIMEOUT",
      error: "Timed out waiting for CRM response.",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.outcome, "final");
  assert.equal(result.finalType, "FAILED");
});

run("migrates legacy multi-campaign state into the new global state", () => {
  const state = coerceProspectingState({
    campaigns: {
      one: {
        searchedNames: ["Example AI", "Example AI"],
        registeredNames: ["Jane Doe"],
        updatedAt: "2026-03-22T16:00:13.237Z",
      },
      two: {
        searchedCompanyNames: ["Other Co."],
        registeredLeadNames: ["John Smith"],
        updatedAt: "2026-03-27T17:06:34.308Z",
      },
    },
  });

  assert.deepEqual(state.searchedCompanyNames, ["example ai", "other co"]);
  assert.deepEqual(state.registeredLeadNames, ["jane doe", "john smith"]);
  assert.deepEqual(state.explorationMemory, {
    visitedUrls: [],
    queryHistory: [],
    consecutiveHardMissRuns: 0,
  });
  assert.equal(state.updatedAt, "2026-03-27T17:06:34.308Z");
});

run("accepts CRM source-trace requests and GET_CAMPAIGN_STATE responses with exploration memory", () => {
  const request = parseAndValidateProspectingContract(
    "crm_request",
    JSON.stringify({
      action: "REGISTER_SOURCE_TRACE",
      runId: "run_trace_001",
      sourceTrace: {
        queries: ["genai engineer spain"],
        fetchedUrls: ["https://example.ai/team"],
        evidenceUrls: [],
      },
    }),
  );

  assert.equal(request.ok, true);

  const response = parseAndValidateProspectingContract(
    "crm_response",
    JSON.stringify({
      status: "OK",
      action: "GET_CAMPAIGN_STATE",
      campaignState: {
        searchedCompanyNames: ["example ai"],
        registeredLeadNames: ["jane doe"],
      },
      explorationMemory: {
        visitedUrls: [
          {
            url: "https://example.ai/team",
            normalizedUrl: "https://example.ai/team",
            source: "fetch",
            firstSeenAt: "2026-03-29T08:00:00.000Z",
            lastSeenAt: "2026-03-29T08:00:00.000Z",
          },
        ],
        queryHistory: [
          {
            query: "genai engineer spain",
            normalizedQuery: "genai engineer spain",
            usedAt: "2026-03-29T08:00:00.000Z",
          },
        ],
        consecutiveHardMissRuns: 2,
      },
    }),
  );

  assert.equal(response.ok, true);
});

run("canonicalizes sourcer requests with persisted campaign exclusions", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prospecting-state-"));
  process.env.OPENCLAW_STATE_DIR = tempRoot;
  saveState(coerceProspectingState({
    searchedCompanyNames: ["maisa"],
    registeredLeadNames: ["david villalón"],
    updatedAt: "2026-03-28T12:08:55.405Z",
  }));

  const canonical = canonicalizeProspectingRequest("sourcer_request", {
    action: "SOURCE_ONE",
    runId: "run_state_001",
    campaignContext: {
      targetThemes: ["software consultancy"],
    },
    excludedCompanyNames: ["allen recruitment"],
    excludedLeadNames: ["jane doe"],
    constraints: {},
  });

  assert.deepEqual(canonical.excludedCompanyNames, ["maisa", "allen recruitment"]);
  assert.deepEqual(canonical.excludedLeadNames, ["david villalón", "jane doe"]);
});

run("finds only the assistant JSON that belongs to the current run", () => {
  const result = findRunScopedAssistantReply(
    [
      {
        type: "message",
        timestamp: "2026-03-27T19:17:41.690Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "```json\n{\"status\":\"FOUND\",\"candidate\":{\"candidateId\":\"old\"}}\n```",
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-27T19:34:50.824Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: '[Fri 2026-03-27 19:34 UTC] {"action":"SOURCE_ONE","runId":"run_new"}',
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-27T19:35:38.550Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "```json\n{\"status\":\"FOUND\",\"candidate\":{\"candidateId\":\"new\"}}\n```",
            },
          ],
        },
      },
    ],
    "run_new",
    "SOURCE_ONE",
  );

  assert.equal(result.status, "FOUND");
  assert.equal(result.payloadText, '{"status":"FOUND","candidate":{"candidateId":"new"}}');
});

run("flags malformed downstream assistant text for the current run", () => {
  const result = findRunScopedAssistantReply(
    [
      {
        type: "message",
        timestamp: "2026-03-27T19:34:50.824Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: '[Fri 2026-03-27 19:34 UTC] {"action":"QUALIFY_ONE","runId":"run_bad"}',
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-27T19:35:38.550Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Context size has been exceeded.",
            },
          ],
        },
      },
    ],
    "run_bad",
    "QUALIFY_ONE",
  );

  assert.equal(result.status, "MALFORMED");
  assert.equal(result.rawText, "Context size has been exceeded.");
});

run("matches malformed request text when action and runId are still explicit", () => {
  const result = findRunScopedAssistantReply(
    [
      {
        type: "message",
        timestamp: "2026-03-27T21:07:09.677Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: '[Fri 2026-03-27 21:07 UTC] {"action":"SOURCE_ONE","runId":"run_bad","constraints":{"maxCandidatesToReturn":1}}}',
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-27T21:07:32.406Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: '{"status":"NO_CANDIDATE","reason":"No candidate found"}',
            },
          ],
        },
      },
    ],
    "run_bad",
    "SOURCE_ONE",
  );

  assert.equal(result.status, "FOUND");
  assert.equal(result.payloadText, '{"status":"NO_CANDIDATE","reason":"No candidate found"}');
});

run("finds CRM replies by action when no payload runId exists", () => {
  const result = findRunScopedAssistantReply(
    [
      {
        type: "message",
        timestamp: "2026-03-27T20:10:00.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: '{"action":"GET_CAMPAIGN_STATE"}',
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-27T20:10:03.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: '```json\n{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":[],"registeredLeadNames":[]}}\n```',
            },
          ],
        },
      },
    ],
    undefined,
    "GET_CAMPAIGN_STATE",
  );

  assert.equal(result.status, "FOUND");
  assert.equal(
    result.payloadText,
    '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":[],"registeredLeadNames":[]}}',
  );
});

run("finds CRM replies by action even when a transport runId was passed to the await helper", () => {
  const result = findRunScopedAssistantReply(
    [
      {
        type: "message",
        timestamp: "2026-03-28T11:10:00.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: '{"action":"GET_CAMPAIGN_STATE"}',
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-28T11:10:03.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":[],"registeredLeadNames":[]}}',
            },
          ],
        },
      },
    ],
    "transport_run_id_that_should_be_ignored",
    "GET_CAMPAIGN_STATE",
  );

  assert.equal(result.status, "FOUND");
  assert.equal(
    result.payloadText,
    '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":[],"registeredLeadNames":[]}}',
  );
});

run("extracts nested worker JSON from the OpenClaw agent wrapper", () => {
  const payloadText = extractJsonCandidateText(
    JSON.stringify({
      runId: "run_123",
      status: "ok",
      summary: "completed",
      result: {
        payloads: [
          {
            text: '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":[],"registeredLeadNames":[]}}',
          },
        ],
      },
    }),
  );

  assert.equal(
    payloadText,
    '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":[],"registeredLeadNames":[]}}',
  );
});

const validOutreachPack = {
  sourceNotes:
    "Qualified lead for a small IT company in Spain with strong evidence for role, geography, and company profile.",
  hook1: "Possible fit for agentic automation in internal operations.",
  hook2: "Relevant technical buyer with a plausible internal automation angle.",
  fitSummary:
    "Strong lead for practical GenAI and agentic workflow work in a small IT environment with a named decision-maker.",
  connectionNoteDraft:
    "Hola Jaume, vi que en Unimedia combináis IA y desarrollo cloud. Diseño sistemas agentic para automatizar operaciones en pymes IT. Me gustaría conectar y compartirte una idea concreta.",
  dmDraft:
    "Hola Jaume.\n\nMe llamó la atención cómo estáis posicionando Unimedia en IA y software a medida. Suelo ayudar a empresas IT pequeñas a convertir tareas repetitivas en flujos agentic útiles para operaciones internas.\n\nSi te cuadra, te comparto una idea concreta que podría tener sentido en vuestro contexto.",
  emailSubjectDraft: "automatización interna con genai",
  emailBodyDraft:
    "Hola Jaume. Vi que en Unimedia estáis trabajando en IA y desarrollo cloud para clientes, y pensé que quizá también os interese aplicarlo dentro del negocio. Estoy ayudando a equipos IT pequeños a montar sistemas agentic para automatizar trabajo operativo, acelerar workflows internos y reducir carga manual sin añadir una capa enorme de producto. Si te encaja, te comparto por aquí una idea concreta que sí podría tener sentido para una empresa como la vuestra. La idea sería totalmente aterrizada al tipo de equipo y servicio que ya estáis moviendo.",
  nextActionType: "connection_request",
};

const validLeadProfile = {
  recruiterType: "in_house",
  region: "Spain",
};

run("accepts a valid commercial request", () => {
  const result = parseAndValidateProspectingContract(
    "commercial_request",
    JSON.stringify({
      action: "GENERATE_OUTREACH_PACK",
      runId: "run_commercial_001",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jaume Vidal",
          roleTitle: "CEO & Founder",
          linkedinUrl: "https://www.linkedin.com/in/jaume-vidal",
        },
        company: {
          name: "Unimedia Technology",
          website: "https://www.unimedia.tech",
          domain: "unimedia.tech",
        },
        fitSignals: [
          "Spain-based software consultancy",
          "Company size is 10-49 employees",
        ],
        evidence: [
          {
            type: "company_site",
            url: "https://www.unimedia.tech",
            claim: "Unimedia Technology is based in Barcelona, Spain.",
          },
          {
            type: "company_profile",
            url: "https://clutch.co/profile/unimedia-technology",
            claim: "Unimedia Technology has 10-49 employees.",
          },
        ],
        notes: "Strong fit for internal automation work.",
      },
      qualification: {
        status: "ACCEPT",
        reasons: [
          "Named founder",
          "Spain-based company",
          "Company size matches the requested range",
        ],
      },
      channelRules: {
        languageMode: "MATCH_LEAD_LANGUAGE",
        connectionNote: {
          maxChars: 200,
          targetMinChars: 140,
          targetMaxChars: 190,
        },
        dm: {
          minChars: 320,
          maxChars: 650,
          paragraphCount: 3,
        },
        emailSubject: {
          minWords: 2,
          maxWords: 5,
        },
        emailBody: {
          minWords: 70,
          maxWords: 130,
          minSentences: 3,
          maxSentences: 5,
        },
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("accepts a valid commercial READY response", () => {
  const result = parseAndValidateProspectingContract(
    "commercial_response",
    JSON.stringify({
      status: "READY",
      candidateId: "cand_123",
      outreachPack: validOutreachPack,
    }),
    {
      expectedCandidateId: "cand_123",
    },
  );

  assert.equal(result.ok, true);
});

run("accepts REGISTER_ACCEPTED_LEAD requests with outreachPack", () => {
  const result = parseAndValidateProspectingContract(
    "crm_request",
    JSON.stringify({
      action: "REGISTER_ACCEPTED_LEAD",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jaume Vidal",
          roleTitle: "CEO & Founder",
          linkedinUrl: "https://www.linkedin.com/in/jaume-vidal",
        },
        company: {
          name: "Unimedia Technology",
          website: "https://www.unimedia.tech",
          domain: "unimedia.tech",
        },
        fitSignals: ["Spain-based consultancy"],
        evidence: [
          {
            type: "company_site",
            url: "https://www.unimedia.tech",
            claim: "Barcelona, Spain.",
          },
          {
            type: "company_profile",
            url: "https://clutch.co/profile/unimedia-technology",
            claim: "10-49 employees.",
          },
        ],
        notes: "Strong fit",
      },
      decision: {
        status: "ACCEPT",
        reasons: ["Accepted by qualifier."],
      },
      outreachPack: validOutreachPack,
      campaignStateUpdate: {
        searchedCompanyNamesAdd: ["Unimedia Technology"],
        registeredLeadNamesAdd: ["Jaume Vidal"],
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("accepts SAVE_PENDING_SHORTLIST requests with outreachPack", () => {
  const result = parseAndValidateProspectingContract(
    "crm_request",
    JSON.stringify({
      action: "SAVE_PENDING_SHORTLIST",
      pendingShortlist: {
        originalRequestSummary: "lead en espana 5-50",
        options: [
          {
            candidate: {
              candidateId: "cand_123",
              person: {
                fullName: "Jaume Vidal",
                roleTitle: "CEO & Founder",
                linkedinUrl: "https://www.linkedin.com/in/jaume-vidal",
              },
              company: {
                name: "Unimedia Technology",
                website: "https://www.unimedia.tech",
                domain: "unimedia.tech",
              },
              fitSignals: ["Spain-based consultancy"],
              evidence: [
                {
                  type: "company_site",
                  url: "https://www.unimedia.tech",
                  claim: "Barcelona, Spain.",
                },
                {
                  type: "company_profile",
                  url: "https://clutch.co/profile/unimedia-technology",
                  claim: "10-49 employees.",
                },
              ],
              notes: "Strong fit",
            },
            summary: "Strong CEO lead with a slight size near miss.",
            missedFilters: ["company size 5-50"],
            reasons: ["Named founder", "Spain-based company"],
            outreachPack: validOutreachPack,
          },
        ],
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("accepts qualifier ACCEPT responses with leadProfile", () => {
  const result = parseAndValidateProspectingContract(
    "qualifier_response",
    JSON.stringify({
      status: "ACCEPT",
      candidateId: "cand_123",
      leadProfile: validLeadProfile,
      decision: {
        verdict: "ACCEPT",
        reasons: ["Named founder in Spain."],
        missingFields: [],
      },
    }),
    {
      expectedCandidateId: "cand_123",
    },
  );

  assert.equal(result.ok, true);
});

run("accepts REGISTER_ACCEPTED_LEAD requests with leadProfile", () => {
  const result = parseAndValidateProspectingContract(
    "crm_request",
    JSON.stringify({
      action: "REGISTER_ACCEPTED_LEAD",
      candidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jaume Vidal",
          roleTitle: "CEO & Founder",
          linkedinUrl: "https://www.linkedin.com/in/jaume-vidal",
        },
        company: {
          name: "Unimedia Technology",
          website: "https://www.unimedia.tech",
          domain: "unimedia.tech",
        },
        fitSignals: ["Spain-based consultancy"],
        evidence: [
          {
            type: "company_site",
            url: "https://www.unimedia.tech",
            claim: "Barcelona, Spain.",
          },
          {
            type: "company_profile",
            url: "https://clutch.co/profile/unimedia-technology",
            claim: "10-49 employees.",
          },
        ],
        notes: "Strong fit",
      },
      decision: {
        status: "ACCEPT",
        reasons: ["Accepted by qualifier."],
      },
      leadProfile: validLeadProfile,
      campaignStateUpdate: {
        searchedCompanyNamesAdd: ["Unimedia Technology"],
        registeredLeadNamesAdd: ["Jaume Vidal"],
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("accepts SAVE_PENDING_SHORTLIST requests with leadProfile", () => {
  const result = parseAndValidateProspectingContract(
    "crm_request",
    JSON.stringify({
      action: "SAVE_PENDING_SHORTLIST",
      pendingShortlist: {
        originalRequestSummary: "lead en espana 5-50",
        options: [
          {
            candidate: {
              candidateId: "cand_123",
              person: {
                fullName: "Jaume Vidal",
                roleTitle: "CEO & Founder",
                linkedinUrl: "https://www.linkedin.com/in/jaume-vidal",
              },
              company: {
                name: "Unimedia Technology",
                website: "https://www.unimedia.tech",
                domain: "unimedia.tech",
              },
              fitSignals: ["Spain-based consultancy"],
              evidence: [
                {
                  type: "company_site",
                  url: "https://www.unimedia.tech",
                  claim: "Barcelona, Spain.",
                },
                {
                  type: "company_profile",
                  url: "https://clutch.co/profile/unimedia-technology",
                  claim: "10-49 employees.",
                },
              ],
              notes: "Strong fit",
            },
            summary: "Strong CEO lead with a slight size near miss.",
            missedFilters: ["company size 5-50"],
            reasons: ["Named founder", "Spain-based company"],
            leadProfile: validLeadProfile,
          },
        ],
      },
    }),
  );

  assert.equal(result.ok, true);
});

run("planner routes accepted leads through commercial before CRM persistence", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_commercial_accept",
      originalRequestSummary: "lead en espana 5-50",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["ceo"],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["ceo", "software company", "Spain"],
      attemptBudget: 4,
      attemptIndex: 0,
      acceptedLeads: [],
      shortlistOptions: [],
      seenCompanies: [],
      seenLeadNames: [],
      currentCandidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jaume Vidal",
          roleTitle: "CEO & Founder",
          linkedinUrl: null,
        },
        company: {
          name: "Unimedia Technology",
          website: "https://www.unimedia.tech",
          domain: "unimedia.tech",
        },
        fitSignals: ["Spain-based consultancy"],
        evidence: [
          {
            type: "company_site",
            url: "https://www.unimedia.tech",
            claim: "Barcelona, Spain.",
          },
          {
            type: "company_profile",
            url: "https://clutch.co/profile/unimedia-technology",
            claim: "10-49 employees.",
          },
        ],
        notes: "Strong fit",
      },
      currentQualificationReasons: [],
      currentCloseMatch: null,
      currentOutreachPack: null,
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "QUALIFY_ONE",
    },
    latestResult: {
      contract: "qualifier_response",
      ok: true,
      status: "VALID",
      parsed: {
        status: "ACCEPT",
        candidateId: "cand_123",
        decision: {
          verdict: "ACCEPT",
          reasons: ["Named founder", "Exact fit"],
          missingFields: [],
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "commercial_request");
  assert.equal(result.request.expectedAction, "GENERATE_OUTREACH_PACK");
});

run("planner falls back to CRM persistence when commercial fails for an accepted lead", () => {
  const result = planProspectingMainNextAction({
    state: {
      mode: "lead_search",
      language: "es",
      requestId: "lead_commercial_fallback",
      originalRequestSummary: "lead en espana 5-50",
      requestedLeadCount: 1,
      targetFilters: {
        preferredCountry: "es",
        preferredMinCompanySize: 5,
        preferredMaxCompanySize: 50,
        preferredRoleThemes: ["ceo"],
        preferNamedPerson: true,
      },
      sourcerTargetThemes: ["ceo", "software company", "Spain"],
      attemptBudget: 4,
      attemptIndex: 0,
      acceptedLeads: [],
      shortlistOptions: [],
      seenCompanies: [],
      seenLeadNames: [],
      currentCandidate: {
        candidateId: "cand_123",
        person: {
          fullName: "Jaume Vidal",
          roleTitle: "CEO & Founder",
          linkedinUrl: null,
        },
        company: {
          name: "Unimedia Technology",
          website: "https://www.unimedia.tech",
          domain: "unimedia.tech",
        },
        fitSignals: ["Spain-based consultancy"],
        evidence: [
          {
            type: "company_site",
            url: "https://www.unimedia.tech",
            claim: "Barcelona, Spain.",
          },
          {
            type: "company_profile",
            url: "https://clutch.co/profile/unimedia-technology",
            claim: "10-49 employees.",
          },
        ],
        notes: "Strong fit",
      },
      currentQualificationReasons: ["Named founder", "Exact fit"],
      currentCloseMatch: null,
      currentOutreachPack: null,
      currentMatchMode: "STRICT",
      enrichRoundCount: 0,
      awaitingAction: "GENERATE_OUTREACH_PACK",
    },
    latestResult: {
      contract: "commercial_response",
      ok: false,
      status: "TIMEOUT",
      error: "Commercial worker stalled.",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "crm_request");
  assert.equal(result.request.expectedAction, "REGISTER_ACCEPTED_LEAD");
  assert.equal(typeof result.request.payload.outreachPack?.connectionNoteDraft, "string");
  assert.equal(
    result.request.payload.outreachPack.connectionNoteDraft.length <= 200,
    true,
  );
  const emailWordCount = result.request.payload.outreachPack.emailBodyDraft
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  assert.equal(emailWordCount >= 70 && emailWordCount <= 130, true);
});

run("reads the matched request payload back from the session store", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prospecting-request-"));
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  const sessionDir = path.join(tempRoot, "agents", "sourcer", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });

  const sessionFile = path.join(sessionDir, "request.jsonl");
  const storePath = path.join(sessionDir, "sessions.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      "agent:sourcer:main": {
        sessionFile,
      },
    }),
  );

  fs.writeFileSync(
    sessionFile,
    `${JSON.stringify({
      type: "message",
      timestamp: "2026-03-28T12:00:00.000Z",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: '{"action":"SOURCE_ONE","runId":"run_request_1","excludedCompanyNames":["maisa"],"excludedLeadNames":["david villalón"]}',
          },
        ],
      },
    })}\n`,
  );

  const result = readRunScopedRequestPayload({
    sessionKey: "agent:sourcer:main",
    runId: "run_request_1",
    expectedAction: "SOURCE_ONE",
  });

  assert.deepEqual(result, {
    payloadText:
      '{"action":"SOURCE_ONE","runId":"run_request_1","excludedCompanyNames":["maisa"],"excludedLeadNames":["david villalón"]}',
    messageTimestamp: "2026-03-28T12:00:00.000Z",
  });
});

run("extracts run-scoped sourcer tool traces from the session store", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prospecting-tool-trace-"));
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  const sessionDir = path.join(tempRoot, "agents", "sourcer", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });

  const sessionFile = path.join(sessionDir, "tool-trace.jsonl");
  const storePath = path.join(sessionDir, "sessions.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      "agent:sourcer:main": {
        sessionFile,
      },
    }),
  );

  fs.writeFileSync(
    sessionFile,
    [
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-29T09:00:00.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: '{"action":"SOURCE_ONE","runId":"run_trace_001"}' }],
        },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-03-29T09:00:01.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              name: "web_search",
              arguments: { query: "genai engineer spain" },
            },
            {
              type: "toolCall",
              name: "web_fetch",
              arguments: { url: "https://example.ai/team?utm_source=test" },
            },
            {
              type: "toolCall",
              name: "web_fetch",
              arguments: { url: "https://example.ai/team?utm_source=test" },
            },
          ],
        },
      }),
    ].join("\n"),
  );

  const result = readRunScopedToolTrace({
    sessionKey: "agent:sourcer:main",
    runId: "run_trace_001",
    expectedAction: "SOURCE_ONE",
  });

  assert.deepEqual(result, {
    queries: ["genai engineer spain"],
    fetchedUrls: ["https://example.ai/team?utm_source=test"],
    candidateCompanies: [],
  });
});

run("routes explicit query-memory reset requests to CRM", () => {
  const result = planProspectingMainNextAction({
    userText: "resetea las queries usadas y vuelve a intentarlo",
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "send_request");
  assert.equal(result.request.contract, "crm_request");
  assert.equal(result.request.expectedAction, "RESET_QUERY_MEMORY");
});

run("falls back to the latest action request when main passes the transport runId instead of the payload runId", () => {
  const result = findRunScopedAssistantReply(
    [
      {
        type: "message",
        timestamp: "2026-03-28T19:21:32.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: '{"action":"GET_CAMPAIGN_STATE","runId":"payload_run_001"}',
            },
          ],
        },
      },
      {
        type: "message",
        timestamp: "2026-03-28T19:21:34.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":["maisa"],"registeredLeadNames":["david villalón"]}}',
            },
          ],
        },
      },
    ],
    "transport_run_999",
    "GET_CAMPAIGN_STATE",
  );

  assert.equal(result.status, "FOUND");
  assert.equal(
    result.payloadText,
    '{"status":"OK","action":"GET_CAMPAIGN_STATE","campaignState":{"searchedCompanyNames":["maisa"],"registeredLeadNames":["david villalón"]}}',
  );
});

await runAsync("watcher waits across transport timeout while session file keeps changing", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prospecting-watch-"));
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  const sessionDir = path.join(tempRoot, "agents", "sourcer", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });

  const sessionFile = path.join(sessionDir, "watch.jsonl");
  const storePath = path.join(sessionDir, "sessions.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      "agent:sourcer:main": {
        sessionFile,
      },
    }),
  );

  fs.writeFileSync(
    sessionFile,
    `${JSON.stringify({
      type: "message",
      timestamp: "2026-03-28T12:00:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: '{"action":"SOURCE_ONE","runId":"run_watch_1"}' }],
      },
    })}\n`,
  );

  const pending = awaitRunScopedAssistantJson({
    sessionKey: "agent:sourcer:main",
    runId: "run_watch_1",
    expectedAction: "SOURCE_ONE",
    timeoutMs: 200,
    pollIntervalMs: 50,
    maxRuntimeMs: 1000,
  });

  setTimeout(() => {
    fs.appendFileSync(
      sessionFile,
      `${JSON.stringify({
        type: "tool",
        timestamp: "2026-03-28T12:00:00.150Z",
        name: "web_search",
      })}\n`,
    );
  }, 100);

  setTimeout(() => {
    fs.appendFileSync(
      sessionFile,
      `${JSON.stringify({
        type: "message",
        timestamp: "2026-03-28T12:00:00.350Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: '{"status":"NO_CANDIDATE","reason":"No candidate"}' }],
        },
      })}\n`,
    );
  }, 320);

  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.status, "FOUND");
});

await runAsync("watcher fails on inactivity stall", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prospecting-idle-"));
  process.env.OPENCLAW_STATE_DIR = tempRoot;

  const sessionDir = path.join(tempRoot, "agents", "qualifier", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });

  const sessionFile = path.join(sessionDir, "idle.jsonl");
  const storePath = path.join(sessionDir, "sessions.json");
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      "agent:qualifier:main": {
        sessionFile,
      },
    }),
  );

  fs.writeFileSync(
    sessionFile,
    `${JSON.stringify({
      type: "message",
      timestamp: "2026-03-28T12:00:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: '{"action":"QUALIFY_ONE","runId":"run_idle_1"}' }],
      },
    })}\n`,
  );

  const result = await awaitRunScopedAssistantJson({
    sessionKey: "agent:qualifier:main",
    runId: "run_idle_1",
    expectedAction: "QUALIFY_ONE",
    timeoutMs: 200,
    pollIntervalMs: 50,
    maxRuntimeMs: 600,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "TIMEOUT");
});
