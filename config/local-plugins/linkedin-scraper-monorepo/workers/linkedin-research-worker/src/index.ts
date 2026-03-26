import { buildWorkerApp } from "./http/server.js";
import { loadWorkerConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const app = buildWorkerApp({ config });

  const close = async () => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
