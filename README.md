# OpenClaw en Docker - Instalación Rápida

Contenedor Docker para ejecutar OpenClaw con dashboard accesible desde Windows.

## Inicio Rápido

### 1. Construir e Iniciar el Contenedor

```powershell
docker compose up -d --build
```
Nota: guarda el token generado en la salida de la consola en el archivo .env, en la variable OPENCLAW_GATEWAY_TOKEN.

### 2. Ejecutar Onboarding

```powershell
docker compose exec openclaw openclaw onboard
```

### 3. Reiniciar docker

```powershell
docker compose restart openclaw
```

### 4. Escribir por Telegram

Envía un mensaje al bot para iniciar el flujo de emparejamiento.

### 5. Aprobar el Emparejamiento

```powershell
docker compose exec openclaw openclaw pairing approve telegram <codigo>
```

El `<codigo>` se entrega en la primera interacción por Telegram.

## Opcional: Dashboard Web

### 1. Configurar apertura por lanzamiento

```powershell
docker compose exec openclaw openclaw configure
```
Selecciona las siguientes opciones en cada pregunta:
◇  Where will the Gateway run?
│  Local (this machine)
│
◇  Select sections to configure
│  Gateway
│
◇  Gateway port
│  18789
│
◇  Gateway bind mode
│  LAN (All interfaces)
│
◇  Gateway auth
│  Token
│
◇  Tailscale exposure
│  Off

Finalmente te saldrá un token (una clave alfanumérica larga) que debes copiar y guardar.

### 2. Reiniciar el contenedor

```powershell
docker compose restart
```

### 3. Entrar al Dashboard
Abre:

http://127.0.0.1:18789/?token=<token>

En esta primera conexión, el sistema te dirá que no estás autorizado. Continúa con el siguiente paso para aprobar tu host.

### 4. Emparejar Host

Primera vez que se ingresa se debe dar permiso al host.

```powershell
docker compose exec openclaw openclaw devices list
```

```powershell
docker compose exec openclaw openclaw devices approve <request_id>
```

## Comandos Útiles

### Gestión del Contenedor

```powershell
# Ver estado
docker compose ps

# Ver logs
docker compose logs -f openclaw

# Reiniciar
docker compose restart openclaw

# Detener
docker compose stop openclaw

# Eliminar (⚠️ mantiene datos)
docker compose down

# Eliminar con datos (⚠️)
docker compose down -v
```

### Comandos OpenClaw

```powershell
# Estado general
docker compose exec openclaw openclaw status --all

# Health check
docker compose exec openclaw openclaw health

# Configuración interactiva
docker compose exec openclaw openclaw onboard

# Ver configuración web
docker compose exec openclaw openclaw configure
```

## Estructura de Carpetas

```
openclaw-docker/
├── Dockerfile              # Imagen Docker
├── docker compose.yml      # Configuración de Docker Compose
├── entrypoint.sh          # Script de entrada
├── .env.example           # Archivo de ejemplo de variables
├── .env                   # Variables de entorno (crear desde .env.example)
├── .gitignore             # Archivos ignorados por Git
├── data/                  # Datos persistentes
└── README.md              # Este archivo
```

## Solución de Problemas

### El contenedor no inicia

```powershell
# Ver logs detallados
docker compose logs openclaw

# Verificar que los puertos están libres
netstat -ano | findstr "18789"
```

### Dashboard no responde

```powershell
# Reiniciar el contenedor
docker compose restart openclaw

# Verificar gateway
docker compose logs openclaw | findstr "gateway"
```

### Error "no auth configured"

Asegúrate de completar el onboarding inicial y configurar el proveedor correspondiente.

## Documentación Adicional

- Documentación oficial: https://docs.openclaw.ai
- GitHub: https://github.com/openclaw/openclaw
- Guía completa: Ver archivo `instructions.md`

## Notas Importantes

⚠️ **Seguridad:**
- Nunca expongas el puerto 18789 sin autenticación en Internet
- Mantén las API keys fuera del repositorio (nunca en el Dockerfile)
- Genera tokens fuertes

📝 **Requisitos:**
- Docker Engine >= 20.10
- Docker Compose >= 2.0
- Mínimo 2GB RAM disponibles
- Puertos 18789 disponibles

## Soporte

Para problemas adicionales, consulta:
1. Los logs: `docker compose logs openclaw`
2. La documentación oficial en https://docs.openclaw.ai
3. El archivo completo de instrucciones en `instructions.md`
