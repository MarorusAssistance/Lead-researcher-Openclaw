import fs from "node:fs";
import path from "node:path";

export interface PendingShortlistOption {
  candidate: {
    candidateId: string;
    person: { fullName: string | null; roleTitle: string | null; linkedinUrl: string | null };
    company: { name: string; website: string | null; domain: string | null };
    fitSignals: string[];
    evidence: Array<{ type: string; url: string; claim: string }>;
    notes: string | null;
  };
  summary: string;
  missedFilters: string[];
  reasons: string[];
  outreachPack?: {
    sourceNotes: string;
    hook1: string;
    hook2: string;
    fitSummary: string;
    connectionNoteDraft: string;
    dmDraft: string;
    emailSubjectDraft: string;
    emailBodyDraft: string;
    nextActionType: "connection_request";
  };
}

export interface PendingShortlist {
  shortlistId: string;
  originalRequestSummary: string;
  options: PendingShortlistOption[];
  createdAt: string;
  expiresAt: string;
}

interface PendingShortlistState {
  pendingShortlist: PendingShortlist | null;
  updatedAt: string;
}

type UnknownRecord = Record<string, unknown>;

function getDataDir(): string {
  return (
    process.env.NOTION_RECRUITER_CRM_DATA_DIR ||
    (process.env.OPENCLAW_STATE_DIR
      ? path.join(process.env.OPENCLAW_STATE_DIR, "plugin-state", "notion-recruiter-crm")
      : undefined) ||
    "/home/openclaw/.openclaw/plugin-state/notion-recruiter-crm"
  );
}

function getShortlistStatePath(): string {
  return (
    process.env.PENDING_SHORTLIST_STATE_PATH ||
    path.join(getDataDir(), "pending-shortlist-state.json")
  );
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

function defaultState(now: string = new Date().toISOString()): PendingShortlistState {
  return {
    pendingShortlist: null,
    updatedAt: now,
  };
}

function coercePendingShortlistOption(input: unknown): PendingShortlistOption {
  if (!isRecord(input)) {
    throw new Error("Pending shortlist option must be an object.");
  }

  if (!isRecord(input.candidate)) {
    throw new Error("Pending shortlist option candidate must be an object.");
  }

  if (typeof input.summary !== "string" || input.summary.trim().length === 0) {
    throw new Error("Pending shortlist option summary must be a non-empty string.");
  }

  if (!isStringArray(input.missedFilters) || input.missedFilters.length === 0) {
    throw new Error("Pending shortlist option missedFilters must be a non-empty string array.");
  }

  if (!isStringArray(input.reasons) || input.reasons.length === 0) {
    throw new Error("Pending shortlist option reasons must be a non-empty string array.");
  }

  let outreachPack: PendingShortlistOption["outreachPack"];
  if (input.outreachPack !== undefined) {
    if (!isRecord(input.outreachPack)) {
      throw new Error("Pending shortlist option outreachPack must be an object.");
    }
    const rawOutreachPack = input.outreachPack;

    const requiredKeys = [
      "sourceNotes",
      "hook1",
      "hook2",
      "fitSummary",
      "connectionNoteDraft",
      "dmDraft",
      "emailSubjectDraft",
      "emailBodyDraft",
    ] as const;

    for (const key of requiredKeys) {
      const value = rawOutreachPack[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Pending shortlist option outreachPack.${key} must be a non-empty string.`);
      }
    }

    if (rawOutreachPack.nextActionType !== "connection_request") {
      throw new Error(
        "Pending shortlist option outreachPack.nextActionType must be connection_request.",
      );
    }

    outreachPack = {
      sourceNotes: (rawOutreachPack.sourceNotes as string).trim(),
      hook1: (rawOutreachPack.hook1 as string).trim(),
      hook2: (rawOutreachPack.hook2 as string).trim(),
      fitSummary: (rawOutreachPack.fitSummary as string).trim(),
      connectionNoteDraft: (rawOutreachPack.connectionNoteDraft as string).trim(),
      dmDraft: (rawOutreachPack.dmDraft as string).trim(),
      emailSubjectDraft: (rawOutreachPack.emailSubjectDraft as string).trim(),
      emailBodyDraft: (rawOutreachPack.emailBodyDraft as string).trim(),
      nextActionType: "connection_request",
    };
  }

  return {
    candidate: input.candidate as PendingShortlistOption["candidate"],
    summary: input.summary.trim(),
    missedFilters: input.missedFilters.map((value) => value.trim()).filter(Boolean),
    reasons: input.reasons.map((value) => value.trim()).filter(Boolean),
    outreachPack,
  };
}

function coercePendingShortlist(input: unknown): PendingShortlist {
  if (!isRecord(input)) {
    throw new Error("Pending shortlist must be an object.");
  }

  if (typeof input.shortlistId !== "string" || input.shortlistId.trim().length === 0) {
    throw new Error("Pending shortlist shortlistId must be a non-empty string.");
  }

  if (
    typeof input.originalRequestSummary !== "string" ||
    input.originalRequestSummary.trim().length === 0
  ) {
    throw new Error("Pending shortlist originalRequestSummary must be a non-empty string.");
  }

  if (!Array.isArray(input.options) || input.options.length === 0) {
    throw new Error("Pending shortlist options must be a non-empty array.");
  }

  if (typeof input.createdAt !== "string" || input.createdAt.trim().length === 0) {
    throw new Error("Pending shortlist createdAt must be a non-empty string.");
  }

  if (typeof input.expiresAt !== "string" || input.expiresAt.trim().length === 0) {
    throw new Error("Pending shortlist expiresAt must be a non-empty string.");
  }

  return {
    shortlistId: input.shortlistId.trim(),
    originalRequestSummary: input.originalRequestSummary.trim(),
    options: input.options.map((value) => coercePendingShortlistOption(value)),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}

function coerceState(input: unknown): PendingShortlistState {
  const now = new Date().toISOString();

  if (!isRecord(input)) {
    throw new Error("Pending shortlist state root must be a JSON object.");
  }

  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim().length > 0
      ? input.updatedAt
      : now;

  if (input.pendingShortlist === null || input.pendingShortlist === undefined) {
    return {
      pendingShortlist: null,
      updatedAt,
    };
  }

  return {
    pendingShortlist: coercePendingShortlist(input.pendingShortlist),
    updatedAt,
  };
}

function readState(): PendingShortlistState {
  ensureDir();
  const shortlistStatePath = getShortlistStatePath();

  if (!fs.existsSync(shortlistStatePath)) {
    const initial = defaultState();
    fs.writeFileSync(shortlistStatePath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  const raw = fs.readFileSync(shortlistStatePath, "utf8");
  return coerceState(JSON.parse(raw) as unknown);
}

function writeState(state: PendingShortlistState): void {
  ensureDir();
  const shortlistStatePath = getShortlistStatePath();
  const tempPath = `${shortlistStatePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tempPath, shortlistStatePath);
}

export function loadPendingShortlist(): PendingShortlist | null {
  const state = readState();
  if (!state.pendingShortlist) {
    return null;
  }

  if (new Date(state.pendingShortlist.expiresAt).getTime() <= Date.now()) {
    clearPendingShortlist(state.pendingShortlist.shortlistId);
    return null;
  }

  return state.pendingShortlist;
}

export function savePendingShortlist(
  input: Omit<PendingShortlist, "shortlistId" | "createdAt" | "expiresAt">,
  ttlHours: number = 24,
): PendingShortlist {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
  const shortlist: PendingShortlist = {
    shortlistId: `short_${now.toISOString().replace(/[:.]/g, "_")}`,
    originalRequestSummary: input.originalRequestSummary.trim(),
    options: input.options,
    createdAt,
    expiresAt,
  };

  writeState({
    pendingShortlist: shortlist,
    updatedAt: createdAt,
  });

  return shortlist;
}

export function clearPendingShortlist(shortlistId?: string): string | null {
  const state = readState();
  const current = state.pendingShortlist;

  if (!current) {
    return null;
  }

  if (shortlistId && current.shortlistId !== shortlistId) {
    return null;
  }

  writeState({
    pendingShortlist: null,
    updatedAt: new Date().toISOString(),
  });

  return current.shortlistId;
}
