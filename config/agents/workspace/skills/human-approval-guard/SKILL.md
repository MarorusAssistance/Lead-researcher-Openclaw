---
name: human-approval-guard
description: Impone revisión humana antes de cualquier acción pública o sensible en LinkedIn y controla el riesgo comercial y operativo.
user-invocable: false
---

# human-approval-guard

## Objetivo

Asegurar que ninguna acción pública, sensible o irreversible se ejecute sin revisión humana previa.

Esta skill es la barrera de seguridad del flujo comercial.

## Cuándo usar esta skill

Usa esta skill antes de:

- enviar una solicitud de conexión
- enviar un DM en LinkedIn
- hacer un follow-up
- compartir CV o enlace al CV
- responder a una solicitud del recruiter
- ejecutar una acción pública desde browser

## Principio general

Si una acción afecta externamente a otra persona o a una cuenta real, debe pasar por aprobación humana.

## Herramientas que puede usar

- `browser`
- `notion_recruiter_get`
- `notion_recruiter_mark_status`
- `notion_recruiter_log_touchpoint`

## Acciones que SIEMPRE requieren aprobación humana

- enviar una invitación de LinkedIn
- enviar cualquier mensaje por LinkedIn
- adjuntar o compartir CV
- responder a mensajes ambiguos
- actuar cuando falte contexto suficiente

## Checklist obligatoria previa a aprobación

Antes de dar luz verde, verifica:

1. ¿Hay fit real?
2. ¿Hay al menos 1-2 datos reales de personalización?
3. ¿El mensaje suena humano y no masivo?
4. ¿La longitud es razonable?
5. ¿No hay afirmaciones inventadas?
6. ¿No se está insistiendo demasiado?
7. ¿La siguiente acción tiene sentido según el estado de la conversación?
8. ¿Se ha registrado o se va a registrar correctamente en Notion?

Si alguna respuesta es negativa, recomienda corrección antes de enviar.

## Reglas

- Ante duda, no enviar.
- Si el mensaje parece genérico, pedir reescritura.
- Si falta contexto, pedir más research.
- Si el recruiter ya mostró desinterés, frena el envío.
- Si el tono es demasiado vendedor, frena el envío.
- Si el flujo comercial ya ha tenido 2 seguimientos sin respuesta, frena el envío salvo instrucción explícita.

## Tipos de decisión

Devuelve una de estas decisiones:

- `approved`
- `approved_with_edits`
- `blocked`
- `needs_more_research`

## Cuando bloquear

Bloquea si ocurre cualquiera de estos casos:

- mensaje claramente genérico
- sin evidencia de fit
- tono invasivo
- exceso de insistencia
- información dudosa o inventada
- falta de aprobación humana explícita
- falta de registro en CRM

## Formato de salida

Devuelve siempre:

### Approval Decision
- Decision:
- Reason:

### Risk Check
- Fit confirmed:
- Personalization confirmed:
- Tone acceptable:
- Cadence acceptable:
- CRM state acceptable:

### Required Edits
- ...
- ...

### Final Recommended Message
[solo si aplica]

### Next Step
- Send after approval / rewrite / research more / stop outreach