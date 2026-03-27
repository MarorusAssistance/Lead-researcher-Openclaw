import { Value } from "@sinclair/typebox/value";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { appendInteractionLog, normalizeHttpUrl, normalizeLinkedInUrl } from "./property-mappers.js";
import { NotionRecruiterClient, RecruiterPluginError } from "./notion-client.js";
import {
  AttachCvSchema,
  GetRecruiterSchema,
  LogTouchpointSchema,
  MarkStatusSchema,
  PluginConfigSchema,
  QueryDueFollowupsSchema,
  SaveDraftsSchema,
  SaveResearchSchema,
  ScheduleNextActionSchema,
  UpsertRecruiterSchema,
  type AttachCvInput,
  type GetRecruiterInput,
  type LogTouchpointInput,
  type MarkStatusInput,
  type PluginConfig,
  type QueryDueFollowupsInput,
  type RecruiterRecord,
  type SaveDraftsInput,
  type SaveResearchInput,
  type ScheduleNextActionInput,
  type UpsertRecruiterInput,
} from "./types.js";
import { loadState, saveState, normalizeName } from "./prospecting-state.js";

type UpdateAction =
  | "START_CAMPAIGN"
  | "STOP_CAMPAIGN"
  | "LOG_SEARCH"
  | "LOG_REGISTER"
  | "INC_SUCCESS"
  | "INC_FAIL";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

const DEFAULT_STATUS = "To Contact";
const DEFAULT_NEXT_ACTION_TYPE = "connection_request";
const DEFAULT_CV_SENT = false;
const DEFAULT_CV_URL_EN =
  "https://drive.google.com/file/d/1Bkr_O7egJ4lJ_-rhJlMrSt3aTcrG3oU3/view?usp=sharing";
const DEFAULT_CV_URL_ES =
  "https://drive.google.com/file/d/1boKFfBigABiFCJ2RirVB4J2nRybpGbLg/view?usp=sharing";

function parsePluginConfig(pluginConfig: unknown): PluginConfig {
  if (Value.Check(PluginConfigSchema, pluginConfig)) {
    return pluginConfig;
  }

  const issues = [...Value.Errors(PluginConfigSchema, pluginConfig)].map((issue) => issue.message);
  throw new RecruiterPluginError(
    "invalid_input",
    `Invalid plugin config for notion-recruiter-crm: ${issues.join("; ")}`,
    400,
    { issues },
  );
}

function createSuccessResult(text: string, details: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text }],
    details: {
      ok: true,
      ...details,
    },
  };
}

function createErrorResult(error: unknown): ToolResult {
  const normalized = normalizeError(error);

  return {
    content: [{ type: "text", text: normalized.message as string }],
    details: {
      ok: false,
      error: normalized,
    },
  };
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof RecruiterPluginError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "unknown",
      message: error.message,
    };
  }

  return {
    code: "unknown",
    message: String(error),
  };
}

function normalizeLinkedInUrlOrThrow(value: string): string {
  try {
    return normalizeLinkedInUrl(value);
  } catch (error: unknown) {
    throw new RecruiterPluginError(
      "invalid_input",
      error instanceof Error ? error.message : "linkedinUrl is invalid.",
      400,
    );
  }
}

function isNonBlankString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalLinkedInUrl(value: string | null | undefined): string | undefined {
  return isNonBlankString(value) ? normalizeLinkedInUrlOrThrow(value) : undefined;
}

function normalizeHttpUrlOrThrow(value: string, label: string): string {
  try {
    return normalizeHttpUrl(value, label);
  } catch (error: unknown) {
    throw new RecruiterPluginError(
      "invalid_input",
      error instanceof Error ? error.message : `${label} is invalid.`,
      400,
    );
  }
}

function requireIsoDateTime(value: string, label: string): string {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new RecruiterPluginError(
      "invalid_input",
      `${label} must be a valid ISO date/time string.`,
      400,
    );
  }

  return parsed.toISOString();
}

function normalizeOptionalIsoDateTime(
  value: string | null | undefined,
  label: string,
): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isNonBlankString(value)) {
    return undefined;
  }

  return requireIsoDateTime(value, label);
}

function summarizeRecruiter(record: RecruiterRecord): string {
  const parts = [record.name];
  if (record.company) {
    parts.push(`@ ${record.company}`);
  }
  if (record.role) {
    parts.push(`(${record.role})`);
  }
  if (record.status) {
    parts.push(`status=${record.status}`);
  }
  if (record.nextActionAt) {
    parts.push(`next=${record.nextActionAt}`);
  }

  return parts.join(" ");
}

function formatFollowupSummary(items: Array<Record<string, unknown>>, beforeIso: string): string {
  if (items.length === 0) {
    return `No recruiters with follow-ups due on or before ${beforeIso}.`;
  }

  return `Found ${items.length} recruiters with follow-ups due on or before ${beforeIso}.`;
}

async function executeTool(handler: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await handler();
  } catch (error: unknown) {
    return createErrorResult(error);
  }
}

function ensureAtLeastOneProvidedField(
  params: Record<string, unknown>,
  keys: string[],
  message: string,
): void {
  if (!keys.some((key) => Object.prototype.hasOwnProperty.call(params, key))) {
    throw new RecruiterPluginError("invalid_input", message, 400);
  }
}

const ProspectingStateGetSchema = Type.Object({
  campaignId: Type.String({ minLength: 1 }),
});

const ProspectingStateUpdateSchema = Type.Object({
  campaignId: Type.String({ minLength: 1 }),
  action: Type.Union([
    Type.Literal("START_CAMPAIGN"),
    Type.Literal("STOP_CAMPAIGN"),
    Type.Literal("LOG_SEARCH"),
    Type.Literal("LOG_REGISTER"),
    Type.Literal("INC_SUCCESS"),
    Type.Literal("INC_FAIL"),
  ]),
  name: Type.Optional(Type.String({ minLength: 1 })),
  targetCount: Type.Optional(Type.Integer({ minimum: 1 })),
});

export function registerNotionRecruiterTools(api: OpenClawPluginApi): void {
  const config = parsePluginConfig(api.pluginConfig);
  const client = new NotionRecruiterClient(config.databaseId, () => process.env.NOTION_API_KEY, api.logger);

  api.registerTool({
    name: "prospecting_state_get",
    label: "Prospecting State Get",
    description: "Get minimal prospecting state for a campaign.",
    parameters: ProspectingStateGetSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as { campaignId: string };
        const state = loadState();
        const campaign = state.campaigns[params.campaignId];

        if (!campaign) {
          return createSuccessResult(`No state found for campaign ${params.campaignId}.`, {
            status: "NONE",
            campaignId: params.campaignId,
            targetCount: 0,
            insertedCount: 0,
            failedCount: 0,
            searchedNames: [],
            registeredNames: [],
          });
        }

        return createSuccessResult(`Loaded prospecting state for campaign ${params.campaignId}.`, {
          status: campaign.status,
          campaignId: params.campaignId,
          targetCount: campaign.targetCount,
          insertedCount: campaign.insertedCount,
          failedCount: campaign.failedCount,
          searchedNames: campaign.searchedNames,
          registeredNames: campaign.registeredNames,
          updatedAt: campaign.updatedAt,
        });
      });
    },
  });

  api.registerTool({
    name: "prospecting_state_update",
    label: "Prospecting State Update",
    description: "Update minimal prospecting state for a campaign.",
    parameters: ProspectingStateUpdateSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as {
          campaignId: string;
          action: UpdateAction;
          name?: string;
          targetCount?: number;
        };

        const state = loadState();
        const now = new Date().toISOString();

        const campaign =
          state.campaigns[params.campaignId] ??
          (state.campaigns[params.campaignId] = {
            status: "STOPPED",
            targetCount: 0,
            insertedCount: 0,
            failedCount: 0,
            searchedNames: [],
            registeredNames: [],
            updatedAt: now,
          });

        switch (params.action) {
          case "START_CAMPAIGN":
            campaign.status = "ACTIVE";
            campaign.targetCount = params.targetCount ?? campaign.targetCount ?? 0;
            break;

          case "STOP_CAMPAIGN":
            campaign.status =
              campaign.targetCount > 0 && campaign.insertedCount >= campaign.targetCount
                ? "DONE"
                : "STOPPED";
            break;

          case "LOG_SEARCH": {
            if (!params.name) {
              throw new RecruiterPluginError(
                "invalid_input",
                "name is required for LOG_SEARCH",
                400,
              );
            }
            const n = normalizeName(params.name);
            if (n && !campaign.searchedNames.includes(n)) {
              campaign.searchedNames.push(n);
            }
            break;
          }

          case "LOG_REGISTER": {
            if (!params.name) {
              throw new RecruiterPluginError(
                "invalid_input",
                "name is required for LOG_REGISTER",
                400,
              );
            }
            const n = normalizeName(params.name);
            if (n && !campaign.registeredNames.includes(n)) {
              campaign.registeredNames.push(n);
            }
            break;
          }

          case "INC_SUCCESS":
            campaign.insertedCount += 1;
            break;

          case "INC_FAIL":
            campaign.failedCount += 1;
            break;
        }

        if (
          campaign.targetCount > 0 &&
          campaign.insertedCount >= campaign.targetCount
        ) {
          campaign.status = "DONE";
        }

        campaign.updatedAt = now;
        saveState(state);

        return createSuccessResult(`Updated prospecting state for campaign ${params.campaignId}.`, {
          status: "OK",
          campaignId: params.campaignId,
          campaignStatus: campaign.status,
          targetCount: campaign.targetCount,
          insertedCount: campaign.insertedCount,
          failedCount: campaign.failedCount,
          updatedAt: campaign.updatedAt,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_upsert",
    label: "Notion Recruiter Upsert",
    description:
      "Create or update a recruiter page in the configured Notion CRM using LinkedIn URL as the unique key when present.",
    parameters: UpsertRecruiterSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as UpsertRecruiterInput;
        api.logger.debug?.(
          `[notion-recruiter-crm] notion_recruiter_upsert raw params ${JSON.stringify(rawParams)}`,
        );
        const normalizedInput = {
          name: params.name.trim(),
          linkedinUrl: normalizeOptionalLinkedInUrl(params.linkedinUrl),
          company: params.company,
          role: params.role,
          recruiterType: params.recruiterType,
          region: params.region,
          fitScore: params.fitScore,
          status: isNonBlankString(params.status) ? params.status.trim() : DEFAULT_STATUS,
          sourceNotes: params.sourceNotes,
          hook1: params.hook1,
          hook2: params.hook2,
          fitSummary: params.fitSummary,
          connectionNoteDraft: params.connectionNoteDraft,
          dmDraft: params.dmDraft,
          emailSubjectDraft: params.emailSubjectDraft,
          emailBodyDraft: params.emailBodyDraft,
          mailDraft: params.mailDraft,
          followup1Draft: params.followup1Draft,
          followup2Draft: params.followup2Draft,
          lastReplySummary: params.lastReplySummary,
          interactionLog: params.interactionLog,
          lastTouchAt: normalizeOptionalIsoDateTime(params.lastTouchAt, "lastTouchAt"),
          nextActionAt: normalizeOptionalIsoDateTime(params.nextActionAt, "nextActionAt"),
          nextActionType: isNonBlankString(params.nextActionType)
            ? params.nextActionType.trim()
            : DEFAULT_NEXT_ACTION_TYPE,
          cvSent: params.cvSent ?? DEFAULT_CV_SENT,
          cvUrl: params.cvUrl ? normalizeHttpUrlOrThrow(params.cvUrl, "cvUrl") : undefined,
          cvUrlEn:
            params.cvUrlEn === null
              ? null
              : normalizeHttpUrlOrThrow(
                  isNonBlankString(params.cvUrlEn) ? params.cvUrlEn : DEFAULT_CV_URL_EN,
                  "cvUrlEn",
                ),
          cvUrlEs:
            params.cvUrlEs === null
              ? null
              : normalizeHttpUrlOrThrow(
                  isNonBlankString(params.cvUrlEs) ? params.cvUrlEs : DEFAULT_CV_URL_ES,
                  "cvUrlEs",
                ),
        };
        api.logger.debug?.(
          `[notion-recruiter-crm] notion_recruiter_upsert normalized input ${JSON.stringify(normalizedInput)}`,
        );
        const result = await client.upsertRecruiter(normalizedInput);

        return createSuccessResult(
          `${result.action === "created" ? "Created" : "Updated"} recruiter ${summarizeRecruiter(result.recruiter)}.`,
          {
            action: result.action,
            pageId: result.recruiter.pageId,
            summary: summarizeRecruiter(result.recruiter),
            recruiter: result.recruiter,
          },
        );
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_get",
    label: "Notion Recruiter Get",
    description:
      "Fetch a recruiter by LinkedIn URL or Notion page ID and return the normalized CRM record.",
    parameters: GetRecruiterSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as GetRecruiterInput;
        if (!params.linkedinUrl && !params.pageId) {
          throw new RecruiterPluginError(
            "invalid_input",
            "Provide either linkedinUrl or pageId.",
            400,
          );
        }

        const recruiter = params.pageId
          ? await client.getRecruiterByPageId(params.pageId)
          : await client.getRecruiterByLinkedInOrThrow(normalizeLinkedInUrlOrThrow(params.linkedinUrl!));

        if (params.pageId && params.linkedinUrl) {
          const normalizedInput = normalizeLinkedInUrlOrThrow(params.linkedinUrl);
          const normalizedStored = recruiter.linkedinUrl
            ? normalizeLinkedInUrlOrThrow(recruiter.linkedinUrl)
            : null;
          if (normalizedStored && normalizedStored !== normalizedInput) {
            throw new RecruiterPluginError(
              "invalid_input",
              "pageId and linkedinUrl refer to different recruiters.",
              400,
              {
                expectedLinkedInUrl: normalizedStored,
                providedLinkedInUrl: normalizedInput,
              },
            );
          }
        }

        return createSuccessResult(`Loaded recruiter ${summarizeRecruiter(recruiter)}.`, {
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_query_due_followups",
    label: "Notion Recruiter Query Due Followups",
    description:
      "List recruiters whose Next Action At is due before a given ISO timestamp, optionally filtered by status.",
    parameters: QueryDueFollowupsSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as QueryDueFollowupsInput;
        const beforeIso = params.beforeIso
          ? requireIsoDateTime(params.beforeIso, "beforeIso")
          : new Date().toISOString();
        const statuses = params.statuses?.map((value) => value.trim()).filter(Boolean);
        const items = await client.queryDueFollowups({
          beforeIso,
          statuses: statuses && statuses.length > 0 ? statuses : undefined,
          limit: params.limit ?? 20,
        });

        return createSuccessResult(formatFollowupSummary(items, beforeIso), {
          beforeIso,
          count: items.length,
          recruiters: items,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_save_research",
    label: "Notion Recruiter Save Research",
    description:
      "Persist research fields for a recruiter: source notes, hooks, and fit summary.",
    parameters: SaveResearchSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as SaveResearchInput;
        ensureAtLeastOneProvidedField(
          params as Record<string, unknown>,
          ["sourceNotes", "hook1", "hook2", "fitSummary"],
          "Provide at least one research field to update.",
        );

        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            sourceNotes: params.sourceNotes,
            hook1: params.hook1,
            hook2: params.hook2,
            fitSummary: params.fitSummary,
          },
        );

        return createSuccessResult(`Saved research for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_save_drafts",
    label: "Notion Recruiter Save Drafts",
    description: "Persist message drafts for a recruiter in Notion CRM properties.",
    parameters: SaveDraftsSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as SaveDraftsInput;
        ensureAtLeastOneProvidedField(
          params as Record<string, unknown>,
          [
            "connectionNoteDraft",
            "dmDraft",
            "emailSubjectDraft",
            "emailBodyDraft",
            "mailDraft",
            "followup1Draft",
            "followup2Draft",
          ],
          "Provide at least one draft field to update.",
        );

        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            connectionNoteDraft: params.connectionNoteDraft,
            dmDraft: params.dmDraft,
            emailSubjectDraft: params.emailSubjectDraft,
            emailBodyDraft: params.emailBodyDraft,
            mailDraft: params.mailDraft,
            followup1Draft: params.followup1Draft,
            followup2Draft: params.followup2Draft,
          },
        );

        return createSuccessResult(`Saved drafts for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_log_touchpoint",
    label: "Notion Recruiter Log Touchpoint",
    description:
      "Log a recruiter interaction, update Last Touch At, and append a human-readable line to Interaction Log.",
    parameters: LogTouchpointSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as LogTouchpointInput;
        const linkedinUrl = normalizeLinkedInUrlOrThrow(params.linkedinUrl);
        const recruiter = await client.getRecruiterByLinkedInOrThrow(linkedinUrl);
        const atIso = requireIsoDateTime(params.atIso, "atIso");
        const logLine = `[${atIso}] (${params.channel}/${params.touchType}) ${params.summary.trim()}`;
        const updated = await client.updateRecruiterByLinkedIn(linkedinUrl, {
          lastTouchAt: atIso,
          interactionLog: appendInteractionLog(recruiter.interactionLog, logLine),
        });

        return createSuccessResult(`Logged touchpoint for ${summarizeRecruiter(updated)}.`, {
          pageId: updated.pageId,
          recruiter: updated,
          appendedLogLine: logLine,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_mark_status",
    label: "Notion Recruiter Mark Status",
    description:
      "Update the Status property and optionally the Last Reply Summary for a recruiter.",
    parameters: MarkStatusSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as MarkStatusInput;
        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            status: params.status.trim(),
            lastReplySummary: params.lastReplySummary,
          },
        );

        return createSuccessResult(`Updated status for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_schedule_next_action",
    label: "Notion Recruiter Schedule Next Action",
    description: "Set Next Action Type and Next Action At for a recruiter follow-up.",
    parameters: ScheduleNextActionSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as ScheduleNextActionInput;
        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            nextActionType: params.nextActionType.trim(),
            nextActionAt: requireIsoDateTime(params.nextActionAtIso, "nextActionAtIso"),
          },
        );

        return createSuccessResult(`Scheduled next action for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });

  api.registerTool({
    name: "notion_recruiter_attach_cv",
    label: "Notion Recruiter Attach CV",
    description: "Store a CV URL for a recruiter and optionally mark CV Sent.",
    parameters: AttachCvSchema,
    async execute(_toolCallId, rawParams) {
      return executeTool(async () => {
        const params = rawParams as AttachCvInput;
        const recruiter = await client.updateRecruiterByLinkedIn(
          normalizeLinkedInUrlOrThrow(params.linkedinUrl),
          {
            cvUrl: normalizeHttpUrlOrThrow(params.cvUrl, "cvUrl"),
            cvSent: params.cvSent,
          },
        );

        return createSuccessResult(`Attached CV info for ${summarizeRecruiter(recruiter)}.`, {
          pageId: recruiter.pageId,
          recruiter,
        });
      });
    },
  });
}
