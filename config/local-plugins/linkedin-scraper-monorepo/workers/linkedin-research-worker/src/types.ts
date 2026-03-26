export type BrowserWaitState = "domcontentloaded" | "load" | "networkidle";

export type BrowserPageLike = {
  goto: (
    url: string,
    options?: {
      timeout?: number;
      waitUntil?: BrowserWaitState;
    },
  ) => Promise<void>;
  waitForLoadState: (
    state?: BrowserWaitState,
    options?: {
      timeout?: number;
    },
  ) => Promise<void>;
  content: () => Promise<string>;
  url: () => string;
  screenshot: (options: { path: string; fullPage?: boolean }) => Promise<void>;
};

export type BrowserSessionFactory = {
  withPage: <T>(handler: (page: BrowserPageLike) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export type DebugArtifacts = {
  screenshotPath?: string;
  htmlPath?: string;
};
