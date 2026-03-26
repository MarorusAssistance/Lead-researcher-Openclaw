import type { CompanyEntity, FitAnalysis, PersonEntity, RawEntity } from "./schemas.js";

type SignalRule = {
  label: string;
  weight: number;
  patterns: RegExp[];
};

const SIGNAL_RULES: SignalRule[] = [
  { label: "Recruiting", weight: 22, patterns: [/\brecruit(ing|er|ment)?\b/i, /\btalent acquisition\b/i, /\bsourc(er|ing)\b/i] },
  { label: "Hiring", weight: 20, patterns: [/\bhiring\b/i, /\bjoin our team\b/i, /\bwe(?:'| a)?re hiring\b/i, /\bcontratando\b/i] },
  { label: "Staffing", weight: 16, patterns: [/\bstaffing\b/i, /\bexecutive search\b/i, /\bplacement\b/i] },
  { label: "Talent Ops", weight: 16, patterns: [/\btalent ops?\b/i, /\bpeople ops?\b/i, /\bpeople operations\b/i] },
  { label: "HR Tech", weight: 14, patterns: [/\bhr tech\b/i, /\bapplicant tracking\b/i, /\bats\b/i, /\brecruitment platform\b/i] },
  { label: "GenAI", weight: 24, patterns: [/\bgenai\b/i, /\bgenerative ai\b/i, /\bllm\b/i, /\bai\b/i] },
];

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function preferFirst(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function collectPersonSources(entity: PersonEntity): Array<{ source: string; text: string }> {
  const sources: Array<{ source: string; text: string }> = [];
  const fields = [
    ["headline", entity.headline],
    ["about", entity.about],
    ["currentRole", entity.currentRole],
    ["currentCompany", entity.currentCompany],
  ] as const;

  for (const [source, value] of fields) {
    const cleaned = cleanText(value);
    if (cleaned) {
      sources.push({ source, text: cleaned });
    }
  }

  entity.experience.forEach((entry, index) => {
    const combined = [entry.title, entry.company, entry.description].map(cleanText).filter(Boolean).join(" | ");
    if (combined) {
      sources.push({ source: `experience:${index}`, text: combined });
    }
  });

  return sources;
}

function collectCompanySources(entity: CompanyEntity): Array<{ source: string; text: string }> {
  const sources: Array<{ source: string; text: string }> = [];
  const fields = [
    ["tagline", entity.tagline],
    ["industry", entity.industry],
    ["about", entity.about],
    ["companyName", entity.companyName],
    ["headquarters", entity.headquarters],
  ] as const;

  for (const [source, value] of fields) {
    const cleaned = cleanText(value);
    if (cleaned) {
      sources.push({ source, text: cleaned });
    }
  }

  entity.specialties.forEach((specialty) => {
    const cleaned = cleanText(specialty);
    if (cleaned) {
      sources.push({ source: "specialty", text: cleaned });
    }
  });

  return sources;
}

function matchSignals(sources: Array<{ source: string; text: string }>) {
  const matches: Array<{ label: string; weight: number; source: string }> = [];

  for (const { source, text } of sources) {
    for (const rule of SIGNAL_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        matches.push({ label: rule.label, weight: rule.weight, source });
      }
    }
  }

  const deduped = new Map<string, { label: string; weight: number; source: string }>();
  for (const match of matches) {
    const key = `${match.label}:${match.source}`;
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }

  return [...deduped.values()];
}

function scoreFromMatches(matchCount: number, totalWeight: number, hasSubstantialData: boolean): number | null {
  if (matchCount === 0) {
    return hasSubstantialData ? 15 : null;
  }

  return Math.max(0, Math.min(100, totalWeight));
}

function strongestHooks(matches: Array<{ label: string; source: string; weight: number }>): [string | null, string | null] {
  const top = [...matches].sort((left, right) => right.weight - left.weight).slice(0, 2);
  return [
    top[0] ? `Senal detectada: ${top[0].label} en ${top[0].source}.` : null,
    top[1] ? `Senal detectada: ${top[1].label} en ${top[1].source}.` : null,
  ];
}

function summary(labels: string[], emptyMessage: string): string {
  return labels.length > 0 ? `Se detectaron senales de ${labels.join(", ")}.` : emptyMessage;
}

export function analyzeEntityFit(rawEntity: RawEntity): FitAnalysis {
  if (rawEntity.entityType === "person") {
    const matches = matchSignals(collectPersonSources(rawEntity));
    const labels = unique(matches.map((match) => match.label));
    const [hook1, hook2] = strongestHooks(matches);
    const fitScore = scoreFromMatches(
      matches.length,
      matches.reduce((sum, match) => sum + match.weight, 0),
      Boolean(rawEntity.headline || rawEntity.about || rawEntity.currentRole || rawEntity.currentCompany || rawEntity.experience.length > 0),
    );

    return {
      fitScore,
      fitSummary: labels.length > 0 ? `Perfil con senales de ${labels.join(", ")}.` : "Perfil con poca evidencia especifica para recruiting o GenAI aplicada a recruiting.",
      hook1,
      hook2,
      sourceNotes: [
        rawEntity.fullName ? `Perfil: ${rawEntity.fullName}.` : null,
        rawEntity.currentRole ? `Rol actual: ${rawEntity.currentRole}.` : null,
        rawEntity.currentCompany ? `Empresa actual: ${rawEntity.currentCompany}.` : null,
        rawEntity.location ? `Ubicacion: ${rawEntity.location}.` : null,
        summary(labels, "No se detectaron senales fuertes de recruiting, staffing, HR tech o GenAI aplicada a recruiting."),
      ].filter(Boolean).join(" ") || null,
      region: preferFirst(rawEntity.regionGuess, rawEntity.location),
      company: preferFirst(rawEntity.currentCompany, rawEntity.companyGuess),
      role: preferFirst(rawEntity.currentRole, rawEntity.headline),
      type: "Person",
    };
  }

  const matches = matchSignals(collectCompanySources(rawEntity));
  const labels = unique(matches.map((match) => match.label));
  const [hook1, hook2] = strongestHooks(matches);
  const fitScore = scoreFromMatches(
    matches.length,
    matches.reduce((sum, match) => sum + match.weight, 0),
    Boolean(rawEntity.tagline || rawEntity.about || rawEntity.industry || rawEntity.specialties.length > 0),
  );

  return {
    fitScore,
    fitSummary: labels.length > 0 ? `Empresa con senales de ${labels.join(", ")}.` : "Empresa con informacion limitada y sin senales fuertes de recruiting o GenAI aplicada a recruiting.",
    hook1,
    hook2,
    sourceNotes: [
      rawEntity.companyName ? `Empresa: ${rawEntity.companyName}.` : null,
      rawEntity.tagline ? `Tagline: ${rawEntity.tagline}.` : null,
      rawEntity.industry ? `Industria: ${rawEntity.industry}.` : null,
      rawEntity.headquarters ? `Sede: ${rawEntity.headquarters}.` : null,
      summary(labels, "No se detectaron senales fuertes de recruiting, staffing, HR tech o GenAI aplicada a recruiting."),
    ].filter(Boolean).join(" ") || null,
    region: preferFirst(rawEntity.regionGuess, rawEntity.headquarters),
    company: preferFirst(rawEntity.companyName),
    role: preferFirst(rawEntity.tagline),
    type: "Company",
  };
}
