import { tool } from "ai";
import { z } from "zod";
import type { BrowserToolContext } from "./browserToolRuntime";
import { trace } from "./traceLogger";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createPageReadTools(context: BrowserToolContext) {
  const { emitToolEvent, ensureContentScript, resolveTab } = context;

  return {
    read_page: tool({
      description: [
        "Read a page's structure.",
        "Returns headings, forms, and all interactive elements tagged with ref numbers.",
        "ALWAYS call this before interacting with a new or changed page.",
        "Use the returned ref numbers with click() and type() tools.",
        "If you need to read the actual TEXT CONTENT of a page (articles, data, paragraphs), use get_page_text() instead.",
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
      }),
      execute: async ({ tabId }) => {
        const step = emitToolEvent("read_page", { tabId }, "started");
        try {
          const tab = resolveTab(tabId);
          await ensureContentScript(tab);
          const result = await tab.runJs<string>(
            "window.__blueberry.readPage()",
          );
          const tabHeader = `# Page: ${tab.title}\nURL: ${tab.url}\nTab ID: ${tab.id}\n\n`;
          emitToolEvent(
            "read_page",
            {},
            "completed",
            `Read ${result.length} chars`,
            undefined,
            step,
          );
          return tabHeader + result;
        } catch (error) {
          const message = context.formatError("Error reading page", error);
          emitToolEvent("read_page", {}, "error", undefined, message, step);
          return message;
        }
      },
    }),

    get_page_text: tool({
      description: [
        "Extract the readable text content of a page.",
        "Returns the actual text, paragraphs, headings, tables, and links - not interactive elements.",
        "Use this when you need to READ and UNDERSTAND what a page says (articles, data, financial info, search results).",
        "Use read_page() instead when you need interactive element refs for clicking/typing.",
        "ALWAYS call this after navigating to a page to understand its content before deciding next steps.",
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
      }),
      execute: async ({ tabId }) => {
        const step = emitToolEvent("get_page_text", { tabId }, "started");
        try {
          const tab = resolveTab(tabId);
          await ensureContentScript(tab);
          const result = await tab.runJs<string>(
            "window.__blueberry.getPageText()",
          );
          const tabHeader = `[Tab: ${tab.id} | ${tab.url}]\n`;
          emitToolEvent(
            "get_page_text",
            {},
            "completed",
            `Extracted ${result.length} chars`,
            undefined,
            step,
          );
          return tabHeader + result;
        } catch (error) {
          const message = context.formatError(
            "Error extracting page text",
            error,
          );
          emitToolEvent("get_page_text", {}, "error", undefined, message, step);
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
        "Pass tabId to target a specific tab (returned by open_tab). Omit to use the active tab.",
      ].join(" "),
      inputSchema: z.object({
        tabId: z
          .string()
          .optional()
          .describe(
            "Target a specific tab by ID (from open_tab). Omit for active tab.",
          ),
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
        const { tabId, ...searchQuery } = query as Record<string, unknown>;
        const input = { tabId, ...searchQuery };
        const step = emitToolEvent("find", input, "started");
        try {
          const tab = resolveTab(tabId as string | undefined);
          await ensureContentScript(tab);
          const results = await tab.runJs<
            Array<{ ref: number; description: string }>
          >(`window.__blueberry.find(${JSON.stringify(searchQuery)})`);

          if (results.length === 0) {
            const message = "No elements found matching the query.";
            trace("find", "no_results", { query: input });
            emitToolEvent("find", input, "completed", message, undefined, step);
            return message;
          }

          const lines = results.map(
            (result) => `[ref=${result.ref}] ${result.description}`,
          );
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
  };
}
