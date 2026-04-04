/**
 * Loads the blueberry page content script that creates a persistent
 * `window.__blueberry` API in the page context. The actual script lives
 * in blueberry.page.js and is inlined at build time via Vite's ?raw import.
 *
 * Injected via executeJavaScript() and persists until navigation.
 */

// @ts-expect-error -- Vite ?raw import returns string, no typings needed
import contentScriptSource from "./blueberry.page.js?raw";

export function getContentScriptSource(): string {
  return contentScriptSource as string;
}
