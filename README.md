# LOLO OpenClaw Gateway

Gateway conversacional de LOLO sobre OpenClaw.

Este repo ya no se trata como el sitio ideal para meter toda la lógica dura de sistemas multiagente. La dirección actual es:

- este repo = gateway, routing, canales y shell conversacional
- engines serios = proyectos aparte, con contratos/API claras
- el flujo de leads actual sigue embebido aquí de forma transitoria

## Rol actual del repo

- exponer `main` como router fino
- gestionar canales y sesiones de OpenClaw
- conectar Telegram y futuras superficies conversacionales
- servir de shell mientras el `lead engine` se extrae a un proyecto aparte

## Estado actual

- `main` ya usa `lolo_router_dispatch` como frontera pública
- el route de leads sigue funcionando por detrás con el backend legacy embebido
- el flujo activo actual sigue siendo:
  - `main -> crm -> sourcer -> qualifier -> commercial -> crm`

## Documentación clave

- arquitectura del gateway:
  - [docs/architecture/lolo-gateway-router.md](docs/architecture/lolo-gateway-router.md)
- brief para construir el futuro lead engine aparte:
  - [docs/architecture/lead-engine-handoff.md](docs/architecture/lead-engine-handoff.md)
- comparación local vs cloud hecha durante el trabajo previo:
  - [docs/model-comparison/summary.md](docs/model-comparison/summary.md)

## Quickstart

```powershell
docker compose up -d --build
docker compose exec openclaw openclaw onboard
docker compose restart openclaw
```

## Telegram

1. Escribe al bot.
2. Aprueba el pairing:

```powershell
docker compose exec openclaw openclaw pairing approve telegram <codigo>
```

## Control UI

```powershell
docker compose exec openclaw openclaw configure
docker compose restart openclaw
```

Luego abre:

```text
http://127.0.0.1:18789/?token=<token>
```

## Comandos útiles

```powershell
docker compose ps
docker compose logs -f openclaw
docker compose restart openclaw
docker compose stop openclaw
docker compose down
```

## Nota de arquitectura

Este repo no debería seguir creciendo como motor de workflows de negocio complejos. La intención es mantener aquí:

- routing
- canales
- sesiones
- gateway/UI rápida
- adaptadores hacia engines externos

Y mover fuera:

- lead research determinista
- validación fuerte de leads
- persistencia compleja
- lógica multiagente de negocio

## Referencias

- OpenClaw docs: https://docs.openclaw.ai
- OpenClaw GitHub: https://github.com/openclaw/openclaw
