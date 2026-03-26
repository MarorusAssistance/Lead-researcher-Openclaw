# LinkedIn Research V1

Monorepo con tres componentes:

- `plugins/linkedin-research`: plugin nativo de OpenClaw que expone tools para `fetch` y `enrich`.
- `workers/linkedin-research-worker`: worker HTTP externo con Fastify + Playwright.
- `plugins/notion-crm-writer`: plugin nativo de OpenClaw que hace upsert en Notion.

La V1 se centra en perfiles personales de LinkedIn y páginas de empresa de LinkedIn. No incluye posts, jobs, mensajes ni automatización de engagement.

## Arquitectura

```text
/
  plugins/
    linkedin-research/
    notion-crm-writer/
  workers/
    linkedin-research-worker/
  packages/
    shared/
```

Separación de responsabilidades:

- `linkedin-research-worker`: navega con sesión legítima, extrae y normaliza.
- `linkedin-research`: valida, llama por HTTP al worker y expone JSON estable.
- `linkedin_entity_enrich`: scoring determinista y enriquecimiento sin LLM.
- `notion-crm-writer`: detecta el schema real de Notion y construye el payload final.

## Requisitos

- Node.js `>= 22.16.0`
- npm `>= 11`
- Un `storageState` válido de LinkedIn
- `NOTION_API_KEY` con acceso a la base de datos o data source

## Instalar dependencias

```bash
npm install
```

Comandos útiles:

```bash
npm run typecheck
npm run build
npm run test
```

## Variables de entorno

Empieza desde [`.env.example`](/c:/Users/maror/Downloads/OPENCLAW_DOCKER_INSTALLER/openclaw-data/.openclaw/local-plugins/linkedin-scraper/.env.example).

Variables más importantes:

- `LINKEDIN_STORAGE_STATE_PATH`: ruta al fichero `storageState`
- `LINKEDIN_USER_AGENT`: user agent opcional
- `LINKEDIN_WORKER_PORT`: puerto del worker
- `LINKEDIN_WORKER_DEBUG`: activa screenshots y HTML dump en éxito
- `LINKEDIN_WORKER_DEBUG_ON_ERROR`: captura artifacts cuando falla
- `NOTION_API_KEY`: token de la integración de Notion

## Capturar `storageState`

El flujo principal de autenticación es persistir una sesión ya iniciada:

```bash
npm run capture-storage-state --workspace linkedin-research-worker
```

Pasos:

1. Define `LINKEDIN_STORAGE_STATE_PATH` apuntando a un fichero fuera de git, por ejemplo `./.secrets/linkedin-storage-state.json`.
2. Ejecuta el script.
3. Se abrirá Chromium.
4. Haz login manual en LinkedIn.
5. Vuelve a la terminal y pulsa Enter para guardar el `storageState`.

## Ejecutar el worker

```bash
npm run dev --workspace linkedin-research-worker
```

Endpoints:

- `GET /healthz`
- `POST /v1/linkedin/profile/fetch`
- `POST /v1/linkedin/company/fetch`

Ejemplo:

```json
{
  "profileUrl": "https://www.linkedin.com/in/ana-lopez/"
}
```

## Instalar los plugins en OpenClaw

Instala cada plugin desde su carpeta:

```powershell
openclaw plugins install -l "C:\Users\maror\Downloads\OPENCLAW_DOCKER_INSTALLER\openclaw-data\.openclaw\local-plugins\linkedin-scraper\plugins\linkedin-research"
openclaw plugins install -l "C:\Users\maror\Downloads\OPENCLAW_DOCKER_INSTALLER\openclaw-data\.openclaw\local-plugins\linkedin-scraper\plugins\notion-crm-writer"
```

Consulta el ejemplo de configuración en [examples/openclaw.config.json](/c:/Users/maror/Downloads/OPENCLAW_DOCKER_INSTALLER/openclaw-data/.openclaw/local-plugins/linkedin-scraper/examples/openclaw.config.json).

Después reinicia el gateway de OpenClaw.

## Tools disponibles

### `linkedin_profile_fetch`

Entrada:

```json
{
  "profileUrl": "https://www.linkedin.com/in/ana-lopez/"
}
```

Salida:

```json
{
  "entityType": "person",
  "fullName": "Ana Lopez",
  "headline": "Senior Recruiter for GenAI teams",
  "location": "Madrid, Spain",
  "about": "Hiring applied AI engineers and building talent acquisition processes.",
  "currentCompany": "Acme AI",
  "currentRole": "Senior Recruiter",
  "experience": [],
  "education": [],
  "skills": [],
  "profileUrl": "https://www.linkedin.com/in/ana-lopez/",
  "companyGuess": "Acme AI",
  "regionGuess": "Madrid, Spain",
  "contactabilitySignals": []
}
```

### `linkedin_company_fetch`

Entrada:

```json
{
  "companyUrl": "https://www.linkedin.com/company/talentflow/"
}
```

### `linkedin_entity_enrich`

Entrada:

```json
{
  "rawEntity": {
    "entityType": "company",
    "companyName": "TalentFlow",
    "tagline": "AI-powered recruiting platform",
    "industry": "HR Tech",
    "companySize": "51-200 employees",
    "headquarters": "Barcelona, Spain",
    "website": "https://talentflow.example.com/",
    "about": "We build GenAI tooling for talent teams and recruiting operations.",
    "specialties": ["Recruiting", "Generative AI", "Talent Ops"],
    "companyUrl": "https://www.linkedin.com/company/talentflow/",
    "regionGuess": "Barcelona, Spain",
    "hiringSignals": [],
    "genaiSignals": [],
    "recruitingSignals": []
  }
}
```

Salida:

```json
{
  "fitScore": 78,
  "fitSummary": "Empresa con señales de HR tech, recruiting, GenAI aplicada a recruiting.",
  "hook1": "Señal detectada: GenAI aplicada a recruiting en about.",
  "hook2": "Señal detectada: recruiting en specialty.",
  "sourceNotes": "Empresa: TalentFlow. Tagline: AI-powered recruiting platform. Industria: HR Tech. Sede: Barcelona, Spain. Se detectaron señales de HR tech, recruiting, GenAI aplicada a recruiting.",
  "region": "Barcelona, Spain",
  "company": "TalentFlow",
  "role": "AI-powered recruiting platform",
  "type": "Company"
}
```

### `crm_upsert_contactable_entity`

Entrada:

```json
{
  "entityType": "person",
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "rawEntity": {
    "entityType": "person",
    "fullName": "Ana Lopez",
    "headline": "Senior Recruiter",
    "location": "Madrid, Spain",
    "about": null,
    "currentCompany": "Acme AI",
    "currentRole": "Senior Recruiter",
    "experience": [],
    "education": [],
    "skills": [],
    "profileUrl": "https://www.linkedin.com/in/ana-lopez/",
    "companyGuess": "Acme AI",
    "regionGuess": "Madrid, Spain",
    "contactabilitySignals": []
  },
  "fitAnalysis": {
    "fitScore": 81,
    "fitSummary": "Perfil con señales claras de recruiting.",
    "hook1": "Señal detectada: recruiting en headline.",
    "hook2": null,
    "sourceNotes": "Perfil: Ana Lopez. Rol actual: Senior Recruiter.",
    "region": "Madrid, Spain",
    "company": "Acme AI",
    "role": "Senior Recruiter",
    "type": "Person"
  }
}
```

## Flujo de integración

Ejemplo completo:

1. `linkedin_profile_fetch`
2. `linkedin_entity_enrich` usando la salida anterior como `rawEntity`
3. `crm_upsert_contactable_entity` usando:

```json
{
  "entityType": "person",
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "rawEntity": "<salida de linkedin_profile_fetch>",
  "fitAnalysis": "<salida de linkedin_entity_enrich>"
}
```

Hay un ejemplo adicional en [examples/tool-flow.json](/c:/Users/maror/Downloads/OPENCLAW_DOCKER_INSTALLER/openclaw-data/.openclaw/local-plugins/linkedin-scraper/examples/tool-flow.json).

## Docker

El worker incluye Dockerfile y ejemplo de compose:

- [workers/linkedin-research-worker/Dockerfile](/c:/Users/maror/Downloads/OPENCLAW_DOCKER_INSTALLER/openclaw-data/.openclaw/local-plugins/linkedin-scraper/workers/linkedin-research-worker/Dockerfile)
- [docker-compose.example.yml](/c:/Users/maror/Downloads/OPENCLAW_DOCKER_INSTALLER/openclaw-data/.openclaw/local-plugins/linkedin-scraper/docker-compose.example.yml)

## Tests incluidos

- Unit tests de normalización y scoring en `packages/shared`
- Integración del worker con fixtures HTML en `workers/linkedin-research-worker/test`
- Integración del plugin `linkedin-research` con worker HTTP mockeado
- Tests del writer de Notion para mapping, create, update y detección `select/status`

## Extensión futura

La base queda preparada para añadir:

- scraping de posts
- scraping de jobs
- drafts de outreach
- tracking CRM más avanzado

Sin romper los contratos V1 actuales.
