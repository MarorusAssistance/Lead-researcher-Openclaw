import fs from "node:fs";
import path from "node:path";

export type CampaignStatus = "ACTIVE" | "STOPPED" | "DONE";

export interface CampaignState {
  status: CampaignStatus;
  targetCount: number;
  insertedCount: number;
  failedCount: number;
  searchedNames: string[];
  registeredNames: string[];
  updatedAt: string;
}

export interface ProspectingStateFile {
  campaigns: Record<string, CampaignState>;
}

const DATA_DIR =
  process.env.NOTION_RECRUITER_CRM_DATA_DIR ||
  "/home/openclaw/.openclaw/.openclaw/plugin-state/notion-recruiter-crm";

const STATE_PATH =
  process.env.PROSPECTING_STATE_PATH ||
  path.join(DATA_DIR, "prospecting-state.json");

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultState(): ProspectingStateFile {
  return { campaigns: {} };
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

export function loadState(): ProspectingStateFile {
  ensureDir();

  if (!fs.existsSync(STATE_PATH)) {
    const initial = defaultState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  const raw = fs.readFileSync(STATE_PATH, "utf8");
  const parsed = JSON.parse(raw) as ProspectingStateFile;

  if (!parsed.campaigns || typeof parsed.campaigns !== "object") {
    return defaultState();
  }

  return parsed;
}

export function saveState(state: ProspectingStateFile): void {
  ensureDir();
  const tempPath = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tempPath, STATE_PATH);
}