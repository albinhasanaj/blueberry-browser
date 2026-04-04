import { createNavigationTools } from "./browserToolNavigationTools";
import {
  createBrowserToolContext,
  type BrowserToolDeps,
} from "./browserToolRuntime";
import { createPageInteractionTools } from "./browserToolPageTools";

export type { BrowserToolDeps } from "./browserToolRuntime";

export function createBrowserTools(deps: BrowserToolDeps) {
  const context = createBrowserToolContext(deps);

  return {
    ...createPageInteractionTools(context),
    ...createNavigationTools(context),
  };
}
