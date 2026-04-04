import type { Tab } from "../Tab";
import { getContentScriptSource } from "./contentScript";
import type { AgentToolEvent } from "./types";

export type ToolCallRef = { stepIndex: number; callId: string };

export type EmitToolEvent = (
  toolName: string,
  input: Record<string, unknown>,
  status: AgentToolEvent["status"],
  result?: string,
  error?: string,
  ref?: ToolCallRef,
) => ToolCallRef;

export interface BrowserToolDeps {
  getWorkTab: () => Tab;
  captureScreenshot: () => Promise<string | null>;
  emitToolEvent: EmitToolEvent;
  openTab: (url?: string) => Tab;
  hasWorkTab: () => boolean;
}

export interface BrowserToolContext extends BrowserToolDeps {
  autoScreenshot: () => Promise<string>;
  ensureContentScript: (tab: Tab) => Promise<void>;
  waitForLoad: (
    tab: Tab,
    options?: { rejectOnMainFrameFailure?: boolean; timeoutMs?: number },
  ) => Promise<void>;
  formatError: (prefix: string, error: unknown) => string;
  navigationWarning: string;
}

const DEFAULT_LOAD_TIMEOUT_MS = 30_000;

const NAVIGATION_WARNING =
  "\n\u26A0 All previous refs are now invalid. Use find() or read_page() to get fresh refs before clicking or typing.";

async function autoScreenshot(
  captureScreenshot: () => Promise<string | null>,
): Promise<string> {
  try {
    const screenshot = await captureScreenshot();
    if (screenshot) {
      return "\n[Screenshot attached -- you can see the current page state]";
    }
  } catch {
    // Non-critical -- the model can still call screenshot manually
  }
  return "";
}

export async function ensureContentScript(tab: Tab): Promise<void> {
  const injected = await tab.runJs<boolean>(
    "typeof window.__blueberry !== 'undefined'",
  );
  if (!injected) {
    await tab.runJs(getContentScriptSource());
  }
}

export function waitForLoad(
  tab: Tab,
  options: { rejectOnMainFrameFailure?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const {
    rejectOnMainFrameFailure = false,
    timeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  } = options;

  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      tab.webContents.removeListener("did-finish-load", onLoad);
      tab.webContents.removeListener("did-fail-load", onFail);
    };

    const onLoad = (): void => {
      cleanup();
      resolve();
    };

    const onFail = (
      _event: Electron.Event,
      errorCode: number,
      errorDesc: string,
      _validatedURL: string,
      isMainFrame: boolean,
    ): void => {
      if (!isMainFrame || errorCode === -3) return;
      cleanup();
      if (rejectOnMainFrameFailure) {
        reject(new Error(`Navigation failed (${errorCode}): ${errorDesc}`));
        return;
      }
      resolve();
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    tab.webContents.once("did-finish-load", onLoad);
    tab.webContents.once("did-fail-load", onFail);
  });
}

export function createBrowserToolContext(
  deps: BrowserToolDeps,
): BrowserToolContext {
  return {
    ...deps,
    autoScreenshot: () => autoScreenshot(deps.captureScreenshot),
    ensureContentScript,
    waitForLoad,
    formatError: (prefix, error) =>
      `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
    navigationWarning: NAVIGATION_WARNING,
  };
}
