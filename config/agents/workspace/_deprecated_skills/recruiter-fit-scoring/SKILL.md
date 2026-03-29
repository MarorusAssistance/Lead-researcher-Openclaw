---
name: recruiter-fit-scoring
description: Puntúa recruiters IT según su encaje real con un perfil GenAI freelance y decide si merece la pena contactarlos.
user-invocable: false
---

# recruiter-fit-scoring

## Objetivo

Evaluar de forma conservadora si un recruiter merece ser contactado para oportunidades relacionadas con **GenAI Engineering freelance**.

Esta skill **no investiga desde cero si no hay contexto previo suficiente**. Su función es leer la información disponible, puntuarla y decidir si el contacto tiene sentido.

## Cuándo usar esta skill

Usa esta skill cuando ya exista investigación previa o información básica sobre un recruiter y quieras decidir:

- si debe ser contactado
- con qué prioridad
- con qué ángulo
- si debe descartarse por falta de fit

## Herramientas que puede usar

- `web_fetch`
- `browser`
- `notion_recruiter_mark_status`

Usa herramientas solo si necesitas validar un dato concreto. No repitas toda la investigación si ya existe.

## Criterios de scoring

Puntúa de 0 a 100 usando estos factores:

### 1. Relevancia del dominio técnico (0-30)
Puntúa alto si hay evidencia clara de que trabaja con:
- AI
- ML
- Data / MLOps
- LLM
- GenAI
- software engineering técnico avanzado

### 2. Probabilidad real de mover perfiles como el objetivo (0-25)
Puntúa alto si:
- el recruiter trabaja vacantes técnicas
- su empresa contrata software / AI talent
- ha publicado o gestionado búsquedas similares

### 3. Calidad de personalización posible (0-15)
Puntúa alto si hay:
- 2 o más hooks concretos
- contexto reciente
- información suficiente para escribir un mensaje no genérico

### 4. Compatibilidad geográfica y operativa (0-10)
Puntúa alto si:
- acepta remoto
- opera en Europa o mercados compatibles
- el idioma parece adecuado

### 5. Tipo de recruiter y potencial comercial (0-10)
Puntúa alto si:
- es in-house en empresa interesante
- o agency especializada con vacantes técnicas reales

### 6. Riesgo o ruido (resta hasta 10)
Resta puntos si:
- perfil demasiado genérico
- sin señales de AI / tech fit
- demasiada ambigüedad
- poco contexto verificable

## Umbrales de decisión

- **80-100**: alta prioridad
- **65-79**: buena prioridad
- **50-64**: prioridad media, contactar solo si hay capacidad
- **35-49**: baja prioridad
- **0-34**: no contactar

## Reglas

- Sé conservador.
- No regales puntuación.
- Si faltan evidencias, baja el score.
- No confundir "trabaja en recruiting" con "recluta perfiles relevantes".
- Explica brevemente por qué das esa puntuación.
- Si el recruiter no es buen fit, dilo claramente.

## Estado recomendado

Devuelve uno de estos estados:

- `high_priority`
- `medium_priority`
- `low_priority`
- `discarded`

## Actualización en CRM

Si existe ficha en Notion, actualiza el estado cuando proceda.

Guía sugerida:
- `high_priority` → mantener o marcar como listo para outreach
- `medium_priority` → mantener en cola
- `low_priority` → mantener en backlog
- `discarded` → marcar como descartado

## Formato de salida

Devuelve siempre este formato:

### Fit Score
- Score:
- Recommended Status:

### Why
- ...
- ...
- ...

### Positive Signals
- ...
- ...

### Concerns
- ...
- ...

### Outreach Recommendation
- Contact now / later / do not contact
- Best angle: