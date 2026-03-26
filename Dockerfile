FROM node:22-bookworm-slim

# Metadata
LABEL maintainer="OpenClaw Docker Setup"
LABEL description="OpenClaw AI Assistant containerizado"
LABEL version="1.0"

# Variables de entorno
ENV NODE_ENV=production \
    OPENCLAW_HOME=/home/openclaw/.openclaw \
    OPENCLAW_GATEWAY_PORT=18789 \
    PNPM_HOME=/home/openclaw/.local/share/pnpm \
    HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew \
    HOMEBREW_CELLAR=/home/linuxbrew/.linuxbrew/Cellar \
    HOMEBREW_REPOSITORY=/home/linuxbrew/.linuxbrew/Homebrew \
    PATH="/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/home/openclaw/.local/share/pnpm:$PATH"

# Instalar dependencias del sistema y Homebrew
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    bash \
    python3 \
    python3-pip \
    build-essential \
    openssl \
    procps \
    file \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Instalar pnpm globalmente
RUN npm install -g pnpm@latest

# Crear usuario no-root primero (antes de instalar Homebrew)
RUN groupadd -r openclaw && useradd -r -g openclaw -m -d /home/openclaw -s /bin/bash openclaw

# Preparar directorios de Homebrew con permisos correctos
RUN mkdir -p /home/linuxbrew/.linuxbrew \
    && chown -R openclaw:openclaw /home/linuxbrew

# Instalar Homebrew como usuario no-root (Corrección del error)
USER openclaw
WORKDIR /home/openclaw
RUN git clone --depth=1 --single-branch https://github.com/Homebrew/brew /home/linuxbrew/.linuxbrew/Homebrew \
    && mkdir -p /home/linuxbrew/.linuxbrew/bin \
    && ln -s /home/linuxbrew/.linuxbrew/Homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew \
    && /home/linuxbrew/.linuxbrew/bin/brew update --force --quiet

# Volver a root para preparar directorios de sistema
USER root

# Crear directorio de datos persistentes
RUN mkdir -p ${OPENCLAW_HOME} \
    && mkdir -p ${OPENCLAW_HOME}/workspace \
    && mkdir -p ${OPENCLAW_HOME}/agents \
    && mkdir -p ${OPENCLAW_HOME}/credentials \
    && chown -R openclaw:openclaw ${OPENCLAW_HOME}

# Crear directorios para pnpm store (se montarán con tmpfs escribible)
RUN mkdir -p /home/openclaw/.local/share/pnpm \
    && mkdir -p /home/openclaw/.local/bin \
    && mkdir -p /home/openclaw/.cache \
    && chown -R openclaw:openclaw /home/openclaw

# Instalar OpenClaw globalmente
RUN npm i -g openclaw@latest

# Crear directorio de trabajo
WORKDIR /app

# Copiar script de entrada
COPY --chown=openclaw:openclaw entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Cambiar definitivamente al usuario no-root
USER openclaw

# Exponer puertos
EXPOSE ${OPENCLAW_GATEWAY_PORT}

# Volumen para persistencia
VOLUME ["${OPENCLAW_HOME}"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD openclaw health || exit 1

# Punto de entrada
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["openclaw", "gateway", "--verbose", "--allow-unconfigured"]
