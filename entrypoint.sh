#!/bin/bash
set -euo pipefail

trap 'echo "Stopping OpenClaw..."; exit 0' SIGTERM SIGINT

STATE_DIR="${OPENCLAW_STATE_DIR:-/home/openclaw/.openclaw}"
TOKEN_FILE="${STATE_DIR}/.gateway_token"

echo "Starting OpenClaw..."

if ! command -v openclaw >/dev/null 2>&1; then
    echo "OpenClaw CLI is not installed"
    exit 1
fi

mkdir -p "${STATE_DIR}"
mkdir -p "${STATE_DIR}/plugin-state/notion-recruiter-crm"
mkdir -p "${STATE_DIR}/workspace"
mkdir -p "${STATE_DIR}/workspace-research"
mkdir -p "${STATE_DIR}/workspace-crm"

if [ ! -d /project/config/local-plugins/notion-recruiter-crm ] || [ ! -d /project/config/local-plugins/linkedin-research ]; then
    echo "Bundled project plugins are missing under /project/config/local-plugins"
    exit 1
fi

if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    printf '%s' "${OPENCLAW_GATEWAY_TOKEN}" > "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"
elif [ -f "${TOKEN_FILE}" ] && [ -s "${TOKEN_FILE}" ]; then
    export OPENCLAW_GATEWAY_TOKEN="$(cat "${TOKEN_FILE}")"
else
    export OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
    printf '%s' "${OPENCLAW_GATEWAY_TOKEN}" > "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"
fi

echo "Gateway port: ${OPENCLAW_GATEWAY_PORT:-18789}"
echo "Workspace: /project/config/agents/workspace"
echo "Project root: /project"

exec "$@"
