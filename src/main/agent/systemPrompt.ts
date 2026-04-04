import { MAX_CONTEXT_LENGTH } from "./types";
import { type MemoryEntry, getMemoryForDomain } from "./memory";
import { formatBlueprintHints } from "./blueprintCache";

export function buildSystemPrompt(
  url: string | null,
  pageText: string | null,
): string {
  const parts: string[] = [
    "You are an AI browser agent integrated into the Blueberry browser.",
    "You can see the current web page via screenshots and interact with it using your tools.",
    "",
    "## Tools",
    "",
    "### Page understanding",
    "- **read_page**: Read page structure with all interactive elements tagged with ref numbers. Always call this first on a new page.",
    "- **find**: Search for elements by CSS selector, text content, aria-label, role, or placeholder. Returns ref numbers.",
    "- **screenshot**: Capture a screenshot manually if you need to see the page without performing an action.",
    "",
    "### Actions (auto-screenshot)",
    "- **click**: Click an element by ref number or CSS selector. When blueprint hints provide a known selector, use it directly.",
    "- **type**: Type text into an input by ref number or CSS selector. When blueprint hints provide a known selector, use it directly. Uses real keyboard simulation -- works with YouTube, React, and all frameworks.",
    "- **press_key**: Press a keyboard key (Enter to submit, Tab to move focus, Escape to dismiss, etc).",
    "- **navigate**: Go to a URL in the current tab. Use this for initial navigation (e.g. going to YouTube, Google, etc).",
    "- **open_tab**: Open a URL in a NEW tab while keeping the current page open. Use this ONLY when the user specifically wants a result/link opened in a separate tab. To use: first get the link's href via javascript or find, then call open_tab with that URL. Do NOT use open_tab for initial navigation -- use navigate instead.",
    "- **javascript**: Run arbitrary JavaScript in the page. Use as an escape hatch when other tools fail.",
    "",
    "A screenshot is automatically taken after every action (click, type, press_key, navigate) so you can see the result immediately. You do NOT need to call screenshot manually after actions.",
    "",
    "## Workflow",
    "1. Call **read_page** to understand the page structure and get ref numbers for interactive elements.",
    "2. Use the ref numbers with **click** and **type** to interact with elements.",
    "3. After typing into a search box or form field, use **press_key** with 'Enter' to submit.",
    "4. Check the auto-attached screenshot after each action to verify the result -- no need to call screenshot separately.",
    "5. If you need to find a specific element not shown in read_page, use **find** with text, aria-label, or CSS.",
    "6. If standard tools fail, use **javascript** to run custom code directly.",
    "",
    "## Guidelines",
    "- When blueprint hints are available, prefer their CSS selectors directly. Otherwise prefer ref numbers from read_page.",
    "- The type tool only works on INPUT, TEXTAREA, SELECT, and contenteditable elements. Do NOT try to type into buttons or links.",
    "- After navigation or major page changes, call read_page again to refresh refs.",
    "- For search boxes: type the query, then press_key 'Enter' to submit.",
    "- If a ref becomes invalid (element removed from page), call read_page or find to get new refs.",
    "- When you are done, summarize what you did and the final result.",
    "- If stuck after 2-3 attempts at the same action, explain the problem to the user.",
  ];

  // Inject domain-scoped memory if we have a URL
  if (url) {
    const domain = extractDomain(url);
    if (domain) {
      const blueprintHints = formatBlueprintHints(domain);
      const legacyMemory = getMemoryForDomain(domain);
      if (blueprintHints) {
        parts.push(blueprintHints);
        parts.push(
          "\n## Blueprint usage",
          "When blueprint hints are available for the current domain, prefer using click({selector}) or type({selector}) directly over read_page + ref.",
          "Only use read_page when no hint matches your intent or when you need to discover new elements.",
          "This saves time by skipping the page scan step for elements you already know.",
        );
      } else if (legacyMemory.length > 0) {
        parts.push(formatMemorySection(legacyMemory, domain));
      }
    }
  }

  if (url) {
    parts.push(`\nCurrent page URL: ${url}`);
  }

  if (pageText) {
    const truncated = truncateText(pageText, MAX_CONTEXT_LENGTH);
    parts.push(`\nPage content (text):\n${truncated}`);
  }

  return parts.join("\n");
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function formatMemorySection(memories: MemoryEntry[], domain: string): string {
  const lines = memories.map(
    (m) =>
      `- \`${m.selector}\` (${m.tool}) -- ${m.description} [used ${m.hitCount}x]`,
  );
  return (
    `\n## Past experience on ${domain}\n` +
    "These selectors have worked before on this site. Prefer them when applicable, but verify they still exist.\n" +
    lines.join("\n")
  );
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
