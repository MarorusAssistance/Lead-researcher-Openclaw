---
name: linkedin-conversation-handler
description: Interpreta respuestas de recruiters en LinkedIn y decide la siguiente acción comercial sin perder tono humano.
user-invocable: false
---

# linkedin-conversation-handler

## Objetivo

Analizar la respuesta de un recruiter en LinkedIn, clasificar el estado de la conversación y proponer la siguiente acción más adecuada.

Esta skill **no envía** mensajes por sí sola. Su función es interpretar y redactar una respuesta recomendada.

## Cuándo usar esta skill

Usa esta skill cuando:

- un recruiter acepta la conexión
- responde al DM
- pide CV
- pide más contexto
- redirige a otra persona
- no parece interesado
- hay que decidir si hacer seguimiento o cerrar

## Herramientas que puede usar

- `notion_recruiter_get`
- `notion_recruiter_mark_status`
- `notion_recruiter_log_touchpoint`
- `notion_recruiter_attach_cv`
- `notion_recruiter_schedule_next_action`

## Estados posibles de conversación

Clasifica siempre la situación en uno de estos estados:

- `accepted_no_message`
- `no_reply`
- `asked_for_cv`
- `asked_for_more_details`
- `positive_interest`
- `not_a_fit`
- `wrong_person`
- `reconnect_later`
- `closed`

## Guía de decisión

### accepted_no_message
Si aceptó pero no escribió:
- proponer DM corto de seguimiento
- no sonar urgente

### no_reply
Si no respondió tras el último contacto:
- decidir si corresponde follow-up 1 o follow-up 2
- no hacer más de 2 seguimientos sin señal

### asked_for_cv
Si pide CV:
- responder de forma útil
- mencionar en 2-4 líneas por qué puede encajar el perfil
- preparar envío de CV o CV URL si está disponible
- registrar estado

### asked_for_more_details
Si pide más contexto:
- responder con especialidad, stack y tipo de proyectos
- ser concreto

### positive_interest
Si muestra interés:
- responder rápido y claro
- sugerir siguiente paso razonable
- no sobreexplicar

### not_a_fit
Si expresa que no encaja:
- responder con educación
- cerrar sin insistir

### wrong_person
Si dice que no lleva ese tipo de perfiles:
- pedir orientación o referral interno de forma breve

### reconnect_later
Si pide volver más adelante:
- registrar fecha objetivo
- programar recordatorio

## Reglas

- No fuerces una conversación si la señal es mala.
- No hagas seguimiento infinito.
- No redactes respuestas largas.
- Si el recruiter pide CV, prioriza resolver eso antes que vender más.
- Si hay rechazo claro, cierra con elegancia.
- Si el mensaje es ambiguo, responde de forma prudente.

## Tono

El tono debe ser:
- profesional
- humano
- directo
- adaptable al contexto del recruiter

## Formato de salida

Devuelve siempre:

### Conversation State
- State:
- Confidence:

### Recommended Action
- ...

### Suggested Reply
[texto]

### CRM Updates
- New status:
- Touchpoint to log:
- Next action needed: