import { z } from "zod";

export const PROPERTY_KEYS = [
  "name",
  "linkedinUrl",
  "company",
  "role",
  "type",
  "region",
  "fitScore",
  "status",
  "sourceNotes",
  "hook1",
  "hook2",
  "fitSummary",
  "connectionNoteDraft",
  "dmDraft",
  "followup1Draft",
  "followup2Draft",
  "lastReplySummary",
  "interactionLog",
  "lastTouchAt",
  "nextActionAt",
  "nextActionType",
  "cvSent",
  "cvUrl",
] as const;

export type PropertyKey = (typeof PROPERTY_KEYS)[number];

export const DEFAULT_PROPERTY_MAP: Record<PropertyKey, string> = {
  name: "Name",
  linkedinUrl: "LinkedIn URL",
  company: "Company",
  role: "Role",
  type: "Type",
  region: "Region",
  fitScore: "Fit Score",
  status: "Status",
  sourceNotes: "Source Notes",
  hook1: "Hook 1",
  hook2: "Hook 2",
  fitSummary: "Fit Summary",
  connectionNoteDraft: "Connection Note Draft",
  dmDraft: "DM Draft",
  followup1Draft: "Followup 1 Draft",
  followup2Draft: "Followup 2 Draft",
  lastReplySummary: "Last Reply Summary",
  interactionLog: "Interaction Log",
  lastTouchAt: "Last Touch At",
  nextActionAt: "Next Action At",
  nextActionType: "Next Action Type",
  cvSent: "CV Sent",
  cvUrl: "CV URL",
};

const PropertyKeySchema = z.enum(PROPERTY_KEYS);

const PropertyMapSchema = z
  .object(
    Object.fromEntries(PROPERTY_KEYS.map((key) => [key, z.string().min(1).optional()])) as Record<
      PropertyKey,
      z.ZodTypeAny
    >,
  )
  .strict();

export const NotionCrmWriterPluginConfigSchema = z
  .object({
    notionVersion: z.string().min(1),
    databaseId: z.string().min(1).optional(),
    dataSourceId: z.string().min(1).optional(),
    propertyMap: PropertyMapSchema,
    optionalFields: z.array(PropertyKeySchema),
    typeValues: z
      .object({
        person: z.string().min(1),
        company: z.string().min(1),
      })
      .strict(),
    defaultStatusValue: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.databaseId && !value.dataSourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either databaseId or dataSourceId must be configured.",
      });
    }
  });

export type NotionCrmWriterPluginConfig = z.infer<typeof NotionCrmWriterPluginConfigSchema>;

export function resolvePropertyName(
  config: NotionCrmWriterPluginConfig,
  key: PropertyKey,
): string {
  return config.propertyMap[key] ?? DEFAULT_PROPERTY_MAP[key];
}
