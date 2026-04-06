import { tool } from "ai";
import { z } from "zod";
import type { BrowserToolContext } from "./browserToolRuntime";

const MISSING_TARGET_MESSAGE = "Error: Provide either ref or selector";
const MAX_JS_OUTPUT = 8000;

function stringifyJavaScriptResult(result: unknown): string {
  if (result === undefined || result === null) {
    return String(result);
  }

  if (typeof result === "object") {
    return JSON.stringify(result, null, 2);
  }

  return String(result);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createPageInteractionTools(context: BrowserToolContext) {
  const { emitToolEvent, ensureContentScript, autoScreenshot, resolveTab } =
    context;

  return {
    click: tool({
      description: [
        "Click an element on the page.",
        "ALWAYS prefer using a ref number from read_page() or find().",
        "Falls back to CSS selector if ref is not available (pierces shadow DOM).",
        "MUST provide either ref or selector - not both.",
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
        ref: z
          .number()
          .optional()
          .describe("Element ref number from read_page or find"),
        selector: z
          .string()
          .optional()
          .describe("CSS selector fallback if no ref is available"),
      }),
      execute: async ({ tabId, ref, selector }) => {
        const input = ref != null ? { tabId, ref } : { tabId, selector };
        const step = emitToolEvent("click", input, "started");
        try {
          const tab = resolveTab(tabId);
          await ensureContentScript(tab);
          const urlBefore = tab.webContents.getURL();

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
            emitToolEvent(
              "click",
              input,
              "error",
              undefined,
              MISSING_TARGET_MESSAGE,
              step,
            );
            return MISSING_TARGET_MESSAGE;
          }

          if (!result.ok) {
            emitToolEvent(
              "click",
              input,
              "error",
              undefined,
              result.error,
              step,
            );
            return `Error: ${result.error}`;
          }

          const message = `Clicked <${result.tag}>${result.text ? ` "${result.text}"` : ""}`;
          emitToolEvent("click", input, "completed", message, undefined, step);

          const screenshotSuffix = await autoScreenshot();
          await new Promise((resolve) => setTimeout(resolve, 300));

          const urlAfter = tab.webContents.getURL();
          if (urlAfter !== urlBefore) {
            return message + screenshotSuffix + context.navigationWarning;
          }

          return message + screenshotSuffix;
        } catch (error) {
          const message = context.formatError("Error clicking element", error);
          emitToolEvent("click", input, "error", undefined, message, step);
          return message;
        }
      },
    }),

    type: tool({
      description: [
        "Type text into an input field.",
        "ALWAYS prefer using a ref number from read_page() or find().",
        "Focuses the element, clears existing content, then simulates real keyboard input character by character.",
        "Works with all frameworks (React, YouTube, etc).",
        "ONLY works on input, textarea, select, and contenteditable elements.",
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
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
      execute: async ({ tabId, ref, selector, text }) => {
        const input =
          ref != null ? { tabId, ref, text } : { tabId, selector, text };
        const step = emitToolEvent("type", input, "started");
        try {
          const tab = resolveTab(tabId);
          await ensureContentScript(tab);

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
            emitToolEvent(
              "type",
              input,
              "error",
              undefined,
              MISSING_TARGET_MESSAGE,
              step,
            );
            return MISSING_TARGET_MESSAGE;
          }

          if (!focusResult.ok) {
            emitToolEvent(
              "type",
              input,
              "error",
              undefined,
              focusResult.error,
              step,
            );
            return `Error: ${focusResult.error}`;
          }

          for (const char of text) {
            tab.webContents.sendInputEvent({
              type: "keyDown",
              keyCode: char,
            });
            tab.webContents.sendInputEvent({ type: "char", keyCode: char });
            tab.webContents.sendInputEvent({ type: "keyUp", keyCode: char });
          }

          const message = `Typed "${text}" into <${focusResult.tag}>`;
          emitToolEvent("type", input, "completed", message, undefined, step);
          return message + (await autoScreenshot());
        } catch (error) {
          const message = context.formatError(
            "Error typing into element",
            error,
          );
          emitToolEvent("type", input, "error", undefined, message, step);
          return message;
        }
      },
    }),

    press_key: tool({
      description: [
        "Press a keyboard key.",
        "Use to submit forms (Enter), navigate fields (Tab), close dialogs (Escape), or scroll (ArrowDown/ArrowUp).",
        "Common keys: Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, Space.",
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
        key: z
          .string()
          .describe(
            "The key to press (e.g. 'Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown')",
          ),
      }),
      execute: async ({ tabId, key }) => {
        const step = emitToolEvent("press_key", { tabId, key }, "started");
        try {
          const tab = resolveTab(tabId);
          tab.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
          tab.webContents.sendInputEvent({ type: "keyUp", keyCode: key });

          const message = `Pressed "${key}" key`;
          emitToolEvent(
            "press_key",
            { key },
            "completed",
            message,
            undefined,
            step,
          );
          return message + (await autoScreenshot());
        } catch (error) {
          const message = context.formatError(
            `Error pressing key "${key}"`,
            error,
          );
          emitToolEvent(
            "press_key",
            { key },
            "error",
            undefined,
            message,
            step,
          );
          return message;
        }
      },
    }),

    javascript: tool({
      description: [
        "Execute JavaScript in the page context.",
        "Use as an escape hatch when other tools cannot accomplish the task.",
        "The code runs in the web page's context with full access to DOM and window.",
        "Returns the result of the last expression.",
        "NEVER use for simple tasks that click(), type(), or find() can handle.",
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
        code: z
          .string()
          .describe("JavaScript code to execute in the page context"),
      }),
      execute: async ({ tabId, code }) => {
        const input = { tabId, code: code.substring(0, 200) };
        const step = emitToolEvent("javascript", input, "started");
        try {
          const tab = resolveTab(tabId);
          const result = await tab.runJs<unknown>(code);

          let output = stringifyJavaScriptResult(result);
          if (output.length > MAX_JS_OUTPUT) {
            output = `${output.substring(0, MAX_JS_OUTPUT)}\n... (truncated)`;
          }

          emitToolEvent(
            "javascript",
            input,
            "completed",
            output,
            undefined,
            step,
          );
          return output;
        } catch (error) {
          const message = context.formatError("JavaScript error", error);
          emitToolEvent("javascript", input, "error", undefined, message, step);
          return message;
        }
      },
    }),
  };
}
