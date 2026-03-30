# Lead Engine Handoff

Este documento sirve como brief para pasarle a otro agente o a otro proyecto la construcción del futuro `lead engine` de LOLO.

## Objetivo

Construir un sistema separado, más determinista y robusto que el flujo embebido actual, para:

- buscar leads B2B
- validarlos con reglas estrictas y relajaciones controladas
- persistir resultados y shortlist
- generar drafts comerciales
- exponer una API clara para que este gateway la consuma

## Qué queremos conseguir

El sistema debe encontrar leads y empresas relevantes para Manuel, que vende trabajo como:

- freelancer de sistemas agentic
- GenAI Engineer
- automatización aplicada a empresas IT

Buyer personas objetivo habituales:

- CEO / Founder
- CTO / Head of Engineering
- talent leaders / technical recruiters

Señales típicas:

- empresas IT
- empresas pequeñas o medianas
- necesidad plausible de automatización, GenAI o agentic systems
- operación en España o Europa, según el caso

## Problema actual que se quiere evitar

El flujo embebido en OpenClaw funciona, pero no es la base ideal para:

- lógica estricta de negocio
- workflows largos
- retries controlados
- trazabilidad fuerte
- control de estado durable
- portabilidad fuera del chat/gateway

Por eso el nuevo sistema debe vivir fuera de este repo.

## Arquitectura esperada

El nuevo proyecto debería ser un engine/API separado.

Recomendación actual:

- framework principal: `LangGraph`
- posibilidad secundaria: `AutoGen Core`
- frontera pública: API propia, no prompts de chat

Este gateway de OpenClaw solo debería:

- detectar intención
- enrutar al engine correcto
- pasar `userText` + parseo ligero + metadata
- devolver al usuario el resultado final

## Contrato de entrada recomendado

No trabajar con la request cruda únicamente.

El engine debería recibir algo parecido a esto:

```json
{
  "action": "lead_search.start",
  "requestId": "req_123",
  "userText": "busca 3 leads que trabajen en españa y esten en empresas de entre 5 y 50 empleados",
  "parsed": {
    "targetCount": 3,
    "preferredCountry": "es",
    "minCompanySize": 5,
    "maxCompanySize": 50
  },
  "meta": {
    "sourceChannel": "telegram",
    "sourceAgent": "main",
    "timestamp": "2026-03-30T18:00:00Z"
  }
}
```

El engine debe poder reinterpretar y corregir el parseo si hace falta.

## Flujo funcional deseado

Flujo interno del engine:

- parser/normalizer
- planner/orchestrator
- sourcer
- qualifier
- commercial
- crm writer

Principios:

- solo un writer persiste
- fail fast con JSON inválido
- no fabricar éxito
- retries acotados y observables
- shortlist para close matches
- resultados explicables

## Componentes sugeridos

### 1. Parser / Intent normalizer
- convierte texto del usuario en constraints claras
- mantiene también el `userText` original

### 2. Sourcer
- web-first
- recoge un dossier
- no persiste
- no acepta/rechaza comercialmente

### 3. Qualifier
- decide `ACCEPT`, `REJECT`, `ENRICH`
- maneja match exacto vs close match
- puede rellenar clasificación comercial como `region` y `type`

### 4. Commercial
- genera hooks y drafts
- no navega
- no persiste
- usa solo el dossier y la validación

### 5. CRM writer
- único escritor
- persiste leads aceptados
- persiste shortlist temporal
- mantiene memoria de exploración

## Memoria y estado esperados

Estado mínimo:

- `searchedCompanyNames`
- `registeredLeadNames`
- `visitedUrls`
- `queryHistory`
- `pendingShortlist`
- contadores de misses / outcomes

## Respuestas esperadas del engine

El engine debería responder con un contrato claro:

```json
{
  "status": "completed",
  "resultType": "accepted_leads",
  "acceptedLeads": [],
  "closeMatches": [],
  "userMessage": "He encontrado 2 leads exactos y 1 candidato cercano."
}
```

## Integración posterior con este gateway

Este repo debería acabar llamando a tools o endpoints del estilo:

- `lead_engine_start_search`
- `lead_engine_get_run`
- `lead_engine_choose_shortlist_option`
- `lead_engine_reset_query_memory`

La idea es que `lolo_router_dispatch` enrute a ese engine externo, y no al backend embebido actual.

## Restricciones importantes

- preserve web-first sourcing
- no volver a LinkedIn-first dependency
- contratos estrictos
- prompts cortos y explícitos
- preferir validadores y código sobre prompt-only logic

## Qué tiene que entregar el otro proyecto

- arquitectura base del engine
- contratos de entrada/salida
- store/state durable
- flow completo de lead search
- tests del flujo
- smoke test reproducible
- documentación para integrarlo con este gateway
