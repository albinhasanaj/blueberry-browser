import { tool } from "ai";
import { z } from "zod";
import type { BrowserToolContext } from "./browserToolRuntime";
import { trace } from "./traceLogger";

export function createNavigationTools(context: BrowserToolContext) {
  const {
    getWorkTab,
    captureScreenshot,
    emitToolEvent,
    openTab,
    hasWorkTab,
    autoScreenshot,
    waitForLoad,
    navigationWarning,
  } = context;

  // Guard against parallel navigate() calls stomping each other.
  // When multiple navigate() fire at once, only the first uses the work tab;
  // the rest automatically open new tabs (like open_tab) so each URL loads
  // successfully in its own context.
  let navigating = false;

  return {
    navigate: tool({
      description: [
        "Navigate the browser to a URL.",
        "MUST provide a full URL including https://.",
        "ALWAYS call get_page_text() after navigation to read and understand the page content.",
        "Use read_page() only when you need interactive element refs for clicking/typing.",
        "This switches the active tab -- you can interact with the page immediately after.",
        "Prefer this over open_tab() for primary navigation.",
      ].join(" "),
      inputSchema: z.object({
        url: z.string().url().describe("The full URL to navigate to"),
      }),
      execute: async ({ url }) => {
        const step = emitToolEvent("navigate", { url }, "started");
        try {
          // If no work tab OR another navigate is already in-flight,
          // open a new tab so we don't stomp the existing navigation.
          if (!hasWorkTab() || navigating) {
            const newTab = openTab(url);
            await waitForLoad(newTab);

            const result =
              `Opened tab (tabId: "${newTab.id}") and navigated to ${newTab.url} -- page title: "${newTab.title}"` +
              navigationWarning;
            trace("navigate", "background_open", {
              url,
              tabId: newTab.id,
              finalUrl: newTab.url,
              title: newTab.title,
            });
            emitToolEvent("navigate", { url }, "completed", result, undefined, step);
            return result + (await autoScreenshot());
          }

          navigating = true;
          try {
            const tab = getWorkTab();
            const loaded = waitForLoad(tab, { rejectOnMainFrameFailure: true });
            await tab.loadURL(url);
            await loaded;

            const result =
              `Navigated to ${tab.url} -- page title: "${tab.title}"` +
              navigationWarning;
            trace("navigate", "success", { url, finalUrl: tab.url, title: tab.title });
            emitToolEvent("navigate", { url }, "completed", result, undefined, step);
            return result + (await autoScreenshot());
          } finally {
            navigating = false;
          }
        } catch (error) {
          const message = context.formatError(`Error navigating to "${url}"`, error);
          emitToolEvent("navigate", { url }, "error", undefined, message, step);
          return message;
        }
      },
    }),

    screenshot: tool({
      description: [
        "Take a screenshot of the current page.",
        "Returns a JPEG image attached for visual inspection.",
        "Use after performing actions to verify results visually.",
        "Use when you need to understand visual layout that read_page() cannot convey.",
      ].join(" "),
      inputSchema: z.object({}),
      execute: async () => {
        const step = emitToolEvent("screenshot", {}, "started");
        try {
          const screenshot = await captureScreenshot();
          if (!screenshot) {
            const message = "Error: Could not capture screenshot -- no active tab";
            emitToolEvent("screenshot", {}, "error", undefined, message, step);
            return message;
          }

          const message =
            "Screenshot captured successfully. I can now see the current state of the page.";
          emitToolEvent("screenshot", {}, "completed", message, undefined, step);
          return message;
        } catch (error) {
          const message = context.formatError("Error capturing screenshot", error);
          emitToolEvent("screenshot", {}, "error", undefined, message, step);
          return message;
        }
      },
    }),

    open_tab: tool({
      description: [
        "Open a URL in a new background tab and return its tabId.",
        "Use this ONLY when you want to load multiple pages in parallel (e.g. open 3 search results at once).",
        "For single-page navigation, ALWAYS use navigate() instead.",
        "Pass the returned tabId to get_page_text({ tabId }), read_page({ tabId }), click({ tabId }), etc.",
      ].join(" "),
      inputSchema: z.object({
        url: z.string().url().describe("The full URL to open in a new tab"),
      }),
      execute: async ({ url }) => {
        const step = emitToolEvent("open_tab", { url }, "started");
        try {
          const tab = openTab(url);
          await waitForLoad(tab);

          const result =
            `Opened tab (tabId: "${tab.id}") -- ${tab.url} -- title: "${tab.title}"\n` +
            `Use tabId "${tab.id}" with get_page_text(), read_page(), click(), etc. to interact with this tab.`;
          trace("open_tab", "success", {
            url,
            tabId: tab.id,
            finalUrl: tab.url,
            title: tab.title,
          });
          emitToolEvent("open_tab", { url }, "completed", result, undefined, step);
          return result;
        } catch (error) {
          const message = context.formatError("Error opening new tab", error);
          emitToolEvent("open_tab", { url }, "error", undefined, message, step);
          return message;
        }
      },
    }),
  };
}
