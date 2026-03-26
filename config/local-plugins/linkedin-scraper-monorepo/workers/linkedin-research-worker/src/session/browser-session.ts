import { access } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import { AppError } from "@linkedin-research/shared";
import type { BrowserPageLike, BrowserSessionFactory } from "../types.js";

type PlaywrightSessionFactoryOptions = {
  storageStatePath: string;
  userAgent?: string;
  pageTimeoutMs: number;
};

export class PlaywrightSessionFactory implements BrowserSessionFactory {
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly options: PlaywrightSessionFactoryOptions) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      await access(this.options.storageStatePath).catch(() => {
        throw new AppError("session_invalid", "LinkedIn storageState file was not found.", {
          status: 401,
          details: {
            storageStatePath: this.options.storageStatePath,
          },
        });
      });

      this.browserPromise = chromium.launch({
        headless: true,
      });
    }

    return this.browserPromise;
  }

  async withPage<T>(handler: (page: BrowserPageLike) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      storageState: this.options.storageStatePath,
      userAgent: this.options.userAgent,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(this.options.pageTimeoutMs);

    try {
      return await handler(page);
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (!this.browserPromise) {
      return;
    }

    const browser = await this.browserPromise;
    await browser.close();
    this.browserPromise = null;
  }
}
