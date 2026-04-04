import { tool } from "ai";
import { z } from "zod";
import type { Tab } from "../Tab";
import type { AgentToolEvent } from "./types";
import { getContentScriptSource } from "./contentScript";

type ToolCallRef = { stepIndex: number; callId: string };

type EmitToolEvent = (
  toolName: string,
  input: Record<string, unknown>,
  status: AgentToolEvent["status"],
  result?: string,
  error?: string,
  ref?: ToolCallRef,
) => ToolCallRef;

interface BrowserToolDeps {
  getActiveTab: () => Tab;
  captureScreenshot: () => Promise<string | null>;
  emitToolEvent: EmitToolEvent;
  openTab: (url?: string) => Tab;
}

/**
 * Ensure the __blueberry content script is injected into the active tab.
 * Idempotent -- re-injects only after navigations that wipe the page context.
 */
async function ensureContentScript(tab: Tab): Promise<void> {
  const injected = await tab.runJs<boolean>(
    "typeof window.__blueberry !== 'undefined'",
  );
  if (!injected) {
    await tab.runJs(getContentScriptSource());
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createBrowserTools(deps: BrowserToolDeps) {
  const { getActiveTab, captureScreenshot, emitToolEvent, openTab } = deps;

  /**
   * Auto-capture a screenshot after an action and attach it to the message
   * context so the model can see results without wasting a tool call.
   * Returns a suffix to append to the tool result text.
   */
  async function autoScreenshot(): Promise<string> {
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

  return {
    // =====================================================================
    // read_page -- structured page reading with ref-tagged interactive els
    // =====================================================================
    read_page: tool({
      description:
        "Read the current page structure. Returns headings, forms, and all interactive elements (links, buttons, inputs, etc.) tagged with ref numbers. Use the ref numbers with the click and type tools. Always call this before interacting with a new page.",
      inputSchema: z.object({}),
      execute: async () => {
        const step = emitToolEvent("read_page", {}, "started");
        try {
          const tab = getActiveTab();
          await ensureContentScript(tab);
          const result = await tab.runJs<string>(
            "window.__blueberry.readPage()",
          );
          emitToolEvent(
            "read_page",
            {},
            "completed",
            `Read ${result.length} chars`,
            undefined,
            step,
          );
          return result;
        } catch (err) {
          const msg = `Error reading page: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("read_page", {}, "error", undefined, msg, step);
          return msg;
        }
      },
    }),

    // =====================================================================
    // find -- multi-strategy element search returning refs
    // =====================================================================
    find: tool({
      description:
        "Find elements on the page using various strategies. Returns matching elements with ref numbers you can pass to click/type. Provide at least one search parameter. Searches pierce shadow DOM boundaries.",
      inputSchema: z.object({
        css: z.string().optional().describe("CSS selector to search for"),
        text: z
          .string()
          .optional()
          .describe(
            "Text content to search for (case-insensitive partial match)",
          ),
        ariaLabel: z
          .string()
          .optional()
          .describe(
            "aria-label value to search for (case-insensitive partial match)",
          ),
        role: z
          .string()
          .optional()
          .describe(
            "ARIA role to search for (e.g. 'button', 'textbox', 'link')",
          ),
        placeholder: z
          .string()
          .optional()
          .describe(
            "Placeholder text to search for (inputs/textareas, case-insensitive)",
          ),
      }),
      execute: async (query) => {
        const step = emitToolEvent("find", query as Record<string, unknown>, "started");
        try {
          const tab = getActiveTab();
          await ensureContentScript(tab);
          const results = await tab.runJs<
            Array<{ ref: number; description: string }>
          >(`window.__blueberry.find(${JSON.stringify(query)})`);

          if (results.length === 0) {
            const msg = "No elements found matching the query.";
            emitToolEvent(
              "find",
              query as Record<string, unknown>,
              "completed",
              msg,
              undefined,
              step,
            );
            return msg;
          }

          const lines = results.map((r) => `[ref=${r.ref}] ${r.description}`);
          const msg = `Found ${results.length} element(s):\n${lines.join("\n")}`;
          emitToolEvent(
            "find",
            query as Record<string, unknown>,
            "completed",
            msg,
            undefined,
            step,
          );
          return msg;
        } catch (err) {
          const msg = `Error finding elements: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent(
            "find",
            query as Record<string, unknown>,
            "error",
            undefined,
            msg,
            step,
          );
          return msg;
        }
      },
    }),

    // =====================================================================
    // click -- click by ref (preferred) or CSS selector (fallback)
    // =====================================================================
    click: tool({
      description:
        "Click an element on the page. Prefer using a ref number from read_page or find. Falls back to CSS selector if ref is not available (pierces shadow DOM).",
      inputSchema: z.object({
        ref: z
          .number()
          .optional()
          .describe("Element ref number from read_page or find"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector fallback if no ref is available"),
      }),
      execute: async ({ ref, selector }) => {
        const input = ref != null ? { ref } : { selector };
        const step = emitToolEvent("click", input, "started");
        try {
          const tab = getActiveTab();
          await ensureContentScript(tab);

          let result: {
            ok: boolean;
            error?: string;
            tag?: string;
            text?: string;
          };
          if (ref != null) {
            result = await tab.runJs(`window.__blueberry.click(${ref})`);
          } else if (selector) {
            result = await tab.runJs(
              `window.__blueberry.clickBySelector(${JSON.stringify(selector)})`,
            );
          } else {
            const msg = "Error: Provide either ref or selector";
            emitToolEvent("click", input, "error", undefined, msg, step);
            return msg;
          }

          if (!result.ok) {
            emitToolEvent("click", input, "error", undefined, result.error, step);
            return `Error: ${result.error}`;
          }
          const msg = `Clicked <${result.tag}>${result.text ? ` "${result.text}"` : ""}`;
          emitToolEvent("click", input, "completed", msg, undefined, step);
          return msg + (await autoScreenshot());
        } catch (err) {
          const msg = `Error clicking element: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("click", input, "error", undefined, msg, step);
          return msg;
        }
      },
    }),

    // =====================================================================
    // type -- type into element using Electron keyboard simulation
    // =====================================================================
    type: tool({
      description:
        "Type text into an input field. Prefer using a ref number from read_page or find. Focuses the element, clears it, then simulates real keyboard input character by character so it works with all frameworks (React, YouTube, etc). Only works on input, textarea, select, and contenteditable elements.",
      inputSchema: z.object({
        ref: z
          .number()
          .optional()
          .describe("Element ref number from read_page or find"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector fallback if no ref is available"),
        text: z.string().describe("The text to type into the field"),
      }),
      execute: async ({ ref, selector, text }) => {
        const input = ref != null ? { ref, text } : { selector, text };
        const step = emitToolEvent("type", input, "started");
        try {
          const tab = getActiveTab();
          await ensureContentScript(tab);

          // Step 1: Focus the element and clear it (in page context)
          let focusResult: { ok: boolean; error?: string; tag?: string };
          if (ref != null) {
            focusResult = await tab.runJs(
              `window.__blueberry.focusForTyping(${ref})`,
            );
          } else if (selector) {
            focusResult = await tab.runJs(
              `window.__blueberry.focusBySelector(${JSON.stringify(selector)})`,
            );
          } else {
            const msg = "Error: Provide either ref or selector";
            emitToolEvent("type", input, "error", undefined, msg, step);
            return msg;
          }

          if (!focusResult.ok) {
            emitToolEvent("type", input, "error", undefined, focusResult.error, step);
            return `Error: ${focusResult.error}`;
          }

          // Step 2: Type each character using Electron's sendInputEvent
          for (const char of text) {
            tab.webContents.sendInputEvent({
              type: "keyDown",
              keyCode: char,
            });
            tab.webContents.sendInputEvent({ type: "char", keyCode: char });
            tab.webContents.sendInputEvent({ type: "keyUp", keyCode: char });
          }

          const msg = `Typed "${text}" into <${focusResult.tag}>`;
          emitToolEvent("type", input, "completed", msg, undefined, step);
          return msg + (await autoScreenshot());
        } catch (err) {
          const msg = `Error typing into element: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("type", input, "error", undefined, msg, step);
          return msg;
        }
      },
    }),

    // =====================================================================
    // press_key -- press a keyboard key (Enter, Tab, Escape, etc.)
    // =====================================================================
    press_key: tool({
      description:
        "Press a keyboard key. Use this to submit forms (Enter), move between fields (Tab), close dialogs (Escape), etc. Common keys: Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, Space.",
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "The key to press (e.g. 'Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown')",
          ),
      }),
      execute: async ({ key }) => {
        const step = emitToolEvent("press_key", { key }, "started");
        try {
          const tab = getActiveTab();
          tab.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
          tab.webContents.sendInputEvent({ type: "keyUp", keyCode: key });

          const msg = `Pressed "${key}" key`;
          emitToolEvent("press_key", { key }, "completed", msg, undefined, step);
          return msg + (await autoScreenshot());
        } catch (err) {
          const msg = `Error pressing key "${key}": ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("press_key", { key }, "error", undefined, msg, step);
          return msg;
        }
      },
    }),

    // =====================================================================
    // navigate -- go to a URL
    // =====================================================================
    navigate: tool({
      description:
        "Navigate the browser to a URL. Provide a full URL including https://. After navigation, call read_page to understand the new page.",
      inputSchema: z.object({
        url: z.string().url().describe("The full URL to navigate to"),
      }),
      execute: async ({ url }) => {
        const step = emitToolEvent("navigate", { url }, "started");
        try {
          const tab = getActiveTab();

          const loaded = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              tab.webContents.removeListener("did-finish-load", onLoad);
              tab.webContents.removeListener("did-fail-load", onFail);
              resolve();
            }, 30_000);

            const onLoad = (): void => {
              clearTimeout(timeout);
              tab.webContents.removeListener("did-fail-load", onFail);
              resolve();
            };
            const onFail = (
              _event: Electron.Event,
              errorCode: number,
              errorDesc: string,
              _validatedURL: string,
              isMainFrame: boolean,
            ): void => {
              if (!isMainFrame) return;
              if (errorCode === -3) return;
              clearTimeout(timeout);
              tab.webContents.removeListener("did-finish-load", onLoad);
              reject(
                new Error(`Navigation failed (${errorCode}): ${errorDesc}`),
              );
            };

            tab.webContents.once("did-finish-load", onLoad);
            tab.webContents.once("did-fail-load", onFail);
          });

          await tab.loadURL(url);
          await loaded;

          const result = `Navigated to ${tab.url} -- page title: "${tab.title}"`;
          emitToolEvent("navigate", { url }, "completed", result, undefined, step);
          return result + (await autoScreenshot());
        } catch (err) {
          const msg = `Error navigating to "${url}": ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("navigate", { url }, "error", undefined, msg, step);
          return msg;
        }
      },
    }),

    // =====================================================================
    // screenshot -- capture current page as JPEG
    // =====================================================================
    screenshot: tool({
      description:
        "Take a screenshot of the current page. The image is captured as JPEG and attached for you to see. Use after actions to verify results visually.",
      inputSchema: z.object({}),
      execute: async () => {
        const step = emitToolEvent("screenshot", {}, "started");
        try {
          const screenshot = await captureScreenshot();
          if (!screenshot) {
            const msg = "Error: Could not capture screenshot -- no active tab";
            emitToolEvent("screenshot", {}, "error", undefined, msg, step);
            return msg;
          }
          const msg =
            "Screenshot captured successfully. I can now see the current state of the page.";
          emitToolEvent("screenshot", {}, "completed", msg, undefined, step);
          return msg;
        } catch (err) {
          const msg = `Error capturing screenshot: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("screenshot", {}, "error", undefined, msg, step);
          return msg;
        }
      },
    }),

    // =====================================================================
    // javascript -- run arbitrary JS in the page context (escape hatch)
    // =====================================================================
    javascript: tool({
      description:
        "Execute arbitrary JavaScript in the page context. Use this as an escape hatch when other tools cannot accomplish the task. The code runs in the web page's context (has access to DOM, window, etc). Returns the result of the last expression. The __blueberry API is available if the content script has been injected.",
      inputSchema: z.object({
        code: z
          .string()
          .describe("JavaScript code to execute in the page context"),
      }),
      execute: async ({ code }) => {
        const step = emitToolEvent(
          "javascript",
          { code: code.substring(0, 200) },
          "started",
        );
        try {
          const tab = getActiveTab();
          const result = await tab.runJs<unknown>(code);

          let output: string;
          if (result === undefined || result === null) {
            output = String(result);
          } else if (typeof result === "object") {
            output = JSON.stringify(result, null, 2);
          } else {
            output = String(result);
          }

          const MAX_JS_OUTPUT = 8000;
          if (output.length > MAX_JS_OUTPUT) {
            output = output.substring(0, MAX_JS_OUTPUT) + "\n... (truncated)";
          }

          emitToolEvent(
            "javascript",
            { code: code.substring(0, 200) },
            "completed",
            output,
            undefined,
            step,
          );
          return output;
        } catch (err) {
          const msg = `JavaScript error: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent(
            "javascript",
            { code: code.substring(0, 200) },
            "error",
            undefined,
            msg,
            step,
          );
          return msg;
        }
      },
    }),

    // =====================================================================
    // open_tab -- open a URL in a new tab
    // =====================================================================
    open_tab: tool({
      description:
        "Open a URL in a new browser tab and switch to it. Use this when the user asks to open something in a new tab, or when you want to keep the current page open while visiting another. After opening, call read_page to understand the new page.",
      inputSchema: z.object({
        url: z.string().url().describe("The full URL to open in a new tab"),
      }),
      execute: async ({ url }) => {
        const step = emitToolEvent("open_tab", { url }, "started");
        try {
          const tab = openTab(url);

          // Wait for the page to load
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              tab.webContents.removeListener("did-finish-load", onLoad);
              resolve();
            }, 30_000);
            const onLoad = (): void => {
              clearTimeout(timeout);
              resolve();
            };
            tab.webContents.once("did-finish-load", onLoad);
          });

          const result = `Opened new tab: ${tab.url} -- title: "${tab.title}"`;
          emitToolEvent("open_tab", { url }, "completed", result, undefined, step);
          return result + (await autoScreenshot());
        } catch (err) {
          const msg = `Error opening new tab: ${err instanceof Error ? err.message : String(err)}`;
          emitToolEvent("open_tab", { url }, "error", undefined, msg, step);
          return msg;
        }
      },
    }),
  };
}
