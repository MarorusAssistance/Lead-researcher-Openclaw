---
name: recruiter-research
description: Investiga recruiters IT relevantes para perfiles GenAI y guarda hallazgos útiles para outreach personalizado.
user-invocable: false
---

# recruiter-research

## Objetivo

Encontrar recruiters IT relevantes para un perfil de **Gen AI Engineer freelance**, investigar su contexto profesional y extraer información útil para personalizar un contacto humano y creíble.

Esta skill **no contacta**, **no envía mensajes** y **no toma acciones públicas**. Su trabajo es investigar, resumir y guardar contexto en Notion.

## Cuándo usar esta skill

Usa esta skill cuando necesites:

- encontrar recruiters relevantes para perfiles AI / ML / LLM / GenAI / AI Engineering
- investigar un recruiter ya identificado
- resumir por qué una persona merece ser contactada
- extraer hooks de personalización para una futura nota de conexión o DM
- guardar la investigación en el CRM de Notion

## Perfil objetivo

Prioriza recruiters que cumplan varias de estas señales:

- reclutan perfiles AI, ML, Data, MLOps, LLM, GenAI o AI Engineering
- trabajan en empresas o consultoras que publican vacantes técnicas relevantes
- comparten posts, actividad o señales relacionadas con hiring técnico
- tienen foco en mercados o geografías compatibles con el perfil objetivo
- parecen mover perfiles técnicos reales, no vacantes genéricas sin relación

## Herramientas que puede usar

Esta skill puede usar, cuando estén disponibles:

- `web_search`
- `web_fetch`
- `browser`
- `notion_recruiter_upsert`
- `notion_recruiter_save_research`

## Entradas esperadas

Si el usuario no da todos los datos, asume un perfil base razonable:

- perfil objetivo: **Gen AI Engineer freelance**
- stack principal: LLMs, agents, RAG, automatización, Python, integración de herramientas, producción
- mercados posibles: Europa, remoto internacional, startups, consultoras, product companies
- idioma preferente: español o inglés según el contexto del recruiter

## Proceso

1. Identifica recruiters potencialmente relevantes.
2. Verifica que haya señales reales de encaje.
3. Busca información útil del recruiter:
   - nombre
   - empresa
   - tipo de recruiter: `in_house` o `agency`
   - región / mercado
   - área técnica que parece cubrir
   - señales concretas de hiring o de actividad profesional
4. Extrae **2 hooks reales** para personalización:
   - un post, hiring push, tipo de vacantes, sector, stack, expansión, etc.
5. Redacta un resumen corto de encaje.
6. Guarda o actualiza la ficha en Notion.

## Reglas de calidad

- No inventes datos.
- No asumas que un recruiter mueve GenAI si no hay indicios reales.
- Si faltan datos, di claramente qué falta.
- No contactes nunca desde esta skill.
- No redactes ni envíes mensajes finales aquí salvo una nota muy breve de contexto interno.
- Prioriza calidad sobre volumen.
- Descarta perfiles sin señales suficientes.

## Criterio mínimo para considerar un recruiter "válido"

Debe haber al menos:

- una señal de que trabaja vacantes técnicas o IT
- una señal de proximidad a AI / data / ML / software engineering / innovation hiring
- dos datos concretos que permitan personalizar el contacto

Si no se cumplen esos mínimos, marca el perfil como de baja prioridad o descartable.

## Qué guardar en Notion

Cuando sea posible, guarda:

- `Name`
- `LinkedIn URL`
- `Company`
- `Role`
- `Type`
- `Region`
- `Source Notes`
- `Hook 1`
- `Hook 2`
- `Fit Summary`

Usa `notion_recruiter_upsert` para crear o actualizar la ficha base y `notion_recruiter_save_research` para añadir notas de investigación.

## Formato de salida

Devuelve siempre este formato en markdown:

### Research Summary
- Name:
- Company:
- Role:
- Recruiter Type:
- Region:
- LinkedIn URL:

### Relevance Signals
- ...
- ...
- ...

### Personalization Hooks
- Hook 1:
- Hook 2:

### Risks or Missing Data
- ...
- ...

### CRM Action
- Created or updated in Notion:
- Recommended next step: