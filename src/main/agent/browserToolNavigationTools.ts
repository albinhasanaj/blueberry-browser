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

  return {
    navigate: tool({
      description: [
        "Navigate the browser to a URL.",
        "MUST provide a full URL including https://.",
        "ALWAYS call read_page() after navigation to understand the new page.",
        "This switches the active tab -- you can interact with the page immediately after.",
        "Prefer this over open_tab() for primary navigation.",
      ].join(" "),
      inputSchema: z.object({
        url: z.string().url().describe("The full URL to navigate to"),
      }),
      execute: async ({ url }) => {
        const step = emitToolEvent("navigate", { url }, "started");
        try {
          if (!hasWorkTab()) {
            const newTab = openTab(url);
            await waitForLoad(newTab);

            const result =
              `Opened background tab and navigated to ${newTab.url} -- page title: "${newTab.title}"` +
              navigationWarning;
            trace("navigate", "background_open", {
              url,
              finalUrl: newTab.url,
              title: newTab.title,
            });
            emitToolEvent("navigate", { url }, "completed", result, undefined, step);
            return result + (await autoScreenshot());
          }

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
        "Open a URL in a new browser tab.",
        "ONLY use this when you explicitly need to keep the current page open.",
        "For normal navigation, ALWAYS prefer navigate() instead.",
        "After opening, call read_page() to understand the new page.",
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
            `Opened background tab: ${tab.url} -- title: "${tab.title}"` +
            navigationWarning;
          trace("open_tab", "success", {
            url,
            finalUrl: tab.url,
            title: tab.title,
          });
          emitToolEvent("open_tab", { url }, "completed", result, undefined, step);
          return result + (await autoScreenshot());
        } catch (error) {
          const message = context.formatError("Error opening new tab", error);
          emitToolEvent("open_tab", { url }, "error", undefined, message, step);
          return message;
        }
      },
    }),
  };
}
