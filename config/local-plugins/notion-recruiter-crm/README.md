# Notion Recruiter CRM

Plugin nativo de OpenClaw para usar una base de datos de Notion como CRM de recruiters. El plugin resuelve automaticamente el `data_source_id` principal a partir del `databaseId`, usa `NOTION_API_KEY` desde variables de entorno y registra herramientas nativas con `api.registerTool(...)`.

## Que hace

- Crea o actualiza recruiters usando el LinkedIn URL como clave natural cuando existe; si no llega, crea igualmente el lead.
- Lee fichas normalizadas desde Notion.
- Guarda research, hooks y drafts de outreach.
- Registra touchpoints y mantiene un historial simple en `Interaction Log`.
- Marca estados, programa follow-ups y adjunta CVs.
- Consulta follow-ups pendientes por fecha y estado.

## Estructura

```text
notion-recruiter-crm/
  openclaw.plugin.json
  package.json
  tsconfig.json
  .gitignore
  .env.example
  README.md
  index.ts
  src/
    notion-client.ts
    property-mappers.ts
    tools.ts
    types.ts
```

## Instalar dependencias

```bash
npm install
npm run typecheck
npm run build
```

## Configurar NOTION_API_KEY

1. Crea una integracion interna en Notion.
2. Copia el token de la integracion.
3. Comparte la base de datos de Notion con esa integracion.
4. Exporta la variable:

PowerShell:

```powershell
$env:NOTION_API_KEY="secret_xxx"
```

CMD:

```cmd
set NOTION_API_KEY=secret_xxx
```

El repo incluye `.env.example`, pero no guarda un `.env` real.

## Configurar `databaseId` en `openclaw.json`

El plugin solo pide `databaseId`.

```json
{
  "plugins": {
    "entries": {
      "notion-recruiter-crm": {
        "enabled": true,
        "config": {
          "databaseId": "01234567-89ab-cdef-0123-456789abcdef"
        }
      }
    }
  }
}
```

`databaseId` es el ID de la URL de la base de datos de Notion. Internamente el plugin llama a `databases.retrieve(...)`, toma el primer `data_source_id`, valida el schema y opera sobre `notion.dataSources.*`.

## Instalar el plugin localmente

```powershell
openclaw plugins install -l "C:\Users\TU_USUARIO\dev\openclaw-extensions\notion-recruiter-crm"
```

## Inspeccionarlo

En OpenClaw `2026.3.13`, el subcomando disponible es `info`, no `inspect`.

```powershell
openclaw plugins info notion-recruiter-crm
```

Si en tu fork existe un alias `inspect`, puedes usarlo, pero el CLI documentado actual usa `info`.

## Habilitarlo

```powershell
openclaw plugins enable notion-recruiter-crm
```

Tambien puedes dejar `enabled: true` en `openclaw.json`.

## Reinicio del gateway

Los cambios en plugins o en `openclaw.json` requieren reiniciar el gateway para que OpenClaw vuelva a descubrir, validar y cargar el plugin.

## Propiedades esperadas en Notion

La data source debe tener estas propiedades con estos tipos:

- `Name` (`title`)
- `LinkedIn URL` (`url`, opcional)
- `Company` (`rich_text`)
- `Role` (`rich_text`)
- `Type` (`select`)
- `Region` (`rich_text`)
- `Fit Score` (`number`)
- `Status` (`select`)
- `Source Notes` (`rich_text`)
- `Hook 1` (`rich_text`)
- `Hook 2` (`rich_text`)
- `Fit Summary` (`rich_text`)
- `Connection Note Draft` (`rich_text`)
- `DM Draft` (`rich_text`)
- `Email Subject Draft` (`rich_text`)
- `Email Body Draft` (`rich_text`)
- `Follow Up 1 Draft` (`rich_text`)
- `Follow Up 2 Draft` (`rich_text`)
- `Last Reply Summary` (`rich_text`)
- `Interaction Log` (`rich_text`)
- `Last Touch At` (`date`)
- `Next Action At` (`date`)
- `Next Action Type` (`select`)
- `CV Sent` (`checkbox`)
- `CV URL` (`url`, opcional legacy)
- `CV URL EN` (`url`)
- `CV URL ES` (`url`)

El plugin tambien tolera el alias legacy `Followup 1 Draft` y `Followup 2 Draft`. Si falta una propiedad necesaria para el payload que intentas guardar, si el tipo no coincide, o si la base no esta compartida con la integracion, devuelve un error claro con el detalle.

## Notas de modelado

- `Type` espera valores `in_house` o `agency`.
- En el flujo actual de CRM, `Status` se normaliza a `To Contact` por defecto.
- En el flujo actual de CRM, `Next Action Type` se normaliza a `connection_request` por defecto.
- El plugin normaliza el LinkedIn URL antes de buscar, crear y actualizar cuando se proporciona.
- `CV URL EN` y `CV URL ES` pueden rellenarse automaticamente con los enlaces por defecto del perfil.
- `Interaction Log` se mantiene como texto acumulado simple.

## Ejemplos de uso de tools

### `notion_recruiter_upsert`

```json
{
  "name": "Ana Lopez",
  "company": "Contoso",
  "role": "Senior Recruiter",
  "recruiterType": "in_house",
  "region": "Spain",
  "fitScore": 8.5,
  "sourceNotes": "Leads hiring for data and AI roles in Madrid."
}
```

### `notion_recruiter_get`

Por LinkedIn:

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/"
}
```

Por page ID:

```json
{
  "pageId": "01234567-89ab-cdef-0123-456789abcdef"
}
```

### `notion_recruiter_query_due_followups`

```json
{
  "beforeIso": "2026-03-20T18:00:00.000Z",
  "statuses": ["contacted", "waiting_reply"],
  "limit": 10
}
```

### `notion_recruiter_save_research`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "sourceNotes": "Found via AI engineering hiring thread.",
  "hook1": "Scaling hiring in Barcelona",
  "hook2": "Recently opened ML platform roles",
  "fitSummary": "High fit for backend ML infra roles."
}
```

### `notion_recruiter_save_drafts`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "connectionNoteDraft": "Hi Ana, loved your recent post on AI hiring.",
  "dmDraft": "Thanks for connecting. Sharing a concise intro and profile.",
  "emailSubjectDraft": "AI recruiter candidate for your Madrid searches",
  "emailBodyDraft": "Hi Ana, sharing a concise summary of fit and profile.",
  "followup1Draft": "Bumping this in case it got buried.",
  "followup2Draft": "Happy to resend the profile if useful."
}
```

### `notion_recruiter_log_touchpoint`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "channel": "linkedin",
  "touchType": "dm",
  "atIso": "2026-03-20T10:30:00.000Z",
  "summary": "Sent intro DM with 3-line pitch."
}
```

### `notion_recruiter_mark_status`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "status": "waiting_reply",
  "lastReplySummary": "Asked for CV and availability."
}
```

### `notion_recruiter_schedule_next_action`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "nextActionType": "followup_1",
  "nextActionAtIso": "2026-03-24T09:00:00.000Z"
}
```

### `notion_recruiter_attach_cv`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/ana-lopez/",
  "cvUrl": "https://example.com/cv/jane-doe.pdf",
  "cvSent": true
}
```

## Errores que maneja

- `401`: `NOTION_API_KEY` ausente o invalido.
- `403`: la integracion no tiene acceso al database/data source o no tiene permisos suficientes.
- `404`: `databaseId`, `pageId` o recruiter inexistente, o recurso no compartido con la integracion.
- `429`: rate limit de Notion.
- `schema_mismatch`: faltan propiedades o el tipo de alguna columna no coincide.

## Desarrollo

- OpenClaw carga `index.ts` nativamente con `jiti`, sin bundle estilo Codex/Claude/Cursor.
- El runtime usa `openclaw/plugin-sdk/core`.
- Si mas adelante quieres anadir skills, puedes extender el manifest con `skills` y crear el arbol correspondiente sin tocar la base del runtime.
