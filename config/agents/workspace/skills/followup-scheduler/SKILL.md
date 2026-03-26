---
name: followup-scheduler
description: Decide cuándo hacer el siguiente seguimiento comercial y lo deja registrado de forma ordenada y prudente.
user-invocable: false
---

# followup-scheduler

## Objetivo

Determinar la próxima acción comercial para cada recruiter y programarla de forma razonable, evitando comportamiento agresivo o poco humano.

Esta skill ayuda a calendarizar el outreach y los follow-ups. No debe generar cadencias masivas ni ráfagas poco naturales.

## Cuándo usar esta skill

Usa esta skill cuando:

- se ha enviado una conexión y hay que decidir cuándo revisar
- un recruiter ha aceptado la conexión
- se ha enviado un DM y no ha habido respuesta
- hay que programar follow-up
- un recruiter ha pedido volver más adelante
- hay que revisar tareas pendientes desde Notion

## Herramientas que puede usar

- `cron`
- `notion_recruiter_query_due_followups`
- `notion_recruiter_schedule_next_action`
- `notion_recruiter_mark_status`

## Reglas de cadencia

### Conexión enviada
- revisar más adelante, no inmediatamente
- no asumir aceptación inmediata

### Tras aceptación de conexión
- esperar aproximadamente **1 día laborable**
- preferir envío de DM entre lunes y jueves

### Tras DM sin respuesta
- esperar **3 días laborables** antes de follow-up 1

### Tras follow-up 1 sin respuesta
- esperar **5 a 7 días laborables** antes de follow-up 2

### Después de follow-up 2 sin respuesta
- cerrar o dejar en pausa
- no seguir insistiendo

### Si pide volver más adelante
- programar la fecha sugerida o una fecha razonable

## Ventanas preferidas

Favorece:

- lunes a jueves
- horario laboral razonable
- distribución natural de acciones

Evita:

- fines de semana
- ráfagas artificiales
- muchas acciones en segundos o minutos seguidos
- acumulaciones raras al mismo recruiter

## Reglas de humanidad

- No programar contactos masivos con intervalos idénticos.
- Reparte acciones de forma natural.
- La prioridad es parecer humano y operar con criterio.
- Mejor menos acciones y mejor personalizadas.

## Límites

- No más de 2 seguimientos sin respuesta.
- No reabrir un hilo cerrado salvo instrucción clara.
- Si el recruiter no es buen fit, no programes nada.

## Qué debe decidir

Para cada recruiter, decide:

- si hay siguiente acción
- cuál es la siguiente acción
- cuándo debe ocurrir
- si hace falta intervención humana antes de ejecutarla

## Formato de salida

Devuelve siempre:

### Scheduling Decision
- Next action type:
- Next action at:
- Reason:

### Cadence Context
- Last touch:
- Conversation state:
- Priority:

### CRM Update
- Save next action: yes/no
- Cron job needed: yes/no
- Human review required: yes/no

## Uso de cron

Si el entorno lo permite, usa `cron` para revisar tareas pendientes o despertar flujos internos.
No uses `cron` para automatizar acciones públicas sin aprobación humana.
