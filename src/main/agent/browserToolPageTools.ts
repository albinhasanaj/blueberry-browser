import { tool } from "ai";
import { z } from "zod";
import type { BrowserToolContext } from "./browserToolRuntime";
import { trace } from "./traceLogger";

const MISSING_TARGET_MESSAGE = "Error: Provide either ref or selector";
const MAX_JS_OUTPUT = 8000;

export function createPageInteractionTools(context: BrowserToolContext) {
  const { getWorkTab, emitToolEvent, ensureContentScript, autoScreenshot } =
    context;

  return {
    read_page: tool({
      description: [
        "Read the current page structure.",
        "Returns headings, forms, and all interactive elements tagged with ref numbers.",
        "ALWAYS call this before interacting with a new or changed page.",
        "Use the returned ref numbers with click() and type() tools.",
        "If the output is too large, use find() to search for specific elements instead.",
      ].join(" "),
      inputSchema: z.object({}),
      execute: async () => {
        const step = emitToolEvent("read_page", {}, "started");
        try {
          const tab = getWorkTab();
          await ensureContentScript(tab);
          const result = await tab.runJs<string>("window.__blueberry.readPage()");
          emitToolEvent(
            "read_page",
            {},
            "completed",
            `Read ${result.length} chars`,
            undefined,
            step,
          );
          return result;
        } catch (error) {
          const message = context.formatError("Error reading page", error);
          emitToolEvent("read_page", {}, "error", undefined, message, step);
          return message;
        }
      },
    }),

    find: tool({
      description: [
        "Find elements on the page matching search criteria.",
        "Returns matching elements with ref numbers for use with click() and type().",
        "MUST provide at least one search parameter.",
        "Searches pierce shadow DOM boundaries.",
        "Use this instead of read_page() when you know what you are looking for.",
      ].join(" "),
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
        const input = query as Record<string, unknown>;
        const step = emitToolEvent("find", input, "started");
        try {
          const tab = getWorkTab();
          await ensureContentScript(tab);
          const results = await tab.runJs<
            Array<{ ref: number; description: string }>
          >(`window.__blueberry.find(${JSON.stringify(query)})`);

          if (results.length === 0) {
            const message = "No elements found matching the query.";
            trace("find", "no_results", { query: input });
            emitToolEvent("find", input, "completed", message, undefined, step);
            return message;
          }

          const lines = results.map((result) => `[ref=${result.ref}] ${result.description}`);
          const message = `Found ${results.length} element(s):\n${lines.join("\n")}`;
          trace("find", "results", {
            query: input,
            count: results.length,
            refs: results.map((result) => result.ref),
          });
          emitToolEvent("find", input, "completed", message, undefined, step);
          return message;
        } catch (error) {
          const message = context.formatError("Error finding elements", error);
          emitToolEvent("find", input, "error", undefined, message, step);
          return message;
        }
      },
    }),

    click: tool({
      description: [
        "Click an element on the page.",
        "ALWAYS prefer using a ref number from read_page() or find().",
        "Falls back to CSS selector if ref is not available (pierces shadow DOM).",
        "MUST provide either ref or selector -- not both.",
      ].join(" "),
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
          const tab = getWorkTab();
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
            emitToolEvent("click", input, "error", undefined, MISSING_TARGET_MESSAGE, step);
            return MISSING_TARGET_MESSAGE;
          }

          if (!result.ok) {
            emitToolEvent("click", input, "error", undefined, result.error, step);
            return `Error: ${result.error}`;
          }

          const message = `Clicked <${result.tag}>${result.text ? ` "${result.text}"` : ""}`;
          emitToolEvent("click", input, "completed", message, undefined, step);

          const screenshotSuffix = await autoScreenshot();
          await new Promise((resolve) => setTimeout(resolve, 300));

          const urlAfter = tab.webContents.getURL();
          if (urlAfter !== urlBefore) {
            trace("click", "triggered_navigation", {
              from: urlBefore,
              to: urlAfter,
            });
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
      ].join(" "),
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
          const tab = getWorkTab();
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
            emitToolEvent("type", input, "error", undefined, MISSING_TARGET_MESSAGE, step);
            return MISSING_TARGET_MESSAGE;
          }

          if (!focusResult.ok) {
            emitToolEvent("type", input, "error", undefined, focusResult.error, step);
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
          const message = context.formatError("Error typing into element", error);
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
      ].join(" "),
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
          const tab = getWorkTab();
          tab.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
          tab.webContents.sendInputEvent({ type: "keyUp", keyCode: key });

          const message = `Pressed "${key}" key`;
          emitToolEvent("press_key", { key }, "completed", message, undefined, step);
          return message + (await autoScreenshot());
        } catch (error) {
          const message = context.formatError(`Error pressing key "${key}"`, error);
          emitToolEvent("press_key", { key }, "error", undefined, message, step);
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
      ].join(" "),
      inputSchema: z.object({
        code: z
          .string()
          .describe("JavaScript code to execute in the page context"),
      }),
      execute: async ({ code }) => {
        const input = { code: code.substring(0, 200) };
        const step = emitToolEvent("javascript", input, "started");
        try {
          const tab = getWorkTab();
          const result = await tab.runJs<unknown>(code);

          let output: string;
          if (result === undefined || result === null) {
            output = String(result);
          } else if (typeof result === "object") {
            output = JSON.stringify(result, null, 2);
          } else {
            output = String(result);
          }

          if (output.length > MAX_JS_OUTPUT) {
            output = output.substring(0, MAX_JS_OUTPUT) + "\n... (truncated)";
          }

          emitToolEvent("javascript", input, "completed", output, undefined, step);
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
