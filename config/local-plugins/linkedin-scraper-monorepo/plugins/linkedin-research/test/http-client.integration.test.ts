import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { LinkedInResearchWorkerClient } from "../src/http-client.js";

function listenOnce(
  handler: Parameters<typeof createServer>[0],
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server address unavailable"));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

describe("LinkedInResearchWorkerClient", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      await closers.pop()?.();
    }
  });

  it("returns validated profile data from the worker", async () => {
    const server = await listenOnce((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ok: true,
          data: {
            entityType: "person",
            fullName: "Ana Lopez",
            headline: null,
            location: null,
            about: null,
            currentCompany: null,
            currentRole: null,
            experience: [],
            education: [],
            skills: [],
            profileUrl: "https://www.linkedin.com/in/ana-lopez/",
            companyGuess: null,
            regionGuess: null,
            contactabilitySignals: [],
          },
          meta: {
            requestId: "req-1",
            durationMs: 10,
            attempts: 1,
          },
        }),
      );
    });
    closers.push(server.close);

    const client = new LinkedInResearchWorkerClient({
      workerBaseUrl: server.baseUrl,
      requestTimeoutMs: 30000,
      debug: false,
    });

    const profile = await client.fetchProfile("https://www.linkedin.com/in/ana-lopez/");
    expect(profile.entityType).toBe("person");
    expect(profile.fullName).toBe("Ana Lopez");
  });

  it("maps typed worker errors", async () => {
    const server = await listenOnce((_request, response) => {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ok: false,
          error: {
            code: "session_invalid",
            message: "Session expired",
            status: 401,
            retryable: false,
          },
        }),
      );
    });
    closers.push(server.close);

    const client = new LinkedInResearchWorkerClient({
      workerBaseUrl: server.baseUrl,
      requestTimeoutMs: 30000,
      debug: false,
    });

    await expect(client.fetchProfile("https://www.linkedin.com/in/ana-lopez/")).rejects.toMatchObject(
      {
        code: "session_invalid",
        status: 401,
      },
    );
  });

  it("fails when the worker returns an invalid payload", async () => {
    const server = await listenOnce((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          ok: true,
          data: {
            nope: true,
          },
          meta: {
            requestId: "req-1",
            durationMs: 10,
            attempts: 1,
          },
        }),
      );
    });
    closers.push(server.close);

    const client = new LinkedInResearchWorkerClient({
      workerBaseUrl: server.baseUrl,
      requestTimeoutMs: 30000,
      debug: false,
    });

    await expect(client.fetchProfile("https://www.linkedin.com/in/ana-lopez/")).rejects.toMatchObject(
      {
        code: "validation_error",
        status: 502,
      },
    );
  });

  it("times out worker calls", async () => {
    const server = await listenOnce((_request, _response) => {
      // Keep the socket open past the client timeout.
    });
    closers.push(server.close);

    const client = new LinkedInResearchWorkerClient({
      workerBaseUrl: server.baseUrl,
      requestTimeoutMs: 25,
      debug: false,
    });

    await expect(client.fetchProfile("https://www.linkedin.com/in/ana-lopez/")).rejects.toMatchObject(
      {
        code: "timeout",
        status: 504,
      },
    );
  });
});
