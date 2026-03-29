import fs from "node:fs";
import path from "node:path";

type UnknownRecord = Record<string, unknown>;

type SessionContentPart = {
  type?: string;
  text?: string;
};

type SessionMessage = {
  role?: string;
  content?: SessionContentPart[];
};

export type SessionEntry = {
  type?: string;
  timestamp?: string;
  message?: SessionMessage;
};

export interface AwaitSessionJsonInput {
  sessionKey: string;
  runId?: string;
  expectedAction: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxRuntimeMs?: number;
}

export interface ResetSessionInput {
  sessionKey: string;
}

export type ResetSessionResult = {
  ok: true;
  status: "RESET" | "NO_SESSION";
  sessionKey: string;
  storePath: string;
  previousSessionFile?: string | null;
  archivedSessionFile?: string | null;
};

export type AwaitSessionJsonResult =
  | {
      ok: true;
      status: "FOUND";
      sessionKey: string;
      payloadText: string;
      messageTimestamp: string | null;
      sessionFile: string;
    }
  | {
      ok: false;
      status: "MALFORMED";
      sessionKey: string;
      error: string;
      rawText: string;
      messageTimestamp: string | null;
      sessionFile: string;
    }
  | {
      ok: false;
      status: "TIMEOUT";
      sessionKey: string;
      error: string;
      sessionFile?: string;
    };

type ReplySearchResult =
  | {
      status: "FOUND";
      payloadText: string;
      messageTimestamp: string | null;
    }
  | {
      status: "MALFORMED";
      rawText: string;
      messageTimestamp: string | null;
    }
  | {
      status: "PENDING";
    };

export type RequestSearchResult = {
  payloadText: string;
  messageTimestamp: string | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function agentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");

  if (parts.length < 3 || parts[0] !== "agent" || parts[1]!.trim().length === 0) {
    throw new Error(`Invalid agent session key: ${sessionKey}`);
  }

  return parts[1]!;
}

function openClawStateDir(): string {
  return process.env.OPENCLAW_STATE_DIR || "/home/openclaw/.openclaw";
}

function sessionStorePath(sessionKey: string): string {
  return path.join(
    openClawStateDir(),
    "agents",
    agentIdFromSessionKey(sessionKey),
    "sessions",
    "sessions.json",
  );
}

function resolveSessionFile(sessionKey: string): string | null {
  const storePath = sessionStorePath(sessionKey);

  if (!fs.existsSync(storePath)) {
    return null;
  }

  const raw = fs.readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`Session store is not a JSON object: ${storePath}`);
  }

  const record = parsed[sessionKey];
  if (!isRecord(record) || typeof record.sessionFile !== "string" || record.sessionFile.length === 0) {
    return null;
  }

  return record.sessionFile;
}

function readSessionStore(storePath: string): UnknownRecord {
  if (!fs.existsSync(storePath)) {
    return {};
  }

  const raw = fs.readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`Session store is not a JSON object: ${storePath}`);
  }

  return parsed;
}

function writeSessionStore(storePath: string, value: UnknownRecord): void {
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function archivePathFor(sessionFile: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${sessionFile}.reset.${stamp}`;
}

export function resetAgentSession(input: ResetSessionInput): ResetSessionResult {
  const storePath = sessionStorePath(input.sessionKey);
  const store = readSessionStore(storePath);
  const current = store[input.sessionKey];

  if (!isRecord(current)) {
    return {
      ok: true,
      status: "NO_SESSION",
      sessionKey: input.sessionKey,
      storePath,
      previousSessionFile: null,
      archivedSessionFile: null,
    };
  }

  const previousSessionFile =
    typeof current.sessionFile === "string" && current.sessionFile.length > 0
      ? current.sessionFile
      : null;
  let archivedSessionFile: string | null = null;

  if (previousSessionFile && fs.existsSync(previousSessionFile)) {
    archivedSessionFile = archivePathFor(previousSessionFile);
    fs.renameSync(previousSessionFile, archivedSessionFile);
  }

  delete store[input.sessionKey];
  writeSessionStore(storePath, store);

  return {
    ok: true,
    status: "RESET",
    sessionKey: input.sessionKey,
    storePath,
    previousSessionFile,
    archivedSessionFile,
  };
}

function parseJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const candidates: string[] = [];
  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];

  for (const match of fencedMatches) {
    if (match[1]) {
      candidates.push(match[1].trim());
    }
  }

  candidates.push(trimmed);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Keep trying smaller candidates.
    }
  }

  return null;
}

function extractTextParts(entry: SessionEntry): string[] {
  if (entry.type !== "message" || entry.message?.content === undefined) {
    return [];
  }

  return entry.message.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter((text) => text.length > 0);
}

function isMatchingRequest(
  entry: SessionEntry,
  runId: string | undefined,
  expectedAction: string,
): boolean {
  if (entry.type !== "message" || entry.message?.role !== "user") {
    return false;
  }

  for (const text of extractTextParts(entry)) {
    const candidate = parseJsonCandidate(text);
    if (!candidate) {
      const actionRegex = new RegExp(`"action"\\s*:\\s*"${escapeRegex(expectedAction)}"`);
      if (!actionRegex.test(text)) {
        continue;
      }

      if (runId !== undefined) {
        const runIdRegex = new RegExp(`"runId"\\s*:\\s*"${escapeRegex(runId)}"`);
        const anyRunIdRegex = /"runId"\s*:/;
        if (anyRunIdRegex.test(text) && !runIdRegex.test(text)) {
          continue;
        }
      }

      return true;
    }

    const parsed = JSON.parse(candidate) as unknown;
    if (!isRecord(parsed) || parsed.action !== expectedAction) {
      continue;
    }

    if (runId !== undefined) {
      if (Object.prototype.hasOwnProperty.call(parsed, "runId")) {
        if (parsed.runId !== runId) {
          continue;
        }
      }
    }

    return true;
  }

  return false;
}

function isSkippableControlText(text: string): boolean {
  return text === "ANNOUNCE_SKIP" || text === "REPLY_SKIP";
}

export function findRunScopedAssistantReply(
  entries: SessionEntry[],
  runId: string | undefined,
  expectedAction: string,
): ReplySearchResult {
  if (runId === undefined && expectedAction.trim().length === 0) {
    throw new Error("expectedAction is required when runId is omitted.");
  }

  const findRequestIndex = (candidateRunId: string | undefined): number => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (isMatchingRequest(entries[index]!, candidateRunId, expectedAction)) {
        return index;
      }
    }

    return -1;
  };

  let requestIndex = findRequestIndex(runId);
  if (requestIndex === -1 && runId !== undefined) {
    requestIndex = findRequestIndex(undefined);
  }

  if (requestIndex === -1) {
    return { status: "PENDING" };
  }

  let latestMalformed: ReplySearchResult | null = null;

  for (let index = requestIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.type !== "message" || entry.message?.role !== "assistant") {
      continue;
    }

    for (const text of extractTextParts(entry)) {
      if (isSkippableControlText(text)) {
        continue;
      }

      const payloadText = parseJsonCandidate(text);
      if (payloadText) {
        return {
          status: "FOUND",
          payloadText,
          messageTimestamp: entry.timestamp ?? null,
        };
      }

      latestMalformed = {
        status: "MALFORMED",
        rawText: text,
        messageTimestamp: entry.timestamp ?? null,
      };
    }
  }

  return latestMalformed ?? { status: "PENDING" };
}

export function findRunScopedRequestJson(
  entries: SessionEntry[],
  runId: string | undefined,
  expectedAction: string,
): RequestSearchResult | null {
  if (runId === undefined && expectedAction.trim().length === 0) {
    throw new Error("expectedAction is required when runId is omitted.");
  }

  const findRequestIndex = (candidateRunId: string | undefined): number => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (isMatchingRequest(entries[index]!, candidateRunId, expectedAction)) {
        return index;
      }
    }

    return -1;
  };

  let requestIndex = findRequestIndex(runId);
  if (requestIndex === -1 && runId !== undefined) {
    requestIndex = findRequestIndex(undefined);
  }

  if (requestIndex === -1) {
    return null;
  }

  const entry = entries[requestIndex]!;
  for (const text of extractTextParts(entry)) {
    const candidate = parseJsonCandidate(text);
    if (!candidate) {
      continue;
    }

    const parsed = JSON.parse(candidate) as unknown;
    if (!isRecord(parsed) || parsed.action !== expectedAction) {
      continue;
    }

    if (runId !== undefined && Object.prototype.hasOwnProperty.call(parsed, "runId") && parsed.runId !== runId) {
      continue;
    }

    return {
      payloadText: candidate,
      messageTimestamp: entry.timestamp ?? null,
    };
  }

  return null;
}

function parseSessionEntries(sessionFile: string): SessionEntry[] {
  const raw = fs.readFileSync(sessionFile, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const entries: SessionEntry[] = [];

  for (const line of lines) {
    const parsed = JSON.parse(line) as unknown;
    if (isRecord(parsed)) {
      entries.push(parsed as SessionEntry);
    }
  }

  return entries;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sessionFileFingerprint(sessionFile: string): string | null {
  if (!fs.existsSync(sessionFile)) {
    return null;
  }

  const stat = fs.statSync(sessionFile);
  return `${stat.size}:${stat.mtimeMs}`;
}

export async function awaitRunScopedAssistantJson(
  input: AwaitSessionJsonInput,
): Promise<AwaitSessionJsonResult> {
  if (input.expectedAction.trim().length === 0) {
    throw new Error("expectedAction must be a non-empty string.");
  }

  const idleTimeoutMs = input.timeoutMs ?? 45000;
  const pollIntervalMs = input.pollIntervalMs ?? 1000;
  const maxRuntimeMs = input.maxRuntimeMs ?? Math.max(idleTimeoutMs * 4, 180000);
  const startedAt = Date.now();
  let lastActivityAt = startedAt;
  let lastFingerprint: string | null = null;

  while (Date.now() - startedAt <= maxRuntimeMs) {
    const sessionFile = resolveSessionFile(input.sessionKey);

    if (sessionFile && fs.existsSync(sessionFile)) {
      const fingerprint = sessionFileFingerprint(sessionFile);
      if (fingerprint && fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        lastActivityAt = Date.now();
      }

      const entries = parseSessionEntries(sessionFile);
      const result = findRunScopedAssistantReply(entries, input.runId, input.expectedAction);

      if (result.status === "FOUND") {
        return {
          ok: true,
          status: "FOUND",
          sessionKey: input.sessionKey,
          payloadText: result.payloadText,
          messageTimestamp: result.messageTimestamp,
          sessionFile,
        };
      }

      if (result.status === "MALFORMED") {
        return {
          ok: false,
          status: "MALFORMED",
          sessionKey: input.sessionKey,
          error: "Downstream assistant replied with non-JSON text.",
          rawText: result.rawText,
          messageTimestamp: result.messageTimestamp,
          sessionFile,
        };
      }
    }

    if (Date.now() - lastActivityAt >= idleTimeoutMs) {
      return {
        ok: false,
        status: "TIMEOUT",
        sessionKey: input.sessionKey,
        error: "Timed out waiting for a downstream JSON reply after session inactivity.",
        sessionFile: resolveSessionFile(input.sessionKey) ?? undefined,
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    status: "TIMEOUT",
    sessionKey: input.sessionKey,
    error: "Timed out waiting for a downstream JSON reply after max runtime.",
    sessionFile: resolveSessionFile(input.sessionKey) ?? undefined,
  };
}

export function readRunScopedRequestPayload(
  input: Pick<AwaitSessionJsonInput, "sessionKey" | "runId" | "expectedAction">,
): RequestSearchResult | null {
  const sessionFile = resolveSessionFile(input.sessionKey);
  if (!sessionFile || !fs.existsSync(sessionFile)) {
    return null;
  }

  const entries = parseSessionEntries(sessionFile);
  return findRunScopedRequestJson(entries, input.runId, input.expectedAction);
}
