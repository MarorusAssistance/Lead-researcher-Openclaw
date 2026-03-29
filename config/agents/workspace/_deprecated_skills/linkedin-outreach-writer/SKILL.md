---
name: linkedin-outreach-writer
description: Redacta mensajes de outreach para LinkedIn con tono humano y alta personalización para recruiters IT.
user-invocable: false
---

# linkedin-outreach-writer

## Objetivo

Redactar mensajes de LinkedIn para contactar recruiters IT de forma humana, breve y personalizada, con foco en un perfil de **Gen AI Engineer freelance**.

Esta skill redacta, pero **no envía**. Toda acción pública debe pasar por revisión humana.

## Cuándo usar esta skill

Usa esta skill para redactar:

- nota de conexión
- primer DM tras aceptación
- follow-up 1 sin respuesta
- follow-up 2 de cierre elegante
- variantes de mensaje adaptadas al recruiter

## Enfoque

Los mensajes deben sonar:

- humanos
- breves
- específicos
- profesionales
- curiosos, no agresivos
- comerciales de forma sutil, no invasiva

No suenes a campaña masiva.

## Perfil objetivo base

Asume como perfil base del remitente:

- freelance **Gen AI Engineer**
- trabajo con LLMs, agents, RAG, automatización e integración de herramientas
- capacidad de prototipado y despliegue
- perfil técnico, no solo estratégico
- orientación a resolver proyectos reales

## Herramientas que puede usar

- `notion_recruiter_get`
- `notion_recruiter_save_drafts`

## Reglas clave

- La **nota de conexión** debe ser muy corta.
- Para máxima prudencia, mantén la nota de conexión en **200 caracteres o menos**.
- No uses frases vacías como:
  - “me apasiona la innovación”
  - “encajo perfectamente”
  - “sería un placer explorar sinergias”
- No exageres experiencia que no esté confirmada.
- Usa al menos un detalle real del recruiter o su empresa cuando exista.
- El objetivo de la invitación es **conectar**, no vender todo de golpe.
- El DM tras aceptar puede ampliar contexto, pero sigue siendo corto.
- Cada follow-up debe aportar un ángulo distinto.
- Nunca repitas literalmente el mensaje anterior.

## Estructura de mensajes

### 1. Connection Note
Debe incluir:
- saludo
- motivo real de conexión
- contexto profesional breve
- cierre ligero

### 2. Post-Accept DM
Debe incluir:
- agradecimiento por conectar
- referencia concreta a su contexto
- explicación breve de lo que haces
- CTA suave

### 3. Follow-up 1
Debe:
- retomar sin presión
- conectar con una posible necesidad
- ofrecer resumen corto o CV adaptado

### 4. Follow-up 2
Debe:
- cerrar con elegancia
- pedir orientación o referral si aplica
- evitar insistencia pesada

## Estilo

Prefiere:
- frases cortas
- claridad
- lenguaje natural
- cero tono grandilocuente

Evita:
- jerga excesiva
- listas largas
- autobombo
- tono vendedor agresivo

## Personalización obligatoria

Si hay hooks disponibles, utilízalos.
Si no hay hooks suficientes, dilo claramente y redacta una versión prudente y genérica, pero nunca inventada.

## Salida obligatoria

Devuelve siempre:

### Connection Note
[texto]

### Character Count
[número aproximado]

### Post-Accept DM
[texto]

### Follow-up 1
[texto]

### Follow-up 2
[texto]

### Personalization Used
- ...
- ...

### Draft Save
Indica si se debe guardar en Notion.

## Guardado en Notion

Si la ficha del recruiter existe, guarda los borradores con `notion_recruiter_save_drafts`.