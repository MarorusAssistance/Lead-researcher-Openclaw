import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import readline from "node:readline/promises";
import { chromium } from "playwright";
import { z } from "zod";

const StorageCaptureEnvSchema = z
  .object({
    LINKEDIN_STORAGE_STATE_PATH: z.string().min(1),
    LINKEDIN_USER_AGENT: z.string().min(1).optional(),
  })
  .strict();

async function main(): Promise<void> {
  const env = StorageCaptureEnvSchema.parse(process.env);
  const storagePath = resolve(env.LINKEDIN_STORAGE_STATE_PATH);
  await mkdir(dirname(storagePath), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
  });
  const context = await browser.newContext({
    userAgent: env.LINKEDIN_USER_AGENT,
  });
  const page = await context.newPage();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    await page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
    });

    await rl.question(
      `Completa el login manual en el navegador y pulsa Enter para guardar storageState en ${storagePath}`,
    );

    await context.storageState({
      path: storagePath,
    });

    console.log(`storageState guardado en ${storagePath}`);
  } finally {
    rl.close();
    await context.close();
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
