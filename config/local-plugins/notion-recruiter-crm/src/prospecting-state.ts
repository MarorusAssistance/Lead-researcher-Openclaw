import fs from "node:fs";
import path from "node:path";

export type ExplorationUrlSource = "fetch" | "evidence";

export interface VisitedUrlRecord {
  url: string;
  normalizedUrl: string;
  source: ExplorationUrlSource;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface QueryHistoryEntry {
  query: string;
  normalizedQuery: string;
  usedAt: string;
}

export interface ProspectingExplorationMemory {
  visitedUrls: VisitedUrlRecord[];
  queryHistory: QueryHistoryEntry[];
  consecutiveHardMissRuns: number;
}

export interface ProspectingState {
  searchedCompanyNames: string[];
  registeredLeadNames: string[];
  explorationMemory: ProspectingExplorationMemory;
  updatedAt: string;
}

type UnknownRecord = Record<string, unknown>;
const QUERY_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUERY_HISTORY_ENTRIES = 1000;
const TRACKING_QUERY_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|_hsenc$|_hsmi$|ref$|ref_src$)/i;

function getDataDir(): string {
  return (
    process.env.NOTION_RECRUITER_CRM_DATA_DIR ||
    (process.env.OPENCLAW_STATE_DIR
      ? path.join(process.env.OPENCLAW_STATE_DIR, "plugin-state", "notion-recruiter-crm")
      : undefined) ||
    "/home/openclaw/.openclaw/plugin-state/notion-recruiter-crm"
  );
}

function getStatePath(): string {
  return process.env.PROSPECTING_STATE_PATH || path.join(getDataDir(), "prospecting-state.json");
}

function ensureDir(): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isUrlSource(value: unknown): value is ExplorationUrlSource {
  return value === "fetch" || value === "evidence";
}

function defaultExplorationMemory(now: string = new Date().toISOString()): ProspectingExplorationMemory {
  return {
    visitedUrls: [],
    queryHistory: [],
    consecutiveHardMissRuns: 0,
  };
}

function defaultState(now: string = new Date().toISOString()): ProspectingState {
  return {
    searchedCompanyNames: [],
    registeredLeadNames: [],
    explorationMemory: defaultExplorationMemory(now),
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

export function normalizeTrackedQuery(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizeTrackedUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/u, "");
    }

    const keptEntries = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_QUERY_PARAM.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const left = `${leftKey}=${leftValue}`;
        const right = `${rightKey}=${rightValue}`;
        return left.localeCompare(right);
      });
    url.search = "";

    for (const [key, value] of keptEntries) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  } catch {
    return trimmed.toLowerCase();
  }
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

function normalizeVisitedUrlRecords(records: VisitedUrlRecord[]): VisitedUrlRecord[] {
  const merged = new Map<string, VisitedUrlRecord>();

  for (const record of records) {
    const normalizedUrl = normalizeTrackedUrl(record.normalizedUrl || record.url);
    const rawUrl = record.url.trim();
    if (!rawUrl || !normalizedUrl) {
      continue;
    }

    const current = merged.get(normalizedUrl);
    const nextSource: ExplorationUrlSource =
      current?.source === "fetch" || record.source === "fetch" ? "fetch" : "evidence";
    const firstSeenAt = current && current.firstSeenAt < record.firstSeenAt ? current.firstSeenAt : record.firstSeenAt;
    const lastSeenAt = current && current.lastSeenAt > record.lastSeenAt ? current.lastSeenAt : record.lastSeenAt;

    merged.set(normalizedUrl, {
      url: rawUrl,
      normalizedUrl,
      source: nextSource,
      firstSeenAt,
      lastSeenAt,
    });
  }

  return [...merged.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

function normalizeQueryHistoryEntries(entries: QueryHistoryEntry[]): QueryHistoryEntry[] {
  const now = Date.now();

  const normalized = entries
    .map((entry) => {
      const query = entry.query.trim();
      const normalizedQuery = normalizeTrackedQuery(entry.normalizedQuery || entry.query);
      const usedAt = new Date(entry.usedAt).toISOString();

      return {
        query,
        normalizedQuery,
        usedAt,
      };
    })
    .filter((entry) => {
      if (!entry.query || !entry.normalizedQuery) {
        return false;
      }

      const usedAtTime = new Date(entry.usedAt).getTime();
      return Number.isFinite(usedAtTime) && now - usedAtTime <= QUERY_HISTORY_WINDOW_MS;
    })
    .sort((left, right) => right.usedAt.localeCompare(left.usedAt));

  return normalized.slice(0, MAX_QUERY_HISTORY_ENTRIES);
}

function coerceVisitedUrlRecord(input: unknown): VisitedUrlRecord {
  if (!isRecord(input)) {
    throw new Error("Visited URL entry must be an object.");
  }

  if (typeof input.url !== "string" || input.url.trim().length === 0) {
    throw new Error('Visited URL entry field "url" must be a non-empty string.');
  }

  if (!isUrlSource(input.source)) {
    throw new Error('Visited URL entry field "source" must be "fetch" or "evidence".');
  }

  if (typeof input.firstSeenAt !== "string" || input.firstSeenAt.trim().length === 0) {
    throw new Error('Visited URL entry field "firstSeenAt" must be a non-empty string.');
  }

  if (typeof input.lastSeenAt !== "string" || input.lastSeenAt.trim().length === 0) {
    throw new Error('Visited URL entry field "lastSeenAt" must be a non-empty string.');
  }

  const firstSeenAt = new Date(input.firstSeenAt).toISOString();
  const lastSeenAt = new Date(input.lastSeenAt).toISOString();

  return {
    url: input.url.trim(),
    normalizedUrl: normalizeTrackedUrl(
      typeof input.normalizedUrl === "string" && input.normalizedUrl.trim().length > 0
        ? input.normalizedUrl
        : input.url,
    ),
    source: input.source,
    firstSeenAt,
    lastSeenAt,
  };
}

function coerceQueryHistoryEntry(input: unknown): QueryHistoryEntry {
  if (!isRecord(input)) {
    throw new Error("Query history entry must be an object.");
  }

  if (typeof input.query !== "string" || input.query.trim().length === 0) {
    throw new Error('Query history entry field "query" must be a non-empty string.');
  }

  if (typeof input.usedAt !== "string" || input.usedAt.trim().length === 0) {
    throw new Error('Query history entry field "usedAt" must be a non-empty string.');
  }

  return {
    query: input.query.trim(),
    normalizedQuery: normalizeTrackedQuery(
      typeof input.normalizedQuery === "string" && input.normalizedQuery.trim().length > 0
        ? input.normalizedQuery
        : input.query,
    ),
    usedAt: new Date(input.usedAt).toISOString(),
  };
}

function coerceExplorationMemory(input: unknown): ProspectingExplorationMemory {
  const now = new Date().toISOString();

  if (input === undefined) {
    return defaultExplorationMemory(now);
  }

  if (!isRecord(input)) {
    throw new Error('State field "explorationMemory" must be an object.');
  }

  const visitedUrls = Array.isArray(input.visitedUrls)
    ? normalizeVisitedUrlRecords(input.visitedUrls.map((value) => coerceVisitedUrlRecord(value)))
    : [];
  const queryHistory = Array.isArray(input.queryHistory)
    ? normalizeQueryHistoryEntries(input.queryHistory.map((value) => coerceQueryHistoryEntry(value)))
    : [];
  const consecutiveHardMissRuns = asPositiveInteger(input.consecutiveHardMissRuns) ?? 0;

  return {
    visitedUrls,
    queryHistory,
    consecutiveHardMissRuns,
  };
}

export function appendVisitedUrls(
  existing: VisitedUrlRecord[],
  additions: Array<{ url: string; source: ExplorationUrlSource; seenAt?: string }>,
): VisitedUrlRecord[] {
  const nextEntries: VisitedUrlRecord[] = [...existing];

  for (const addition of additions) {
    if (typeof addition.url !== "string" || addition.url.trim().length === 0) {
      continue;
    }

    const seenAt =
      typeof addition.seenAt === "string" && addition.seenAt.trim().length > 0
        ? new Date(addition.seenAt).toISOString()
        : new Date().toISOString();

    nextEntries.push({
      url: addition.url.trim(),
      normalizedUrl: normalizeTrackedUrl(addition.url),
      source: addition.source,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
    });
  }

  return normalizeVisitedUrlRecords(nextEntries);
}

export function appendQueryHistory(
  existing: QueryHistoryEntry[],
  queries: string[],
  usedAt: string = new Date().toISOString(),
): QueryHistoryEntry[] {
  const entries = [...existing];

  for (const query of queries) {
    if (typeof query !== "string" || query.trim().length === 0) {
      continue;
    }

    entries.push({
      query: query.trim(),
      normalizedQuery: normalizeTrackedQuery(query),
      usedAt,
    });
  }

  return normalizeQueryHistoryEntries(entries);
}

export function deriveQueryUsage(
  entries: QueryHistoryEntry[],
): Array<{ query: string; normalizedQuery: string; count: number; lastUsedAt: string }> {
  const usage = new Map<string, { query: string; normalizedQuery: string; count: number; lastUsedAt: string }>();

  for (const entry of normalizeQueryHistoryEntries(entries)) {
    const current = usage.get(entry.normalizedQuery);
    if (!current) {
      usage.set(entry.normalizedQuery, {
        query: entry.query,
        normalizedQuery: entry.normalizedQuery,
        count: 1,
        lastUsedAt: entry.usedAt,
      });
      continue;
    }

    current.count += 1;
    if (entry.usedAt > current.lastUsedAt) {
      current.lastUsedAt = entry.usedAt;
      current.query = entry.query;
    }
  }

  return [...usage.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return right.lastUsedAt.localeCompare(left.lastUsedAt);
  });
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
      explorationMemory: coerceExplorationMemory(input.explorationMemory),
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
      explorationMemory: defaultExplorationMemory(now),
      updatedAt: latestUpdatedAt || now,
    };
  }

  throw new Error(
    'Prospecting state must contain either "searchedCompanyNames"/"registeredLeadNames" or a legacy "campaigns" object.',
  );
}

export function loadState(): ProspectingState {
  ensureDir();
  const statePath = getStatePath();

  if (!fs.existsSync(statePath)) {
    const initial = defaultState();
    fs.writeFileSync(statePath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  const raw = fs.readFileSync(statePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return coerceProspectingState(parsed);
}

export function saveState(state: ProspectingState): void {
  ensureDir();
  const statePath = getStatePath();

  const normalized: ProspectingState = {
    searchedCompanyNames: normalizeNames(state.searchedCompanyNames),
    registeredLeadNames: normalizeNames(state.registeredLeadNames),
    explorationMemory: {
      visitedUrls: normalizeVisitedUrlRecords(state.explorationMemory.visitedUrls),
      queryHistory: normalizeQueryHistoryEntries(state.explorationMemory.queryHistory),
      consecutiveHardMissRuns:
        typeof state.explorationMemory.consecutiveHardMissRuns === "number" &&
        Number.isInteger(state.explorationMemory.consecutiveHardMissRuns) &&
        state.explorationMemory.consecutiveHardMissRuns >= 0
          ? state.explorationMemory.consecutiveHardMissRuns
          : 0,
    },
    updatedAt:
      typeof state.updatedAt === "string" && state.updatedAt.trim().length > 0
        ? state.updatedAt
        : new Date().toISOString(),
  };

  const tempPath = `${statePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, statePath);
}
