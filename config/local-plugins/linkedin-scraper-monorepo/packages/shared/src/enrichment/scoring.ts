import { deriveRegionFromFields, normalizeCompanyGuess } from "../normalizers/linkedin.js";
import { cleanText, preferFirstNonEmpty } from "../normalizers/text.js";
import type { CompanyEntity, FitAnalysis, PersonEntity, RawEntity } from "../schemas/entities.js";

type SignalCategory =
  | "hiring"
  | "recruiting"
  | "staffing"
  | "talent_ops"
  | "hr_tech"
  | "genai_recruiting";

type SignalRule = {
  category: SignalCategory;
  label: string;
  weight: number;
  patterns: RegExp[];
};

type MatchedSignal = {
  category: SignalCategory;
  label: string;
  weight: number;
  source: string;
};

const SIGNAL_RULES: SignalRule[] = [
  {
    category: "recruiting",
    label: "recruiting",
    weight: 22,
    patterns: [
      /\brecruit(ing|er|ment)?\b/i,
      /\btalent acquisition\b/i,
      /\btechnical sourcer\b/i,
      /\bsourcer\b/i,
    ],
  },
  {
    category: "hiring",
    label: "hiring",
    weight: 20,
    patterns: [
      /\bhiring\b/i,
      /\bwe(?:'| a)?re hiring\b/i,
      /\bjoin our team\b/i,
      /\bopen roles?\b/i,
    ],
  },
  {
    category: "staffing",
    label: "staffing",
    weight: 16,
    patterns: [
      /\bstaffing\b/i,
      /\bplacement\b/i,
      /\bsearch firm\b/i,
      /\bexecutive search\b/i,
    ],
  },
  {
    category: "talent_ops",
    label: "talent ops",
    weight: 16,
    patterns: [
      /\btalent ops?\b/i,
      /\bpeople ops?\b/i,
      /\bworkforce planning\b/i,
      /\bpeople operations\b/i,
    ],
  },
  {
    category: "hr_tech",
    label: "HR tech",
    weight: 14,
    patterns: [
      /\bhr tech\b/i,
      /\bats\b/i,
      /\brecruitment platform\b/i,
      /\bapplicant tracking\b/i,
    ],
  },
  {
    category: "genai_recruiting",
    label: "GenAI aplicada a recruiting",
    weight: 24,
    patterns: [
      /\bgenai\b/i,
      /\bgenerative ai\b/i,
      /\bllm\b/i,
      /\bai recruiting\b/i,
      /\bai[- ]powered recruiting\b/i,
      /\bmachine learning\b/i,
    ],
  },
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function collectPersonSources(entity: PersonEntity): Array<{ source: string; text: string }> {
  const sources: Array<{ source: string; text: string }> = [];
  const topLevelFields = [
    ["headline", entity.headline],
    ["about", entity.about],
    ["currentRole", entity.currentRole],
    ["currentCompany", entity.currentCompany],
  ] as const;

  for (const [source, value] of topLevelFields) {
    const normalized = cleanText(value);
    if (normalized) {
      sources.push({ source, text: normalized });
    }
  }

  entity.experience.forEach((entry, index) => {
    const combined = [entry.title, entry.company, entry.description]
      .map(cleanText)
      .filter((value): value is string => Boolean(value))
      .join(" | ");

    if (combined.length > 0) {
      sources.push({ source: `experience:${index}`, text: combined });
    }
  });

  return sources;
}

function collectCompanySources(entity: CompanyEntity): Array<{ source: string; text: string }> {
  const sources: Array<{ source: string; text: string }> = [];
  const topLevelFields = [
    ["tagline", entity.tagline],
    ["industry", entity.industry],
    ["about", entity.about],
    ["companyName", entity.companyName],
    ["headquarters", entity.headquarters],
  ] as const;

  for (const [source, value] of topLevelFields) {
    const normalized = cleanText(value);
    if (normalized) {
      sources.push({ source, text: normalized });
    }
  }

  for (const specialty of entity.specialties) {
    sources.push({ source: "specialty", text: specialty });
  }

  return sources;
}

function detectSignals(sources: Array<{ source: string; text: string }>): MatchedSignal[] {
  const matches: MatchedSignal[] = [];

  for (const { source, text } of sources) {
    for (const rule of SIGNAL_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        matches.push({
          category: rule.category,
          label: rule.label,
          weight: rule.weight,
          source,
        });
      }
    }
  }

  const deduped = new Map<string, MatchedSignal>();
  for (const match of matches) {
    const key = `${match.category}:${match.source}`;
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }

  return [...deduped.values()];
}

function toScore(matches: MatchedSignal[], hasSubstantialData: boolean): number | null {
  if (matches.length === 0) {
    return hasSubstantialData ? 15 : null;
  }

  const total = matches.reduce((sum, match) => sum + match.weight, 0);
  return Math.max(0, Math.min(100, total));
}

function topMatches(matches: MatchedSignal[]): MatchedSignal[] {
  return [...matches].sort((left, right) => right.weight - left.weight).slice(0, 2);
}

function formatHook(match: MatchedSignal | undefined): string | null {
  if (!match) {
    return null;
  }

  return `Señal detectada: ${match.label} en ${match.source}.`;
}

function summarizeSignals(matches: MatchedSignal[]): string {
  if (matches.length === 0) {
    return "No se detectaron señales fuertes de recruiting, staffing, HR tech o GenAI aplicada a recruiting.";
  }

  return `Se detectaron señales de ${unique(matches.map((match) => match.label)).join(", ")}.`;
}

function buildPersonSourceNotes(entity: PersonEntity, matches: MatchedSignal[]): string | null {
  const parts = [
    entity.fullName ? `Perfil: ${entity.fullName}.` : null,
    entity.currentRole ? `Rol actual: ${entity.currentRole}.` : null,
    entity.currentCompany ? `Empresa actual: ${entity.currentCompany}.` : null,
    entity.location ? `Ubicación: ${entity.location}.` : null,
    summarizeSignals(matches),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" ") : null;
}

function buildCompanySourceNotes(entity: CompanyEntity, matches: MatchedSignal[]): string | null {
  const parts = [
    entity.companyName ? `Empresa: ${entity.companyName}.` : null,
    entity.tagline ? `Tagline: ${entity.tagline}.` : null,
    entity.industry ? `Industria: ${entity.industry}.` : null,
    entity.headquarters ? `Sede: ${entity.headquarters}.` : null,
    summarizeSignals(matches),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" ") : null;
}

export function derivePersonContactabilitySignals(entity: PersonEntity): string[] {
  const matches = detectSignals(collectPersonSources(entity));
  return unique(matches.map((match) => `Señal ${match.label} en ${match.source}`));
}

export function deriveCompanySignalGroups(entity: CompanyEntity): Pick<
  CompanyEntity,
  "hiringSignals" | "genaiSignals" | "recruitingSignals"
> {
  const matches = detectSignals(collectCompanySources(entity));

  return {
    hiringSignals: unique(
      matches
        .filter((match) => match.category === "hiring")
        .map((match) => `Señal ${match.label} en ${match.source}`),
    ),
    genaiSignals: unique(
      matches
        .filter((match) => match.category === "genai_recruiting")
        .map((match) => `Señal ${match.label} en ${match.source}`),
    ),
    recruitingSignals: unique(
      matches
        .filter((match) =>
          ["recruiting", "staffing", "talent_ops", "hr_tech"].includes(match.category),
        )
        .map((match) => `Señal ${match.label} en ${match.source}`),
    ),
  };
}

export function analyzeEntityFit(rawEntity: RawEntity): FitAnalysis {
  if (rawEntity.entityType === "person") {
    const matches = detectSignals(collectPersonSources(rawEntity));
    const strongest = topMatches(matches);
    const substantialData = Boolean(
      rawEntity.headline ||
        rawEntity.about ||
        rawEntity.currentRole ||
        rawEntity.currentCompany ||
        rawEntity.experience.length > 0,
    );

    return {
      fitScore: toScore(matches, substantialData),
      fitSummary:
        matches.length > 0
          ? `Perfil con señales de ${unique(matches.map((match) => match.label)).join(", ")}.`
          : "Perfil con poca evidencia específica para recruiting o GenAI aplicada a recruiting.",
      hook1: formatHook(strongest[0]),
      hook2: formatHook(strongest[1]),
      sourceNotes: buildPersonSourceNotes(rawEntity, matches),
      region: deriveRegionFromFields(rawEntity.regionGuess, rawEntity.location),
      company: normalizeCompanyGuess(rawEntity.currentCompany ?? rawEntity.companyGuess),
      role: preferFirstNonEmpty(rawEntity.currentRole, rawEntity.headline),
      type: "Person",
    };
  }

  const matches = detectSignals(collectCompanySources(rawEntity));
  const strongest = topMatches(matches);
  const substantialData = Boolean(
    rawEntity.tagline ||
      rawEntity.about ||
      rawEntity.industry ||
      rawEntity.specialties.length > 0 ||
      rawEntity.hiringSignals.length > 0 ||
      rawEntity.genaiSignals.length > 0 ||
      rawEntity.recruitingSignals.length > 0,
  );

  return {
    fitScore: toScore(matches, substantialData),
    fitSummary:
      matches.length > 0
        ? `Empresa con señales de ${unique(matches.map((match) => match.label)).join(", ")}.`
        : "Empresa con información limitada y sin señales fuertes de recruiting o GenAI aplicada a recruiting.",
    hook1: formatHook(strongest[0]),
    hook2: formatHook(strongest[1]),
    sourceNotes: buildCompanySourceNotes(rawEntity, matches),
    region: deriveRegionFromFields(rawEntity.regionGuess, rawEntity.headquarters),
    company: normalizeCompanyGuess(rawEntity.companyName),
    role: preferFirstNonEmpty(rawEntity.tagline),
    type: "Company",
  };
}
