import { Type, type Static } from "@sinclair/typebox";

export const PLUGIN_ID = "notion-recruiter-crm";
export const PLUGIN_NAME = "Notion Recruiter CRM";
export const PLUGIN_DESCRIPTION = "CRUD y seguimiento de recruiters en Notion";

export const PluginConfigSchema = Type.Object(
  {
    databaseId: Type.String({
      minLength: 1,
      description: "Notion database ID copied from the database URL.",
    }),
  },
  {
    additionalProperties: false,
  },
);

export type PluginConfig = Static<typeof PluginConfigSchema>;

export const RecruiterTypeSchema = Type.Union([
  Type.Literal("in_house"),
  Type.Literal("agency"),
]);

export const TouchChannelSchema = Type.Union([
  Type.Literal("linkedin"),
  Type.Literal("email"),
  Type.Literal("other"),
]);

export const TouchTypeSchema = Type.Union([
  Type.Literal("connection_request"),
  Type.Literal("dm"),
  Type.Literal("followup"),
  Type.Literal("reply"),
  Type.Literal("cv_sent"),
  Type.Literal("other"),
]);

const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const NullableBooleanSchema = Type.Union([Type.Boolean(), Type.Null()]);
const NullableNumberSchema = Type.Union([Type.Number(), Type.Null()]);

export const UpsertRecruiterSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    linkedinUrl: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
    company: Type.Optional(NullableStringSchema),
    role: Type.Optional(NullableStringSchema),
    recruiterType: Type.Optional(Type.Union([RecruiterTypeSchema, Type.Null()])),
    region: Type.Optional(NullableStringSchema),
    fitScore: Type.Optional(NullableNumberSchema),
    status: Type.Optional(NullableStringSchema),
    sourceNotes: Type.Optional(NullableStringSchema),
    hook1: Type.Optional(NullableStringSchema),
    hook2: Type.Optional(NullableStringSchema),
    fitSummary: Type.Optional(NullableStringSchema),
    connectionNoteDraft: Type.Optional(NullableStringSchema),
    dmDraft: Type.Optional(NullableStringSchema),
    emailSubjectDraft: Type.Optional(NullableStringSchema),
    emailBodyDraft: Type.Optional(NullableStringSchema),
    followup1Draft: Type.Optional(NullableStringSchema),
    followup2Draft: Type.Optional(NullableStringSchema),
    lastReplySummary: Type.Optional(NullableStringSchema),
    interactionLog: Type.Optional(NullableStringSchema),
    lastTouchAt: Type.Optional(NullableStringSchema),
    nextActionAt: Type.Optional(NullableStringSchema),
    nextActionType: Type.Optional(NullableStringSchema),
    cvSent: Type.Optional(NullableBooleanSchema),
    cvUrl: Type.Optional(NullableStringSchema),
    cvUrlEn: Type.Optional(NullableStringSchema),
    cvUrlEs: Type.Optional(NullableStringSchema),
  },
  { additionalProperties: false },
);

export const GetRecruiterSchema = Type.Object(
  {
    linkedinUrl: Type.Optional(Type.String({ minLength: 1 })),
    pageId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const QueryDueFollowupsSchema = Type.Object(
  {
    beforeIso: Type.Optional(Type.String({ minLength: 1 })),
    statuses: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 50 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

export const SaveResearchSchema = Type.Object(
  {
    linkedinUrl: Type.String({ minLength: 1 }),
  sourceNotes: Type.Optional(Type.String()),
  hook1: Type.Optional(Type.String()),
  hook2: Type.Optional(Type.String()),
  fitSummary: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const SaveDraftsSchema = Type.Object(
  {
    linkedinUrl: Type.String({ minLength: 1 }),
    connectionNoteDraft: Type.Optional(Type.String()),
    dmDraft: Type.Optional(Type.String()),
    emailSubjectDraft: Type.Optional(Type.String()),
    emailBodyDraft: Type.Optional(Type.String()),
    followup1Draft: Type.Optional(Type.String()),
    followup2Draft: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const LogTouchpointSchema = Type.Object(
  {
    linkedinUrl: Type.String({ minLength: 1 }),
    channel: TouchChannelSchema,
    touchType: TouchTypeSchema,
    atIso: Type.String({ minLength: 1 }),
    summary: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const MarkStatusSchema = Type.Object(
  {
    linkedinUrl: Type.String({ minLength: 1 }),
    status: Type.String({ minLength: 1 }),
    lastReplySummary: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ScheduleNextActionSchema = Type.Object(
  {
    linkedinUrl: Type.String({ minLength: 1 }),
    nextActionType: Type.String({ minLength: 1 }),
    nextActionAtIso: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const AttachCvSchema = Type.Object(
  {
    linkedinUrl: Type.String({ minLength: 1 }),
    cvUrl: Type.String({ minLength: 1 }),
    cvSent: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export type UpsertRecruiterInput = Static<typeof UpsertRecruiterSchema>;
export type GetRecruiterInput = Static<typeof GetRecruiterSchema>;
export type QueryDueFollowupsInput = Static<typeof QueryDueFollowupsSchema>;
export type SaveResearchInput = Static<typeof SaveResearchSchema>;
export type SaveDraftsInput = Static<typeof SaveDraftsSchema>;
export type LogTouchpointInput = Static<typeof LogTouchpointSchema>;
export type MarkStatusInput = Static<typeof MarkStatusSchema>;
export type ScheduleNextActionInput = Static<typeof ScheduleNextActionSchema>;
export type AttachCvInput = Static<typeof AttachCvSchema>;

export const PROPERTY_NAMES = {
  name: "Name",
  linkedinUrl: "LinkedIn URL",
  company: "Company",
  role: "Role",
  recruiterType: "Type",
  region: "Region",
  fitScore: "Fit Score",
  status: "Status",
  sourceNotes: "Source Notes",
  hook1: "Hook 1",
  hook2: "Hook 2",
  fitSummary: "Fit Summary",
  connectionNoteDraft: "Connection Note Draft",
  dmDraft: "DM Draft",
  emailSubjectDraft: "Email Subject Draft",
  emailBodyDraft: "Email Body Draft",
  followup1Draft: "Follow Up 1 Draft",
  followup2Draft: "Follow Up 2 Draft",
  lastReplySummary: "Last Reply Summary",
  interactionLog: "Interaction Log",
  lastTouchAt: "Last Touch At",
  nextActionAt: "Next Action At",
  nextActionType: "Next Action Type",
  cvSent: "CV Sent",
  cvUrl: "CV URL",
  cvUrlEn: "CV URL EN",
  cvUrlEs: "CV URL ES",
} as const;

export type RecruiterFieldKey = keyof typeof PROPERTY_NAMES;

export type WritablePropertyType =
  | "title"
  | "rich_text"
  | "url"
  | "number"
  | "checkbox"
  | "date"
  | "select"
  | "status";

export type RecruiterPropertySpec = {
  notionName: string;
  aliases?: readonly string[];
  allowedTypes: readonly WritablePropertyType[];
  requiredOnCreate?: boolean;
  fallbackToAnyTitle?: boolean;
};

export const RECRUITER_PROPERTY_SPECS = {
  name: {
    notionName: PROPERTY_NAMES.name,
    allowedTypes: ["title"],
    requiredOnCreate: true,
    fallbackToAnyTitle: true,
  },
  linkedinUrl: {
    notionName: PROPERTY_NAMES.linkedinUrl,
    allowedTypes: ["url"],
  },
  company: {
    notionName: PROPERTY_NAMES.company,
    allowedTypes: ["rich_text"],
  },
  role: {
    notionName: PROPERTY_NAMES.role,
    allowedTypes: ["rich_text"],
  },
  recruiterType: {
    notionName: PROPERTY_NAMES.recruiterType,
    allowedTypes: ["select"],
  },
  region: {
    notionName: PROPERTY_NAMES.region,
    allowedTypes: ["rich_text"],
  },
  fitScore: {
    notionName: PROPERTY_NAMES.fitScore,
    allowedTypes: ["number"],
  },
  status: {
    notionName: PROPERTY_NAMES.status,
    allowedTypes: ["select", "status"],
  },
  sourceNotes: {
    notionName: PROPERTY_NAMES.sourceNotes,
    allowedTypes: ["rich_text"],
  },
  hook1: {
    notionName: PROPERTY_NAMES.hook1,
    allowedTypes: ["rich_text"],
  },
  hook2: {
    notionName: PROPERTY_NAMES.hook2,
    allowedTypes: ["rich_text"],
  },
  fitSummary: {
    notionName: PROPERTY_NAMES.fitSummary,
    allowedTypes: ["rich_text"],
  },
  connectionNoteDraft: {
    notionName: PROPERTY_NAMES.connectionNoteDraft,
    allowedTypes: ["rich_text"],
  },
  dmDraft: {
    notionName: PROPERTY_NAMES.dmDraft,
    allowedTypes: ["rich_text"],
  },
  emailSubjectDraft: {
    notionName: PROPERTY_NAMES.emailSubjectDraft,
    allowedTypes: ["rich_text"],
  },
  emailBodyDraft: {
    notionName: PROPERTY_NAMES.emailBodyDraft,
    allowedTypes: ["rich_text"],
  },
  followup1Draft: {
    notionName: PROPERTY_NAMES.followup1Draft,
    aliases: ["Followup 1 Draft"],
    allowedTypes: ["rich_text"],
  },
  followup2Draft: {
    notionName: PROPERTY_NAMES.followup2Draft,
    aliases: ["Followup 2 Draft"],
    allowedTypes: ["rich_text"],
  },
  lastReplySummary: {
    notionName: PROPERTY_NAMES.lastReplySummary,
    allowedTypes: ["rich_text"],
  },
  interactionLog: {
    notionName: PROPERTY_NAMES.interactionLog,
    allowedTypes: ["rich_text"],
  },
  lastTouchAt: {
    notionName: PROPERTY_NAMES.lastTouchAt,
    allowedTypes: ["date"],
  },
  nextActionAt: {
    notionName: PROPERTY_NAMES.nextActionAt,
    allowedTypes: ["date"],
  },
  nextActionType: {
    notionName: PROPERTY_NAMES.nextActionType,
    allowedTypes: ["select"],
  },
  cvSent: {
    notionName: PROPERTY_NAMES.cvSent,
    allowedTypes: ["checkbox"],
  },
  cvUrl: {
    notionName: PROPERTY_NAMES.cvUrl,
    allowedTypes: ["url"],
  },
  cvUrlEn: {
    notionName: PROPERTY_NAMES.cvUrlEn,
    allowedTypes: ["url"],
  },
  cvUrlEs: {
    notionName: PROPERTY_NAMES.cvUrlEs,
    allowedTypes: ["url"],
  },
} as const satisfies Record<RecruiterFieldKey, RecruiterPropertySpec>;

export type NotionSelectOption = {
  id: string;
  name: string;
  color?: string;
};

export type NotionStatusGroup = {
  id: string;
  name: string;
  color?: string;
  optionIds: string[];
};

export type NotionSchemaObservation = {
  key: RecruiterFieldKey;
  notionName: string;
  id: string;
  actualType: string;
};

export type NotionSchemaProperty = {
  key: RecruiterFieldKey;
  notionName: string;
  id: string;
  type: WritablePropertyType;
  actualType: WritablePropertyType;
  options?: NotionSelectOption[];
  groups?: NotionStatusGroup[];
};

export type NotionSchemaSnapshot = {
  databaseId: string;
  dataSourceId: string;
  databaseTitle: string | null;
  loadedAt: string;
  propertiesByKey: Partial<Record<RecruiterFieldKey, NotionSchemaProperty>>;
  observedByKey: Partial<Record<RecruiterFieldKey, NotionSchemaObservation>>;
  propertiesByName: Record<string, NotionSchemaProperty>;
  rawPropertyTypes: Record<string, string>;
};

export type SchemaValidationProblem = {
  key: RecruiterFieldKey;
  notionName: string;
  reason: "missing" | "wrong_type";
  expectedTypes: WritablePropertyType[];
  actualType?: string;
};

export type RecruiterPropertyValues = {
  name?: string | null;
  linkedinUrl?: string | null;
  company?: string | null;
  role?: string | null;
  recruiterType?: string | null;
  region?: string | null;
  fitScore?: number | null;
  status?: string | null;
  sourceNotes?: string | null;
  hook1?: string | null;
  hook2?: string | null;
  fitSummary?: string | null;
  connectionNoteDraft?: string | null;
  dmDraft?: string | null;
  emailSubjectDraft?: string | null;
  emailBodyDraft?: string | null;
  followup1Draft?: string | null;
  followup2Draft?: string | null;
  lastReplySummary?: string | null;
  interactionLog?: string | null;
  lastTouchAt?: string | null;
  nextActionAt?: string | null;
  nextActionType?: string | null;
  cvSent?: boolean | null;
  cvUrl?: string | null;
  cvUrlEn?: string | null;
  cvUrlEs?: string | null;
};

export type RecruiterRecord = {
  pageId: string;
  notionUrl: string | null;
  name: string;
  linkedinUrl: string | null;
  company: string | null;
  role: string | null;
  recruiterType: string | null;
  region: string | null;
  fitScore: number | null;
  status: string | null;
  sourceNotes: string | null;
  hook1: string | null;
  hook2: string | null;
  fitSummary: string | null;
  connectionNoteDraft: string | null;
  dmDraft: string | null;
  emailSubjectDraft: string | null;
  emailBodyDraft: string | null;
  followup1Draft: string | null;
  followup2Draft: string | null;
  lastReplySummary: string | null;
  interactionLog: string | null;
  lastTouchAt: string | null;
  nextActionAt: string | null;
  nextActionType: string | null;
  cvSent: boolean | null;
  cvUrl: string | null;
  cvUrlEn: string | null;
  cvUrlEs: string | null;
};

export type RecruiterSummary = Pick<
  RecruiterRecord,
  | "pageId"
  | "name"
  | "linkedinUrl"
  | "company"
  | "role"
  | "status"
  | "lastTouchAt"
  | "nextActionAt"
  | "nextActionType"
  | "cvSent"
>;

export type PluginErrorCode =
  | "invalid_input"
  | "missing_env"
  | "schema_mismatch"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "bad_response"
  | "bad_request"
  | "unknown";
