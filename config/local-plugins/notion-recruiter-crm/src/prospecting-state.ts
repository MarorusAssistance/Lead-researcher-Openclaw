import fs from "node:fs";
import path from "node:path";

export interface ProspectingState {
  searchedCompanyNames: string[];
  registeredLeadNames: string[];
  updatedAt: string;
}

type UnknownRecord = Record<string, unknown>;

const DATA_DIR =
  process.env.NOTION_RECRUITER_CRM_DATA_DIR ||
  "/home/openclaw/.openclaw/plugin-state/notion-recruiter-crm";

const STATE_PATH =
  process.env.PROSPECTING_STATE_PATH ||
  path.join(DATA_DIR, "prospecting-state.json");

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function defaultState(now: string = new Date().toISOString()): ProspectingState {
  return {
    searchedCompanyNames: [],
    registeredLeadNames: [],
    updatedAt: now,
  };
}

export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\b(ltd|limited|llc|inc|corp|corporation|sl|s\.l\.)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNames(names: string[]): string[] {
  const deduped = new Set<string>();

  for (const value of names) {
    const normalized = normalizeName(value);
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return [...deduped];
}

function readLegacyNames(record: UnknownRecord, keys: string[]): string[] {
  const values: string[] = [];

  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    const candidate = record[key];
    if (!isStringArray(candidate)) {
      throw new Error(`Legacy state field "${key}" must be an array of strings.`);
    }

    values.push(...candidate);
  }

  return values;
}

export function coerceProspectingState(input: unknown): ProspectingState {
  const now = new Date().toISOString();

  if (!isRecord(input)) {
    throw new Error("Prospecting state root must be a JSON object.");
  }

  if ("searchedCompanyNames" in input || "registeredLeadNames" in input) {
    if (!isStringArray(input.searchedCompanyNames)) {
      throw new Error('State field "searchedCompanyNames" must be an array of strings.');
    }

    if (!isStringArray(input.registeredLeadNames)) {
      throw new Error('State field "registeredLeadNames" must be an array of strings.');
    }

    const updatedAt =
      typeof input.updatedAt === "string" && input.updatedAt.trim().length > 0
        ? input.updatedAt
        : now;

    return {
      searchedCompanyNames: normalizeNames(input.searchedCompanyNames),
      registeredLeadNames: normalizeNames(input.registeredLeadNames),
      updatedAt,
    };
  }

  if ("campaigns" in input) {
    if (!isRecord(input.campaigns)) {
      throw new Error('Legacy state field "campaigns" must be an object.');
    }

    const searchedNames: string[] = [];
    const registeredNames: string[] = [];
    let latestUpdatedAt = "";

    for (const [campaignId, campaignState] of Object.entries(input.campaigns)) {
      if (!isRecord(campaignState)) {
        throw new Error(`Legacy campaign "${campaignId}" must be an object.`);
      }

      searchedNames.push(
        ...readLegacyNames(campaignState, ["searchedCompanyNames", "searchedNames"]),
      );
      registeredNames.push(
        ...readLegacyNames(campaignState, ["registeredLeadNames", "registeredNames"]),
      );

      if (
        typeof campaignState.updatedAt === "string" &&
        campaignState.updatedAt.trim().length > 0 &&
        campaignState.updatedAt > latestUpdatedAt
      ) {
        latestUpdatedAt = campaignState.updatedAt;
      }
    }

    return {
      searchedCompanyNames: normalizeNames(searchedNames),
      registeredLeadNames: normalizeNames(registeredNames),
      updatedAt: latestUpdatedAt || now,
    };
  }

  throw new Error(
    'Prospecting state must contain either "searchedCompanyNames"/"registeredLeadNames" or a legacy "campaigns" object.',
  );
}

export function loadState(): ProspectingState {
  ensureDir();

  if (!fs.existsSync(STATE_PATH)) {
    const initial = defaultState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  const raw = fs.readFileSync(STATE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return coerceProspectingState(parsed);
}

export function saveState(state: ProspectingState): void {
  ensureDir();

  const normalized: ProspectingState = {
    searchedCompanyNames: normalizeNames(state.searchedCompanyNames),
    registeredLeadNames: normalizeNames(state.registeredLeadNames),
    updatedAt:
      typeof state.updatedAt === "string" && state.updatedAt.trim().length > 0
        ? state.updatedAt
        : new Date().toISOString(),
  };

  const tempPath = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, STATE_PATH);
}
