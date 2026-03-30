FROM node:22-bookworm-slim

LABEL maintainer="OpenClaw Docker Setup"
LABEL description="OpenClaw gateway container for LOLO-openclaw-gateway"
LABEL version="1.1"

ENV NODE_ENV=production \
    HOME=/home/openclaw \
    OPENCLAW_STATE_DIR=/home/openclaw/.openclaw \
    OPENCLAW_GATEWAY_PORT=18789 \
    PNPM_HOME=/home/openclaw/.local/share/pnpm \
    PATH="/home/openclaw/.local/share/pnpm:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    file \
    git \
    openssl \
    procps \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r openclaw && useradd -r -g openclaw -m -d /home/openclaw -s /bin/bash openclaw

RUN npm install -g pnpm@latest openclaw@2026.3.13 \
    && npm cache clean --force

RUN mkdir -p ${OPENCLAW_STATE_DIR} \
    && mkdir -p ${OPENCLAW_STATE_DIR}/agents \
    && mkdir -p ${OPENCLAW_STATE_DIR}/credentials \
    && mkdir -p ${OPENCLAW_STATE_DIR}/local-plugins \
    && mkdir -p ${OPENCLAW_STATE_DIR}/plugin-state \
    && mkdir -p ${OPENCLAW_STATE_DIR}/workspace \
    && mkdir -p /home/openclaw/.cache \
    && mkdir -p /home/openclaw/.local/share/pnpm \
    && chown -R openclaw:openclaw /home/openclaw

WORKDIR /home/openclaw

COPY entrypoint.sh /usr/local/bin/openclaw-entrypoint
COPY . /project
RUN chmod +x /usr/local/bin/openclaw-entrypoint
RUN chown -R openclaw:openclaw /project/config/agents

USER openclaw

EXPOSE 18789

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/healthz" || exit 1

ENTRYPOINT ["/usr/local/bin/openclaw-entrypoint"]
CMD ["openclaw", "gateway", "--verbose", "--allow-unconfigured", "--bind", "lan"]
