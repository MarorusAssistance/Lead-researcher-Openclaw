#!/bin/bash
set -e

trap 'echo "Recibiendo señal de terminación..."; exit 0' SIGTERM SIGINT

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Iniciando OpenClaw en Docker...${NC}"

if ! command -v openclaw &> /dev/null; then
    echo -e "${RED}❌ OpenClaw no está instalado${NC}"
    exit 1
fi

echo -e "${GREEN}✓ OpenClaw CLI encontrado${NC}"

TOKEN_FILE="$OPENCLAW_HOME/.gateway_token"

mkdir -p "$OPENCLAW_HOME"

if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    echo -e "${GREEN}🔐 Usando OPENCLAW_GATEWAY_TOKEN del entorno${NC}"
    printf '%s' "$OPENCLAW_GATEWAY_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
elif [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
    echo -e "${GREEN}🔐 Usando token persistido en .gateway_token${NC}"
    export OPENCLAW_GATEWAY_TOKEN="$(cat "$TOKEN_FILE")"
else
    echo -e "${YELLOW}🔑 Generando token de gateway por primera vez...${NC}"
    export OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
    printf '%s' "$OPENCLAW_GATEWAY_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo -e "${GREEN}✓ Token generado y guardado en .gateway_token${NC}"
fi

echo -e "${GREEN}🚀 Ejecutando: $@${NC}"
exec "$@"