/**
 * Loads the blueberry page content script that creates a persistent
 * `window.__blueberry` API in the page context.
 *
 * The script is assembled from raw source fragments so registry handling,
 * DOM queries, actions, and page-reading logic can evolve independently.
 */

// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import registrySource from "./contentScriptParts/registry.js?raw";
// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import domSource from "./contentScriptParts/dom.js?raw";
// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import readPageSource from "./contentScriptParts/readPage.js?raw";
// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import findSource from "./contentScriptParts/find.js?raw";
// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import actionsSource from "./contentScriptParts/actions.js?raw";
// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import pageTextSource from "./contentScriptParts/pageText.js?raw";
// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import apiSource from "./contentScriptParts/api.js?raw";

const CONTENT_SCRIPT_PARTS = [
  registrySource,
  domSource,
  readPageSource,
  findSource,
  actionsSource,
  pageTextSource,
  apiSource,
];

const contentScriptSource = [
  "(function () {",
  "  if (window.__blueberry) return;",
  ...CONTENT_SCRIPT_PARTS,
  "})();",
].join("\n\n");

export function getContentScriptSource(): string {
  return contentScriptSource;
}
