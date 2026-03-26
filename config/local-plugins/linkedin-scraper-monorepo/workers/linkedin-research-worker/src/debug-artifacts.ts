import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { BrowserPageLike, DebugArtifacts } from "./types.js";

type CaptureDebugArtifactsOptions = {
  page: BrowserPageLike;
  html: string;
  baseDir: string;
  requestId: string;
  label: string;
  captureScreenshot: boolean;
  captureHtml: boolean;
};

export async function captureDebugArtifacts(
  options: CaptureDebugArtifactsOptions,
): Promise<DebugArtifacts | undefined> {
  if (!options.captureScreenshot && !options.captureHtml) {
    return undefined;
  }

  const baseDir = resolve(options.baseDir, options.requestId);
  await mkdir(baseDir, { recursive: true });

  const artifacts: DebugArtifacts = {};

  if (options.captureScreenshot) {
    artifacts.screenshotPath = resolve(baseDir, `${options.label}.png`);
    await mkdir(dirname(artifacts.screenshotPath), { recursive: true });
    await options.page.screenshot({
      path: artifacts.screenshotPath,
      fullPage: true,
    });
  }

  if (options.captureHtml) {
    artifacts.htmlPath = resolve(baseDir, `${options.label}.html`);
    await mkdir(dirname(artifacts.htmlPath), { recursive: true });
    await writeFile(artifacts.htmlPath, options.html, "utf8");
  }

  return artifacts;
}
