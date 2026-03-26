import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWorkerApp } from "../src/http/server.js";
import type { BrowserPageLike, BrowserSessionFactory } from "../src/types.js";

const testDir = fileURLToPath(new URL(".", import.meta.url));

class MockPage implements BrowserPageLike {
  private currentUrl = "";

  private currentHtml = "";

  constructor(private readonly routes: Record<string, string>) {}

  async goto(url: string): Promise<void> {
    const html = this.routes[url];
    if (!html) {
      throw new Error(`Route not mocked: ${url}`);
    }

    this.currentUrl = url;
    this.currentHtml = html;
  }

  async waitForLoadState(): Promise<void> {
    return;
  }

  async content(): Promise<string> {
    return this.currentHtml;
  }

  url(): string {
    return this.currentUrl;
  }

  async screenshot(): Promise<void> {
    return;
  }
}

class MockBrowserFactory implements BrowserSessionFactory {
  constructor(private readonly routes: Record<string, string>) {}

  async withPage<T>(handler: (page: BrowserPageLike) => Promise<T>): Promise<T> {
    return handler(new MockPage(this.routes));
  }

  async close(): Promise<void> {
    return;
  }
}

async function fixture(name: string): Promise<string> {
  return readFile(join(testDir, "fixtures", name), "utf8");
}

describe("linkedin-research-worker integration", () => {
  it("extracts a profile through the HTTP route", async () => {
    const routes = {
      "https://www.linkedin.com/in/ana-lopez/": await fixture("profile-main.html"),
      "https://www.linkedin.com/in/ana-lopez/details/experience/": await fixture(
        "profile-experience.html",
      ),
      "https://www.linkedin.com/in/ana-lopez/details/education/": await fixture(
        "profile-education.html",
      ),
      "https://www.linkedin.com/in/ana-lopez/details/skills/": await fixture("profile-skills.html"),
    };

    const app = buildWorkerApp({
      config: {
        host: "127.0.0.1",
        port: 8787,
        storageStatePath: "./.secrets/storage-state.json",
        pageTimeoutMs: 30000,
        retries: 0,
        concurrency: 1,
        debug: false,
        debugOnError: false,
        debugArtifactsDir: "./debug-artifacts",
      },
      browserFactory: new MockBrowserFactory(routes),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/linkedin/profile/fetch",
      payload: {
        profileUrl: "https://www.linkedin.com/in/ana-lopez/",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.data.entityType).toBe("person");
    expect(body.data.fullName).toBe("Ana Lopez");
    expect(body.data.currentCompany).toBe("Acme AI");
    expect(body.data.skills).toContain("Talent Acquisition");

    await app.close();
  });

  it("degrades gracefully when optional company pages are missing", async () => {
    const routes = {
      "https://www.linkedin.com/company/quietco/": await fixture("company-main-minimal.html"),
    };

    const app = buildWorkerApp({
      config: {
        host: "127.0.0.1",
        port: 8787,
        storageStatePath: "./.secrets/storage-state.json",
        pageTimeoutMs: 30000,
        retries: 0,
        concurrency: 1,
        debug: false,
        debugOnError: false,
        debugArtifactsDir: "./debug-artifacts",
      },
      browserFactory: new MockBrowserFactory(routes),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/linkedin/company/fetch",
      payload: {
        companyUrl: "https://www.linkedin.com/company/quietco/",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.data.entityType).toBe("company");
    expect(body.data.companyName).toBe("QuietCo");
    expect(body.data.about).toBeNull();
    expect(body.data.specialties).toEqual([]);

    await app.close();
  });
});
