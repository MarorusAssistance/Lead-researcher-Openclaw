FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json tsconfig.base.json vitest.config.ts ./
COPY packages/shared/package.json packages/shared/package.json
COPY workers/linkedin-research-worker/package.json workers/linkedin-research-worker/package.json

RUN npm install --include-workspace-root

COPY packages/shared ./packages/shared
COPY workers/linkedin-research-worker ./workers/linkedin-research-worker

RUN npx playwright install --with-deps chromium \
  && npm run build --workspace @linkedin-research/shared \
  && npm run build --workspace linkedin-research-worker

EXPOSE 8787

CMD ["npm", "run", "start", "--workspace", "linkedin-research-worker"]
